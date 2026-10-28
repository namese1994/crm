import "@crm/env/load";
import "reflect-metadata";
import { db } from "@crm/db";
import { CARE } from "@crm/validation/customer-care";
import { CustomerCareService } from "../../apps/api/src/customer-care/customer-care.service";
import { seedDraftLibrary } from "./draft-library";

if (
	process.env.NODE_ENV === "production" ||
	!new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_test")
)
	throw new Error(
		"Demo requires an isolated _test database outside production",
	);
const now = new Date();
const actor = "care-demo-manager";
await db.organization.upsert({
	where: { id: "workspace" },
	create: {
		id: "workspace",
		name: "CRM thử nghiệm UMEHA",
		slug: "crm-thu-nghiem",
		createdAt: now,
		metadata: JSON.stringify({ onboardedAt: now.toISOString() }),
	},
	update: {
		name: "CRM thử nghiệm UMEHA",
		slug: "crm-thu-nghiem",
		metadata: JSON.stringify({ onboardedAt: now.toISOString() }),
	},
});
for (const [id, name, role] of [
	[actor, "Quản lý thử nghiệm", "owner"],
	["care-demo-staff-1", "Nhân viên mẫu 1", "member"],
	["care-demo-staff-2", "Nhân viên mẫu 2", "member"],
	["care-demo-staff-3", "Nhân viên mẫu 3", "member"],
] as const) {
	await db.user.upsert({
		where: { id },
		create: {
			id,
			name,
			email: `${id}@example.invalid`,
			updatedAt: now,
		},
		update: {},
	});
	await db.member.upsert({
		where: {
			organizationId_userId: { organizationId: "workspace", userId: id },
		},
		create: {
			id: crypto.randomUUID(),
			organizationId: "workspace",
			userId: id,
			role,
			createdAt: now,
		},
		update: {},
	});
}
await seedDraftLibrary(actor);
const care = new CustomerCareService(db);
for (let index = 1; index <= 6; index++) {
	const brand = index % 2 === 0 ? "UMEHA" : "LI_EN_SPORT";
	const previousOrder = await db.careOrder.findFirst({
		where: {
			sourceOrderId: `demo-order-${index}`,
			customer: { brand, shopId: "demo-shop" },
		},
	});
	const imported = await care.importOrder(
		{
			brand,
			shopId: "demo-shop",
			customerId: `demo-customer-${index}`,
			customerName: `Khách mẫu ${index}`,
			orderId: `demo-order-${index}`,
			orderStatus: "DELIVERED",
			deliveredAt: (
				previousOrder?.deliveredAt ?? new Date(now.getTime() - 2 * CARE.dayMs)
			).toISOString(),
			deliveryEvidence: "SYNTHETIC_DEMO",
			products: [
				{ sku: `DEMO-${index}`, name: "Sản phẩm minh họa", quantity: 1 },
			],
			sourceCreatedAt: (
				previousOrder?.sourceCreatedAt ??
				new Date(now.getTime() - 5 * CARE.dayMs)
			).toISOString(),
			sourceUpdatedAt: now.toISOString(),
			conversation: {
				pageId: "demo-page",
				conversationId: `demo-page_${index}`,
				verifiedAt: now.toISOString(),
				activityVerifiedAt: now.toISOString(),
				lastInboundAt: null,
				lastOutboundAt: null,
				canSend: true,
			},
		},
		actor,
		now,
	);
	const expected = await db.careCustomer.findUniqueOrThrow({
		where: { id: imported.customerId },
		select: { enrolled: true, ownerId: true, tags: true },
	});
	await care.configureCustomer(
		{
			id: imported.customerId,
			enrolled: true,
			ownerId: actor,
			tags: ["demo"],
			expected,
		},
		actor,
	);
}
for (const brand of ["UMEHA", "LI_EN_SPORT"] as const) {
	await db.careTemplate.upsert({
		where: { id: `demo-approved-${brand}` },
		create: {
			id: `demo-approved-${brand}`,
			brand,
			purpose: "CHECK_IN",
			name: "DEMO — chỉ dùng dữ liệu mẫu",
			requiredTags: ["demo"],
			body: "DỮ LIỆU MẪU: {{customer}} nhận {{product}} ổn chưa ạ?",
			approvedAt: now,
			approvedBy: actor,
		},
		update: {},
	});
}
await care.tick(now);
const token = crypto.randomUUID();
await db.session.create({
	data: {
		id: crypto.randomUUID(),
		token,
		userId: actor,
		expiresAt: new Date(now.getTime() + CARE.dayMs),
		updatedAt: now,
		activeOrganizationId: "workspace",
	},
});
const key = await crypto.subtle.importKey(
	"raw",
	new TextEncoder().encode(process.env.BETTER_AUTH_SECRET),
	{ name: "HMAC", hash: "SHA-256" },
	false,
	["sign"],
);
const signature = await crypto.subtle.sign(
	"HMAC",
	key,
	new TextEncoder().encode(token),
);
const cookie = encodeURIComponent(
	`${token}.${Buffer.from(signature).toString("base64")}`,
);
const origin = new URL(process.env.APP_URL ?? "http://localhost:3000");
const secure = origin.protocol === "https:";
await Bun.write(
	"../../.scratch/demo-browser-state.json",
	JSON.stringify({
		cookies: [
			{
				name: secure ? "__Secure-crm.session_token" : "crm.session_token",
				value: cookie,
				domain: origin.hostname,
				path: "/",
				httpOnly: true,
				secure,
				sameSite: "Lax",
				expires: Math.floor(now.getTime() / 1000) + 86400,
			},
		],
		origins: [],
	}),
);
process.stdout.write(
	"Synthetic care demo prepared. Session stored only in ignored .scratch.\n",
);
await db.$disconnect();
