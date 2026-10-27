import {
	isWorkspaceAdmin,
	WORKSPACE_ID,
	workspaceRoleOf,
} from "@crm/auth/organization";
import { type Db, Prisma } from "@crm/db";
import type {
	careCustomerInput,
	careListInput,
} from "@crm/validation/customer-care";
import {
	CARE,
	type CareActionInput,
	type CareImport,
	type CareMetrics,
	type CareSourceLease,
	type CareTemplateInput,
	careBlock,
	careDueAt,
	careImport,
	careMetrics,
	careProducts,
	careSourceLease,
	careStep,
	renderCareTemplate,
} from "@crm/validation/customer-care";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { z } from "zod";
import { InjectDatabase } from "../database/database.constants";

type Tx = Prisma.TransactionClient;
const active = ["OPEN", "CLAIMED", "COPIED", "WAITING"] as const;
const customerContext = {
	conversations: { orderBy: { verifiedAt: "desc" as const } },
	orders: { orderBy: { sourceCreatedAt: "desc" as const } },
	events: { orderBy: { createdAt: "desc" as const }, take: 15 },
};
const sourceContext = {
	id: true,
	lastSuccessAt: true,
	lastError: true,
	leaseToken: true,
} as const;
type CareCustomerContext = Prisma.CareCustomerGetPayload<{
	include: typeof customerContext;
}>;
type CareSourceContext = Prisma.CareSyncStateGetPayload<{
	select: typeof sourceContext;
}>;

@Injectable()
export class CustomerCareService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async requireManager(userId: string) {
		if (!isWorkspaceAdmin(await workspaceRoleOf(userId, this.db)))
			throw new ForbiddenException("Chỉ quản lý được cấu hình chăm sóc");
	}

	async list(input: z.infer<typeof careListInput>, userId: string) {
		const where: Prisma.CareTaskWhereInput = {
			customer: {
				brand: input.brand,
				ownerId: input.mine ? userId : undefined,
			},
			state:
				input.state === "ACTIVE"
					? { in: ["OPEN", "CLAIMED", "COPIED"] }
					: input.state === "WAITING"
						? "WAITING"
						: input.state === "DONE"
							? { in: ["DONE", "CANCELLED"] }
							: undefined,
		};
		const [rows, total, sources] = await Promise.all([
			this.db.careTask.findMany({
				where,
				orderBy: [{ dueAt: "asc" }, { id: "asc" }],
				skip: (input.page - 1) * CARE.pageSize,
				take: CARE.pageSize,
				include: { customer: { include: customerContext }, order: true },
			}),
			this.db.careTask.count({ where }),
			this.db.careSyncState.findMany({ select: sourceContext }),
		]);
		return {
			rows: rows.map((task) => ({
				...task,
				blockReason:
					this.block(task.customer, new Date(), task.outcome === "PROMISED") ??
					this.sourceBlock(task.customer, sources, new Date()),
				products: careProducts.parse(task.order.products),
				channelRestricted: task.customer.conversations[0]?.canSend === false,
				conversationUrl: this.conversationUrl(task.customer.conversations[0]),
				latestInboundAt: this.latestInboundAt(task.customer),
			})),
			total,
			pageSize: CARE.pageSize,
		};
	}

	async customers(brand?: "UMEHA" | "LI_EN_SPORT", page = 1) {
		const where = brand ? { brand } : {};
		const [rows, total] = await Promise.all([
			this.db.careCustomer.findMany({
				where,
				orderBy: { updatedAt: "desc" },
				skip: (page - 1) * CARE.pageSize,
				take: CARE.pageSize,
				select: {
					id: true,
					brand: true,
					shopId: true,
					sourceCustomerId: true,
					name: true,
					tags: true,
					ownerId: true,
					enrolled: true,
					optedOut: true,
					openIssue: true,
					replyPending: true,
					uncertain: true,
					conversations: {
						select: { lastInboundAt: true },
						orderBy: { lastInboundAt: { sort: "desc", nulls: "last" } },
						take: 1,
					},
					_count: { select: { orders: true, conversations: true } },
				},
			}),
			this.db.careCustomer.count({ where }),
		]);
		return {
			rows: rows.map((customer) => ({
				...customer,
				latestInboundAt: this.latestInboundAt(customer),
			})),
			total,
		};
	}

	async resolveCustomer(
		id: string,
		actorId: string,
		reason: string,
		expectedInboundAt: string | null,
	) {
		if (!reason.trim()) throw new BadRequestException("Cần ghi kết quả xử lý");
		const manager = isWorkspaceAdmin(await workspaceRoleOf(actorId, this.db));
		return this.db.$transaction(async (tx) => {
			await this.lock(tx, id);
			const customer = await tx.careCustomer.findUniqueOrThrow({
				where: { id },
				include: customerContext,
			});
			if (customer.ownerId !== actorId && !manager)
				throw new ForbiddenException("Khách thuộc nhân viên khác");
			if (customer.uncertain)
				throw new ConflictException("Cần đối soát công việc chưa rõ đã gửi");
			this.assertReviewedInbound(customer, expectedInboundAt);
			if (!customer.replyPending && !customer.openIssue)
				return { id: customer.id, replyPending: false, openIssue: false };
			const updated = await tx.careCustomer.update({
				where: { id },
				data: {
					replyPending: false,
					openIssue: false,
					unanswered: customer.replyPending ? 0 : undefined,
				},
			});
			await tx.careEvent.create({
				data: { customerId: id, actorId, kind: "RESOLVED", reason },
			});
			await tx.careTask.updateMany({
				where: {
					customerId: id,
					state: "WAITING",
					outcome: { in: ["ISSUE", "REPLIED"] },
				},
				data: {
					state: "DONE",
					outcome: "RESOLVED",
					leaseUntil: null,
					version: { increment: 1 },
				},
			});
			return {
				id: updated.id,
				replyPending: updated.replyPending,
				openIssue: updated.openIssue,
			};
		});
	}

	async configureCustomer(
		input: z.infer<typeof careCustomerInput>,
		actorId: string,
	) {
		await this.requireManager(actorId);
		if (
			input.ownerId &&
			!(await this.db.member.findUnique({
				where: {
					organizationId_userId: {
						organizationId: WORKSPACE_ID,
						userId: input.ownerId,
					},
				},
			}))
		)
			throw new BadRequestException("Nhân viên không thuộc workspace");
		return this.db.$transaction(async (tx) => {
			await this.lock(tx, input.id);
			const previous = await tx.careCustomer.findUniqueOrThrow({
				where: { id: input.id },
			});
			const row = await tx.careCustomer.update({
				where: { id: input.id },
				data: {
					enrolled: input.enrolled,
					ownerId: input.ownerId,
					tags: [...new Set(input.tags)],
				},
			});
			await tx.careEvent.create({
				data: {
					customerId: input.id,
					actorId,
					kind: "CUSTOMER_CONFIGURED",
					reason: JSON.stringify({
						enrolled: input.enrolled,
						ownerId: input.ownerId,
						tags: input.tags,
					}),
				},
			});
			if (!input.enrolled || previous.ownerId !== input.ownerId)
				await this.suspendPrepared(tx, input.id);
			if (!input.enrolled)
				await tx.careTask.updateMany({
					where: { customerId: input.id, state: { in: ["OPEN", "CLAIMED"] } },
					data: {
						state: "CANCELLED",
						outcome: "UNENROLLED",
						version: { increment: 1 },
					},
				});
			else if (previous.ownerId !== input.ownerId)
				await tx.careTask.updateMany({
					where: { customerId: input.id, state: "CLAIMED" },
					data: {
						state: "OPEN",
						ownerId: null,
						leaseUntil: null,
						version: { increment: 1 },
					},
				});
			return row;
		});
	}

	async importOrder(
		raw: CareImport,
		actorId: string,
		now = new Date(),
		sourceLease?: CareSourceLease,
	) {
		const input = careImport.parse(raw);
		const lease = sourceLease ? careSourceLease.parse(sourceLease) : null;
		if (
			lease &&
			(!lease.id.startsWith(`${input.brand}:${input.shopId}:`) ||
				(input.conversation &&
					lease.id !==
						`${input.brand}:${input.shopId}:${input.conversation.pageId}`))
		)
			throw new ConflictException("SOURCE_SCOPE_MISMATCH");
		for (const instant of [
			input.sourceCreatedAt,
			input.sourceUpdatedAt,
			input.deliveredAt,
			input.conversation?.verifiedAt,
			input.conversation?.activityVerifiedAt,
			input.conversation?.lastInboundAt,
			input.conversation?.lastOutboundAt,
		]) {
			if (instant && new Date(instant).getTime() > now.getTime() + 60_000)
				throw new BadRequestException(
					"Dữ liệu nguồn có thời điểm trong tương lai",
				);
		}
		return this.db.$transaction(async (tx) => {
			if (lease) {
				const current = await tx.$queryRaw<{ id: string }[]>`
					SELECT id FROM "careSyncState" WHERE id = ${lease.id} AND "leaseToken" = ${lease.token} AND "leaseUntil" > clock_timestamp() FOR SHARE`;
				if (!current.length) throw new ConflictException("SOURCE_LEASE_LOST");
			}
			const customer = await tx.careCustomer.upsert({
				where: {
					brand_shopId_sourceCustomerId: {
						brand: input.brand,
						shopId: input.shopId,
						sourceCustomerId: input.customerId,
					},
				},
				create: {
					brand: input.brand,
					shopId: input.shopId,
					sourceCustomerId: input.customerId,
					name: input.customerName,
					syncedAt: now,
				},
				update: {},
			});
			await this.lock(tx, customer.id);
			const key = {
				customerId_sourceOrderId: {
					customerId: customer.id,
					sourceOrderId: input.orderId,
				},
			};
			const previous = await tx.careOrder.findUnique({ where: key });
			if (
				previous &&
				previous.sourceUpdatedAt > new Date(input.sourceUpdatedAt)
			)
				return { customerId: customer.id, stale: true };
			await tx.careCustomer.update({
				where: { id: customer.id },
				data: { name: input.customerName, syncedAt: now },
			});
			const values = {
				status: input.orderStatus,
				deliveredAt: input.deliveredAt ? new Date(input.deliveredAt) : null,
				deliveryEvidence: input.deliveryEvidence,
				products: input.products,
				sourceCreatedAt: new Date(input.sourceCreatedAt),
				sourceUpdatedAt: new Date(input.sourceUpdatedAt),
			};
			const order = await tx.careOrder.upsert({
				where: key,
				create: {
					customerId: customer.id,
					sourceOrderId: input.orderId,
					...values,
				},
				update: values,
			});
			if (input.conversation) {
				const c = input.conversation;
				const conversationKey = {
					pageId_sourceId: { pageId: c.pageId, sourceId: c.conversationId },
				};
				const existing = await tx.careConversation.findUnique({
					where: conversationKey,
				});
				if (existing && existing.customerId !== customer.id)
					throw new ConflictException(
						"Hội thoại đã liên kết với khách khác; cần xác minh danh tính",
					);
				if (!existing || existing.verifiedAt <= new Date(c.verifiedAt)) {
					const activity = this.conversationValues(c, existing);
					await tx.careConversation.upsert({
						where: conversationKey,
						create: {
							customerId: customer.id,
							pageId: c.pageId,
							sourceId: c.conversationId,
							...activity,
						},
						update: activity,
					});
					const inbound = activity.lastInboundAt;
					const outbound = activity.lastOutboundAt;
					const lastOutbound =
						outbound &&
						(!customer.lastTouchAt || outbound > customer.lastTouchAt)
							? outbound
							: customer.lastTouchAt;
					if (
						inbound &&
						(!existing?.lastInboundAt || inbound > existing.lastInboundAt) &&
						(!lastOutbound || inbound > lastOutbound)
					)
						await tx.careCustomer.update({
							where: { id: customer.id },
							data: { replyPending: true, unanswered: 0 },
						});
					if (
						outbound &&
						(!customer.lastTouchAt || outbound > customer.lastTouchAt)
					)
						await tx.careCustomer.update({
							where: { id: customer.id },
							data: { lastTouchAt: outbound },
						});
				}
			}
			const invalid =
				input.orderStatus !== "DELIVERED" ||
				previous?.deliveredAt?.getTime() !== values.deliveredAt?.getTime();
			if (invalid && previous) {
				await this.suspendPrepared(tx, customer.id);
				await tx.careTask.updateMany({
					where: { orderId: order.id, state: { in: ["OPEN", "CLAIMED"] } },
					data: {
						state: "CANCELLED",
						outcome: "ORDER_CHANGED",
						version: { increment: 1 },
					},
				});
			}
			if (!previous || previous.status !== input.orderStatus)
				await tx.careEvent.create({
					data: {
						customerId: customer.id,
						actorId,
						kind: "ORDER_SYNCED",
						reason: input.orderStatus,
					},
				});
			return { customerId: customer.id, stale: false };
		});
	}

	private conversationValues(
		c: NonNullable<CareImport["conversation"]>,
		existing: Pick<
			CareCustomerContext["conversations"][number],
			"lastInboundAt" | "lastOutboundAt"
		> | null,
	) {
		const latest = (value: string | null, previous: Date | null) => {
			const incoming = value ? new Date(value) : null;
			return incoming && (!previous || incoming > previous)
				? incoming
				: previous;
		};
		return {
			lastInboundAt: latest(c.lastInboundAt, existing?.lastInboundAt ?? null),
			lastOutboundAt: latest(
				c.lastOutboundAt,
				existing?.lastOutboundAt ?? null,
			),
			verifiedAt: new Date(c.verifiedAt),
			activityVerifiedAt: c.activityVerifiedAt
				? new Date(c.activityVerifiedAt)
				: null,
			canSend: c.canSend,
		};
	}

	async tick(now = new Date()) {
		const customers = await this.db.careCustomer.findMany({
			where: { enrolled: true },
			select: { id: true },
			orderBy: { id: "asc" },
		});
		let created = 0;
		for (const customer of customers) {
			created += await this.db.$transaction(async (tx) => {
				await this.lock(tx, customer.id);
				const current = await tx.careCustomer.findUniqueOrThrow({
					where: { id: customer.id },
					include: customerContext,
				});
				const newest = current.orders[0];
				const copiedOld = await tx.careTask.findFirst({
					where: {
						customerId: customer.id,
						state: "COPIED",
						orderId: newest ? { not: newest.id } : undefined,
					},
				});
				if (copiedOld) {
					await this.suspendPrepared(tx, customer.id);
					return 0;
				}
				await tx.careTask.updateMany({
					where: {
						customerId: customer.id,
						state: { in: ["OPEN", "CLAIMED"] },
						orderId: newest ? { not: newest.id } : undefined,
					},
					data: {
						state: "CANCELLED",
						outcome: "SUPERSEDED_ORDER",
						version: { increment: 1 },
					},
				});
				if (
					newest?.status !== "DELIVERED" ||
					!newest.deliveredAt ||
					!newest.deliveryEvidence ||
					!current.ownerId
				)
					return 0;
				await tx.careTask.updateMany({
					where: {
						customerId: customer.id,
						state: "WAITING",
						outcome: "PROMISED",
						dueAt: { lte: now },
					},
					data: { state: "OPEN", version: { increment: 1 } },
				});
				if (
					await tx.careTask.findFirst({
						where: {
							customerId: customer.id,
							orderId: newest.id,
							outcome: "PROMISED",
							state: { in: [...active] },
						},
					})
				)
					return 0;
				const step = careStep(newest.deliveredAt, now);
				if (!step) return 0;
				if (
					await tx.careTask.findFirst({
						where: {
							customerId: customer.id,
							milestone: { lt: step.day },
							state: "COPIED",
						},
					})
				) {
					await this.suspendPrepared(tx, customer.id);
					return 0;
				}
				await tx.careTask.updateMany({
					where: {
						customerId: customer.id,
						orderId: newest.id,
						milestone: { lt: step.day },
						state: { in: ["OPEN", "CLAIMED"] },
					},
					data: {
						state: "CANCELLED",
						outcome: "EXPIRED_MILESTONE",
						version: { increment: 1 },
					},
				});
				await tx.careTask.updateMany({
					where: {
						customerId: customer.id,
						state: "WAITING",
						outcome: "SNOOZE",
						dueAt: { lte: now },
					},
					data: { state: "OPEN", outcome: null, version: { increment: 1 } },
				});
				if (
					this.block(current, now) ||
					(await this.verifiedSourceBlock(tx, current, now))
				)
					return 0;
				if (
					await tx.careTask.findFirst({
						where: { customerId: customer.id, state: { in: [...active] } },
					})
				)
					return 0;
				const result = await tx.careTask.createMany({
					data: [
						{
							customerId: customer.id,
							orderId: newest.id,
							milestone: step.day,
							purpose: step.purpose,
							dueAt: careDueAt(newest.deliveredAt, step.day),
						},
					],
					skipDuplicates: true,
				});
				return result.count;
			});
		}
		return { created };
	}

	async claim(id: string, actorId: string, now = new Date()) {
		const task = await this.db.careTask.findUnique({
			where: { id },
			select: { customerId: true },
		});
		if (!task) throw new NotFoundException("Không tìm thấy việc chăm sóc");
		return this.db.$transaction(async (tx) => {
			await this.lock(tx, task.customerId);
			const row = await tx.careTask.findUniqueOrThrow({
				where: { id },
				include: { customer: { include: customerContext }, order: true },
			});
			if (row.customer.ownerId !== actorId)
				throw new ForbiddenException(
					"Khách thuộc nhân viên khác; nhờ quản lý bàn giao",
				);
			if (
				row.dueAt > now ||
				row.state === "DONE" ||
				row.state === "CANCELLED" ||
				row.state === "WAITING"
			)
				throw new ConflictException("Tác vụ chưa đến lịch hoặc đã kết thúc");
			if (
				row.ownerId &&
				row.ownerId !== actorId &&
				row.leaseUntil &&
				row.leaseUntil > now
			)
				throw new ConflictException("Một nhân viên đang xử lý");
			await this.assertEligible(tx, row, now);
			await tx.careEvent.create({
				data: {
					customerId: row.customerId,
					taskId: id,
					actorId,
					kind: "CLAIMED",
				},
			});
			return tx.careTask.update({
				where: { id },
				data: {
					ownerId: actorId,
					leaseUntil: new Date(now.getTime() + CARE.leaseMs),
					state: row.state === "COPIED" ? "COPIED" : "CLAIMED",
					version: { increment: 1 },
				},
			});
		});
	}

	async copy(id: string, actorId: string, now = new Date()) {
		const task = await this.db.careTask.findUnique({
			where: { id },
			select: { customerId: true },
		});
		if (!task) throw new NotFoundException("Không tìm thấy việc chăm sóc");
		return this.db.$transaction(async (tx) => {
			await this.lock(tx, task.customerId);
			const row = await tx.careTask.findUniqueOrThrow({
				where: { id },
				include: { customer: { include: customerContext }, order: true },
			});
			this.assertLease(row, actorId, now);
			await this.assertEligible(tx, row, now);
			const sent = await tx.careTask.findMany({
				where: {
					customerId: row.customerId,
					outcome: { in: ["SENT_MANUAL", "RECONCILED_SENT"] },
				},
				select: { templateId: true },
			});
			const templates = await tx.careTemplate.findMany({
				where: {
					brand: row.customer.brand,
					purpose: row.purpose,
					approvedAt: { not: null },
					OR: [{ validUntil: null }, { validUntil: { gt: now } }],
				},
				orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
			});
			const template = templates
				.filter(
					(t) =>
						this.matchesTemplate(t, row.customer.tags) &&
						!sent.some((event) => event.templateId === t.id),
				)
				.sort((a, b) => b.requiredTags.length - a.requiredTags.length)
				.at(0);
			if (!template)
				throw new ConflictException(
					"Chưa có mẫu đã duyệt phù hợp hoặc mẫu đã dùng",
				);
			const products = careProducts.parse(row.order.products);
			let snapshot: string;
			try {
				snapshot = renderCareTemplate(template.body, {
					customer: row.customer.name,
					product: products.map((p) => p.name).join(", "),
					brand: row.customer.brand === "UMEHA" ? "UMEHA" : "Li En Sport",
				});
			} catch {
				throw new BadRequestException("Mẫu thiếu biến; cần quản lý kiểm tra");
			}
			const result = await tx.careTask.update({
				where: { id },
				data: {
					state: "COPIED",
					templateId: template.id,
					templateVersion: template.version,
					snapshot,
					copiedAt: now,
					version: { increment: 1 },
				},
			});
			await tx.careEvent.create({
				data: {
					customerId: row.customerId,
					taskId: id,
					actorId,
					kind: "COPY_PREPARED",
				},
			});
			return {
				id,
				version: result.version,
				text: snapshot,
				conversationUrl: this.conversationUrl(row.customer.conversations[0]),
			};
		});
	}

	async action(input: CareActionInput, actorId: string, now = new Date()) {
		const task = await this.db.careTask.findUnique({
			where: { id: input.id },
			select: { customerId: true },
		});
		if (!task) throw new NotFoundException("Không tìm thấy việc chăm sóc");
		return this.db.$transaction(async (tx) => {
			await this.lock(tx, task.customerId);
			const row = await tx.careTask.findUniqueOrThrow({
				where: { id: input.id },
				include: { customer: { include: customerContext }, order: true },
			});
			if (row.version !== input.version)
				throw new ConflictException("Tác vụ đã thay đổi; tải lại dữ liệu");
			if (row.customer.ownerId !== actorId)
				throw new ForbiddenException("Khách thuộc nhân viên khác");
			if (row.state === "DONE" || row.state === "CANCELLED")
				throw new ConflictException("Tác vụ đã kết thúc");
			const changes: Prisma.CareCustomerUpdateInput = {};
			if (
				row.customer.replyPending &&
				["RESOLVED", "SNOOZE"].includes(input.result)
			)
				this.assertReviewedInbound(
					row.customer,
					input.expectedInboundAt ?? null,
				);
			let state: "DONE" | "WAITING" = "DONE";
			if (input.result === "SENT_MANUAL") {
				this.assertLease(row, actorId, now);
				await this.assertEligible(tx, row, now);
				if (row.state !== "COPIED" || !row.templateId || !row.snapshot)
					throw new ConflictException(
						"Cần chuẩn bị nội dung trước khi xác nhận",
					);
				const template = await tx.careTemplate.findUnique({
					where: { id: row.templateId },
				});
				if (
					!template?.approvedAt ||
					template.version !== row.templateVersion ||
					(template.validUntil && template.validUntil <= now) ||
					!this.matchesTemplate(template, row.customer.tags)
				)
					throw new ConflictException("Mẫu đã thay đổi hoặc hết hiệu lực");
				changes.lastTouchAt = now;
				changes.unanswered = { increment: 1 };
			} else if (input.result === "OPT_OUT") changes.optedOut = true;
			else if (input.result === "ISSUE") {
				changes.openIssue = true;
				state = "WAITING";
			} else if (input.result === "REPLIED") {
				changes.replyPending = true;
				changes.unanswered = 0;
				state = "WAITING";
			} else if (input.result === "UNCERTAIN") {
				changes.uncertain = true;
				state = "WAITING";
			} else if (input.result === "RESOLVED") {
				if (!input.reason)
					throw new BadRequestException("Cần ghi kết quả xử lý/đối soát");
				if (row.customer.uncertain && !input.resolution)
					throw new BadRequestException(
						"Cần xác nhận đối soát: đã gửi hoặc chưa gửi",
					);
				if (row.customer.uncertain && input.resolution === "SENT") {
					changes.lastTouchAt = now;
					changes.unanswered = { increment: 1 };
				}
				changes.uncertain = false;
				changes.replyPending = false;
				changes.openIssue = false;
				changes.pausedUntil = null;
			} else if (input.result === "SNOOZE") {
				if (!input.until || new Date(input.until) <= now)
					throw new BadRequestException("Ngày hẹn phải ở tương lai");
				changes.pausedUntil = new Date(input.until);
				if (row.customer.replyPending) {
					changes.replyPending = false;
					changes.unanswered = 0;
				}
				state = "WAITING";
			}
			if (["BLOCKED", "SKIPPED"].includes(input.result) && !input.reason)
				throw new BadRequestException("Cần ghi lý do");
			await tx.careCustomer.update({
				where: { id: row.customerId },
				data: changes,
			});
			const result = await tx.careTask.update({
				where: { id: row.id },
				data: {
					state,
					outcome: this.actionOutcome(input, row.customer.replyPending),
					dueAt:
						input.result === "SNOOZE" && input.until
							? new Date(input.until)
							: undefined,
					confirmedAt: input.result === "SENT_MANUAL" ? now : null,
					leaseUntil: null,
					version: { increment: 1 },
				},
			});
			await tx.careEvent.create({
				data: {
					customerId: row.customerId,
					taskId: row.id,
					actorId,
					kind: this.actionOutcome(input, row.customer.replyPending),
					reason: input.reason,
				},
			});
			return result;
		});
	}

	async templates(brand?: "UMEHA" | "LI_EN_SPORT") {
		return this.db.careTemplate.findMany({
			where: brand ? { brand } : {},
			orderBy: [{ brand: "asc" }, { purpose: "asc" }, { updatedAt: "desc" }],
		});
	}

	async saveTemplate(input: CareTemplateInput, actorId: string) {
		await this.requireManager(actorId);
		try {
			renderCareTemplate(input.body, {
				customer: "Khách",
				product: "Sản phẩm",
				brand: "Thương hiệu",
			});
		} catch {
			throw new BadRequestException(
				"Biến được hỗ trợ: customer, product, brand",
			);
		}
		const { id, validUntil, ...data } = input;
		const values = {
			...data,
			validUntil: validUntil ? new Date(validUntil) : null,
			approvedAt: null,
			approvedBy: null,
		};
		return id
			? this.db.careTemplate.update({
					where: { id },
					data: { ...values, version: { increment: 1 } },
				})
			: this.db.careTemplate.create({ data: values });
	}

	async approveTemplate(
		id: string,
		actorId: string,
		approved: boolean,
		version: number,
	) {
		await this.requireManager(actorId);
		return this.db.$transaction(async (tx) => {
			const changed = await tx.careTemplate.updateMany({
				where: { id, version },
				data: {
					approvedAt: approved ? new Date() : null,
					approvedBy: approved ? actorId : null,
					version: { increment: 1 },
				},
			});
			if (changed.count !== 1)
				throw new ConflictException(
					"Mẫu đã thay đổi; tải lại và duyệt đúng phiên bản",
				);
			return tx.careTemplate.findUniqueOrThrow({ where: { id } });
		});
	}

	async summary(userId: string) {
		const [open, waiting, sentManual, customers, role, sources] =
			await Promise.all([
				this.db.careTask.count({
					where: {
						customer: { ownerId: userId },
						state: { in: ["OPEN", "CLAIMED", "COPIED"] },
					},
				}),
				this.db.careTask.count({
					where: { customer: { ownerId: userId }, state: "WAITING" },
				}),
				this.db.careTask.count({
					where: {
						outcome: { in: ["SENT_MANUAL", "RECONCILED_SENT"] },
						customer: { ownerId: userId },
					},
				}),
				this.db.careCustomer.count(),
				workspaceRoleOf(userId, this.db),
				this.db.careSyncState.findMany({
					select: { id: true, lastSuccessAt: true, lastError: true },
				}),
			]);
		return {
			open,
			waiting,
			sentManual,
			customers,
			sources,
			syncConfigured: this.sourcesConfigured(),
			demo: new URL(
				process.env.DATABASE_URL ?? "postgresql://localhost/unknown",
			).pathname.endsWith("_test"),
			canManage: isWorkspaceAdmin(role),
			mode: "MANUAL_COPY" as const,
		};
	}

	async metrics(now = new Date()): Promise<CareMetrics> {
		const rows = await this.db.$queryRaw<
			{ brand: string; days: number; mature: bigint; repeat: bigint }[]
		>`
			WITH first_delivery AS (
				SELECT "customerId", MIN("deliveredAt") AS first_at
				FROM "careOrder" WHERE status = 'DELIVERED' AND "deliveredAt" IS NOT NULL GROUP BY "customerId"
			), windows AS (SELECT * FROM (VALUES (30), (60), (90)) AS w(days))
			SELECT c.brand::text, w.days,
				COUNT(*) FILTER (WHERE f.first_at <= ${now}::timestamp - w.days * interval '1 day') AS mature,
				COUNT(*) FILTER (WHERE f.first_at <= ${now}::timestamp - w.days * interval '1 day' AND EXISTS (
					SELECT 1 FROM "careOrder" o WHERE o."customerId" = c.id AND o.status = 'DELIVERED'
					AND o."deliveredAt" > f.first_at AND o."deliveredAt" <= f.first_at + w.days * interval '1 day'
				)) AS repeat
			FROM "careCustomer" c JOIN first_delivery f ON f."customerId" = c.id CROSS JOIN windows w
			GROUP BY c.brand, w.days ORDER BY c.brand, w.days`;
		return careMetrics.parse({
			activity: await this.activityMetrics(now),
			cohorts: rows.map((r) => ({
				brand: r.brand,
				days: r.days,
				mature: Number(r.mature),
				repeat: Number(r.repeat),
				rate: Number(r.mature) ? Number(r.repeat) / Number(r.mature) : null,
			})),
			coverage: "OBSERVED_CRM_HISTORY" as const,
			attribution: "NOT_CAUSAL" as const,
		});
	}

	private async activityMetrics(now: Date): Promise<CareMetrics["activity"]> {
		const since = new Date(now.getTime() - 30 * CARE.dayMs);
		const kinds = [
			"COPY_PREPARED",
			"SENT_MANUAL",
			"RECONCILED_SENT",
			"BLOCKED",
			"UNCERTAIN",
			"REPLIED",
			"ISSUE",
			"OPT_OUT",
			"SNOOZE",
			"PROMISED",
			"SKIPPED",
			"RESOLVED",
		];
		const where = { createdAt: { gte: since, lte: now }, kind: { in: kinds } };
		const [outcomes, staffEvents, responseRows] = await Promise.all([
			this.db.careEvent.groupBy({
				by: ["kind"],
				where,
				_count: { _all: true },
			}),
			this.db.careEvent.groupBy({
				by: ["actorId", "kind"],
				where,
				_count: { _all: true },
			}),
			this.db.$queryRaw<
				{ brand: string; confirmed: bigint; checked: bigint; replied: bigint }[]
			>`
				WITH confirmed AS (
					SELECT "customerId", MAX("createdAt") AS sent_at FROM "careEvent"
					WHERE kind IN ('SENT_MANUAL', 'RECONCILED_SENT') AND "createdAt" BETWEEN ${since} AND ${now}
					GROUP BY "customerId"
				)
				SELECT c.brand::text, COUNT(*) AS confirmed,
					COUNT(*) FILTER (WHERE EXISTS (
						SELECT 1 FROM "careConversation" v WHERE v."customerId" = c.id
						AND v."activityVerifiedAt" BETWEEN f.sent_at AND ${now}
					)) AS checked,
					COUNT(*) FILTER (WHERE EXISTS (
						SELECT 1 FROM "careConversation" v WHERE v."customerId" = c.id
						AND v."activityVerifiedAt" BETWEEN f.sent_at AND ${now}
						AND v."lastInboundAt" > f.sent_at AND v."lastInboundAt" <= ${now}
					)) AS replied
				FROM confirmed f JOIN "careCustomer" c ON c.id = f."customerId"
				GROUP BY c.brand ORDER BY c.brand`,
		]);
		const ids = [...new Set(staffEvents.map((e) => e.actorId))];
		const users = await this.db.user.findMany({
			where: { id: { in: ids } },
			select: { id: true, name: true },
		});
		return careMetrics.shape.activity.parse({
			since,
			until: now,
			outcomes: outcomes
				.map((row) => ({ kind: row.kind, count: row._count._all }))
				.sort((a, b) => a.kind.localeCompare(b.kind)),
			staff: ids.map((id) => ({
				id,
				name:
					users.find((user) => user.id === id)?.name ??
					"Tài khoản không còn trong hệ thống",
				prepared: staffEvents
					.filter((e) => e.actorId === id && e.kind === "COPY_PREPARED")
					.reduce((sum, e) => sum + e._count._all, 0),
				confirmed: staffEvents
					.filter(
						(e) =>
							e.actorId === id &&
							["SENT_MANUAL", "RECONCILED_SENT"].includes(e.kind),
					)
					.reduce((sum, e) => sum + e._count._all, 0),
			})),
			responses: responseRows.map((row) => ({
				brand: row.brand,
				confirmed: Number(row.confirmed),
				checked: Number(row.checked),
				replied: Number(row.replied),
				rate: Number(row.checked)
					? Number(row.replied) / Number(row.checked)
					: null,
			})),
			responseDefinition:
				"OBSERVED_INBOUND_AFTER_LATEST_MANUAL_CONFIRMATION" as const,
		});
	}

	private actionOutcome(input: CareActionInput, replyPending: boolean) {
		if (input.result === "RESOLVED" && input.resolution === "SENT")
			return "RECONCILED_SENT";
		if (input.result === "SNOOZE" && replyPending) return "PROMISED";
		return input.result;
	}

	private matchesTemplate(
		template: { requiredTags: string[]; excludedTags: string[] },
		tags: string[],
	) {
		return (
			template.requiredTags.every((tag) => tags.includes(tag)) &&
			!template.excludedTags.some((tag) => tags.includes(tag))
		);
	}

	private async lock(tx: Tx, id: string) {
		const found = await tx.$queryRaw<
			{ id: string }[]
		>`SELECT id FROM "careCustomer" WHERE id = ${id} FOR UPDATE`;
		if (!found.length) throw new NotFoundException("Không tìm thấy khách");
	}

	private async suspendPrepared(tx: Tx, customerId: string) {
		const changed = await tx.careTask.updateMany({
			where: { customerId, state: "COPIED" },
			data: {
				state: "WAITING",
				outcome: "UNCERTAIN",
				leaseUntil: null,
				version: { increment: 1 },
			},
		});
		if (changed.count)
			await tx.careCustomer.update({
				where: { id: customerId },
				data: { uncertain: true },
			});
	}

	private block(
		customer: Prisma.CareCustomerGetPayload<{
			include: typeof customerContext;
		}>,
		now: Date,
		honorPromise = false,
	) {
		const conversation = customer.conversations[0];
		return careBlock(
			{
				...customer,
				lastTouchAt: honorPromise ? null : customer.lastTouchAt,
				conversationVerifiedAt: conversation?.activityVerifiedAt ?? null,
				canSend: conversation?.canSend ?? null,
				hasConversation: Boolean(conversation),
			},
			now,
		);
	}

	private async assertEligible(
		tx: Tx,
		row: Prisma.CareTaskGetPayload<{
			include: { customer: { include: typeof customerContext }; order: true };
		}>,
		now: Date,
	) {
		const promised = row.outcome === "PROMISED" && row.dueAt <= now;
		const reason =
			this.block(row.customer, now, promised) ??
			(await this.verifiedSourceBlock(tx, row.customer, now));
		if (reason) throw new ConflictException(reason);
		if (
			row.customer.orders[0]?.id !== row.orderId ||
			row.order.status !== "DELIVERED" ||
			!row.order.deliveredAt ||
			(!promised && careStep(row.order.deliveredAt, now)?.day !== row.milestone)
		)
			throw new ConflictException("Đơn hoặc mốc chăm sóc đã thay đổi");
	}

	private sourcesConfigured() {
		return Boolean(
			process.env.CARE_CHANNELS_JSON &&
				process.env.CARE_POS_API_KEY &&
				process.env.CARE_PANCAKE_TOKENS_JSON,
		);
	}

	private sourceBlock(
		customer: CareCustomerContext,
		sources: CareSourceContext[],
		now: Date,
	) {
		const page = customer.conversations[0]?.pageId;
		const source = sources.find(
			(state) => state.id === `${customer.brand}:${customer.shopId}:${page}`,
		);
		if (!source && !this.sourcesConfigured()) return null;
		if (!source?.lastSuccessAt)
			return "Chưa có lượt đồng bộ đầy đủ cho nguồn này";
		if (source.lastError) return "Nguồn đang có lỗi hoặc đồng bộ chưa đầy đủ";
		if (source.leaseToken) return "Nguồn đang cập nhật; thử lại khi hoàn tất";
		if (
			now.getTime() - source.lastSuccessAt.getTime() > CARE.freshMs ||
			source.lastSuccessAt.getTime() > now.getTime() + 60_000
		)
			return "Chưa xác minh lượt đồng bộ gần đây";
		return null;
	}

	private async verifiedSourceBlock(
		tx: Tx,
		customer: CareCustomerContext,
		now: Date,
	) {
		const key = `${customer.brand}:${customer.shopId}:${customer.conversations[0]?.pageId}`;
		const sources = await tx.$queryRaw<CareSourceContext[]>`
			SELECT id, "lastSuccessAt", "lastError", "leaseToken" FROM "careSyncState" WHERE id = ${key} FOR SHARE`;
		return this.sourceBlock(customer, sources, now);
	}

	private latestInboundAt(customer: {
		conversations: { lastInboundAt: Date | null }[];
	}) {
		return customer.conversations.reduce<Date | null>(
			(latest, conversation) =>
				conversation.lastInboundAt &&
				(!latest || conversation.lastInboundAt > latest)
					? conversation.lastInboundAt
					: latest,
			null,
		);
	}

	private assertReviewedInbound(
		customer: { conversations: { lastInboundAt: Date | null }[] },
		expected: string | null,
	) {
		const latest = this.latestInboundAt(customer)?.getTime() ?? null;
		if (latest !== (expected ? new Date(expected).getTime() : null))
			throw new ConflictException(
				"Có phản hồi mới; tải lại và kiểm tra trước khi xử lý",
			);
	}

	private assertLease(
		row: {
			ownerId: string | null;
			leaseUntil: Date | null;
			state: string;
			customer: { ownerId: string | null };
		},
		actorId: string,
		now: Date,
	) {
		if (
			row.customer.ownerId !== actorId ||
			row.ownerId !== actorId ||
			!row.leaseUntil ||
			row.leaseUntil <= now ||
			!["CLAIMED", "COPIED"].includes(row.state)
		)
			throw new ConflictException("Cần nhận xử lý lại tác vụ");
	}

	private conversationUrl(conversation?: { pageId: string; sourceId: string }) {
		return conversation
			? `https://pancake.vn/${encodeURIComponent(conversation.pageId)}?conversation_id=${encodeURIComponent(conversation.sourceId)}`
			: null;
	}
}
