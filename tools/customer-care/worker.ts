import "@crm/env/load";
import "reflect-metadata";
import { db } from "@crm/db";
import { CARE } from "@crm/validation/customer-care";
import { Logger } from "@nestjs/common";
import { CustomerCareService } from "../../apps/api/src/customer-care/customer-care.service";
import { syncSources } from "./source-sync";

const logger = new Logger("CareWorker");
const care = new CustomerCareService(db);
let stopping = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let wake: (() => void) | undefined;
const stop = () => {
	stopping = true;
	if (timer) clearTimeout(timer);
	wake?.();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

while (!stopping) {
	try {
		await syncSources((input, actor, now) =>
			care.importOrder(input, actor, now),
		);
		await care.tick();
	} catch {
		logger.error({ message: "Care worker failed; will retry on next tick" });
	}
	if (process.argv.includes("--once")) break;
	await new Promise<void>((resolve) => {
		wake = resolve;
		timer = setTimeout(resolve, CARE.workerIntervalMs);
	});
}
await db.$disconnect();
