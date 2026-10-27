import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { encryptCareSecrets } from "@crm/auth/care-config";
import { db } from "@crm/db";
import { CARE_INTEGRATIONS } from "@crm/validation/care-integrations";
import { MockLanguageModelV4 } from "ai/test";
import {
	careContext,
	checkCareAi,
	runCareAiJob,
} from "../agent/lib/care-agent";

const actor = `care-agent-${crypto.randomUUID()}`;
const encryption = process.env.CARE_CONFIG_ENCRYPTION_KEY;
const usage = {
	inputTokens: {
		total: 10,
		noCache: 10,
		cacheRead: undefined,
		cacheWrite: undefined,
	},
	outputTokens: { total: 20, text: 20, reasoning: undefined },
};
const result = {
	summary: "Dữ liệu kiểm thử",
	warnings: ["Cần xem lại"],
	suggestedTags: ["suggested-only"],
	template: {
		name: "Synthetic draft",
		body: "{{customer}} chia sẻ trải nghiệm sử dụng {{product}} nhé.",
		requiredTags: [],
		excludedTags: [],
	},
};
const generated = (text: string) => ({
	content: [{ type: "text" as const, text }],
	finishReason: { unified: "stop" as const, raw: "stop" },
	usage,
	warnings: [],
});

beforeAll(async () => {
	if (await db.careIntegration.count())
		throw new Error("Care AI tests need an empty integration table");
	process.env.CARE_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
		"base64",
	);
	await db.organization.upsert({
		where: { id: "workspace" },
		create: {
			id: "workspace",
			name: "Test",
			slug: "test",
			createdAt: new Date(),
		},
		update: {},
	});
	await db.user.create({
		data: {
			id: actor,
			name: "Test",
			email: `${actor}@example.invalid`,
			updatedAt: new Date(),
		},
	});
	await db.member.create({
		data: {
			id: crypto.randomUUID(),
			userId: actor,
			role: "admin",
			organizationId: "workspace",
			createdAt: new Date(),
		},
	});
});
afterEach(async () => {
	await db.careAiJob.deleteMany({ where: { createdBy: actor } });
	await db.careIntegration.deleteMany({ where: { createdBy: actor } });
	await db.careCustomer.deleteMany({ where: { sourceCustomerId: actor } });
});
afterAll(async () => {
	if (encryption === undefined) delete process.env.CARE_CONFIG_ENCRYPTION_KEY;
	else process.env.CARE_CONFIG_ENCRYPTION_KEY = encryption;
	await db.member.deleteMany({ where: { userId: actor } });
	await db.user.delete({ where: { id: actor } });
});
async function setup() {
	await db.careIntegration.create({
		data: {
			id: CARE_INTEGRATIONS.aiId,
			kind: "LLM",
			name: "Synthetic LLM",
			createdBy: actor,
			config: {
				baseUrl: "https://example.com/v1",
				model: "mock-model",
				dailyLimit: 50,
				maxOutputTokens: 512,
				policies: { UMEHA: "Only verified test facts", LI_EN_SPORT: "" },
			},
			secrets: encryptCareSecrets(
				JSON.stringify({ apiKey: "SYNTHETIC_SECRET_NOT_FOR_LOGS" }),
				CARE_INTEGRATIONS.aiId,
			),
			enabled: true,
			checkedVersion: 1,
		},
	});
}
async function job() {
	const requestId = crypto.randomUUID();
	return db.careAiJob.create({
		data: {
			integrationId: CARE_INTEGRATIONS.aiId,
			configVersion: 1,
			createdBy: actor,
			requestId,
			model: "mock-model",
			input: {
				requestId,
				kind: "DRAFT_TEMPLATE",
				brand: "UMEHA",
				purpose: "CHECK_IN",
				question: "Draft a reusable template",
				tags: [],
			},
		},
	});
}

test("initial AI check with null status runs exactly once; interrupted checks are not retried", async () => {
	await setup();
	await db.careIntegration.update({
		where: { id: CARE_INTEGRATIONS.aiId },
		data: {
			checkRequestedAt: new Date(),
			lastError: null,
			checkedVersion: null,
		},
	});
	const model = new MockLanguageModelV4({ doGenerate: generated("OK") });
	await Promise.all([
		checkCareAi(new Date(), () => model),
		checkCareAi(new Date(), () => model),
	]);
	expect(model.doGenerateCalls).toHaveLength(1);
	const row = await db.careIntegration.findUniqueOrThrow({
		where: { id: CARE_INTEGRATIONS.aiId },
	});
	expect(row.checkedVersion).toBe(1);
	expect(row.checkRequestedAt).toBeNull();
	await db.careIntegration.update({
		where: { id: row.id },
		data: {
			checkRequestedAt: new Date(),
			lastError: "CHECK_RUNNING",
			lastCheckedAt: new Date(Date.now() - CARE_INTEGRATIONS.leaseMs - 1000),
		},
	});
	await checkCareAi(new Date(), () => model);
	expect(model.doGenerateCalls).toHaveLength(1);
	expect(
		(await db.careIntegration.findUniqueOrThrow({ where: { id: row.id } }))
			.lastError,
	).toBe("AI_CHECK_INTERRUPTED_NO_AUTO_RETRY");
});

test("AI worker supports a read-only tool and structured result without applying any suggestion", async () => {
	await setup();
	const queued = await job();
	const model = new MockLanguageModelV4({
		doGenerate: [
			{
				content: [
					{
						type: "tool-call",
						toolCallId: "test-tool",
						toolName: "approvedTemplates",
						input: "{}",
					},
				],
				finishReason: { unified: "tool-calls", raw: "tool_calls" },
				usage,
				warnings: [],
			},
			generated(JSON.stringify(result)),
		],
	});
	const before = await db.careTemplate.count();
	await runCareAiJob(() => model);
	const row = await db.careAiJob.findUniqueOrThrow({
		where: { id: queued.id },
	});
	expect(row.state).toBe("DONE");
	expect(row.result).toEqual(result);
	expect(row.inputTokens).toBe(20);
	expect(row.outputTokens).toBe(40);
	expect(model.doGenerateCalls).toHaveLength(2);
	expect(await db.careTemplate.count()).toBe(before);
});

test("model failure is sanitized and is never retried automatically", async () => {
	await setup();
	const queued = await job();
	const model = new MockLanguageModelV4({
		doGenerate: async () => {
			throw new Error("SYNTHETIC_SECRET_NOT_FOR_LOGS");
		},
	});
	await runCareAiJob(() => model);
	await runCareAiJob(() => model);
	expect(model.doGenerateCalls).toHaveLength(1);
	const row = await db.careAiJob.findUniqueOrThrow({
		where: { id: queued.id },
	});
	expect(row.state).toBe("FAILED");
	expect(row.result).toBeNull();
	expect(row.lastError).toBe("AI_GENERATION_FAILED_NO_AUTO_RETRY");
});

test("configuration changes during generation discard output; expired runs retire without model calls", async () => {
	await setup();
	const queued = await job();
	const model = new MockLanguageModelV4({
		doGenerate: async () => {
			await db.careIntegration.update({
				where: { id: CARE_INTEGRATIONS.aiId },
				data: { version: 2, enabled: false },
			});
			return generated(JSON.stringify(result));
		},
	});
	await runCareAiJob(() => model);
	const row = await db.careAiJob.findUniqueOrThrow({
		where: { id: queued.id },
	});
	expect(row.state).toBe("FAILED");
	expect(row.result).toBeNull();
	expect(row.lastError).toBe("AI_CONFIG_CHANGED");
	await db.careAiJob.update({
		where: { id: row.id },
		data: {
			state: "RUNNING",
			leaseToken: "expired",
			leaseUntil: new Date(Date.now() - 1000),
		},
	});
	await runCareAiJob(() => model);
	expect(model.doGenerateCalls).toHaveLength(1);
	expect(
		(await db.careAiJob.findUniqueOrThrow({ where: { id: row.id } })).lastError,
	).toBe("AI_RUN_INTERRUPTED_NO_AUTO_RETRY");
});

test("customer context excludes identity and rejects revoked membership", async () => {
	const customer = await db.careCustomer.create({
		data: {
			brand: "UMEHA",
			shopId: "synthetic",
			sourceCustomerId: actor,
			name: "PRIVATE_NAME_NOT_FOR_MODEL",
			tags: ["known-tag"],
			syncedAt: new Date(),
		},
	});
	const input = {
		requestId: crypto.randomUUID(),
		kind: "REVIEW_CUSTOMER" as const,
		brand: "UMEHA" as const,
		purpose: "CHECK_IN" as const,
		customerId: customer.id,
		question: "Review",
		tags: [],
	};
	const context = await careContext(input, actor);
	expect(JSON.stringify(context)).not.toContain("PRIVATE_NAME_NOT_FOR_MODEL");
	expect(JSON.stringify(context)).not.toContain(customer.id);
	await expect(careContext(input, "outsider")).rejects.toThrow("MEMBERSHIP");
});
