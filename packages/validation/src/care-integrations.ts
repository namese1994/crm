import { z } from "zod";
import { careBrand, carePurpose } from "./customer-care";

const MINUTE_MS = 60_000;
export const CARE_INTEGRATIONS = {
	posId: "care-poscake",
	aiId: "care-llm",
	webhookHeader: "x-crm-webhook-key",
	customerEventType: "customers",
	webhookBodyBytes: 256 * 1024,
	webhookBatch: 20,
	webhookAttempts: 5,
	leaseMs: 2 * MINUTE_MS,
	retryMs: MINUTE_MS,
	aiTimeoutMs: MINUTE_MS,
	aiWorkerIntervalMs: 5_000,
	aiSteps: 3,
	timezoneOffsetMs: 7 * 60 * MINUTE_MS,
	aiPendingPerUser: 3,
	aiCheckCooldownMs: MINUTE_MS,
	requestTimeoutMs: 15_000,
} as const;

const sourceId = z.string().trim().min(1).max(160);
const pageId = z.string().regex(/^\d+$/);
export const careSourceChannel = z.object({
	brand: careBrand,
	pageId,
});
export const careSourceConfig = z.object({
	shopId: pageId,
	channels: z
		.array(careSourceChannel)
		.min(1)
		.max(10)
		.refine(
			(rows) => new Set(rows.map((row) => row.pageId)).size === rows.length,
			"Mỗi page chỉ được gắn một thương hiệu",
		),
});
export const careSourceSecrets = z.object({
	apiKey: z.string().min(1).max(8192),
	pancakeTokens: z.record(pageId, z.string().min(1).max(8192)),
	webhookKey: z.string().min(32).max(160),
});
export const careSourceSave = careSourceConfig.extend({
	expectedVersion: z.number().int().positive().nullable(),
	name: z.string().trim().min(1).max(160),
	apiKey: z.string().trim().max(8192).optional(),
	pancakeTokens: z
		.array(z.object({ pageId, token: z.string().trim().max(8192) }))
		.max(10)
		.default([]),
});
export const careIntegrationAction = z.object({
	kind: z.enum(["POSCAKE", "LLM"]),
	expectedVersion: z.number().int().positive(),
});
export const careIntegrationToggle = careIntegrationAction.extend({
	enabled: z.boolean(),
});

export const careAiConfig = z.object({
	baseUrl: z
		.url()
		.max(512)
		.refine((value) => {
			const url = new URL(value);
			return (
				url.protocol === "https:" &&
				!url.username &&
				!url.password &&
				!url.search &&
				!url.hash
			);
		}, "Endpoint phải dùng HTTPS và không chứa thông tin đăng nhập"),
	model: z.string().trim().min(1).max(160),
	dailyLimit: z.number().int().min(1).max(1000).default(50),
	maxOutputTokens: z.number().int().min(256).max(8192).default(2048),
	policies: z.object({
		UMEHA: z.string().max(16000),
		LI_EN_SPORT: z.string().max(16000),
	}),
});
export const careAiSecrets = z.object({ apiKey: z.string().min(1).max(8192) });
export const careAiSave = careAiConfig.extend({
	expectedVersion: z.number().int().positive().nullable(),
	apiKey: z.string().trim().max(8192).optional(),
});
export const careAiRequest = z
	.object({
		requestId: z.uuid(),
		kind: z.enum(["DRAFT_TEMPLATE", "REVIEW_CUSTOMER", "QUESTION"]),
		brand: careBrand,
		purpose: carePurpose.default("CHECK_IN"),
		tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
		customerId: sourceId.optional(),
		question: z.string().trim().min(1).max(4000),
	})
	.refine(
		(input) => input.kind !== "REVIEW_CUSTOMER" || Boolean(input.customerId),
		"Chọn khách để kiểm tra",
	);
export const careAiResult = z.object({
	summary: z.string().min(1).max(6000),
	suggestedTags: z.array(z.string().min(1).max(80)).max(30),
	warnings: z.array(z.string().min(1).max(500)).max(12),
	template: z
		.object({
			name: z.string().min(1).max(160),
			body: z.string().min(1).max(3000),
			requiredTags: z.array(z.string().min(1).max(80)).max(30),
			excludedTags: z.array(z.string().min(1).max(80)).max(30),
		})
		.nullable(),
});
export const careJobState = z.enum([
	"PENDING",
	"RUNNING",
	"DONE",
	"FAILED",
	"IGNORED",
]);
export const careIntegrationPublic = z.object({
	id: z.string(),
	kind: z.enum(["POSCAKE", "LLM"]),
	name: z.string(),
	version: z.number(),
	enabled: z.boolean(),
	checkedVersion: z.number().nullable(),
	checkRequestedAt: z.date().nullable(),
	lastCheckedAt: z.date().nullable(),
	lastError: z.string().nullable(),
	lastWebhookAt: z.date().nullable(),
	source: careSourceConfig.nullable(),
	ai: careAiConfig.nullable(),
	apiKeyConfigured: z.boolean(),
	pancakePagesConfigured: z.array(z.string()),
});
export const careIntegrationStatus = z.object({
	canManage: z.boolean(),
	encryptionReady: z.boolean(),
	demoDatabase: z.boolean(),
	source: careIntegrationPublic.nullable(),
	ai: careIntegrationPublic.nullable(),
	webhooks: z.object({
		pending: z.number(),
		failed: z.number(),
		completed: z.number(),
	}),
});
export const careAiJobPublic = z.object({
	id: z.string(),
	state: careJobState,
	input: careAiRequest,
	result: careAiResult.nullable(),
	lastError: z.string().nullable(),
	model: z.string(),
	inputTokens: z.number().nullable(),
	outputTokens: z.number().nullable(),
	createdAt: z.date(),
	finishedAt: z.date().nullable(),
});
export type CareSourceConfig = z.infer<typeof careSourceConfig>;
export type CareSourceSecrets = z.infer<typeof careSourceSecrets>;
export type CareAiConfig = z.infer<typeof careAiConfig>;
export type CareAiRequest = z.infer<typeof careAiRequest>;
export type CareAiResult = z.infer<typeof careAiResult>;
