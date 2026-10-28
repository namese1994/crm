import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
	careSecretBox,
	decryptCareSecrets,
	encryptCareSecrets,
} from "@crm/auth/care-config";
import { appUrl } from "@crm/auth/env";
import { isWorkspaceAdmin, workspaceRoleOf } from "@crm/auth/organization";
import type { CareIntegrationModel, Db, Prisma } from "@crm/db";
import {
	CARE_INTEGRATIONS,
	careAiConfig,
	careAiJobPublic,
	careAiRequest,
	careAiSave,
	careAiSecrets,
	careIntegrationPublic,
	careIntegrationStatus,
	careSourceConfig,
	careSourceSave,
	careSourceSecrets,
} from "@crm/validation/care-integrations";
import {
	careTemplateInput,
	renderCareTemplate,
} from "@crm/validation/customer-care";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";

import { type CareWebhookBody, careWebhookBody } from "./care-webhook.contract";

@Injectable()
export class CareIntegrationsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	private async manager(actor: string) {
		if (!isWorkspaceAdmin(await workspaceRoleOf(actor, this.db)))
			throw new ForbiddenException("Chỉ quản lý được cấu hình nguồn và AI");
	}

	async status(actor: string) {
		const role = await workspaceRoleOf(actor, this.db);
		if (!role) throw new ForbiddenException("Bạn không thuộc workspace");
		const [rows, pending, failed, completed] = await Promise.all([
			this.db.careIntegration.findMany(),
			this.db.careWebhookReceipt.count({
				where: { state: { in: ["PENDING", "RUNNING"] } },
			}),
			this.db.careWebhookReceipt.count({ where: { state: "FAILED" } }),
			this.db.careWebhookReceipt.count({ where: { state: "DONE" } }),
		]);
		return careIntegrationStatus.parse({
			canManage: isWorkspaceAdmin(role),
			encryptionReady: Boolean(careSecretBox()),
			demoDatabase: new URL(
				process.env.DATABASE_URL ?? "postgresql://localhost/unknown",
			).pathname.endsWith("_test"),
			source: this.publicRow(rows.find((row) => row.kind === "POSCAKE")),
			ai: this.publicRow(rows.find((row) => row.kind === "LLM")),
			webhooks: { pending, failed, completed },
		});
	}

	private publicRow(row: CareIntegrationModel | undefined) {
		if (!row) return null;
		let pages: string[] = [];
		let credentialsReadable = Boolean(careSecretBox());
		if (credentialsReadable) {
			try {
				const value = JSON.parse(decryptCareSecrets(row.secrets, row.id));
				if (row.kind === "POSCAKE")
					pages = Object.keys(careSourceSecrets.parse(value).pancakeTokens);
				else careAiSecrets.parse(value);
			} catch {
				credentialsReadable = false;
			}
		}
		return careIntegrationPublic.parse({
			...row,
			source:
				row.kind === "POSCAKE" ? careSourceConfig.parse(row.config) : null,
			ai: row.kind === "LLM" ? careAiConfig.parse(row.config) : null,
			apiKeyConfigured: credentialsReadable,
			pancakePagesConfigured: pages,
			lastError: credentialsReadable ? row.lastError : "CREDENTIALS_UNREADABLE",
		});
	}

	private async persist(
		kind: "POSCAKE" | "LLM",
		name: string,
		config: Prisma.InputJsonValue,
		secrets: string,
		expected: number | null,
		actor: string,
	) {
		const id =
			kind === "POSCAKE" ? CARE_INTEGRATIONS.posId : CARE_INTEGRATIONS.aiId;
		return this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
			const previous = await tx.careIntegration.findUnique({ where: { id } });
			if ((previous?.version ?? null) !== expected)
				throw new ConflictException("Cấu hình đã đổi; tải lại trước khi lưu");
			const encrypted = encryptCareSecrets(secrets, id);
			const row = previous
				? await tx.careIntegration.update({
						where: { id },
						data: {
							name,
							config,
							secrets: encrypted,
							enabled: false,
							version: { increment: 1 },
							checkedVersion: null,
							checkRequestedAt: null,
							lastError: "CONFIG_NOT_VERIFIED",
						},
					})
				: await tx.careIntegration.create({
						data: {
							id,
							kind,
							name,
							config,
							secrets: encrypted,
							createdBy: actor,
							lastError: "CONFIG_NOT_VERIFIED",
						},
					});
			if (kind === "POSCAKE") {
				const configs = [careSourceConfig.parse(config)];
				if (previous) configs.push(careSourceConfig.parse(previous.config));
				for (const source of configs)
					for (const channel of source.channels) {
						const key = `${channel.brand}:${source.shopId}:${channel.pageId}`;
						await tx.careSyncState.upsert({
							where: { id: key },
							create: { id: key, lastError: "SOURCE_CONFIG_CHANGED" },
							update: {
								lastError: "SOURCE_CONFIG_CHANGED",
								leaseToken: null,
								leaseUntil: null,
							},
						});
					}
			}
			return this.publicRow(row);
		});
	}

	async saveSource(raw: z.infer<typeof careSourceSave>, actor: string) {
		await this.manager(actor);
		const input = careSourceSave.parse(raw);
		const existing = await this.db.careIntegration.findUnique({
			where: { id: CARE_INTEGRATIONS.posId },
		});
		const old = existing
			? careSourceSecrets.parse(
					JSON.parse(decryptCareSecrets(existing.secrets, existing.id)),
				)
			: undefined;
		const apiKey = input.apiKey || old?.apiKey;
		if (!apiKey) throw new BadRequestException("Nhập API key POSCake lần đầu");
		const tokens = { ...old?.pancakeTokens };
		for (const item of input.pancakeTokens)
			if (item.token) tokens[item.pageId] = item.token;
		const config = careSourceConfig.parse(input);
		const allowedPages = new Set(
			config.channels.map((channel) => channel.pageId),
		);
		for (const page of Object.keys(tokens))
			if (!allowedPages.has(page)) delete tokens[page];
		const secrets = careSourceSecrets.parse({
			apiKey,
			pancakeTokens: tokens,
			webhookKey: old?.webhookKey ?? randomBytes(32).toString("base64url"),
		});
		return this.persist(
			"POSCAKE",
			input.name,
			config,
			JSON.stringify(secrets),
			input.expectedVersion,
			actor,
		);
	}

	async saveAi(raw: z.infer<typeof careAiSave>, actor: string) {
		await this.manager(actor);
		const input = careAiSave.parse(raw);
		const existing = await this.db.careIntegration.findUnique({
			where: { id: CARE_INTEGRATIONS.aiId },
		});
		const old = existing
			? careAiSecrets.parse(
					JSON.parse(decryptCareSecrets(existing.secrets, existing.id)),
				)
			: undefined;
		const apiKey = input.apiKey || old?.apiKey;
		if (!apiKey) throw new BadRequestException("Nhập API key LLM lần đầu");
		return this.persist(
			"LLM",
			"Trợ lý chăm sóc",
			careAiConfig.parse(input),
			JSON.stringify({ apiKey }),
			input.expectedVersion,
			actor,
		);
	}

	async action(
		kind: "POSCAKE" | "LLM",
		expectedVersion: number,
		actor: string,
		enabled?: boolean,
	) {
		await this.manager(actor);
		const id =
			kind === "POSCAKE" ? CARE_INTEGRATIONS.posId : CARE_INTEGRATIONS.aiId;
		return this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM "careIntegration" WHERE id = ${id} FOR UPDATE`;
			const row = await tx.careIntegration.findUnique({ where: { id } });
			if (!row || row.version !== expectedVersion)
				throw new ConflictException("Cấu hình đã đổi; tải lại");
			if (
				enabled === undefined &&
				kind === "LLM" &&
				(row.checkRequestedAt ||
					(row.lastCheckedAt &&
						Date.now() - row.lastCheckedAt.getTime() <
							CARE_INTEGRATIONS.aiCheckCooldownMs))
			)
				throw new BadRequestException(
					"Chờ ít nhất một phút giữa hai lần kiểm tra LLM",
				);
			if (enabled === true && row.checkedVersion !== row.version)
				throw new BadRequestException(
					"Kiểm tra kết nối phiên bản này trước khi bật",
				);
			if (
				kind === "POSCAKE" &&
				enabled === true &&
				process.env.NODE_ENV !== "test" &&
				new URL(
					process.env.DATABASE_URL ?? "postgresql://localhost/unknown",
				).pathname.endsWith("_test")
			)
				throw new BadRequestException(
					"Nguồn thật cần database vận hành riêng khỏi demo",
				);
			const updated = await tx.careIntegration.update({
				where: { id },
				data:
					enabled === undefined
						? { checkRequestedAt: new Date(), lastError: null }
						: { enabled },
			});
			if (kind === "POSCAKE" && enabled !== undefined) {
				const config = careSourceConfig.parse(row.config);
				for (const channel of config.channels)
					await tx.careSyncState.updateMany({
						where: {
							id: `${channel.brand}:${config.shopId}:${channel.pageId}`,
						},
						data: {
							leaseToken: null,
							leaseUntil: null,
							lastError: enabled ? "WAITING_SOURCE_SYNC" : "SOURCE_DISABLED",
						},
					});
			}
			return this.publicRow(updated);
		});
	}

	async webhookInfo(actor: string) {
		await this.manager(actor);
		const row = await this.db.careIntegration.findUnique({
			where: { id: CARE_INTEGRATIONS.posId },
		});
		if (!row) throw new BadRequestException("Lưu nguồn POSCake trước");
		const secret = careSourceSecrets.parse(
			JSON.parse(decryptCareSecrets(row.secrets, row.id)),
		);
		return {
			url: new URL(`/api/webhooks/care/poscake/${row.id}`, appUrl).toString(),
			header: CARE_INTEGRATIONS.webhookHeader,
			key: secret.webhookKey,
		};
	}

	async receiveWebhook(
		sourceId: string,
		key: string | undefined,
		body: CareWebhookBody,
	) {
		const row = await this.db.careIntegration.findUnique({
			where: { id: sourceId },
		});
		if (row?.kind !== "POSCAKE")
			throw new UnauthorizedException("Webhook không hợp lệ");
		const secrets = careSourceSecrets.parse(
			JSON.parse(decryptCareSecrets(row.secrets, row.id)),
		);
		const actual = Buffer.from(key ?? "");
		const expected = Buffer.from(secrets.webhookKey);
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
			throw new UnauthorizedException("Webhook không hợp lệ");
		if (!row.enabled || row.checkedVersion !== row.version)
			throw new ConflictException("Nguồn chưa bật hoặc chưa kiểm tra");
		const validation = careWebhookBody.safeParse(body);
		if (!validation.success)
			throw new BadRequestException("Payload webhook không hợp lệ");
		const parsed = validation.data;
		const config = careSourceConfig.parse(row.config);
		const events = Array.isArray(parsed) ? parsed : [parsed];
		const digest = createHash("sha256")
			.update(JSON.stringify(body))
			.digest("hex");
		const receipts: Prisma.CareWebhookReceiptCreateManyInput[] = [];
		for (const event of events) {
			const eventType = event.event ?? event.type ?? "order.changed";
			if (eventType === CARE_INTEGRATIONS.customerEventType) continue;
			const hints = Array.isArray(event.data)
				? event.data
				: [event.data?.order ?? event.order ?? event.data ?? event];
			for (const hint of hints) {
				const shopId = hint.shop_id ?? event.shop_id ?? config.shopId;
				if (shopId !== config.shopId)
					throw new BadRequestException("Webhook khác shop đã cấu hình");
				const orderId = hint.order_id ?? hint.id ?? event.order_id;
				if (!orderId) throw new BadRequestException("Webhook thiếu mã đơn");
				const eventKey = createHash("sha256")
					.update(
						JSON.stringify([
							event.event_id ?? hint.updated_at ?? digest,
							orderId,
							eventType,
						]),
					)
					.digest("hex");
				receipts.push({
					integrationId: row.id,
					eventKey,
					eventType,
					shopId,
					orderId,
				});
			}
		}
		return this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM "careIntegration" WHERE id = ${row.id} FOR UPDATE`;
			const current = await tx.careIntegration.findUniqueOrThrow({
				where: { id: row.id },
			});
			if (!current.enabled || current.version !== row.version)
				throw new ConflictException("Nguồn đã đổi; thử lại webhook");
			const received = receipts.length
				? await tx.careWebhookReceipt.createMany({
						data: receipts,
						skipDuplicates: true,
					})
				: { count: 0 };
			await tx.careIntegration.update({
				where: { id: row.id },
				data: { lastWebhookAt: new Date() },
			});
			return {
				accepted: true,
				received: received.count,
				duplicates: receipts.length - received.count,
			};
		});
	}

	async receipts(actor: string) {
		await this.manager(actor);
		return this.db.careWebhookReceipt.findMany({
			orderBy: { receivedAt: "desc" },
			take: 20,
			select: {
				id: true,
				orderId: true,
				state: true,
				attempts: true,
				lastError: true,
				receivedAt: true,
				finishedAt: true,
			},
		});
	}

	async requestAi(raw: z.infer<typeof careAiRequest>, actor: string) {
		const role = await workspaceRoleOf(actor, this.db);
		if (!role) throw new ForbiddenException("Bạn không thuộc workspace");
		const input = careAiRequest.parse(raw);
		const id = CARE_INTEGRATIONS.aiId;
		return this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM "careIntegration" WHERE id = ${id} FOR UPDATE`;
			const previous = await tx.careAiJob.findUnique({
				where: {
					createdBy_requestId: { createdBy: actor, requestId: input.requestId },
				},
			});
			if (previous) return { id: previous.id };
			const row = await tx.careIntegration.findUnique({ where: { id } });
			if (!row?.enabled || row.checkedVersion !== row.version)
				throw new BadRequestException(
					"Quản lý cần cấu hình, kiểm tra và bật AI trước",
				);
			const config = careAiConfig.parse(row.config);
			const today = new Date(Date.now() + CARE_INTEGRATIONS.timezoneOffsetMs);
			today.setUTCHours(0, 0, 0, 0);
			const since = new Date(
				today.getTime() - CARE_INTEGRATIONS.timezoneOffsetMs,
			);
			const count = await tx.careAiJob.count({
				where: { createdAt: { gte: since } },
			});
			if (count >= config.dailyLimit)
				throw new BadRequestException("Đã hết giới hạn lượt AI hôm nay");
			if (
				(await tx.careAiJob.count({
					where: { createdBy: actor, state: { in: ["PENDING", "RUNNING"] } },
				})) >= CARE_INTEGRATIONS.aiPendingPerUser
			)
				throw new BadRequestException(
					"Đang có yêu cầu AI chờ xử lý; chờ kết quả trước",
				);
			if (
				input.customerId &&
				!(await tx.careCustomer.findFirst({
					where: {
						id: input.customerId,
						brand: input.brand,
						ownerId: isWorkspaceAdmin(role) ? undefined : actor,
					},
				}))
			)
				throw new BadRequestException("Khách không thuộc thương hiệu đã chọn");
			const job = await tx.careAiJob.create({
				data: {
					integrationId: id,
					configVersion: row.version,
					requestId: input.requestId,
					createdBy: actor,
					input,
					model: config.model,
				},
			});
			return { id: job.id };
		});
	}

	async aiJobs(actor: string) {
		if (!(await workspaceRoleOf(actor, this.db)))
			throw new ForbiddenException("Bạn không thuộc workspace");
		const rows = await this.db.careAiJob.findMany({
			where: { createdBy: actor },
			orderBy: { createdAt: "desc" },
			take: 20,
		});
		return rows.map((row) => careAiJobPublic.parse(row));
	}

	async applyAiDraft(id: string, actor: string) {
		await this.manager(actor);
		return this.db.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM "careAiJob" WHERE id = ${id} FOR UPDATE`;
			const job = await tx.careAiJob.findFirst({
				where: { id, createdBy: actor, state: "DONE" },
			});
			if (!job) throw new BadRequestException("Không có kết quả AI để lưu");
			const result = careAiJobPublic.parse(job);
			if (!result.result?.template)
				throw new BadRequestException("Kết quả không có mẫu nội dung");
			const templateId = `care-ai-${id}`;
			const existing = await tx.careTemplate.findUnique({
				where: { id: templateId },
			});
			if (existing) return { id: existing.id };
			const input = careTemplateInput.parse({
				...result.result.template,
				brand: result.input.brand,
				purpose: result.input.purpose,
				validUntil: null,
			});
			try {
				renderCareTemplate(input.body, {
					customer: "Khách",
					product: "Sản phẩm",
					brand: "Thương hiệu",
				});
			} catch {
				throw new BadRequestException(
					"Mẫu AI chứa biến không hỗ trợ; sửa lại nội dung trước",
				);
			}
			const { validUntil: _, ...data } = input;
			const template = await tx.careTemplate.create({
				data: { ...data, id: templateId },
			});
			return { id: template.id };
		});
	}
}
