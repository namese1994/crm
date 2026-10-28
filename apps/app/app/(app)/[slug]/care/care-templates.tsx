"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const purposes = {
	CHECK_IN: "Trải nghiệm ban đầu",
	USE_VALUE: "Giá trị sử dụng",
	EXPERIENCE: "Lắng nghe trải nghiệm",
	REORDER: "Mua lại",
	REACTIVATE: "Kết nối lại",
	REVIEW: "Đánh giá",
};

export function CareTemplates({ canManage }: { canManage: boolean }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const templates = useQuery(trpc.care.templates.queryOptions({}));
	const [brand, setBrand] = useState<"UMEHA" | "LI_EN_SPORT">("UMEHA");
	const [purpose, setPurpose] = useState<keyof typeof purposes>("CHECK_IN");
	const [name, setName] = useState("");
	const [body, setBody] = useState("");
	const [required, setRequired] = useState("");
	const [excluded, setExcluded] = useState("");
	const [expires, setExpires] = useState("");
	const [editingId, setEditingId] = useState<string | undefined>();
	const [editingVersion, setEditingVersion] = useState<number | undefined>();
	const save = useMutation(
		trpc.care.saveTemplate.mutationOptions({
			onSuccess: async () => {
				await cache.care();
				setName("");
				setBody("");
				setEditingId(undefined);
				setEditingVersion(undefined);
				toast.success("Đã lưu bản nháp, cần duyệt trước khi dùng");
			},
			onError: async (e) => {
				toast.error(e.message);
				await templates.refetch();
			},
		}),
	);
	const approve = useMutation(
		trpc.care.approveTemplate.mutationOptions({
			onSuccess: async () => {
				await cache.care();
				toast.success("Đã cập nhật phê duyệt");
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const split = (value: string) =>
		value
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
	const hasDraft = Boolean(
		editingId || name || body || required || excluded || expires,
	);
	return (
		<div className="flex flex-col gap-4">
			<Alert>
				<AlertTitle>Nội dung có duyệt, dùng theo ngữ cảnh</AlertTitle>
				<AlertDescription>
					Biến hỗ trợ: {"{{customer}}"}, {"{{product}}"}, {"{{brand}}"}. Chính
					sách, ưu đãi và hướng dẫn sản phẩm cần được xác minh. Mẫu nháp không
					xuất hiện ở nút copy.
				</AlertDescription>
			</Alert>
			{canManage && (
				<Card>
					<CardHeader>
						<CardTitle>
							{editingId
								? "Chỉnh sửa mẫu, cần duyệt lại sau khi lưu"
								: "Soạn mẫu mới"}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{save.isError && (
							<Alert variant="destructive" role="alert">
								<AlertTitle>Chưa lưu được mẫu</AlertTitle>
								<AlertDescription>
									{save.error.message} Bản đang soạn vẫn được giữ; hãy sao chép
									nếu cần trước khi chọn tải mẫu mới, vì thao tác đó sẽ thay bản
									đang soạn.
								</AlertDescription>
							</Alert>
						)}
						<form
							onSubmit={(e) => {
								e.preventDefault();
								save.mutate({
									id: editingId,
									version: editingVersion,
									brand,
									purpose,
									name,
									body,
									requiredTags: split(required),
									excludedTags: split(excluded),
									validUntil: expires
										? new Date(`${expires}T23:59:59+07:00`).toISOString()
										: null,
								});
							}}
						>
							<FieldGroup>
								<Field>
									<FieldLabel>Thương hiệu</FieldLabel>
									<Select
										value={brand}
										onValueChange={(v) => setBrand(v as typeof brand)}
									>
										<SelectTrigger
											size="touch"
											aria-label="Thương hiệu của mẫu"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="UMEHA">UMEHA</SelectItem>
												<SelectItem value="LI_EN_SPORT">Li En Sport</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel>Mục đích</FieldLabel>
									<Select
										value={purpose}
										onValueChange={(v) => setPurpose(v as typeof purpose)}
									>
										<SelectTrigger size="touch" aria-label="Mục đích nội dung">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{Object.entries(purposes).map(([key, label]) => (
													<SelectItem key={key} value={key}>
														{label}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel htmlFor="template-name">Tên mẫu</FieldLabel>
									<Input
										id="template-name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										required
										maxLength={160}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="template-body">Nội dung</FieldLabel>
									<Textarea
										id="template-body"
										value={body}
										onChange={(e) => setBody(e.target.value)}
										required
										maxLength={3000}
										rows={5}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="template-required">
										Tag bắt buộc
									</FieldLabel>
									<Input
										id="template-required"
										value={required}
										onChange={(e) => setRequired(e.target.value)}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="template-excluded">
										Tag loại trừ
									</FieldLabel>
									<Input
										id="template-excluded"
										value={excluded}
										onChange={(e) => setExcluded(e.target.value)}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="template-expiry">
										Hết hạn theo giờ Việt Nam
									</FieldLabel>
									<Input
										type="date"
										id="template-expiry"
										value={expires}
										onChange={(e) => setExpires(e.target.value)}
									/>
								</Field>
								<Button size="touch" type="submit" disabled={save.isPending}>
									Lưu bản nháp
								</Button>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>
			)}
			{templates.isError && <p role="alert">{templates.error.message}</p>}
			<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
				{templates.data?.map((template) => (
					<Card key={template.id}>
						<CardHeader>
							<CardTitle>{template.name}</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex flex-wrap gap-2">
								<Badge variant="outline">
									{template.brand === "UMEHA" ? "UMEHA" : "Li En Sport"}
								</Badge>
								<Badge variant="secondary">
									{template.approvedAt ? "Đã duyệt" : "Bản nháp"} · v
									{template.version}
								</Badge>
								<Badge variant="outline">{purposes[template.purpose]}</Badge>
							</div>
							<p className="whitespace-pre-wrap break-words">{template.body}</p>
							<p className="text-sm">
								Tag: {template.requiredTags.join(", ") || "không bắt buộc"} ·
								Loại trừ: {template.excludedTags.join(", ") || "không"}
							</p>
							{canManage && (
								<Button
									size="touch"
									variant="outline"
									disabled={
										templates.isFetching || templates.isError || save.isPending
									}
									onClick={() => {
										save.reset();
										setEditingId(template.id);
										setEditingVersion(template.version);
										setBrand(template.brand);
										setPurpose(template.purpose);
										setName(template.name);
										setBody(template.body);
										setRequired(template.requiredTags.join(", "));
										setExcluded(template.excludedTags.join(", "));
										setExpires(
											template.validUntil
												? new Intl.DateTimeFormat("en-CA", {
														timeZone: "Asia/Ho_Chi_Minh",
														year: "numeric",
														month: "2-digit",
														day: "2-digit",
													}).format(new Date(template.validUntil))
												: "",
										);
									}}
								>
									{hasDraft
										? "Tải mẫu này (thay bản đang soạn)"
										: "Chỉnh sửa nội dung"}
								</Button>
							)}
							{canManage && (
								<Button
									size="touch"
									variant="outline"
									disabled={approve.isPending}
									onClick={() =>
										approve.mutate({
											id: template.id,
											version: template.version,
											approved: !template.approvedAt,
										})
									}
								>
									{template.approvedAt ? "Thu hồi duyệt" : "Duyệt sử dụng"}
								</Button>
							)}
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
