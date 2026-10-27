import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { auth } from "@crm/auth/auth";
import { isCarePasswordEnabled } from "@crm/auth/env";
import { isWorkspaceRole, WORKSPACE_ID } from "@crm/auth/organization";
import { isWorkspaceEmail } from "@crm/auth/workspace";
import { db } from "@crm/db";

class ProvisionInputError extends Error {}

async function provision() {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			database: { type: "string" },
			email: { type: "string" },
			name: { type: "string" },
			role: { type: "string" },
			"password-file": { type: "string" },
		},
	});
	if (!isCarePasswordEnabled())
		throw new ProvisionInputError(
			"Bật care mode và password auth trước khi cấp tài khoản.",
		);
	const database = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
	if (process.env.NODE_ENV === "test" || values.database !== database)
		throw new ProvisionInputError(
			"Chỉ định đúng tên DATABASE_URL bằng --database.",
		);
	const email = values.email?.trim().toLowerCase();
	const name = values.name?.trim();
	const role = values.role;
	const passwordFile = values["password-file"];
	if (!email || !isWorkspaceEmail(email))
		throw new ProvisionInputError("Email phải nằm trong ALLOWED_SIGN_IN.");
	if (!name || !role || !isWorkspaceRole(role) || !passwordFile)
		throw new ProvisionInputError(
			"Cần --name, --role owner/admin/member và --password-file.",
		);
	const info = await stat(passwordFile);
	if (
		!info.isFile() ||
		(process.platform !== "win32" && (info.mode & 0o077) !== 0)
	)
		throw new ProvisionInputError(
			"File mật khẩu phải là file riêng với quyền 600.",
		);
	const password = (await readFile(passwordFile, "utf8")).replace(/\r?\n$/, "");
	if (password.length < 12 || password.length > 128)
		throw new ProvisionInputError("Mật khẩu cần từ 12 đến 128 ký tự.");
	const hash = await (await auth.$context).password.hash(password);
	await db.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${email}, 0))`;
		if (!(await tx.organization.findUnique({ where: { id: WORKSPACE_ID } })))
			throw new ProvisionInputError(
				"Hoàn tất thiết lập workspace trước khi cấp tài khoản.",
			);
		const existing = await tx.user.findUnique({ where: { email } });
		if (existing) {
			const credential = await tx.account.findFirst({
				where: { userId: existing.id, providerId: "credential" },
			});
			if (credential)
				throw new ProvisionInputError(
					"Tài khoản đã có mật khẩu; không ghi đè.",
				);
		}
		const user =
			existing ??
			(await tx.user.create({
				data: { id: crypto.randomUUID(), email, name, emailVerified: false },
			}));
		const key = { organizationId: WORKSPACE_ID, userId: user.id };
		const member = await tx.member.findUnique({
			where: { organizationId_userId: key },
		});
		if (member && member.role !== role)
			throw new ProvisionInputError(
				"Không đổi vai trò hiện có bằng công cụ cấp mật khẩu.",
			);
		await tx.account.create({
			data: {
				id: crypto.randomUUID(),
				accountId: user.id,
				providerId: "credential",
				userId: user.id,
				password: hash,
			},
		});
		if (!member)
			await tx.member.create({
				data: { id: crypto.randomUUID(), ...key, role, createdAt: new Date() },
			});
	});
	console.log(JSON.stringify({ provisioned: true, role }));
}

try {
	await provision();
} catch (error) {
	console.error(
		error instanceof ProvisionInputError
			? error.message
			: "Cấp tài khoản thất bại; không in dữ liệu tài khoản.",
	);
	process.exitCode = 1;
} finally {
	await db.$disconnect();
}
