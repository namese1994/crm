import { readCareSource } from "@crm/auth/care-config";
import { db } from "@crm/db";
import { CARE_INTEGRATIONS } from "@crm/validation/care-integrations";
import { z } from "zod";
import {
	getJson,
	type ImportOrder,
	messageActivity,
	messageFeed,
	normalizeOrder,
	posOrder,
	SOURCE_SYNC,
} from "./source-sync";

const orderPage = z.object({
	success: z.literal(true),
	data: z.array(z.object({ id: z.union([z.string(), z.number()]) })),
});
const conversationCheck = z.object({
	success: z.literal(true),
	conversations: z.array(z.object({ id: z.union([z.string(), z.number()]) })),
});
const orderDetail = z.object({ success: z.literal(true), data: posOrder });

function safeError(error: Error | null) {
	return error && /^[A-Z_0-9]+$/.test(error.message)
		? error.message
		: "SOURCE_VALIDATION_FAILED";
}

export async function checkPosSource(now = new Date()) {
	const source = await readCareSource();
	if (!source?.row.checkRequestedAt) return;
	const claimed = await db.careIntegration.updateMany({
		where: {
			id: source.row.id,
			version: source.row.version,
			checkRequestedAt: source.row.checkRequestedAt,
			OR: [
				{ lastError: null },
				{ lastError: { not: "CHECK_RUNNING" } },
				{
					lastCheckedAt: {
						lt: new Date(now.getTime() - CARE_INTEGRATIONS.leaseMs),
					},
				},
			],
		},
		data: { lastError: "CHECK_RUNNING", lastCheckedAt: now },
	});
	if (!claimed.count) return;
	let error: string | null = null;
	try {
		const url = new URL(
			`https://pos.pages.fm/api/v1/shops/${source.config.shopId}/orders`,
		);
		url.searchParams.set("api_key", source.secrets.apiKey);
		url.searchParams.set("page_number", "1");
		url.searchParams.set("page_size", "1");
		url.searchParams.append("fields[]", "id");
		orderPage.parse(await getJson(url));
		for (const channel of source.config.channels) {
			const token = source.secrets.pancakeTokens[channel.pageId];
			if (!token) continue;
			const pageUrl = new URL(
				`https://pages.fm/api/public_api/v2/pages/${channel.pageId}/conversations`,
			);
			pageUrl.searchParams.set("page_access_token", token);
			pageUrl.searchParams.set("limit", "1");
			pageUrl.searchParams.set("type", "INBOX");
			conversationCheck.parse(await getJson(pageUrl));
		}
	} catch (cause) {
		error = safeError(cause instanceof Error ? cause : null);
	}
	await db.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM "careIntegration" WHERE id = ${source.row.id} FOR UPDATE`;
		const current = await tx.careIntegration.findUniqueOrThrow({
			where: { id: source.row.id },
		});
		if (current.version !== source.row.version) return;
		await tx.careIntegration.update({
			where: { id: current.id },
			data: {
				checkRequestedAt: null,
				checkedVersion: error ? null : current.version,
				lastCheckedAt: new Date(),
				lastError: error,
				enabled: error ? false : current.enabled,
			},
		});
		if (error)
			for (const channel of source.config.channels)
				await tx.careSyncState.updateMany({
					where: {
						id: `${channel.brand}:${source.config.shopId}:${channel.pageId}`,
					},
					data: { lastError: error, leaseToken: null, leaseUntil: null },
				});
	});
}

export async function processPosWebhooks(
	importOrder: ImportOrder,
	clock: () => Date = () => new Date(),
) {
	for (let index = 0; index < CARE_INTEGRATIONS.webhookBatch; index++) {
		const now = clock();
		const candidate = await db.careWebhookReceipt.findFirst({
			where: {
				OR: [
					{ state: "PENDING", nextAttemptAt: { lte: now } },
					{ state: "RUNNING", leaseUntil: { lt: now } },
				],
			},
			orderBy: { receivedAt: "asc" },
		});
		if (!candidate) return;
		const token = crypto.randomUUID();
		const claimed = await db.careWebhookReceipt.updateMany({
			where: {
				id: candidate.id,
				OR: [
					{ state: "PENDING", nextAttemptAt: { lte: now } },
					{ state: "RUNNING", leaseUntil: { lt: now } },
				],
			},
			data: {
				state: "RUNNING",
				leaseToken: token,
				leaseUntil: new Date(now.getTime() + CARE_INTEGRATIONS.leaseMs),
				attempts: { increment: 1 },
			},
		});
		if (!claimed.count) continue;
		const receipt = await db.careWebhookReceipt.findFirstOrThrow({
			where: { id: candidate.id, leaseToken: token },
		});
		let sourceLease: { id: string; token: string } | undefined;
		try {
			const source = await readCareSource();
			if (
				!source?.row.enabled ||
				source.row.checkedVersion !== source.row.version
			)
				throw new Error("SOURCE_DISABLED");
			if (receipt.shopId !== source.config.shopId) {
				await db.careWebhookReceipt.updateMany({
					where: { id: receipt.id, leaseToken: token },
					data: {
						state: "IGNORED",
						lastError: "SOURCE_SHOP_CHANGED",
						finishedAt: new Date(),
						leaseToken: null,
						leaseUntil: null,
					},
				});
				continue;
			}
			const url = new URL(
				`https://pos.pages.fm/api/v1/shops/${source.config.shopId}/orders/${encodeURIComponent(receipt.orderId)}`,
			);
			url.searchParams.set("api_key", source.secrets.apiKey);
			const raw = orderDetail.parse(await getJson(url)).data;
			if (String(raw.id) !== receipt.orderId)
				throw new Error("POS_ORDER_SCOPE_MISMATCH");
			const channel = source.config.channels.find(
				(row) => row.pageId === raw.page_id,
			);
			if (!channel) {
				await db.careWebhookReceipt.updateMany({
					where: { id: receipt.id, leaseToken: token },
					data: {
						state: "IGNORED",
						lastError: "UNMAPPED_PAGE",
						finishedAt: new Date(),
						leaseToken: null,
						leaseUntil: null,
					},
				});
				continue;
			}
			const key = `${channel.brand}:${source.config.shopId}:${channel.pageId}`;
			const leaseToken = crypto.randomUUID();
			const lease = await db.careSyncState.updateMany({
				where: {
					id: key,
					OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
				},
				data: {
					leaseToken,
					leaseUntil: new Date(now.getTime() + SOURCE_SYNC.leaseMs),
				},
			});
			if (!lease.count) throw new Error("SOURCE_BUSY");
			sourceLease = { id: key, token: leaseToken };
			const order = normalizeOrder(
				raw,
				{ ...channel, shopId: source.config.shopId },
				now,
			);
			if (!order) throw new Error("POS_PAGE_SCOPE_MISMATCH");
			const pageToken = source.secrets.pancakeTokens[channel.pageId];
			const existing = await db.careConversation.findFirst({
				where: {
					pageId: channel.pageId,
					customer: {
						brand: channel.brand,
						shopId: source.config.shopId,
						sourceCustomerId: raw.customer.id,
					},
				},
			});
			if (existing && pageToken && raw.customer.fb_id) {
				const activityUrl = new URL(
					`https://pages.fm/api/public_api/v1/pages/${channel.pageId}/conversations/${encodeURIComponent(existing.sourceId)}/messages`,
				);
				activityUrl.searchParams.set("page_access_token", pageToken);
				order.conversation = messageActivity(
					messageFeed.parse(await getJson(activityUrl)),
					channel.pageId,
					existing.sourceId,
					raw.customer.fb_id,
					now,
				);
			}
			const current = await db.careIntegration.findUniqueOrThrow({
				where: { id: source.row.id },
			});
			if (!current.enabled || current.version !== source.row.version)
				throw new Error("SOURCE_CONFIG_CHANGED");
			const stillOwned = await db.careWebhookReceipt.count({
				where: {
					id: receipt.id,
					leaseToken: token,
					leaseUntil: { gt: clock() },
				},
			});
			if (!stillOwned) throw new Error("WEBHOOK_LEASE_LOST");
			await importOrder(order, "poscake-webhook", clock(), sourceLease);
			await db.careWebhookReceipt.updateMany({
				where: { id: receipt.id, leaseToken: token },
				data: {
					state: "DONE",
					finishedAt: new Date(),
					lastError: null,
					leaseToken: null,
					leaseUntil: null,
				},
			});
		} catch (cause) {
			const error = safeError(cause instanceof Error ? cause : null);
			const exhausted = receipt.attempts >= CARE_INTEGRATIONS.webhookAttempts;
			await db.careWebhookReceipt.updateMany({
				where: { id: receipt.id, leaseToken: token },
				data: {
					state: exhausted ? "FAILED" : "PENDING",
					nextAttemptAt: new Date(
						clock().getTime() +
							CARE_INTEGRATIONS.retryMs *
								2 **
									Math.min(receipt.attempts, CARE_INTEGRATIONS.webhookAttempts),
					),
					lastError: error,
					leaseToken: null,
					leaseUntil: null,
				},
			});
			if (sourceLease && error !== "SOURCE_BUSY")
				await db.careSyncState.updateMany({
					where: { id: sourceLease.id, leaseToken: sourceLease.token },
					data: { lastError: error },
				});
		} finally {
			if (sourceLease)
				await db.careSyncState.updateMany({
					where: { id: sourceLease.id, leaseToken: sourceLease.token },
					data: { leaseToken: null, leaseUntil: null },
				});
		}
	}
}
