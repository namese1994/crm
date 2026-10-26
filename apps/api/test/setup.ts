import { afterAll } from "bun:test";

process.env.GOOGLE_CLIENT_ID ||= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ||= "test-google-client-secret";

afterAll(async () => {
	if (!process.env.DATABASE_URL) return;
	const { db } = await import("@crm/db");
	await db.$disconnect();
});
