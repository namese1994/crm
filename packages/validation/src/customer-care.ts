import { z } from "zod";

export const careBrand = z.enum(["UMEHA", "LI_EN_SPORT"]);
export const CARE_PILOT_LIMIT = 100;
const careCount = z.number().int().nonnegative();
const careRate = z.number().min(0).max(1).nullable();
export const careMetrics = z.object({
	activity: z.object({
		since: z.date(),
		until: z.date(),
		outcomes: z.array(z.object({ kind: z.string(), count: careCount })),
		staff: z.array(
			z.object({
				id: z.string(),
				name: z.string(),
				prepared: careCount,
				confirmed: careCount,
			}),
		),
		responses: z.array(
			z.object({
				brand: careBrand,
				confirmed: careCount,
				checked: careCount,
				replied: careCount,
				rate: careRate,
			}),
		),
		responseDefinition: z.literal(
			"OBSERVED_INBOUND_AFTER_LATEST_MANUAL_CONFIRMATION",
		),
	}),
	cohorts: z.array(
		z.object({
			brand: careBrand,
			days: z.union([z.literal(30), z.literal(60), z.literal(90)]),
			mature: careCount,
			repeat: careCount,
			rate: careRate,
		}),
	),
	coverage: z.literal("OBSERVED_CRM_HISTORY"),
	attribution: z.literal("NOT_CAUSAL"),
});
export type CareMetrics = z.infer<typeof careMetrics>;
export const careOrderStatus = z.enum([
	"PENDING",
	"DELIVERED",
	"PARTIAL",
	"CANCELLED",
	"RETURNED",
]);
export const carePurpose = z.enum([
	"CHECK_IN",
	"USE_VALUE",
	"EXPERIENCE",
	"REORDER",
	"REACTIVATE",
	"REVIEW",
]);
export const careResult = z.enum([
	"SENT_MANUAL",
	"BLOCKED",
	"UNCERTAIN",
	"SNOOZE",
	"SKIPPED",
	"REPLIED",
	"ISSUE",
	"OPT_OUT",
	"RESOLVED",
]);
const sourceId = z.string().min(1).max(160);
export const carePilotPreviewInput = z.object({
	ids: z
		.array(sourceId)
		.min(1)
		.max(CARE_PILOT_LIMIT)
		.refine(
			(ids) => new Set(ids).size === ids.length,
			"Danh sách khách bị trùng",
		),
});
export const carePilotPreviewOutput = z.object({
	readOnly: z.literal(true),
	generatedAt: z.date(),
	ready: careCount,
	rows: z
		.array(
			z.object({
				id: sourceId,
				name: z.string(),
				brand: careBrand,
				eligible: z.boolean(),
				reasons: z.array(z.string()),
				enrolled: z.boolean(),
				deliveredAt: z.date().nullable(),
				milestone: z.number().int().nullable(),
				dueAt: z.date().nullable(),
				sourceCheckedAt: z.date(),
				activityCheckedAt: z.date().nullable(),
				channelRestricted: z.boolean(),
				template: z
					.object({
						id: sourceId,
						name: z.string(),
						version: z.number().int().positive(),
					})
					.nullable(),
			}),
		)
		.max(CARE_PILOT_LIMIT),
});
export type CarePilotPreview = z.infer<typeof carePilotPreviewOutput>;
export const careSourceLease = z.object({ id: sourceId, token: sourceId });
export type CareSourceLease = z.infer<typeof careSourceLease>;
const instant = z.iso.datetime({ offset: true });

export const careProducts = z
	.array(
		z.object({
			sku: z.string().min(1).max(160).nullable(),
			name: z.string().min(1).max(300),
			quantity: z.number().int().positive(),
		}),
	)
	.max(100);

export const careImport = z
	.object({
		brand: careBrand,
		shopId: sourceId,
		customerId: sourceId,
		customerName: z.string().min(1).max(300),
		orderId: sourceId,
		orderStatus: careOrderStatus,
		deliveredAt: instant.nullable(),
		deliveryEvidence: z.string().max(300).nullable(),
		products: careProducts,
		sourceCreatedAt: instant,
		sourceUpdatedAt: instant,
		conversation: z
			.object({
				pageId: sourceId,
				conversationId: sourceId,
				lastInboundAt: instant.nullable(),
				lastOutboundAt: instant.nullable(),
				verifiedAt: instant,
				activityVerifiedAt: instant.nullable().default(null),
				canSend: z.boolean().nullable(),
			})
			.nullable(),
	})
	.superRefine((value, ctx) => {
		if (
			value.orderStatus === "DELIVERED" &&
			(!value.deliveredAt || !value.deliveryEvidence)
		) {
			ctx.addIssue({
				code: "custom",
				message: "Verified delivery time and evidence are required",
				path: ["deliveredAt"],
			});
		}
	});

export const careTemplateInput = z.object({
	id: z.string().optional(),
	brand: careBrand,
	purpose: carePurpose,
	name: z.string().trim().min(1).max(160),
	body: z.string().trim().min(1).max(3000),
	requiredTags: z.array(z.string().trim().min(1).max(80)).max(20),
	excludedTags: z.array(z.string().trim().min(1).max(80)).max(20),
	validUntil: instant.nullable(),
});

export const careCustomerListInput = z.object({
	brand: careBrand.optional(),
	page: z.number().int().min(1).max(10000).default(1),
	search: z.string().trim().max(100).optional(),
	enrolled: z.boolean().optional(),
});

export const careListInput = z.object({
	brand: careBrand.optional(),
	mine: z.boolean().default(true),
	page: z.number().int().min(1).max(10000).default(1),
	state: z.enum(["ACTIVE", "WAITING", "DONE", "ALL"]).default("ACTIVE"),
});
export const careTaskInput = z.object({ id: sourceId });
export const careTemplateApproval = z.object({
	id: sourceId,
	version: z.number().int().positive(),
	approved: z.boolean(),
});
export const careCustomerResolution = z.object({
	id: sourceId,
	reason: z.string().trim().min(1).max(500),
	expectedInboundAt: instant.nullable(),
});
export const careActionInput = z.object({
	id: sourceId,
	version: z.number().int().nonnegative(),
	result: careResult,
	reason: z.string().trim().max(500).default(""),
	until: instant.optional(),
	resolution: z.enum(["SENT", "NOT_SENT"]).optional(),
	expectedInboundAt: instant.nullable().optional(),
});
export const careCustomerInput = z.object({
	id: sourceId,
	enrolled: z.boolean(),
	ownerId: sourceId.nullable(),
	tags: z.array(z.string().trim().min(1).max(80)).max(30),
});
export type CareImport = z.infer<typeof careImport>;
export type CareTemplateInput = z.infer<typeof careTemplateInput>;
export type CareActionInput = z.infer<typeof careActionInput>;

export const CARE = {
	pilotPreviewLimit: CARE_PILOT_LIMIT,
	dayMs: 86_400_000,
	leaseMs: 30 * 60_000,
	freshMs: 30 * 60_000,
	contactGapDays: 7,
	maxUnanswered: 2,
	pageSize: 30,
	workerIntervalMs: 60_000,
	workerBatch: 100,
	timezone: "Asia/Ho_Chi_Minh",
	steps: [
		{ day: 1, purpose: "CHECK_IN" },
		{ day: 5, purpose: "USE_VALUE" },
		{ day: 12, purpose: "EXPERIENCE" },
		{ day: 30, purpose: "REORDER" },
		{ day: 60, purpose: "REACTIVATE" },
		{ day: 90, purpose: "REVIEW" },
	],
} as const;

export function careDueAt(deliveredAt: Date, days: number): Date {
	const local = new Date(deliveredAt.getTime() + 7 * 3_600_000);
	return new Date(
		Date.UTC(
			local.getUTCFullYear(),
			local.getUTCMonth(),
			local.getUTCDate() + days,
			2,
		),
	);
}

export function careStep(deliveredAt: Date, now: Date) {
	return CARE.steps.find((step, index) => {
		const due = careDueAt(deliveredAt, step.day);
		const next = CARE.steps[index + 1];
		const expires = next
			? careDueAt(deliveredAt, next.day)
			: new Date(due.getTime() + CARE.contactGapDays * CARE.dayMs);
		return due <= now && now < expires;
	});
}

export function renderCareTemplate(
	body: string,
	variables: { customer: string; product: string; brand: string },
): string {
	const rendered = body.replace(
		/\{\{\s*([a-zA-Z_]+)\s*\}\}/g,
		(_, key: string) => {
			if (!Object.hasOwn(variables, key))
				throw new Error(`Unsupported template variable: ${key}`);
			const value = variables[key as keyof typeof variables];
			if (!value.trim()) throw new Error(`Missing template variable: ${key}`);
			return value;
		},
	);
	if (rendered.includes("{{") || rendered.includes("}}"))
		throw new Error("Unresolved template variable");
	return rendered;
}

export function careBlock(
	input: {
		enrolled: boolean;
		optedOut: boolean;
		openIssue: boolean;
		uncertain: boolean;
		pausedUntil: Date | null;
		replyPending: boolean;
		lastTouchAt: Date | null;
		unanswered: number;
		syncedAt: Date;
		conversationVerifiedAt: Date | null;
		canSend: boolean | null;
		hasConversation: boolean;
	},
	now: Date,
): string | null {
	if (!input.enrolled) return "Chưa tham gia pilot";
	if (input.optedOut) return "Khách từ chối liên hệ";
	if (input.openIssue) return "Đang xử lý hỗ trợ";
	if (input.uncertain) return "Kết quả gửi chưa rõ, cần đối soát";
	if (input.replyPending) return "Khách đã phản hồi, cần nhân viên xử lý";
	if (input.pausedUntil && input.pausedUntil > now)
		return "Chưa đến ngày khách hẹn";
	if (input.unanswered >= CARE.maxUnanswered)
		return "Tạm dừng sau hai lần không phản hồi";
	if (
		input.lastTouchAt &&
		now.getTime() - input.lastTouchAt.getTime() <
			CARE.contactGapDays * CARE.dayMs
	)
		return "Chưa đủ khoảng cách chăm sóc";
	if (!input.hasConversation) return "Chưa xác minh hội thoại";
	if (
		now.getTime() - input.syncedAt.getTime() > CARE.freshMs ||
		!input.conversationVerifiedAt ||
		now.getTime() - input.conversationVerifiedAt.getTime() > CARE.freshMs
	)
		return "Cần đồng bộ dữ liệu mới trước khi liên hệ";
	return null;
}
