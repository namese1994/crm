import { CARE_INTEGRATIONS } from "@crm/validation/care-integrations";
import {
	Body,
	Controller,
	Headers,
	HttpCode,
	Param,
	Post,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { CareIntegrationsService } from "./care-integrations.service";
import type { CareWebhookBody } from "./care-webhook.contract";

@Controller("api/webhooks/care/poscake")
export class CareWebhookController {
	constructor(private readonly integrations: CareIntegrationsService) {}
	@Post(":sourceId")
	@HttpCode(202)
	@AllowAnonymous()
	receive(
		@Param("sourceId") sourceId: string,
		@Headers(CARE_INTEGRATIONS.webhookHeader) key: string | undefined,
		@Body() body: CareWebhookBody,
	) {
		return this.integrations.receiveWebhook(sourceId, key, body);
	}
}
