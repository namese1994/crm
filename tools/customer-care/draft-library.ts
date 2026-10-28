import { db } from "@crm/db";
import { CustomerCareService } from "../../apps/api/src/customer-care/customer-care.service";

export const DRAFTS = [
	{
		purpose: "CHECK_IN",
		name: "Nhận đủ hàng",
		body: "{{customer}} nhận đủ {{product}} rồi chứ ạ? Có điểm nào cần bên {{brand}} hỗ trợ, mình nhắn em nhé.",
		tags: [],
	},
	{
		purpose: "CHECK_IN",
		name: "Trải nghiệm lần đầu",
		body: "{{customer}} đã có dịp thử {{product}} chưa ạ? Em muốn nghe cảm nhận để bên {{brand}} hỗ trợ mình đúng hơn.",
		tags: [],
	},
	{
		purpose: "USE_VALUE",
		name: "Phối đồ thường ngày",
		body: "{{customer}} thường muốn phối {{product}} với món đồ nào sẵn có ạ? Mình gửi em ảnh hoặc mô tả, em cùng mình chọn cách phối dễ dùng nhé.",
		tags: ["need:daily"],
	},
	{
		purpose: "USE_VALUE",
		name: "Tìm hướng dẫn đúng sản phẩm",
		body: "Nếu {{customer}} cần kiểm tra cách bảo quản {{product}}, mình gửi em ảnh nhãn hướng dẫn nhé. Bên {{brand}} sẽ cùng mình kiểm tra đúng thông tin của sản phẩm.",
		tags: [],
	},
	{
		purpose: "EXPERIENCE",
		name: "Lắng nghe sau sử dụng",
		body: "{{customer}} đã dùng {{product}} một thời gian, có điểm nào mình thích hoặc muốn bên {{brand}} làm tốt hơn không ạ? Em xin ghi nhận đúng trải nghiệm của mình.",
		tags: [],
	},
	{
		purpose: "EXPERIENCE",
		name: "Hoàn cảnh sử dụng",
		body: "{{customer}} hay dùng {{product}} khi đi bộ, đi chơi hay trong sinh hoạt hằng ngày ạ? Em hỏi để lần sau gợi ý sát nhu cầu của mình hơn.",
		tags: [],
	},
	{
		purpose: "REORDER",
		name: "Hỏi nhu cầu mới",
		body: "Dạo này {{customer}} có đang tìm thêm trang phục cho dịp nào không ạ? Nếu cần, bên {{brand}} sẽ chọn vài gợi ý theo nhu cầu và những món mình đã có.",
		tags: [],
	},
	{
		purpose: "REORDER",
		name: "Bổ sung đồ mặc thường ngày",
		body: "{{customer}} muốn tìm thêm một món dễ phối cùng đồ mình đang mặc không ạ? Mình cho em biết màu hoặc kiểu đang cần, em kiểm tra mẫu phù hợp bên {{brand}} nhé.",
		tags: ["need:daily"],
	},
	{
		purpose: "REACTIVATE",
		name: "Kết nối lại nhẹ nhàng",
		body: "{{customer}} dạo này vẫn dùng {{product}} ổn chứ ạ? Nếu có điều gì cần hỗ trợ hoặc muốn góp ý cho {{brand}}, mình nhắn em nhé.",
		tags: [],
	},
	{
		purpose: "REACTIVATE",
		name: "Cập nhật nhu cầu",
		body: "Em chào {{customer}}, nhu cầu trang phục của mình gần đây có thay đổi không ạ? Nếu mình đang cần tìm món nào, bên {{brand}} sẵn sàng cùng mình kiểm tra.",
		tags: [],
	},
	{
		purpose: "REVIEW",
		name: "Góp ý dịch vụ",
		body: "{{customer}} thấy cách bên {{brand}} hỗ trợ mình thời gian qua thế nào ạ? Có điều gì nên giữ hoặc điều chỉnh, em mong nhận được góp ý của mình.",
		tags: [],
	},
	{
		purpose: "REVIEW",
		name: "Xin đánh giá khi đã hài lòng",
		body: "Cảm ơn {{customer}} đã chia sẻ trải nghiệm với {{brand}}. Nếu thuận tiện, mình cho bên em một nhận xét ngắn về {{product}} nhé. Việc sử dụng công khai ảnh hoặc lời nhận xét sẽ được xin phép riêng.",
		tags: ["experience:happy"],
	},
] as const;

export async function seedDraftLibrary(actorId: string) {
	const care = new CustomerCareService(db);
	await care.requireManager(actorId);
	let created = 0;
	for (const brand of ["UMEHA", "LI_EN_SPORT"] as const) {
		for (const draft of DRAFTS) {
			if (
				await db.careTemplate.findFirst({ where: { brand, name: draft.name } })
			)
				continue;
			await care.saveTemplate(
				{
					brand,
					purpose: draft.purpose,
					name: draft.name,
					body: draft.body,
					requiredTags: [...draft.tags],
					excludedTags: [],
					validUntil: null,
				},
				actorId,
			);
			created++;
		}
	}
	return { created, approved: 0 };
}

if (import.meta.main) {
	const actorId = process.argv[2];
	if (!actorId) throw new Error("Manager user ID required");
	process.stdout.write(`${JSON.stringify(await seedDraftLibrary(actorId))}\n`);
	await db.$disconnect();
}
