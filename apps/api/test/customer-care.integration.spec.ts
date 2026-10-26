import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@crm/db";
import type { CareImport } from "@crm/validation/customer-care";
import { CustomerCareService } from "../src/customer-care/customer-care.service";

const service = new CustomerCareService(db);
const prefix = `care-${crypto.randomUUID()}`;
const actor = `${prefix}-staff`;
const manager = `${prefix}-manager`;
const now = new Date("2026-10-27T03:00:00Z");
const fresh = now.toISOString();
const fixture = (
	key: string,
	brand: "UMEHA" | "LI_EN_SPORT" = "UMEHA",
): CareImport & { conversation: NonNullable<CareImport["conversation"]> } => ({
	brand,
	shopId: "test-shop",
	customerId: `${prefix}-${key}`,
	customerName: "Khách kiểm thử",
	orderId: `${prefix}-${key}`,
	orderStatus: "DELIVERED",
	deliveredAt: "2026-10-26T04:00:00Z",
	deliveryEvidence: "synthetic delivery event",
	products: [{ sku: " V35  M ", name: "Sản phẩm kiểm thử", quantity: 1 }],
	sourceCreatedAt: "2026-10-20T04:00:00Z",
	sourceUpdatedAt: fresh,
	conversation: {
		pageId: `${prefix}-${brand}`,
		conversationId: `${prefix}-${key}-${brand}`,
		lastInboundAt: null,
		lastOutboundAt: null,
		verifiedAt: fresh,
		activityVerifiedAt: fresh,
		canSend: true,
	},
});

test("future conversation activity cannot manufacture a fresh source check", async () => {
	const input = fixture("future-activity");
	input.conversation.activityVerifiedAt = "2026-10-28T03:00:00Z";
	await expect(service.importOrder(input, manager, now)).rejects.toThrow(
		"Dữ liệu nguồn có thời điểm trong tương lai",
	);
});

async function enrolled(key: string) {
	const imported = await service.importOrder(fixture(key), manager, now);
	await service.configureCustomer(
		{ id: imported.customerId, enrolled: true, ownerId: actor, tags: [] },
		manager,
	);
	await service.tick(now);
	return db.careTask.findFirstOrThrow({
		where: { customerId: imported.customerId },
	});
}

beforeAll(async () => {
	if (!new URL(process.env.TEST_DATABASE_URL ?? "").pathname.endsWith("_test"))
		throw new Error("Isolated test database required");
	await db.organization.upsert({
		where: { id: "workspace" },
		create: { id: "workspace", name: "Test", slug: "test", createdAt: now },
		update: {},
	});
	for (const [id, role] of [
		[actor, "member"],
		[manager, "admin"],
	] as const) {
		await db.user.create({
			data: {
				id,
				name: "Test",
				email: `${id}@example.invalid`,
				updatedAt: now,
			},
		});
		await db.member.create({
			data: {
				id: crypto.randomUUID(),
				organizationId: "workspace",
				userId: id,
				role,
				createdAt: now,
			},
		});
	}
});

afterAll(async () => {
	const customers = await db.careCustomer.findMany({
		where: { sourceCustomerId: { startsWith: prefix } },
		select: { id: true },
	});
	const ids = customers.map((c) => c.id);
	await db.careEvent.deleteMany({ where: { customerId: { in: ids } } });
	await db.careTask.deleteMany({ where: { customerId: { in: ids } } });
	await db.careOrder.deleteMany({ where: { customerId: { in: ids } } });
	await db.careConversation.deleteMany({ where: { customerId: { in: ids } } });
	await db.careCustomer.deleteMany({ where: { id: { in: ids } } });
	await db.careTemplate.deleteMany({ where: { name: { startsWith: prefix } } });
	await db.member.deleteMany({ where: { userId: { in: [actor, manager] } } });
	await db.user.deleteMany({ where: { id: { in: [actor, manager] } } });
	await db.$disconnect();
});

describe("manual customer care", () => {
	test("a relevant tagged template outranks a newer generic template", async () => {
		const task = await enrolled("specific-template");
		await service.configureCustomer(
			{ id: task.customerId, enrolled: true, ownerId: actor, tags: ["loyal"] },
			manager,
		);
		try {
			for (const [key, body, requiredTags] of [
				["specific", "CHĂM SÓC NHÓM: {{customer}}", ["loyal"]],
				["generic", "NỘI DUNG CHUNG: {{customer}}", []],
			] as const) {
				const template = await service.saveTemplate(
					{
						brand: "UMEHA",
						purpose: "CHECK_IN",
						name: `${prefix}-${key}`,
						body,
						requiredTags: [...requiredTags],
						excludedTags: [],
						validUntil: null,
					},
					manager,
				);
				await service.approveTemplate(template.id, manager, true);
				await db.careTemplate.update({
					where: { id: template.id },
					data: {
						updatedAt: new Date(
							key === "generic"
								? "2026-10-27T02:00:00Z"
								: "2026-10-01T02:00:00Z",
						),
					},
				});
			}
			await service.claim(task.id, actor, now);
			expect((await service.copy(task.id, actor, now)).text).toStartWith(
				"CHĂM SÓC NHÓM:",
			);
		} finally {
			await db.careTemplate.updateMany({
				where: { name: { in: [`${prefix}-specific`, `${prefix}-generic`] } },
				data: { approvedAt: null, approvedBy: null },
			});
		}
	});
	test("response metrics distinguish checked history, latest confirmation and copy-only work", async () => {
		const before = (await service.metrics(now)).activity;
		for (const key of ["metrics-replied", "metrics-stale", "metrics-earlier"]) {
			const input = fixture(key);
			input.conversation.lastInboundAt =
				key === "metrics-earlier"
					? "2026-10-26T23:00:00Z"
					: "2026-10-27T02:00:00Z";
			input.conversation.activityVerifiedAt =
				key === "metrics-stale" ? "2026-10-27T00:00:00Z" : fresh;
			const imported = await service.importOrder(input, manager, now);
			await db.careEvent.create({
				data: {
					customerId: imported.customerId,
					actorId: actor,
					kind: "SENT_MANUAL",
					createdAt: new Date("2026-10-27T01:00:00Z"),
				},
			});
			if (key === "metrics-earlier")
				await db.careEvent.create({
					data: {
						customerId: imported.customerId,
						actorId: actor,
						kind: "SENT_MANUAL",
						createdAt: new Date("2026-10-26T22:00:00Z"),
					},
				});
		}
		const copyOnly = await service.importOrder(
			fixture("metrics-copy-only"),
			manager,
			now,
		);
		await db.careEvent.create({
			data: {
				customerId: copyOnly.customerId,
				actorId: actor,
				kind: "COPY_PREPARED",
				createdAt: now,
			},
		});
		const after = (await service.metrics(now)).activity;
		const base = before.responses.find((r) => r.brand === "UMEHA");
		const measured = after.responses.find((r) => r.brand === "UMEHA");
		expect(measured?.confirmed).toBe((base?.confirmed ?? 0) + 3);
		expect(measured?.checked).toBe((base?.checked ?? 0) + 2);
		expect(measured?.replied).toBe((base?.replied ?? 0) + 1);
		expect(after.outcomes.find((r) => r.kind === "SENT_MANUAL")?.count).toBe(
			(before.outcomes.find((r) => r.kind === "SENT_MANUAL")?.count ?? 0) + 4,
		);
		expect(after.staff.find((r) => r.id === actor)?.prepared).toBe(
			(before.staff.find((r) => r.id === actor)?.prepared ?? 0) + 1,
		);
		expect(after.responseDefinition).toBe(
			"OBSERVED_INBOUND_AFTER_LATEST_MANUAL_CONFIRMATION",
		);
	});
	test("source replay and restart do not duplicate tasks; SKU stays exact", async () => {
		const task = await enrolled("replay");
		await service.importOrder(fixture("replay"), manager, now);
		await new CustomerCareService(db).tick(now);
		expect(
			await db.careTask.count({ where: { customerId: task.customerId } }),
		).toBe(1);
		const order = await db.careOrder.findUniqueOrThrow({
			where: { id: task.orderId },
		});
		expect(JSON.stringify(order.products)).toContain(" V35  M ");
	});
	test("drafts cannot copy; copy never counts as sent; revoked template blocks confirmation", async () => {
		const task = await enrolled("copy");
		await service.claim(task.id, actor, now);
		await expect(service.copy(task.id, actor, now)).rejects.toThrow();
		const template = await service.saveTemplate(
			{
				brand: "UMEHA",
				purpose: "CHECK_IN",
				name: `${prefix}-check`,
				body: "Chị {{customer}}, {{product}} mặc có thoải mái không ạ?",
				requiredTags: [],
				excludedTags: [],
				validUntil: null,
			},
			manager,
		);
		await service.approveTemplate(template.id, manager, true);
		const copy = await service.copy(task.id, actor, now);
		expect(copy.text).toContain("Sản phẩm kiểm thử");
		expect(
			(await db.careTask.findUniqueOrThrow({ where: { id: task.id } }))
				.confirmedAt,
		).toBeNull();
		expect(
			(
				await db.careCustomer.findUniqueOrThrow({
					where: { id: task.customerId },
				})
			).lastTouchAt,
		).toBeNull();
		await service.approveTemplate(template.id, manager, false);
		await expect(
			service.action(
				{
					id: task.id,
					version: copy.version,
					result: "SENT_MANUAL",
					reason: "",
				},
				actor,
				now,
			),
		).rejects.toThrow();
	});
	test("different staff cannot claim another owner's customer", async () => {
		const task = await enrolled("owner");
		await expect(service.claim(task.id, manager, now)).rejects.toThrow();
	});
	test("concurrent confirmations yield exactly one manual sent event", async () => {
		const task = await enrolled("race");
		const template = await service.saveTemplate(
			{
				brand: "UMEHA",
				purpose: "CHECK_IN",
				name: `${prefix}-race`,
				body: "{{customer}} nhận hàng ổn chưa ạ?",
				requiredTags: [],
				excludedTags: [],
				validUntil: null,
			},
			manager,
		);
		await service.approveTemplate(template.id, manager, true);
		await service.claim(task.id, actor, now);
		const copied = await service.copy(task.id, actor, now);
		const results = await Promise.allSettled([
			service.action(
				{
					id: task.id,
					version: copied.version,
					result: "SENT_MANUAL",
					reason: "",
				},
				actor,
				now,
			),
			service.action(
				{
					id: task.id,
					version: copied.version,
					result: "SENT_MANUAL",
					reason: "",
				},
				actor,
				now,
			),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(
			await db.careEvent.count({
				where: { taskId: task.id, kind: "SENT_MANUAL" },
			}),
		).toBe(1);
	});
	test("opt-out blocks a previously claimed task", async () => {
		const task = await enrolled("optout");
		const claimed = await service.claim(task.id, actor, now);
		await service.action(
			{
				id: task.id,
				version: claimed.version,
				result: "OPT_OUT",
				reason: "Khách yêu cầu",
			},
			actor,
			now,
		);
		await expect(service.copy(task.id, actor, now)).rejects.toThrow();
	});
	test("stale updates cannot roll back delivery state", async () => {
		const input = fixture("stale");
		await service.importOrder(input, manager, now);
		expect(
			(
				await service.importOrder(
					{
						...input,
						orderStatus: "PENDING",
						deliveredAt: null,
						deliveryEvidence: null,
						sourceUpdatedAt: "2026-10-21T00:00:00Z",
					},
					manager,
					now,
				)
			).stale,
		).toBe(true);
	});
	test("brands keep identical source customer IDs separate", async () => {
		const a = await service.importOrder(
			fixture("brand", "UMEHA"),
			manager,
			now,
		);
		const b = await service.importOrder(
			fixture("brand", "LI_EN_SPORT"),
			manager,
			now,
		);
		expect(a.customerId).not.toBe(b.customerId);
	});
	test("new order invalidates old open task", async () => {
		const task = await enrolled("new-order");
		await service.importOrder(
			{
				...fixture("new-order"),
				orderId: `${prefix}-new-pending`,
				orderStatus: "PENDING",
				deliveredAt: null,
				deliveryEvidence: null,
				sourceCreatedAt: "2026-10-27T02:00:00Z",
			},
			manager,
			now,
		);
		await service.tick(now);
		expect(
			(await db.careTask.findUniqueOrThrow({ where: { id: task.id } })).state,
		).toBe("CANCELLED");
	});
	test("copied unresolved content freezes rather than creating another touch", async () => {
		const task = await enrolled("copied-new");
		await service.claim(task.id, actor, now);
		await service.copy(task.id, actor, now);
		await service.importOrder(
			{
				...fixture("copied-new"),
				orderId: `${prefix}-copied-new-pending`,
				orderStatus: "PENDING",
				deliveredAt: null,
				deliveryEvidence: null,
				sourceCreatedAt: "2026-10-27T02:00:00Z",
			},
			manager,
			now,
		);
		await service.tick(now);
		expect(
			(await db.careTask.findUniqueOrThrow({ where: { id: task.id } })).outcome,
		).toBe("UNCERTAIN");
	});
	test("member cannot approve templates or enroll customers", async () => {
		await expect(
			service.saveTemplate(
				{
					brand: "UMEHA",
					purpose: "CHECK_IN",
					name: "x",
					body: "x",
					requiredTags: [],
					excludedTags: [],
					validUntil: null,
				},
				actor,
			),
		).rejects.toThrow();
	});

	test("a first-sync customer reply cannot become a proactive reminder", async () => {
		const input = fixture("first-inbound");
		const imported = await service.importOrder(
			{
				...input,
				conversation: {
					...input.conversation,
					lastInboundAt: "2026-10-26T10:00:00Z",
					lastOutboundAt: "2026-10-26T09:00:00Z",
				},
			},
			manager,
			now,
		);
		await service.configureCustomer(
			{ id: imported.customerId, enrolled: true, ownerId: actor, tags: [] },
			manager,
		);
		await service.tick(now);
		expect(
			(
				await db.careCustomer.findUniqueOrThrow({
					where: { id: imported.customerId },
				})
			).replyPending,
		).toBe(true);
		expect(
			await db.careTask.count({ where: { customerId: imported.customerId } }),
		).toBe(0);
	});

	test("changed customer tags invalidate an already copied template", async () => {
		const task = await enrolled("tag-change");
		await service.configureCustomer(
			{
				id: task.customerId,
				enrolled: true,
				ownerId: actor,
				tags: ["need:daily"],
			},
			manager,
		);
		const template = await service.saveTemplate(
			{
				brand: "UMEHA",
				purpose: "CHECK_IN",
				name: `${prefix}-tag-change`,
				body: "TAG_RULE {{customer}}",
				requiredTags: ["need:daily"],
				excludedTags: ["not-fit"],
				validUntil: null,
			},
			manager,
		);
		await service.approveTemplate(template.id, manager, true);
		await service.claim(task.id, actor, now);
		const copied = await service.copy(task.id, actor, now);
		expect(copied.text).toContain("TAG_RULE");
		await service.configureCustomer(
			{
				id: task.customerId,
				enrolled: true,
				ownerId: actor,
				tags: ["need:daily", "not-fit"],
			},
			manager,
		);
		await expect(
			service.action(
				{
					id: task.id,
					version: copied.version,
					result: "SENT_MANUAL",
					reason: "",
				},
				actor,
				now,
			),
		).rejects.toThrow();
	});

	test("manual copy remains available when the API refuses sending", async () => {
		const task = await enrolled("manual-denied");
		const input = fixture("manual-denied");
		await service.importOrder(
			{ ...input, conversation: { ...input.conversation, canSend: false } },
			manager,
			now,
		);
		const template = await service.saveTemplate(
			{
				brand: "UMEHA",
				purpose: "CHECK_IN",
				name: `${prefix}-manual-denied`,
				body: "{{customer}} cần hỗ trợ gì ạ?",
				requiredTags: [],
				excludedTags: [],
				validUntil: null,
			},
			manager,
		);
		await service.approveTemplate(template.id, manager, true);
		await service.claim(task.id, actor, now);
		expect((await service.copy(task.id, actor, now)).text).toBeTruthy();
		expect(
			(
				await db.careConversation.findFirstOrThrow({
					where: { customerId: task.customerId },
				})
			).canSend,
		).toBe(false);
		expect(
			await db.careEvent.count({
				where: { taskId: task.id, kind: "SENT_MANUAL" },
			}),
		).toBe(0);
	});

	test("a customer-requested date survives the original D+x milestone", async () => {
		const task = await enrolled("promise");
		const replied = await service.action(
			{
				id: task.id,
				version: task.version,
				result: "REPLIED",
				reason: "Customer asked for a later date",
			},
			actor,
			now,
		);
		const later = new Date("2027-03-01T02:00:00Z");
		await service.action(
			{
				id: task.id,
				version: replied.version,
				result: "SNOOZE",
				reason: "Customer requested this date",
				until: later.toISOString(),
			},
			actor,
			now,
		);
		await service.importOrder(
			{
				...fixture("promise"),
				sourceUpdatedAt: later.toISOString(),
				conversation: {
					...fixture("promise").conversation,
					verifiedAt: later.toISOString(),
					activityVerifiedAt: later.toISOString(),
				},
			},
			manager,
			later,
		);
		await service.tick(later);
		const promised = await db.careTask.findUniqueOrThrow({
			where: { id: task.id },
		});
		expect(promised.state).toBe("OPEN");
		expect(promised.outcome).toBe("PROMISED");
		await expect(service.claim(task.id, actor, later)).resolves.toBeDefined();
	});

	test("uncertain sending needs an explicit disposition and records a conservative touch", async () => {
		const task = await enrolled("uncertain");
		const waiting = await service.action(
			{
				id: task.id,
				version: task.version,
				result: "UNCERTAIN",
				reason: "Needs reconciliation",
			},
			actor,
			now,
		);
		await expect(
			service.action(
				{
					id: task.id,
					version: waiting.version,
					result: "RESOLVED",
					reason: "Checked",
				},
				actor,
				now,
			),
		).rejects.toThrow();
		const resolved = await service.action(
			{
				id: task.id,
				version: waiting.version,
				result: "RESOLVED",
				reason: "Staff checked platform history",
				resolution: "SENT",
			},
			actor,
			now,
		);
		expect(resolved.outcome).toBe("RECONCILED_SENT");
		const customer = await db.careCustomer.findUniqueOrThrow({
			where: { id: task.customerId },
		});
		expect(customer.uncertain).toBe(false);
		expect(customer.lastTouchAt?.toISOString()).toBe(now.toISOString());
	});
	test("cohorts require maturity and exclude returned repeat orders", async () => {
		const first = {
			...fixture("cohort"),
			orderId: `${prefix}-cohort-first`,
			deliveredAt: "2026-07-01T04:00:00Z",
			sourceCreatedAt: "2026-06-28T04:00:00Z",
		};
		await service.importOrder(first, manager, now);
		await service.importOrder(
			{
				...first,
				orderId: `${prefix}-cohort-repeat`,
				deliveredAt: "2026-07-20T04:00:00Z",
				sourceCreatedAt: "2026-07-17T04:00:00Z",
			},
			manager,
			now,
		);
		const measured = await service.metrics(now);
		expect(
			measured.cohorts.find((c) => c.brand === "UMEHA" && c.days === 30)
				?.repeat,
		).toBeGreaterThan(0);
		await service.importOrder(
			{
				...first,
				orderId: `${prefix}-cohort-repeat`,
				orderStatus: "RETURNED",
				deliveredAt: null,
				deliveryEvidence: null,
				sourceCreatedAt: "2026-07-17T04:00:00Z",
			},
			manager,
			now,
		);
		const after = await service.metrics(now);
		expect(
			after.cohorts.find((c) => c.brand === "UMEHA" && c.days === 30)?.repeat,
		).toBe(
			(measured.cohorts.find((c) => c.brand === "UMEHA" && c.days === 30)
				?.repeat ?? 0) - 1,
		);
	});
});
