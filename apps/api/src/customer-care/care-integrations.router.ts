import {
	CARE_INTEGRATIONS,
	careAiJobPublic,
	careAiRequest,
	careAiSave,
	careIntegrationAction,
	careIntegrationPublic,
	careIntegrationStatus,
	careIntegrationToggle,
	careJobState,
	careSourceSave,
} from "@crm/validation/care-integrations";
import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { CareIntegrationsService } from "./care-integrations.service";
import { CareMembershipMiddleware } from "./care-membership.middleware";

@Router({ alias: "careIntegrations" })
@UseMiddlewares(AuthMiddleware, CareMembershipMiddleware)
export class CareIntegrationsRouter {
	constructor(
		@Inject(CareIntegrationsService)
		private readonly integrations: CareIntegrationsService,
	) {}
	@Query({ output: careIntegrationStatus })
	status(@Ctx() ctx: AuthedTrpcContext) {
		return this.integrations.status(ctx.user.id);
	}
	@Mutation({ input: careSourceSave, output: careIntegrationPublic.nullable() })
	saveSource(
		@Input() input: z.infer<typeof careSourceSave>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.integrations.saveSource(input, ctx.user.id);
	}
	@Mutation({ input: careAiSave, output: careIntegrationPublic.nullable() })
	saveAi(
		@Input() input: z.infer<typeof careAiSave>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.integrations.saveAi(input, ctx.user.id);
	}
	@Mutation({
		input: careIntegrationAction,
		output: careIntegrationPublic.nullable(),
	})
	check(
		@Input() input: z.infer<typeof careIntegrationAction>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.integrations.action(
			input.kind,
			input.expectedVersion,
			ctx.user.id,
		);
	}
	@Mutation({
		input: careIntegrationToggle,
		output: careIntegrationPublic.nullable(),
	})
	toggle(
		@Input() input: z.infer<typeof careIntegrationToggle>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.integrations.action(
			input.kind,
			input.expectedVersion,
			ctx.user.id,
			input.enabled,
		);
	}
	@Mutation({
		output: z.object({
			url: z.url(),
			header: z.literal(CARE_INTEGRATIONS.webhookHeader),
			key: z.string(),
		}),
	})
	webhookInfo(@Ctx() ctx: AuthedTrpcContext) {
		return this.integrations.webhookInfo(ctx.user.id);
	}
	@Query({
		output: z.array(
			z.object({
				id: z.string(),
				orderId: z.string(),
				state: careJobState,
				attempts: z.number(),
				lastError: z.string().nullable(),
				receivedAt: z.date(),
				finishedAt: z.date().nullable(),
			}),
		),
	})
	receipts(@Ctx() ctx: AuthedTrpcContext) {
		return this.integrations.receipts(ctx.user.id);
	}
	@Mutation({ input: careAiRequest, output: z.object({ id: z.string() }) })
	requestAi(
		@Input() input: z.infer<typeof careAiRequest>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.integrations.requestAi(input, ctx.user.id);
	}
	@Query({ output: z.array(careAiJobPublic) })
	aiJobs(@Ctx() ctx: AuthedTrpcContext) {
		return this.integrations.aiJobs(ctx.user.id);
	}
	@Mutation({
		input: z.object({ id: z.string() }),
		output: z.object({ id: z.string() }),
	})
	applyAiDraft(@Input() input: { id: string }, @Ctx() ctx: AuthedTrpcContext) {
		return this.integrations.applyAiDraft(input.id, ctx.user.id);
	}
}
