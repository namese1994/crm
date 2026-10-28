import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { auth } from "@crm/auth/auth";
import { isCarePasswordEnabled } from "@crm/auth/env";
import { db } from "@crm/db";
import { betterAuth } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

const keys = [
	"CRM_CARE_MODE",
	"CRM_CARE_PASSWORD_AUTH",
	"ALLOWED_SIGN_IN",
] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const prefix = `care-password-${crypto.randomUUID()}`;
const origin = "https://care-password.example.test";
const password = "Synthetic-test-credential-1234";
const allowedId = `${prefix}-allowed`;
const provisionId = `${prefix}-provision`;
const users = [allowedId, `${prefix}-removed`, provisionId];
let login: { handler(request: Request): Promise<Response> };

function call(path: string, body?: Record<string, string>, cookie?: string) {
	const headers = new Headers({ origin, "content-type": "application/json" });
	if (cookie) headers.set("cookie", cookie);
	return login.handler(
		new Request(`${origin}/api/auth/${path}`, {
			method: body === undefined ? "GET" : "POST",
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	);
}

beforeAll(async () => {
	process.env.CRM_CARE_MODE = "true";
	process.env.CRM_CARE_PASSWORD_AUTH = "true";
	process.env.ALLOWED_SIGN_IN = `${prefix}@example.test`;
	const hash = await hashPassword(password);
	for (const [index, id] of users.slice(0, 2).entries()) {
		await db.user.create({
			data: {
				id,
				name: "Synthetic password test",
				email:
					index === 0
						? `${prefix}@example.test`
						: `${prefix}-removed@example.test`,
				accounts: {
					create: {
						id,
						accountId: id,
						providerId: "credential",
						password: hash,
					},
				},
			},
		});
	}
	login = betterAuth({
		...auth.options,
		baseURL: origin,
		trustedOrigins: [origin],
		rateLimit: { enabled: false },
		emailAndPassword: {
			enabled: true,
			disableSignUp: true,
			minPasswordLength: 12,
		},
	});
});

afterAll(async () => {
	await db.session.deleteMany({ where: { userId: { in: users } } });
	await db.member.deleteMany({ where: { userId: { in: users } } });
	await db.user.deleteMany({ where: { id: { in: users } } });
	for (const key of keys) {
		if (original[key] === undefined) delete process.env[key];
		else process.env[key] = original[key];
	}
});

describe("care password access", () => {
	test("requires both explicit care flags", () => {
		for (const [care, enabled, expected] of [
			["true", "true", true],
			["true", "false", false],
			["false", "true", false],
			["true", "1", false],
			["", "", false],
		] as const) {
			process.env.CRM_CARE_MODE = care;
			process.env.CRM_CARE_PASSWORD_AUTH = enabled;
			expect(isCarePasswordEnabled()).toBe(expected);
		}
		process.env.CRM_CARE_MODE = "true";
		process.env.CRM_CARE_PASSWORD_AUTH = "true";
	});

	test("does not permit public signup even for an allowed email", async () => {
		const response = await call("sign-up/email", {
			email: `${prefix}@example.test`,
			name: "No signup",
			password,
		});
		expect(response.status).toBe(400);
	});

	test("rejects wrong passwords and an existing account removed from the allow-list", async () => {
		const wrong = await call("sign-in/email", {
			email: `${prefix}@example.test`,
			password: "wrong-password",
		});
		expect(wrong.status).toBe(401);
		const removed = await call("sign-in/email", {
			email: `${prefix}-removed@example.test`,
			password,
		});
		expect(removed.status).toBe(403);
		expect(await db.session.count({ where: { userId: { in: users } } })).toBe(
			0,
		);
	});

	test("issues a session for a provisioned allowed account and revokes it on sign-out", async () => {
		const response = await call("sign-in/email", {
			email: `${prefix}@example.test`,
			password,
		});
		expect(response.status).toBe(200);
		const cookies = response.headers.getSetCookie();
		expect(cookies.some((cookie) => /httponly/i.test(cookie))).toBe(true);
		const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
		const session = await call("get-session", undefined, cookie);
		const result = z
			.object({ user: z.object({ id: z.string() }) })
			.parse(await session.json());
		expect(result.user.id).toBe(allowedId);
		const logout = await call("sign-out", {}, cookie);
		expect(logout.status).toBe(200);
		expect(await db.session.count({ where: { userId: users[0] } })).toBe(0);
	});

	test("concurrent operator runs create exactly one credential for an existing member", async () => {
		const email = `${prefix}-provision@example.test`;
		await db.user.create({
			data: { id: provisionId, name: "Synthetic operator test", email },
		});
		await db.member.create({
			data: {
				id: provisionId,
				organizationId: "workspace",
				userId: provisionId,
				role: "member",
				createdAt: new Date(),
			},
		});
		const root = resolve(import.meta.dir, "../../..");
		const passwordFile = resolve(root, ".scratch", `${prefix}-password`);
		await mkdir(resolve(root, ".scratch"), { recursive: true });
		await writeFile(passwordFile, password, { mode: 0o600 });
		try {
			const url = process.env.TEST_DATABASE_URL;
			if (!url) throw new Error("TEST_DATABASE_URL required");
			const args = [
				process.execPath,
				resolve(root, "tools/customer-care/provision-access.ts"),
				"--database",
				new URL(url).pathname.slice(1),
				"--email",
				email,
				"--name",
				"Synthetic operator test",
				"--role",
				"member",
				"--password-file",
				passwordFile,
			];
			const run = () =>
				Bun.spawn(args, {
					cwd: root,
					env: {
						...process.env,
						NODE_ENV: "production",
						DATABASE_URL: url,
						CRM_CARE_MODE: "true",
						CRM_CARE_PASSWORD_AUTH: "true",
						ALLOWED_SIGN_IN: email,
					},
					stdout: "ignore",
					stderr: "ignore",
				}).exited;
			expect((await Promise.all([run(), run()])).sort()).toEqual([0, 1]);
			expect(
				await db.account.count({
					where: { userId: provisionId, providerId: "credential" },
				}),
			).toBe(1);
		} finally {
			await unlink(passwordFile);
		}
	});
});
