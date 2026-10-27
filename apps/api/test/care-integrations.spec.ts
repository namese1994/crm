import "reflect-metadata";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { decryptCareSecrets } from "@crm/auth/care-config";
import { db } from "@crm/db";
import {
	CARE_INTEGRATIONS,
	careSourceSecrets,
} from "@crm/validation/care-integrations";
import { z } from "zod";
import {
	checkPosSource,
	processPosWebhooks,
} from "../../../tools/customer-care/integration-worker";
import { syncSources } from "../../../tools/customer-care/source-sync";
import { createApp } from "../src/create-app";
import { CareIntegrationsService } from "../src/customer-care/care-integrations.service";

const service = new CareIntegrationsService(db);
const prefix = `integrations-${crypto.randomUUID()}`;
const manager = `${prefix}-manager`;
const staff = `${prefix}-staff`;
const encryption = process.env.CARE_CONFIG_ENCRYPTION_KEY;
const realFetch = globalThis.fetch;
const sourceInput = {
	expectedVersion: null,
	name: prefix,
	shopId: "987671",
	channels: [{ brand: "UMEHA" as const, pageId: "987672" }],
	apiKey: "SYNTHETIC_POS_SECRET",
	pancakeTokens: [],
};
const aiInput = {
	expectedVersion: null,
	baseUrl: "https://example.com/v1",
	model: "synthetic-model",
	apiKey: "SYNTHETIC_LLM_SECRET",
	dailyLimit: 3,
	maxOutputTokens: 512,
	policies: { UMEHA: "Verified test policy", LI_EN_SPORT: "" },
};

beforeAll(async () => {
	if (await db.careIntegration.count())
		throw new Error("Integration fixtures need an empty integration table");
	process.env.CARE_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
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
	for (const [id, role] of [
		[manager, "admin"],
		[staff, "member"],
	] as const) {
		await db.user.create({
			data: {
				id,
				name: "Test",
				email: `${id}@example.invalid`,
				updatedAt: new Date(),
			},
		});
		await db.member.create({
			data: {
				id: crypto.randomUUID(),
				userId: id,
				role,
				organizationId: "workspace",
				createdAt: new Date(),
			},
		});
	}
});
afterEach(async () => {
	globalThis.fetch = realFetch;
	await db.careAiJob.deleteMany({
		where: { createdBy: { in: [manager, staff] } },
	});
	await db.careWebhookReceipt.deleteMany({
		where: { integration: { createdBy: manager } },
	});
	await db.careIntegration.deleteMany({ where: { createdBy: manager } });
	await db.careSyncState.deleteMany({
		where: { id: { startsWith: "UMEHA:987671:" } },
	});
	await db.careTemplate.deleteMany({ where: { name: { startsWith: prefix } } });
});
afterAll(async () => {
	if (encryption === undefined) delete process.env.CARE_CONFIG_ENCRYPTION_KEY;
	else process.env.CARE_CONFIG_ENCRYPTION_KEY = encryption;
	await db.member.deleteMany({ where: { userId: { in: [manager, staff] } } });
	await db.user.deleteMany({ where: { id: { in: [manager, staff] } } });
});

async function enabledSource() {
	await service.saveSource(sourceInput, manager);
	await db.careIntegration.update({
		where: { id: CARE_INTEGRATIONS.posId },
		data: { checkedVersion: 1 },
	});
	await service.action("POSCAKE", 1, manager, true);
	return service.webhookInfo(manager);
}

test("source configuration is manager-only; status never exposes credentials", async () => {
	await expect(service.status("outsider")).rejects.toThrow();
	await expect(service.saveSource(sourceInput, staff)).rejects.toThrow(
		"Chỉ quản lý",
	);
	await service.saveSource(sourceInput, manager);
	const row = await db.careIntegration.findUniqueOrThrow({
		where: { id: CARE_INTEGRATIONS.posId },
	});
	expect(row.secrets).not.toContain(sourceInput.apiKey);
	expect(decryptCareSecrets(row.secrets, row.id)).toContain(sourceInput.apiKey);
	expect(() =>
		decryptCareSecrets(row.secrets, CARE_INTEGRATIONS.aiId),
	).toThrow();
	const visible = JSON.stringify(await service.status(staff));
	expect(visible).not.toContain(sourceInput.apiKey);
	expect(visible).not.toContain("webhookKey");
	await expect(service.webhookInfo(staff)).rejects.toThrow();
	await expect(service.action("POSCAKE", 1, manager, true)).rejects.toThrow(
		"Kiểm tra",
	);
});

test("configuration save keeps blank keys, fences old work, and rejects concurrent edits", async () => {
	await enabledSource();
	await db.careSyncState.update({
		where: { id: "UMEHA:987671:987672" },
		data: { leaseToken: "old-lease", leaseUntil: new Date(Date.now() + 60000) },
	});
	const input = { ...sourceInput, expectedVersion: 1, apiKey: "" };
	const results = await Promise.allSettled([
		service.saveSource(input, manager),
		service.saveSource(input, manager),
	]);
	expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
	const row = await db.careIntegration.findUniqueOrThrow({
		where: { id: CARE_INTEGRATIONS.posId },
	});
	expect(row.enabled).toBe(false);
	expect(row.checkedVersion).toBeNull();
	expect(row.version).toBe(2);
	expect(
		careSourceSecrets.parse(JSON.parse(decryptCareSecrets(row.secrets, row.id)))
			.apiKey,
	).toBe(sourceInput.apiKey);
	const state = await db.careSyncState.findUniqueOrThrow({
		where: { id: "UMEHA:987671:987672" },
	});
	expect(state.leaseToken).toBeNull();
	expect(state.lastError).toBe("SOURCE_CONFIG_CHANGED");
});

test("webhook rejects wrong keys, shop and payload; stores minimal deduplicated receipts", async () => {
	const hook = await enabledSource();
	const body = {
		event_id: "test-event",
		event: "order.updated",
		data: { id: "999", shop_id: sourceInput.shopId },
		message: "DO_NOT_STORE_CUSTOMER_TEXT",
	};
	await expect(
		service.receiveWebhook(CARE_INTEGRATIONS.posId, "wrong", body),
	).rejects.toThrow("Webhook không hợp lệ");
	await expect(
		service.receiveWebhook(CARE_INTEGRATIONS.posId, hook.key, {
			data: { id: "999", shop_id: "1" },
		}),
	).rejects.toThrow("khác shop");
	await expect(
		Reflect.apply(service.receiveWebhook, service, [
			CARE_INTEGRATIONS.posId,
			hook.key,
			"bad",
		]),
	).rejects.toThrow("Payload");
	await expect(
		service.receiveWebhook(CARE_INTEGRATIONS.posId, hook.key, {}),
	).rejects.toThrow("thiếu mã đơn");
	const results = await Promise.all([
		service.receiveWebhook(CARE_INTEGRATIONS.posId, hook.key, body),
		service.receiveWebhook(CARE_INTEGRATIONS.posId, hook.key, body),
	]);
	expect(results.reduce((sum, item) => sum + item.received, 0)).toBe(1);
	const receipts = await db.careWebhookReceipt.findMany();
	expect(receipts).toHaveLength(1);
	expect(JSON.stringify(receipts)).not.toContain("DO_NOT_STORE_CUSTOMER_TEXT");
	await service.action("POSCAKE", 1, manager, false);
	await expect(
		service.receiveWebhook(CARE_INTEGRATIONS.posId, hook.key, body),
	).rejects.toThrow("chưa bật");
});

test("POS check supports order-only credentials and paused source never falls back to environment", async () => {
	await service.saveSource(sourceInput, manager);
	await service.action("POSCAKE", 1, manager);
	let calls = 0;
	globalThis.fetch = Object.assign(async () => {
		calls++;
		return Response.json({ success: true, data: [] });
	}, realFetch);
	await checkPosSource();
	expect(calls).toBe(1);
	expect((await service.status(manager)).source?.checkedVersion).toBe(1);
	await syncSources(async () => {
		throw new Error("Must not import from paused source");
	});
	expect(calls).toBe(1);
});

test("webhook fetches canonical order, preserves delivery evidence, never enrolls or sends", async () => {
	const hook = await enabledSource();
	await service.receiveWebhook(CARE_INTEGRATIONS.posId, hook.key, {
		id: "999",
	});
	let calls = 0;
	globalThis.fetch = Object.assign(
		async (input: string | URL | Request, options?: RequestInit) => {
			calls++;
			expect(options?.method ?? "GET").toBe("GET");
			expect(String(input)).toContain("/orders/999");
			return Response.json({
				success: true,
				data: {
					id: "999",
					page_id: "987672",
					status: 3,
					inserted_at: "2026-10-20T00:00:00",
					updated_at: "2026-10-26T01:00:00",
					status_history: [{ status: 3, updated_at: "2026-10-25T01:00:00" }],
					customer: { id: "fake-customer", name: "Fake" },
					items: [
						{
							quantity: 1,
							variation_info: { name: "Fake product", display_id: " V35  M " },
						},
					],
				},
			});
		},
		realFetch,
	);
	let imports = 0;
	const before = await db.careCustomer.count();
	await processPosWebhooks(async (input, actor, _, lease) => {
		imports++;
		expect(actor).toBe("poscake-webhook");
		expect(lease?.id).toBe("UMEHA:987671:987672");
		expect(input.deliveredAt).toBe("2026-10-25T01:00:00.000Z");
		expect(input.products[0]?.sku).toBe(" V35  M ");
	});
	await processPosWebhooks(async () => {
		imports++;
	});
	expect(calls).toBe(1);
	expect(imports).toBe(1);
	expect(await db.careCustomer.count()).toBe(before);
	expect((await db.careWebhookReceipt.findFirstOrThrow()).state).toBe("DONE");
});

test("AI requests require verified configuration, enforce budget and deduplicate request IDs", async () => {
	await service.saveAi(aiInput, manager);
	const request = {
		requestId: crypto.randomUUID(),
		brand: "UMEHA" as const,
		purpose: "CHECK_IN" as const,
		tags: [],
		kind: "DRAFT_TEMPLATE" as const,
		question: "Draft a reusable value template",
	};
	await expect(service.requestAi(request, staff)).rejects.toThrow("cấu hình");
	await db.careIntegration.update({
		where: { id: CARE_INTEGRATIONS.aiId },
		data: { enabled: true, checkedVersion: 1 },
	});
	const jobs = await Promise.all([
		service.requestAi(request, staff),
		service.requestAi(request, staff),
	]);
	expect(jobs[0]?.id).toBe(jobs[1]?.id);
	await service.requestAi(
		{ ...request, requestId: crypto.randomUUID() },
		staff,
	);
	await service.requestAi(
		{ ...request, requestId: crypto.randomUUID() },
		manager,
	);
	await expect(
		service.requestAi({ ...request, requestId: crypto.randomUUID() }, manager),
	).rejects.toThrow("giới hạn");
	expect(await service.aiJobs(manager)).toHaveLength(1);
	expect(await service.aiJobs(staff)).toHaveLength(2);
});

test("AI result applies once as an unapproved template, only after manager action", async () => {
	await service.saveAi(aiInput, manager);
	const job = await db.careAiJob.create({
		data: {
			integrationId: CARE_INTEGRATIONS.aiId,
			configVersion: 1,
			requestId: crypto.randomUUID(),
			createdBy: manager,
			model: "synthetic-model",
			state: "DONE",
			input: {
				requestId: crypto.randomUUID(),
				kind: "DRAFT_TEMPLATE",
				brand: "UMEHA",
				purpose: "CHECK_IN",
				tags: [],
				question: "Synthetic test",
			},
			result: {
				summary: "Test",
				warnings: [],
				suggestedTags: ["suggested-only"],
				template: {
					name: `${prefix}-draft`,
					body: "{{customer}} sử dụng {{product}} thế nào?",
					requiredTags: [],
					excludedTags: [],
				},
			},
		},
	});
	const count = await db.careTemplate.count();
	await expect(service.applyAiDraft(job.id, staff)).rejects.toThrow(
		"Chỉ quản lý",
	);
	const first = await service.applyAiDraft(job.id, manager);
	expect((await service.applyAiDraft(job.id, manager)).id).toBe(first.id);
	expect(await db.careTemplate.count()).toBe(count + 1);
	const template = await db.careTemplate.findUniqueOrThrow({
		where: { id: first.id },
	});
	expect(template.approvedAt).toBeNull();
	expect(template.approvedBy).toBeNull();
});

test("webhook batch leases and retry deadlines use fresh time for each receipt", async () => {
	const hook = await enabledSource();
	await service.receiveWebhook(CARE_INTEGRATIONS.posId, hook.key, [
		{ id: "1001" },
		{ id: "1002" },
	]);
	let time = Date.now();
	globalThis.fetch = Object.assign(async (input: string | URL | Request) => {
		const id = new URL(String(input)).pathname.split("/").at(-1);
		return Response.json({
			success: true,
			data: {
				id,
				page_id: "987672",
				status: 3,
				inserted_at: "2026-10-20T00:00:00",
				updated_at: "2026-10-26T01:00:00",
				status_history: [],
				customer: { id: "fake", name: "Fake" },
				items: [],
			},
		});
	}, realFetch);
	let imports = 0;
	await processPosWebhooks(
		async (input) => {
			const receipt = await db.careWebhookReceipt.findFirstOrThrow({
				where: { orderId: input.orderId },
			});
			expect(receipt.leaseUntil?.getTime()).toBeGreaterThan(time);
			imports++;
			time += 3 * 60000;
		},
		() => new Date(time),
	);
	expect(imports).toBe(2);
	expect(await db.careWebhookReceipt.count({ where: { state: "DONE" } })).toBe(
		2,
	);
	await service.receiveWebhook(CARE_INTEGRATIONS.posId, hook.key, {
		id: "1003",
	});
	let calls = 0;
	globalThis.fetch = Object.assign(async () => {
		calls++;
		return new Response("rate limit", { status: 429 });
	}, realFetch);
	await processPosWebhooks(
		async () => {
			throw new Error("Must not import");
		},
		() => new Date(time),
	);
	expect(calls).toBe(1);
	const retry = await db.careWebhookReceipt.findFirstOrThrow({
		where: { orderId: "1003" },
	});
	expect(retry.state).toBe("PENDING");
	expect(retry.nextAttemptAt.getTime()).toBeGreaterThan(time);
});

test("source rotation during canonical fetch prevents webhook import", async () => {
	const hook = await enabledSource();
	await service.receiveWebhook(CARE_INTEGRATIONS.posId, hook.key, {
		id: "1004",
	});
	globalThis.fetch = Object.assign(async () => {
		await service.saveSource({ ...sourceInput, expectedVersion: 1 }, manager);
		return Response.json({
			success: true,
			data: {
				id: "1004",
				page_id: "987672",
				status: 3,
				inserted_at: "2026-10-20T00:00:00",
				updated_at: "2026-10-26T01:00:00",
				status_history: [],
				customer: { id: "fake", name: "Fake" },
				items: [],
			},
		});
	}, realFetch);
	let imports = 0;
	await processPosWebhooks(async () => {
		imports++;
	});
	expect(imports).toBe(0);
	expect((await db.careWebhookReceipt.findFirstOrThrow()).state).toBe(
		"PENDING",
	);
});

test("HTTP webhook accepts authenticated JSON, rejects malformed or oversized bodies and deduplicates retries", async () => {
	const hook = await enabledSource();
	const app = await createApp();
	await app.listen(0, "127.0.0.1");
	try {
		const address = z
			.object({ port: z.number() })
			.parse(app.getHttpServer().address());
		const url = `http://127.0.0.1:${address.port}/api/webhooks/care/poscake/${CARE_INTEGRATIONS.posId}`;
		const headers = {
			"Content-Type": "application/json",
			[hook.header]: hook.key,
		};
		const first = await realFetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify({ event: "order.updated", data: { id: "2001" } }),
		});
		expect(first.status).toBe(202);
		expect(await first.json()).toEqual({
			accepted: true,
			received: 1,
			duplicates: 0,
		});
		const replay = await realFetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify({ event: "order.updated", data: { id: "2001" } }),
		});
		expect(
			z.object({ duplicates: z.number() }).parse(await replay.json())
				.duplicates,
		).toBe(1);
		expect(
			(await realFetch(url, { method: "POST", headers, body: "{broken" }))
				.status,
		).toBe(400);
		expect(
			(
				await realFetch(url, {
					method: "POST",
					headers,
					body: JSON.stringify({
						message: "x".repeat(CARE_INTEGRATIONS.webhookBodyBytes + 1),
					}),
				})
			).status,
		).toBe(413);
	} finally {
		await app.close();
	}
});
