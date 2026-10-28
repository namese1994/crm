import { z } from "zod";

const wireId = z
	.union([z.string().min(1).max(160), z.number().int()])
	.transform(String);
const orderHint = z.object({
	id: wireId.optional(),
	order_id: wireId.optional(),
	shop_id: wireId.optional(),
	updated_at: z.string().max(80).optional(),
});
const event = orderHint.extend({
	event_id: wireId.optional(),
	event: z.string().max(120).optional(),
	type: z.string().max(120).optional(),
	order: orderHint.optional(),
	data: z
		.union([
			orderHint.extend({ order: orderHint.optional() }),
			z.array(orderHint).max(100),
		])
		.optional(),
});
export const careWebhookBody = z.union([event, z.array(event).min(1).max(100)]);
export type CareWebhookBody = z.input<typeof careWebhookBody>;
export const careWebhookParserError = z.object({
	type: z.enum(["entity.too.large", "entity.parse.failed"]),
});
