import "@crm/env/load";
import { db } from "@crm/db";
import {
	CARE_INTEGRATIONS,
	careAiConfig,
	careAiSecrets,
	careSourceConfig,
	careSourceSecrets,
} from "@crm/validation/care-integrations";
import { createSecretBox } from "./secret-box";

export function careSecretBox() {
	return createSecretBox(process.env.CARE_CONFIG_ENCRYPTION_KEY);
}

export function encryptCareSecrets(value: string, id: string) {
	const box = careSecretBox();
	if (!box) throw new Error("CARE_ENCRYPTION_NOT_CONFIGURED");
	return box.encrypt(value, `care-integration:${id}`);
}

export function decryptCareSecrets(value: string, id: string) {
	const box = careSecretBox();
	if (!box) throw new Error("CARE_ENCRYPTION_NOT_CONFIGURED");
	return box.decrypt(value, `care-integration:${id}`);
}

export async function readCareSource() {
	const row = await db.careIntegration.findUnique({
		where: { id: CARE_INTEGRATIONS.posId },
	});
	if (!row) return null;
	return {
		row,
		config: careSourceConfig.parse(row.config),
		secrets: careSourceSecrets.parse(
			JSON.parse(decryptCareSecrets(row.secrets, row.id)),
		),
	};
}

export async function readCareAi() {
	const row = await db.careIntegration.findUnique({
		where: { id: CARE_INTEGRATIONS.aiId },
	});
	if (!row) return null;
	return {
		row,
		config: careAiConfig.parse(row.config),
		secrets: careAiSecrets.parse(
			JSON.parse(decryptCareSecrets(row.secrets, row.id)),
		),
	};
}
