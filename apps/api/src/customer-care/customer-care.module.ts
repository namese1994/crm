import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { CareIntegrationsRouter } from "./care-integrations.router";
import { CareIntegrationsService } from "./care-integrations.service";
import { CareWebhookController } from "./care-webhook.controller";
import { CustomerCareRouter } from "./customer-care.router";
import { CustomerCareService } from "./customer-care.service";

@Module({
	imports: [TrpcModule],
	controllers: [CareWebhookController],
	providers: [
		CustomerCareService,
		CustomerCareRouter,
		CareIntegrationsRouter,
		CareIntegrationsService,
	],
})
export class CustomerCareModule {}
