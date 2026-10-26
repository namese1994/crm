import { expect, test } from "bun:test";
import { db } from "@crm/db";
import type { CareImport } from "@crm/validation/customer-care";
import {
	messageActivity,
	messageFeed,
	normalizeOrder,
	posOrder,
	syncSources,
	utcWire,
} from "./source-sync";

test("wire timestamps without zone are UTC, never host-local", () => {
	expect(utcWire("2026-10-26T18:00:00")).toBe("2026-10-26T18:00:00.000Z");
});

test("message activity uses actual messages and strips content", () => {
	const result = messageActivity(
		messageFeed.parse({
			success: true,
			conversation_id: "11_22",
			conv_from: { id: "22" },
			can_inbox: false,
			messages: [
				{
					conversation_id: "11_22",
					page_id: "11",
					type: "INBOX",
					from: { id: "22" },
					inserted_at: "2026-10-23T10:00:00",
					message: "DO_NOT_PERSIST_MESSAGE_BODY",
				},
				{
					conversation_id: "11_22",
					page_id: "11",
					type: "INBOX",
					from: { id: "11" },
					inserted_at: "2026-10-22T10:00:00",
				},
				{
					conversation_id: "11_22",
					page_id: "11",
					type: "system_msg",
					from: { id: "11" },
					inserted_at: "2026-10-26T10:00:00",
				},
				{
					conversation_id: "11_22",
					page_id: "11",
					type: "INBOX",
					from: { id: "22" },
					inserted_at: "2026-10-25T10:00:00",
					is_removed: true,
				},
			],
		}),
		"11",
		"11_22",
		"22",
		new Date("2026-10-27T02:00:00Z"),
	);
	expect(result.lastInboundAt).toBe("2026-10-23T10:00:00.000Z");
	expect(result.lastOutboundAt).toBe("2026-10-22T10:00:00.000Z");
	expect(result.canSend).toBe(false);
	expect(JSON.stringify(result)).not.toContain("DO_NOT_PERSIST_MESSAGE_BODY");
});

test("message scope cannot be borrowed from another customer or page", () => {
	const feed = {
		success: true,
		conversation_id: "11_22",
		conv_from: { id: "99" },
		messages: [],
	};
	expect(() =>
		messageActivity(messageFeed.parse(feed), "11", "11_22", "22", new Date()),
	).toThrow("PANCAKE_IDENTITY_MISMATCH");
});

test("partial pagination and 429 preserve watermark and release lease", async () => {
	const pageId = `9${Date.now()}`;
	const key = `UMEHA:987001:${pageId}`;
	const saved = {
		channels: process.env.CARE_CHANNELS_JSON,
		key: process.env.CARE_POS_API_KEY,
		tokens: process.env.CARE_PANCAKE_TOKENS_JSON,
		fetch: globalThis.fetch,
	};
	process.env.CARE_CHANNELS_JSON = JSON.stringify([
		{ brand: "UMEHA", shopId: "987001", pageId },
	]);
	process.env.CARE_POS_API_KEY = "test-only";
	process.env.CARE_PANCAKE_TOKENS_JSON = JSON.stringify({
		[pageId]: "test-only",
	});
	let calls = 0;
	let imported = 0;
	globalThis.fetch = (async (request: string | URL | Request) => {
		calls++;
		const url = new URL(String(request));
		if (url.hostname === "pages.fm")
			return Response.json({
				success: true,
				conversations: [],
				has_more: false,
			});
		if (url.searchParams.get("page_number") === "2")
			return new Response("rate limited", { status: 429 });
		return Response.json({
			success: true,
			total_pages: 2,
			page_number: 1,
			data: [
				{
					id: 1,
					page_id: pageId,
					status: 0,
					inserted_at: "2026-10-01T00:00:00",
					updated_at: "2026-10-26T00:00:00",
					customer: { id: "test", name: "Khách mẫu" },
					items: [],
				},
			],
		});
	}) as typeof fetch;
	try {
		const now = new Date("2026-10-27T03:00:00Z");
		await syncSources(async () => {
			imported++;
		}, now);
		const state = await db.careSyncState.findUniqueOrThrow({
			where: { id: key },
		});
		expect(imported).toBe(1);
		expect(state.watermark).toBeNull();
		expect(state.lastError).toBe("SOURCE_HTTP_429");
		expect(state.leaseToken).toBeNull();
		expect(state.leaseUntil).toBeNull();
		await syncSources(async () => {}, now);
		expect(calls).toBe(3);
	} finally {
		globalThis.fetch = saved.fetch;
		for (const [name, value] of [
			["CARE_CHANNELS_JSON", saved.channels],
			["CARE_POS_API_KEY", saved.key],
			["CARE_PANCAKE_TOKENS_JSON", saved.tokens],
		] as const) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
		await db.careSyncState.deleteMany({ where: { id: key } });
	}
});

test("delivery uses status=3 history, never payment or update time", () => {
	const raw = posOrder.parse({
		id: 1,
		page_id: "11",
		status: 16,
		inserted_at: "2026-10-01T00:00:00",
		updated_at: "2026-10-22T00:00:00",
		customer: { id: "test", name: "Khách mẫu" },
		items: [
			{ quantity: 1, variation_info: { name: "Mẫu", display_id: " V35  M " } },
		],
		status_history: [
			{ status: 3, updated_at: "2026-10-03T10:00:00" },
			{ status: 16, updated_at: "2026-10-22T00:00:00" },
		],
	});
	const channel = { brand: "UMEHA" as const, shopId: "1", pageId: "11" };
	const normalized = normalizeOrder(raw, channel, new Date());
	expect(normalized?.deliveredAt).toBe("2026-10-03T10:00:00.000Z");
	expect(normalized?.products[0]?.sku).toBe(" V35  M ");
	expect(
		normalizeOrder({ ...raw, status_history: [] }, channel, new Date())
			?.orderStatus,
	).toBe("PENDING");
	expect(
		normalizeOrder(raw, { ...channel, pageId: "12" }, new Date()),
	).toBeNull();
});

test("enrolled customers refresh even when their order is outside the incremental window", async () => {
	const pageId = `8${Date.now()}`;
	const customerId = crypto.randomUUID();
	const key = `UMEHA:987002:${pageId}`;
	const now = new Date("2026-10-27T03:00:00Z");
	const saved = {
		channels: process.env.CARE_CHANNELS_JSON,
		key: process.env.CARE_POS_API_KEY,
		tokens: process.env.CARE_PANCAKE_TOKENS_JSON,
		fetch: globalThis.fetch,
	};
	process.env.CARE_CHANNELS_JSON = JSON.stringify([
		{ brand: "UMEHA", shopId: "987002", pageId },
	]);
	process.env.CARE_POS_API_KEY = "test-only";
	process.env.CARE_PANCAKE_TOKENS_JSON = JSON.stringify({
		[pageId]: "test-only",
	});
	await db.careCustomer.create({
		data: {
			id: customerId,
			brand: "UMEHA",
			shopId: "987002",
			sourceCustomerId: customerId,
			name: "Khách mẫu kiểm thử",
			enrolled: true,
			syncedAt: new Date("2026-10-01T00:00:00Z"),
		},
	});
	await db.careSyncState.create({
		data: { id: key, watermark: new Date("2026-10-26T03:00:00Z") },
	});
	const imports: CareImport[] = [];
	let refreshed = false;
	globalThis.fetch = (async (request: string | URL | Request) => {
		const url = new URL(String(request));
		if (url.pathname.endsWith("/messages"))
			return Response.json({
				success: true,
				conversation_id: `${pageId}_22`,
				conv_from: { id: "22" },
				messages: [
					{
						conversation_id: `${pageId}_22`,
						page_id: pageId,
						type: "INBOX",
						from: { id: "22" },
						inserted_at: "2026-10-27T02:00:00",
					},
				],
			});
		if (url.hostname === "pages.fm")
			return Response.json({
				success: true,
				has_more: false,
				conversations: [
					{
						id: `${pageId}_22`,
						type: "INBOX",
						from: { id: "22" },
						inserted_at: "2026-10-01T00:00:00",
						updated_at: "2026-10-27T02:00:00",
					},
				],
			});
		refreshed = url.searchParams.get("customer_id") === customerId;
		return Response.json({
			success: true,
			total_pages: 1,
			page_number: 1,
			data: refreshed
				? [
						{
							id: "old-order",
							page_id: pageId,
							status: 3,
							inserted_at: "2026-10-01T00:00:00",
							updated_at: "2026-10-02T00:00:00",
							status_history: [
								{ status: 3, updated_at: "2026-10-02T00:00:00" },
							],
							customer: { id: customerId, name: "Khách mẫu", fb_id: "22" },
							items: [],
						},
					]
				: [],
		});
	}) as typeof fetch;
	try {
		await syncSources(async (value) => {
			imports.push(value);
		}, now);
		expect(refreshed).toBe(true);
		expect(imports).toHaveLength(1);
		expect(imports[0]?.orderId).toBe("old-order");
		expect(imports[0]?.deliveredAt).toBe("2026-10-02T00:00:00.000Z");
		expect(imports[0]?.conversation?.lastInboundAt).toBe(
			"2026-10-27T02:00:00.000Z",
		);
		expect(imports[0]?.conversation?.activityVerifiedAt).toBe(
			now.toISOString(),
		);
	} finally {
		globalThis.fetch = saved.fetch;
		for (const [name, value] of [
			["CARE_CHANNELS_JSON", saved.channels],
			["CARE_POS_API_KEY", saved.key],
			["CARE_PANCAKE_TOKENS_JSON", saved.tokens],
		] as const) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
		await db.careCustomer.delete({ where: { id: customerId } });
		await db.careSyncState.delete({ where: { id: key } });
	}
});
