import {
	careActionInput,
	careBrand,
	careCustomerInput,
	careImport,
	careListInput,
	careMetrics,
	careTaskInput,
	careTemplateInput,
} from "@crm/validation/customer-care";
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
import { CustomerCareService } from "./customer-care.service";

@Router({ alias: "care" })
@UseMiddlewares(AuthMiddleware)
export class CustomerCareRouter {
	constructor(
		@Inject(CustomerCareService) private readonly care: CustomerCareService,
	) {}

	@Query({ input: careListInput })
	list(
		@Input() input: z.infer<typeof careListInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.care.list(input, ctx.user.id);
	}

	@Query()
	summary(@Ctx() ctx: AuthedTrpcContext) {
		return this.care.summary(ctx.user.id);
	}

	@Query({ output: careMetrics })
	metrics() {
		return this.care.metrics();
	}

	@Query({
		input: z.object({
			brand: careBrand.optional(),
			page: z.number().int().min(1).default(1),
		}),
	})
	customers(
		@Input() input: { brand?: z.infer<typeof careBrand>; page: number },
	) {
		return this.care.customers(input.brand, input.page);
	}

	@Mutation({ input: careCustomerInput })
	configureCustomer(
		@Input() input: z.infer<typeof careCustomerInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.care.configureCustomer(input, ctx.user.id);
	}

	@Mutation({ input: careTaskInput })
	claim(
		@Input() input: z.infer<typeof careTaskInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.care.claim(input.id, ctx.user.id);
	}

	@Mutation({ input: careTaskInput })
	copy(
		@Input() input: z.infer<typeof careTaskInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.care.copy(input.id, ctx.user.id);
	}

	@Mutation({ input: careActionInput })
	action(
		@Input() input: z.infer<typeof careActionInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.care.action(input, ctx.user.id);
	}

	@Query({ input: z.object({ brand: careBrand.optional() }) })
	templates(@Input() input: { brand?: z.infer<typeof careBrand> }) {
		return this.care.templates(input.brand);
	}

	@Mutation({ input: careTemplateInput })
	saveTemplate(
		@Input() input: z.infer<typeof careTemplateInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.care.saveTemplate(input, ctx.user.id);
	}

	@Mutation({
		input: z.object({ id: z.string().min(1), approved: z.boolean() }),
	})
	approveTemplate(
		@Input() input: { id: string; approved: boolean },
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.care.approveTemplate(input.id, ctx.user.id, input.approved);
	}

	@Mutation({ input: careImport })
	async importOrder(
		@Input() input: z.infer<typeof careImport>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		await this.care.requireManager(ctx.user.id);
		return this.care.importOrder(input, ctx.user.id);
	}

	@Mutation()
	async reconcile(@Ctx() ctx: AuthedTrpcContext) {
		await this.care.requireManager(ctx.user.id);
		return this.care.tick();
	}
}
