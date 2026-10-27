import { readCareSource } from "@crm/auth/care-config";
import { db } from "@crm/db";
import type {
	CareImport,
	CareSourceLease,
} from "@crm/validation/customer-care";
import { z } from "zod";

const id = z.union([z.string().min(1), z.number().int()]).transform(String);
const wireTime = z.string().min(1);
const posItem = z.object({
	quantity: z.number().int().positive(),
	variation_info: z.object({
		name: z.string().min(1),
		display_id: z.string().min(1).nullable(),
	}),
});
export const posOrder = z.object({
	id,
	page_id: id.nullable().optional(),
	status: z.number().int(),
	status_name: z.string().optional(),
	inserted_at: wireTime,
	updated_at: wireTime,
	status_history: z
		.array(z.object({ status: z.number().int(), updated_at: wireTime }))
		.default([]),
	customer: z.object({
		id,
		name: z.string().min(1),
		fb_id: id.nullable().optional(),
	}),
	items: z.array(posItem).max(100),
});
const conversation = z.object({
	id,
	type: z.string(),
	from: z.object({ id }),
	inserted_at: wireTime,
	updated_at: wireTime,
	last_sent_by: z.object({ id }).nullable().optional(),
	can_inbox: z.boolean().nullable().optional(),
	can_send: z.boolean().nullable().optional(),
});
const posPage = z.object({
	success: z.literal(true),
	data: z.array(posOrder),
	total_pages: z.number().int().nonnegative(),
	page_number: z.number().int().positive().optional(),
});
class OrderPagination {
	private totalPages: number | undefined;
	private seen = new Set<string>();

	accept(data: z.infer<typeof posPage>, page: number) {
		if (data.page_number !== undefined && data.page_number !== page)
			throw new Error("POS_PAGE_MISMATCH");
		if (this.totalPages !== undefined && this.totalPages !== data.total_pages)
			throw new Error("POS_PAGINATION_CHANGED");
		if (
			(data.total_pages === 0 && data.data.length > 0) ||
			(data.total_pages > 0 &&
				(page > data.total_pages ||
					(data.data.length === 0 && !(page === 1 && data.total_pages === 1))))
		)
			throw new Error("POS_PAGE_INCOMPLETE");
		this.totalPages = data.total_pages;
		for (const order of data.data) {
			if (this.seen.has(order.id)) throw new Error("POS_DUPLICATE_ORDER");
			this.seen.add(order.id);
		}
		return page >= data.total_pages;
	}
}
export const pancakePage = z.object({
	success: z.literal(true),
	conversations: z.array(conversation),
	has_more: z.boolean().optional(),
	total_pages: z.number().int().nonnegative().optional(),
});
const channelSchema = z.object({
	brand: z.enum(["UMEHA", "LI_EN_SPORT"]),
	shopId: z.string().regex(/^\d+$/),
	pageId: z.string().regex(/^\d+$/),
});

export const messageFeed = z.object({
	success: z.literal(true),
	conversation_id: id,
	conv_from: z.object({ id }),
	can_inbox: z.boolean().optional(),
	is_banned: z.boolean().optional(),
	messages: z.array(
		z.object({
			conversation_id: id,
			page_id: id,
			type: z.string(),
			from: z.object({ id }),
			inserted_at: wireTime,
			is_removed: z.boolean().optional(),
			system_msg: z.boolean().optional(),
		}),
	),
});

export function messageActivity(
	feed: z.infer<typeof messageFeed>,
	pageId: string,
	conversationId: string,
	customerId: string,
	now: Date,
): NonNullable<CareImport["conversation"]> {
	if (
		feed.conversation_id !== conversationId ||
		feed.conv_from.id !== customerId
	)
		throw new Error("PANCAKE_IDENTITY_MISMATCH");
	if (
		feed.messages.some(
			(m) => m.page_id !== pageId || m.conversation_id !== conversationId,
		)
	)
		throw new Error("PANCAKE_MESSAGE_SCOPE_MISMATCH");
	const actionable = feed.messages.filter(
		(m) => m.type === "INBOX" && !m.is_removed && !m.system_msg,
	);
	const latest = (sender: string) =>
		actionable
			.filter((m) => m.from.id === sender)
			.map((m) => utcWire(m.inserted_at))
			.sort()
			.at(-1) ?? null;
	return {
		pageId,
		conversationId,
		lastInboundAt: latest(customerId),
		lastOutboundAt: latest(pageId),
		verifiedAt: now.toISOString(),
		activityVerifiedAt: now.toISOString(),
		canSend: feed.is_banned ? false : (feed.can_inbox ?? null),
	};
}

async function loadActivity(
	pageId: string,
	linked: z.infer<typeof conversation>,
	token: string,
	now: Date,
) {
	const url = new URL(
		`https://pages.fm/api/public_api/v1/pages/${pageId}/conversations/${encodeURIComponent(linked.id)}/messages`,
	);
	url.searchParams.set("page_access_token", token);
	return messageActivity(
		messageFeed.parse(await getJson(url)),
		pageId,
		linked.id,
		linked.from.id,
		now,
	);
}

export const SOURCE_SYNC = {
	pageSize: 50,
	conversationPageSize: 60,
	requestGapMs: 250,
	maxPages: 50,
	overlapMs: 2 * 86_400_000,
	leaseMs: 5 * 60_000,
	timeoutMs: 20_000,
	initialDays: 120,
	refreshMs: 10 * 60_000,
	refreshBatch: 100,
} as const;

type Channel = z.infer<typeof channelSchema>;
type Conversation = z.infer<typeof conversation>;
export function posPageCustomerId(
	fbId: string | null | undefined,
	pageId: string,
): string | undefined {
	if (!fbId) return undefined;
	const prefix = `${pageId}_`;
	if (fbId.startsWith(prefix)) return fbId.slice(prefix.length) || undefined;
	return fbId.includes("_") ? undefined : fbId;
}

function sourceConversation(
	conversations: Map<string, Conversation>,
	pageId: string,
	fbId: string | null | undefined,
) {
	const customerId = posPageCustomerId(fbId, pageId);
	if (!customerId) return undefined;
	const linked = conversations.get(customerId);
	if (fbId?.includes("_") && linked?.id !== fbId) return undefined;
	return linked;
}

export type ImportOrder = (
	value: CareImport,
	actor: string,
	now: Date,
	sourceLease: CareSourceLease,
) => Promise<unknown>;

function orderListUrl(
	channel: Channel,
	page: number,
	apiKey = process.env.CARE_POS_API_KEY,
) {
	const url = new URL(
		`https://pos.pages.fm/api/v1/shops/${channel.shopId}/orders`,
	);
	if (!apiKey) throw new Error("POS_API_KEY_MISSING");
	url.searchParams.set("api_key", apiKey);
	url.searchParams.set("page_number", String(page));
	url.searchParams.set("page_size", String(SOURCE_SYNC.pageSize));
	url.searchParams.set("option_sort", "inserted_at_desc");
	for (const field of [
		"id",
		"page_id",
		"status",
		"status_name",
		"inserted_at",
		"updated_at",
		"status_history",
		"customer",
		"items",
	])
		url.searchParams.append("fields[]", field);
	return url;
}

async function refreshEnrolled(
	channel: Channel,
	conversations: Map<string, z.infer<typeof conversation>>,
	token: string | undefined,
	importOrder: ImportOrder,
	now: Date,
	renewLease: () => Promise<void>,
	sourceLease: CareSourceLease,
	apiKey: string,
) {
	const customers = await db.careCustomer.findMany({
		where: {
			brand: channel.brand,
			shopId: channel.shopId,
			enrolled: true,
			optedOut: false,
			syncedAt: { lt: new Date(now.getTime() - SOURCE_SYNC.refreshMs) },
		},
		orderBy: [{ syncedAt: "asc" }, { id: "asc" }],
		take: SOURCE_SYNC.refreshBatch,
		select: { sourceCustomerId: true },
	});
	let imported = 0;
	for (const customer of customers) {
		const pagination = new OrderPagination();
		for (let page = 1; page <= SOURCE_SYNC.maxPages; page++) {
			await renewLease();
			const url = orderListUrl(channel, page, apiKey);
			url.searchParams.set("customer_id", customer.sourceCustomerId);
			const data = posPage.parse(await getJson(url));
			const complete = pagination.accept(data, page);
			if (
				data.data.some((raw) => raw.customer.id !== customer.sourceCustomerId)
			)
				throw new Error("POS_CUSTOMER_SCOPE_MISMATCH");
			const raw = data.data.find((raw) => raw.page_id === channel.pageId);
			if (raw) {
				const order = normalizeOrder(raw, channel, now);
				if (!order) throw new Error("POS_PAGE_SCOPE_MISMATCH");
				const linked = sourceConversation(
					conversations,
					channel.pageId,
					raw.customer.fb_id,
				);
				if (linked && token)
					order.conversation = await loadActivity(
						channel.pageId,
						linked,
						token,
						now,
					);
				await renewLease();
				await importOrder(order, "source-refresh", now, sourceLease);
				imported++;
				break;
			}
			if (complete) break;
			if (page === SOURCE_SYNC.maxPages)
				throw new Error("POS_CUSTOMER_PAGINATION_INCOMPLETE");
		}
	}
	return imported;
}

export function utcWire(value: string): string {
	const zoned = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
	const parsed = new Date(zoned);
	if (!Number.isFinite(parsed.getTime()))
		throw new Error("SOURCE_TIME_INVALID");
	return parsed.toISOString();
}

function conversationsComplete(data: z.infer<typeof pancakePage>) {
	if (data.has_more !== undefined) return !data.has_more;
	return data.conversations.length < SOURCE_SYNC.conversationPageSize;
}

async function loadConversations(
	pageId: string,
	token: string,
	renewLease: () => Promise<void>,
) {
	const conversations = new Map<string, z.infer<typeof conversation>>();
	const seen = new Set<string>();
	let cursor: string | undefined;
	for (let page = 1; page <= SOURCE_SYNC.maxPages; page++) {
		await renewLease();
		const url = new URL(
			`https://pages.fm/api/public_api/v2/pages/${pageId}/conversations`,
		);
		url.searchParams.set("page_access_token", token);
		if (cursor) url.searchParams.set("last_conversation_id", cursor);
		url.searchParams.set("type", "INBOX");
		const data = pancakePage.parse(await getJson(url));
		for (const c of data.conversations) {
			if (seen.has(c.id)) throw new Error("PANCAKE_DUPLICATE_CONVERSATION");
			seen.add(c.id);
			if (c.type !== "INBOX") continue;
			if (!c.id.startsWith(`${pageId}_`))
				throw new Error("PANCAKE_PAGE_SCOPE_MISMATCH");
			if (conversations.has(c.from.id))
				throw new Error("PANCAKE_CUSTOMER_AMBIGUOUS");
			conversations.set(c.from.id, c);
		}
		if (conversationsComplete(data)) return conversations;
		const next = data.conversations.at(-1)?.id;
		if (!next || next === cursor) throw new Error("PANCAKE_CURSOR_STALLED");
		cursor = next;
	}
	throw new Error("PANCAKE_PAGINATION_INCOMPLETE");
}

export function normalizeOrder(
	raw: z.infer<typeof posOrder>,
	channel: z.infer<typeof channelSchema>,
	_now: Date,
): CareImport | null {
	if (raw.page_id !== channel.pageId) return null;
	const delivered =
		raw.status_history
			.filter((h) => h.status === 3)
			.map((h) => utcWire(h.updated_at))
			.sort()
			.at(-1) ?? null;
	const status =
		raw.status === 3 || raw.status === 16
			? delivered
				? "DELIVERED"
				: "PENDING"
			: [4, 5].includes(raw.status)
				? "RETURNED"
				: raw.status === 15
					? "PARTIAL"
					: [6, 7].includes(raw.status)
						? "CANCELLED"
						: "PENDING";
	return {
		brand: channel.brand,
		shopId: channel.shopId,
		customerId: raw.customer.id,
		customerName: raw.customer.name,
		orderId: raw.id,
		orderStatus: status,
		deliveredAt: status === "DELIVERED" ? delivered : null,
		deliveryEvidence:
			status === "DELIVERED" ? "POS status_history.status=3" : null,
		products: raw.items.map((item) => ({
			sku: item.variation_info.display_id,
			name: item.variation_info.name,
			quantity: item.quantity,
		})),
		sourceCreatedAt: utcWire(raw.inserted_at),
		sourceUpdatedAt: utcWire(raw.updated_at),
		conversation: null,
	};
}

export async function getJson(url: URL): Promise<unknown> {
	await Bun.sleep(SOURCE_SYNC.requestGapMs);
	let response: Response;
	try {
		response = await fetch(url, {
			method: "GET",
			redirect: "error",
			signal: AbortSignal.timeout(SOURCE_SYNC.timeoutMs),
			headers: { accept: "application/json" },
		});
	} catch {
		throw new Error("SOURCE_CONNECTION_FAILED");
	}
	if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
	return response.json();
}

export async function syncSources(importOrder: ImportOrder, now = new Date()) {
	const stored = await readCareSource();
	if (
		stored &&
		(!stored.row.enabled || stored.row.checkedVersion !== stored.row.version)
	)
		return { configured: false, imported: 0 };
	if (
		!stored &&
		(!process.env.CARE_CHANNELS_JSON ||
			!process.env.CARE_POS_API_KEY ||
			!process.env.CARE_PANCAKE_TOKENS_JSON)
	)
		return { configured: false, imported: 0 };
	const channels = stored
		? stored.config.channels.map((channel) => ({
				...channel,
				shopId: stored.config.shopId,
			}))
		: z
				.array(channelSchema)
				.min(1)
				.max(10)
				.parse(JSON.parse(process.env.CARE_CHANNELS_JSON ?? "[]"));
	const tokens =
		stored?.secrets.pancakeTokens ??
		z
			.record(z.string(), z.string().min(1))
			.parse(JSON.parse(process.env.CARE_PANCAKE_TOKENS_JSON ?? "{}"));
	const apiKey = stored?.secrets.apiKey ?? process.env.CARE_POS_API_KEY;
	if (!apiKey) return { configured: false, imported: 0 };
	let imported = 0;
	for (const channel of channels) {
		const key = `${channel.brand}:${channel.shopId}:${channel.pageId}`;
		await db.careSyncState.upsert({
			where: { id: key },
			create: { id: key },
			update: {},
		});
		const leaseToken = crypto.randomUUID();
		const sourceLease = { id: key, token: leaseToken };
		const previousAttempt = await db.careSyncState.findUniqueOrThrow({
			where: { id: key },
		});
		if (
			previousAttempt.lastError &&
			previousAttempt.lastAttemptAt &&
			now.getTime() - previousAttempt.lastAttemptAt.getTime() <
				SOURCE_SYNC.leaseMs
		)
			continue;
		const lease = await db.careSyncState.updateMany({
			where: {
				id: key,
				OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
			},
			data: {
				leaseUntil: new Date(now.getTime() + SOURCE_SYNC.leaseMs),
				leaseToken,
				lastAttemptAt: now,
			},
		});
		if (!lease.count) continue;
		const renewLease = async () => {
			if (stored) {
				const current = await db.careIntegration.findUnique({
					where: { id: stored.row.id },
					select: { enabled: true, version: true },
				});
				if (!current?.enabled || current.version !== stored.row.version)
					throw new Error("SOURCE_CONFIG_CHANGED");
			}
			const renewed = await db.careSyncState.updateMany({
				where: { id: key, leaseToken },
				data: { leaseUntil: new Date(Date.now() + SOURCE_SYNC.leaseMs) },
			});
			if (!renewed.count) throw new Error("SOURCE_LEASE_LOST");
		};
		try {
			const token = tokens[channel.pageId];
			const cursor = await db.careSyncState.findUniqueOrThrow({
				where: { id: key },
			});
			const since = cursor.watermark
				? new Date(cursor.watermark.getTime() - SOURCE_SYNC.overlapMs)
				: new Date(now.getTime() - SOURCE_SYNC.initialDays * 86_400_000);
			let conversations = new Map<string, z.infer<typeof conversation>>();
			let conversationError: string | null = null;
			if (token) {
				try {
					conversations = await loadConversations(
						channel.pageId,
						token,
						renewLease,
					);
				} catch (error) {
					if (
						!(error instanceof Error) ||
						!["PANCAKE_PAGINATION_INCOMPLETE", "SOURCE_HTTP_429"].includes(
							error.message,
						)
					)
						throw error;
					conversationError = error.message;
				}
			}
			const activities = new Map<
				string,
				NonNullable<CareImport["conversation"]>
			>();
			let complete = false;
			const pagination = new OrderPagination();
			for (let page = 1; page <= SOURCE_SYNC.maxPages; page++) {
				await renewLease();
				const url = orderListUrl(channel, page, apiKey);
				url.searchParams.set("update_status", "updated_at");
				url.searchParams.set(
					"start_date_time",
					String(Math.floor(since.getTime() / 1000)),
				);
				url.searchParams.set(
					"end_date_time",
					String(Math.floor(now.getTime() / 1000)),
				);
				const data = posPage.parse(await getJson(url));
				const lastPage = pagination.accept(data, page);
				for (const raw of data.data) {
					await renewLease();
					const order = normalizeOrder(raw, channel, now);
					if (!order) continue;
					const linked = sourceConversation(
						conversations,
						channel.pageId,
						raw.customer.fb_id,
					);
					if (linked && token) {
						let activity = activities.get(linked.id);
						if (!activity) {
							activity = await loadActivity(channel.pageId, linked, token, now);
							activities.set(linked.id, activity);
						}
						order.conversation = activity;
					}
					await renewLease();
					await importOrder(order, "source-sync", now, sourceLease);
					imported++;
				}
				await renewLease();
				if (lastPage) {
					complete = true;
					break;
				}
			}
			if (!complete) throw new Error("POS_PAGINATION_INCOMPLETE");
			if (conversationError) throw new Error(conversationError);
			imported += await refreshEnrolled(
				channel,
				conversations,
				token,
				importOrder,
				now,
				renewLease,
				sourceLease,
				apiKey,
			);
			await db.careSyncState.updateMany({
				where: { id: key, leaseToken },
				data: {
					watermark: now,
					lastSuccessAt: new Date(),
					lastError: token ? null : "PANCAKE_NOT_CONFIGURED",
				},
			});
		} catch (error) {
			const code =
				error instanceof Error && /^[A-Z_0-9]+$/.test(error.message)
					? error.message
					: "SOURCE_VALIDATION_FAILED";
			await db.careSyncState.updateMany({
				where: { id: key, leaseToken },
				data: { lastError: code },
			});
			if (code === "SOURCE_HTTP_429") return { configured: true, imported };
		} finally {
			await db.careSyncState.updateMany({
				where: { id: key, leaseToken },
				data: { leaseUntil: null, leaseToken: null },
			});
		}
	}
	return { configured: true, imported };
}
