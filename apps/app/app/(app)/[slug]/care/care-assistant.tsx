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
import { CARE } from "@crm/validation/customer-care";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const purposes = {
	CHECK_IN: "Hỏi trải nghiệm ban đầu",
	USE_VALUE: "Giá trị sử dụng",
	EXPERIENCE: "Lắng nghe trải nghiệm",
	REORDER: "Mua lại",
	REACTIVATE: "Kết nối lại",
	REVIEW: "Đánh giá",
};
export function CareAssistant({
	canManage,
	userId,
}: {
	canManage: boolean;
	userId: string;
}) {
	const trpc = useTRPC();
	const url = useWorkspaceUrl();
	const cache = useCrmCache();
	const [brand, setBrand] = useState<"UMEHA" | "LI_EN_SPORT">("UMEHA");
	const [kind, setKind] = useState<
		"DRAFT_TEMPLATE" | "REVIEW_CUSTOMER" | "QUESTION"
	>("DRAFT_TEMPLATE");
	const [purpose, setPurpose] = useState<keyof typeof purposes>("CHECK_IN");
	const [tags, setTags] = useState("");
	const [customerId, setCustomerId] = useState("");
	const [page, setPage] = useState(1);
	const [question, setQuestion] = useState("");
	const requestId = useRef<string | null>(null);
	const status = useQuery(trpc.careIntegrations.status.queryOptions());
	const jobs = useQuery({
		...trpc.careIntegrations.aiJobs.queryOptions(),
		refetchInterval: 5000,
	});
	const customers = useQuery({
		...trpc.care.customers.queryOptions({ brand, page }),
		enabled: kind === "REVIEW_CUSTOMER",
	});
	const request = useMutation(
		trpc.careIntegrations.requestAi.mutationOptions({
			onSuccess: async () => {
				requestId.current = null;
				await jobs.refetch();
				toast.success("Đã gửi yêu cầu cho trợ lý");
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const apply = useMutation(
		trpc.careIntegrations.applyAiDraft.mutationOptions({
			onSuccess: async () => {
				await cache.care();
				toast.success(
					"Đã lưu bản nháp trong tab Nội dung; cần duyệt trước khi dùng",
				);
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const enabled = status.data?.ai?.enabled === true;
	return (
		<div className="flex min-w-0 flex-col gap-4">
			<Alert>
				<AlertTitle>Trợ lý đề xuất, nhân viên quyết định</AlertTitle>
				<AlertDescription>
					AI dùng chính sách và dữ liệu được cấp để gợi ý nội dung. Không tự
					gửi, duyệt mẫu hoặc thay đổi hồ sơ khách. Xem kỹ ưu đãi và thông tin
					trước khi dùng.
				</AlertDescription>
			</Alert>
			<Button asChild variant="outline">
				<Link href={url("/settings/care-ai")}>Cấu hình LLM và chính sách</Link>
			</Button>
			{!enabled && (
				<p>Quản lý cần lưu, kiểm tra và bật LLM trước khi sử dụng.</p>
			)}
			<Card>
				<CardHeader>
					<CardTitle>Yêu cầu trợ lý</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						onChange={() => {
							requestId.current = null;
						}}
						onSubmit={(event) => {
							event.preventDefault();
							requestId.current ??= crypto.randomUUID();
							request.mutate({
								requestId: requestId.current,
								kind,
								brand,
								purpose,
								tags: tags
									.split(",")
									.map((tag) => tag.trim())
									.filter(Boolean),
								customerId: kind === "REVIEW_CUSTOMER" ? customerId : undefined,
								question,
							});
						}}
					>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="ai-brand">Thương hiệu</FieldLabel>
								<Select
									value={brand}
									onValueChange={(value) => {
										setBrand(value as typeof brand);
										setCustomerId("");
										setPage(1);
										requestId.current = null;
									}}
								>
									<SelectTrigger id="ai-brand">
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
								<FieldLabel htmlFor="ai-kind">Cần hỗ trợ</FieldLabel>
								<Select
									value={kind}
									onValueChange={(value) => {
										setKind(value as typeof kind);
										requestId.current = null;
									}}
								>
									<SelectTrigger id="ai-kind">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectItem value="DRAFT_TEMPLATE">
												Soạn mẫu chung theo nhóm khách
											</SelectItem>
											<SelectItem value="REVIEW_CUSTOMER">
												Xem tình huống một khách
											</SelectItem>
											<SelectItem value="QUESTION">Hỏi trợ lý</SelectItem>
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel htmlFor="ai-purpose">Mục đích chăm sóc</FieldLabel>
								<Select
									value={purpose}
									onValueChange={(value) => {
										setPurpose(value as typeof purpose);
										requestId.current = null;
									}}
								>
									<SelectTrigger id="ai-purpose">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{Object.entries(purposes).map(([value, label]) => (
												<SelectItem key={value} value={value}>
													{label}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							{kind === "REVIEW_CUSTOMER" && (
								<>
									<Field>
										<FieldLabel htmlFor="ai-customer">Khách hàng</FieldLabel>
										<Select
											value={customerId}
											onValueChange={(value) => {
												setCustomerId(value);
												requestId.current = null;
											}}
										>
											<SelectTrigger id="ai-customer">
												<SelectValue placeholder="Chọn khách phụ trách" />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{customers.data?.rows
														.filter(
															(customer) =>
																canManage || customer.ownerId === userId,
														)
														.map((customer) => (
															<SelectItem key={customer.id} value={customer.id}>
																{customer.name}
															</SelectItem>
														))}
												</SelectGroup>
											</SelectContent>
										</Select>
									</Field>
									<div className="flex flex-wrap items-center gap-2">
										<Button
											type="button"
											variant="outline"
											disabled={page === 1}
											onClick={() => setPage((value) => value - 1)}
										>
											Trang trước
										</Button>
										<span>Trang {page}</span>
										<Button
											type="button"
											variant="outline"
											disabled={
												!customers.data ||
												page * CARE.pageSize >= customers.data.total
											}
											onClick={() => setPage((value) => value + 1)}
										>
											Trang sau
										</Button>
									</div>
								</>
							)}
							<Field>
								<FieldLabel htmlFor="ai-tags">
									Tag nhóm khách, cách nhau bằng dấu phẩy
								</FieldLabel>
								<Input
									id="ai-tags"
									value={tags}
									onChange={(e) => setTags(e.target.value)}
									maxLength={2000}
									placeholder="Ví dụ: khách_mới, quan_tâm_chăm_sóc"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="ai-question">Yêu cầu cụ thể</FieldLabel>
								<Textarea
									id="ai-question"
									rows={5}
									value={question}
									onChange={(e) => setQuestion(e.target.value)}
									required
									maxLength={4000}
									placeholder="Mô tả giá trị muốn mang lại và những điều cần tránh. Không nhập thông tin nhạy cảm."
								/>
							</Field>
							<Button
								type="submit"
								disabled={
									!enabled ||
									request.isPending ||
									(kind === "REVIEW_CUSTOMER" && !customerId)
								}
							>
								Gửi yêu cầu AI
							</Button>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
			{jobs.error && <p>Không tải được kết quả: {jobs.error.message}</p>}
			{jobs.data?.map((job) => (
				<Card key={job.id}>
					<CardHeader>
						<CardTitle>
							{job.input.brand} ·{" "}
							{new Date(job.createdAt).toLocaleString("vi-VN")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex min-w-0 flex-col gap-3">
							<Badge variant="outline">
								{job.state} · {job.model}
							</Badge>
							<p className="whitespace-pre-wrap break-words">
								{job.input.question}
							</p>
							{job.lastError && (
								<p role="status">
									{job.lastError}. Kiểm tra cấu hình hoặc tạo yêu cầu mới; hệ
									thống không tự gọi lại model.
								</p>
							)}
							{job.result && (
								<>
									<p className="whitespace-pre-wrap break-words">
										{job.result.summary}
									</p>
									<p>
										Tag đề xuất:{" "}
										{job.result.suggestedTags.join(", ") || "Không có"}
									</p>
									{job.result.warnings.map((warning) => (
										<p key={warning} className="break-words">
											Lưu ý: {warning}
										</p>
									))}
									{job.result.template && (
										<>
											<Field>
												<FieldLabel htmlFor={`ai-result-${job.id}`}>
													{job.result.template.name}
												</FieldLabel>
												<Textarea
													id={`ai-result-${job.id}`}
													value={job.result.template.body}
													rows={6}
													readOnly
												/>
											</Field>
											<p>
												Tag cần:{" "}
												{job.result.template.requiredTags.join(", ") ||
													"Không có"}
												. Tag loại trừ:{" "}
												{job.result.template.excludedTags.join(", ") ||
													"Không có"}
												.
											</p>
											{canManage && (
												<Button
													variant="outline"
													disabled={apply.isPending}
													onClick={() => apply.mutate({ id: job.id })}
												>
													Lưu thành mẫu nháp để xem và duyệt
												</Button>
											)}
										</>
									)}
									<p>
										Token đầu vào: {job.inputTokens ?? "—"} · đầu ra:{" "}
										{job.outputTokens ?? "—"}
									</p>
								</>
							)}
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
