import "@crm/env/load";
import { db } from "@crm/db";
import { CARE_INTEGRATIONS } from "@crm/validation/care-integrations";
import { checkCareAi, runCareAiJob } from "../agent/lib/care-agent";

let stopping = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let wake: (() => void) | undefined;
function stop() {
	stopping = true;
	clearTimeout(timer);
	wake?.();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
while (!stopping) {
	try {
		await checkCareAi();
		await runCareAiJob();
	} catch {
		console.error(
			"Care AI worker failed; no model request is retried automatically",
		);
	}
	if (process.argv.includes("--once")) break;
	await new Promise<void>((resolve) => {
		wake = resolve;
		timer = setTimeout(resolve, CARE_INTEGRATIONS.aiWorkerIntervalMs);
	});
}
await db.$disconnect();
