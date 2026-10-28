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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Customer = RouterOutputs["care"]["customers"]["rows"][number];

export function CareCustomers({
	canManage,
	userId,
	previewLimit,
}: {
	canManage: boolean;
	userId: string;
	previewLimit: number;
}) {
	const trpc = useTRPC();
	const [page, setPage] = useState(1);
	const [searchDraft, setSearchDraft] = useState("");
	const [search, setSearch] = useState("");
	const [brand, setBrand] = useState<"ALL" | "UMEHA" | "LI_EN_SPORT">("ALL");
	const [enrollment, setEnrollment] = useState<"ALL" | "YES" | "NO">("ALL");
	const [selected, setSelected] = useState<string[]>([]);
	const rows = useQuery(
		trpc.care.customers.queryOptions({
			page,
			search: search || undefined,
			brand: brand === "ALL" ? undefined : brand,
			enrolled: enrollment === "ALL" ? undefined : enrollment === "YES",
		}),
	);
	const preview = useQuery({
		...trpc.care.pilotPreview.queryOptions({ ids: selected }),
		enabled: false,
	});
	const toggle = (id: string) =>
		setSelected((current) => {
			if (current.includes(id)) return current.filter((value) => value !== id);
			if (current.length >= previewLimit) {
				toast.error("Đã đạt giới hạn xem trước; bỏ chọn khách trước khi thêm");
				return current;
			}
			return [...current, id];
		});
	return (
		<div className="flex flex-col gap-4">
			<Alert>
				<AlertTitle>Khách từ POSCake</AlertTitle>
				<AlertDescription>
					Chỉ quản lý được đưa khách vào pilot, giao người phụ trách và sửa tag.
					Tên và mã SKU giữ theo nguồn.
				</AlertDescription>
			</Alert>
			<form
				className="flex flex-wrap items-end gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					setPage(1);
					setSearch(searchDraft.trim());
				}}
			>
				<Field className="min-w-0 flex-1">
					<FieldLabel htmlFor="care-customer-search">
						Tìm theo tên hoặc mã khách POSCake
					</FieldLabel>
					<Input
						id="care-customer-search"
						value={searchDraft}
						maxLength={100}
						onChange={(event) => setSearchDraft(event.target.value)}
					/>
				</Field>
				<Button size="touch" type="submit">
					Tìm khách
				</Button>
				<Button
					size="touch"
					type="button"
					variant="outline"
					onClick={() => {
						setSearchDraft("");
						setSearch("");
						setBrand("ALL");
						setEnrollment("ALL");
						setPage(1);
					}}
				>
					Xóa bộ lọc
				</Button>
			</form>
			<div className="flex flex-wrap gap-3">
				<Select
					value={brand}
					onValueChange={(value) => {
						setBrand(value as typeof brand);
						setPage(1);
					}}
				>
					<SelectTrigger size="touch" aria-label="Lọc khách theo thương hiệu">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="ALL">Cả hai thương hiệu</SelectItem>
							<SelectItem value="UMEHA">UMEHA</SelectItem>
							<SelectItem value="LI_EN_SPORT">Li En Sport</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
				<Select
					value={enrollment}
					onValueChange={(value) => {
						setEnrollment(value as typeof enrollment);
						setPage(1);
					}}
				>
					<SelectTrigger size="touch" aria-label="Lọc theo trạng thái pilot">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="ALL">Tất cả khách</SelectItem>
							<SelectItem value="YES">Trong pilot</SelectItem>
							<SelectItem value="NO">Chưa vào pilot</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
			{rows.data && <p role="status">{rows.data.total} khách phù hợp</p>}
			{canManage && (
				<Card>
					<CardHeader>
						<CardTitle>Xem trước danh sách pilot</CardTitle>
					</CardHeader>
					<CardContent>
						<p>
							Chọn khách ở các hồ sơ bên dưới, tối đa {previewLimit} khách mỗi
							lượt. Dùng báo cáo để rà soát trước khi đưa từng khách vào pilot ở
							hồ sơ.
						</p>
						<p>
							Khách đã chọn vẫn được giữ khi đổi trang hoặc bộ lọc, kể cả khi
							không còn hiển thị. Dùng Bỏ chọn tất cả để bắt đầu lại.
						</p>
						<div className="flex flex-wrap gap-2">
							<Badge variant="outline">
								Đã chọn {selected.length}/{previewLimit}
							</Badge>
							<Button
								size="touch"
								disabled={selected.length === 0 || preview.isFetching}
								onClick={() => preview.refetch()}
							>
								Xem trước điều kiện
							</Button>
							<Button
								size="touch"
								variant="outline"
								disabled={selected.length === 0 || preview.isFetching}
								onClick={() => setSelected([])}
							>
								Bỏ chọn tất cả
							</Button>
						</div>
						{preview.isFetching && (
							<p role="status">Đang kiểm tra điều kiện…</p>
						)}
						{preview.isError && <p role="alert">{preview.error.message}</p>}
						{preview.data && (
							<>
								<p role="status">
									{preview.data.ready}/{preview.data.rows.length} khách đủ điều
									kiện hiện tại ·{" "}
									{new Date(preview.data.generatedAt).toLocaleString("vi-VN", {
										timeZone: "Asia/Ho_Chi_Minh",
									})}
								</p>
								<p>
									Đây là bản xem trước để quản lý rà soát. Chọn xem trước không
									đưa khách vào pilot hoặc tạo nội dung gửi.
								</p>
								<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
									{preview.data.rows.map((customer) => (
										<Card key={customer.id}>
											<CardHeader>
												<CardTitle>
													{customer.name} ·{" "}
													{customer.brand === "UMEHA" ? "UMEHA" : "Li En Sport"}
												</CardTitle>
											</CardHeader>
											<CardContent>
												<Badge variant="outline">
													{customer.eligible
														? "Đủ điều kiện hiện tại"
														: "Cần xử lý trước"}
												</Badge>
												{customer.milestone !== null && (
													<p>Mốc D+{customer.milestone}</p>
												)}
												{customer.deliveredAt && (
													<p>
														Giao thành công:{" "}
														{new Date(customer.deliveredAt).toLocaleString(
															"vi-VN",
															{ timeZone: "Asia/Ho_Chi_Minh" },
														)}
													</p>
												)}
												{customer.dueAt && (
													<p>
														Lịch chăm sóc:{" "}
														{new Date(customer.dueAt).toLocaleString("vi-VN", {
															timeZone: "Asia/Ho_Chi_Minh",
														})}
													</p>
												)}
												{customer.template && (
													<p className="break-words">
														Mẫu: {customer.template.name} · phiên bản{" "}
														{customer.template.version}
													</p>
												)}
												{customer.channelRestricted && (
													<p>
														Pancake hạn chế gửi qua API. Nhân viên kiểm tra khả
														năng gửi trực tiếp.
													</p>
												)}
												<ul>
													{customer.reasons.map((reason) => (
														<li key={reason}>{reason}</li>
													))}
												</ul>
												<p>
													Đơn được kiểm tra:{" "}
													{new Date(customer.sourceCheckedAt).toLocaleString(
														"vi-VN",
														{ timeZone: "Asia/Ho_Chi_Minh" },
													)}
												</p>
												<p>
													Hội thoại được kiểm tra:{" "}
													{customer.activityCheckedAt
														? new Date(
																customer.activityCheckedAt,
															).toLocaleString("vi-VN", {
																timeZone: "Asia/Ho_Chi_Minh",
															})
														: "chưa xác minh"}
												</p>
											</CardContent>
										</Card>
									))}
								</div>
							</>
						)}
					</CardContent>
				</Card>
			)}
			{rows.isError && <p role="alert">{rows.error.message}</p>}
			{rows.data?.rows.length === 0 && (
				<p>
					Không tìm thấy khách phù hợp. Hãy kiểm tra từ khóa hoặc xóa bộ lọc.
				</p>
			)}
			<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
				{rows.data?.rows.map((customer) => (
					<CustomerCard
						key={customer.id}
						customer={customer}
						canManage={canManage}
						canResolve={canManage || customer.ownerId === userId}
						selected={selected.includes(customer.id)}
						onToggle={() => toggle(customer.id)}
					/>
				))}
			</div>
			<div className="flex gap-3">
				<Button
					size="touch"
					variant="outline"
					disabled={page === 1}
					onClick={() => setPage(page - 1)}
				>
					Trang trước
				</Button>
				<span>Trang {page}</span>
				<Button
					size="touch"
					variant="outline"
					disabled={!rows.data || page * rows.data.pageSize >= rows.data.total}
					onClick={() => setPage(page + 1)}
				>
					Trang sau
				</Button>
			</div>
		</div>
	);
}

function CustomerCard({
	customer,
	canManage,
	canResolve,
	selected,
	onToggle,
}: {
	customer: Customer;
	canManage: boolean;
	canResolve: boolean;
	selected: boolean;
	onToggle: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [ownerId, setOwnerId] = useState(customer.ownerId ?? "");
	const [tags, setTags] = useState(customer.tags.join(", "));
	const [resolution, setResolution] = useState("");
	const resolve = useMutation(
		trpc.care.resolveCustomer.mutationOptions({
			onSuccess: async () => {
				setResolution("");
				await cache.care();
				toast.success("Đã ghi nhận xử lý hội thoại/hỗ trợ");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const users = useQuery(trpc.users.list.queryOptions());
	const save = useMutation(
		trpc.care.configureCustomer.mutationOptions({
			onSuccess: async () => {
				await cache.care();
				toast.success("Đã lưu phân công");
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	return (
		<Card>
			<CardHeader>
				<CardTitle>{customer.name}</CardTitle>
			</CardHeader>
			<CardContent>
				{canManage && (
					<Button
						size="touch"
						variant="outline"
						aria-pressed={selected}
						aria-label={`${selected ? "Bỏ chọn" : "Chọn"} ${customer.name} để xem trước pilot`}
						onClick={onToggle}
					>
						{selected ? "Bỏ chọn xem trước" : "Chọn xem trước"}
					</Button>
				)}
				<div className="flex flex-wrap gap-2">
					<Badge variant="outline">
						{customer.brand === "UMEHA" ? "UMEHA" : "Li En Sport"}
					</Badge>
					<Badge variant="secondary">
						{customer.enrolled ? "Trong pilot" : "Chưa vào pilot"}
					</Badge>
					{customer.optedOut && (
						<Badge variant="destructive">Từ chối nhận</Badge>
					)}
					{customer.openIssue && <Badge variant="outline">Đang hỗ trợ</Badge>}
					{customer.replyPending && (
						<Badge variant="outline">Chờ xử lý phản hồi</Badge>
					)}
					{customer.uncertain && (
						<Badge variant="outline">Cần đối soát việc đã copy</Badge>
					)}
				</div>
				{customer.enrolled && !customer.ownerValid && (
					<Alert>
						<AlertTitle>
							{customer.ownerId
								? "Nhân viên phụ trách không còn trong workspace"
								: "Chưa có nhân viên phụ trách"}
						</AlertTitle>
						<AlertDescription>
							Khách đã vào pilot nhưng chưa thể tạo việc chăm sóc mới.{" "}
							{canManage
								? "Chọn nhân viên phụ trách và lưu phân công bên dưới."
								: "Nhờ quản lý phân công nhân viên phụ trách."}
						</AlertDescription>
					</Alert>
				)}
				<p className="break-all text-sm">
					Shop {customer.shopId} · Khách {customer.sourceCustomerId}
				</p>
				<p>
					{customer._count.orders} đơn · {customer._count.conversations} hội
					thoại
				</p>
				{customer.latestInboundAt && (
					<p className="text-sm">
						Tin đến gần nhất:{" "}
						{new Date(customer.latestInboundAt).toLocaleString("vi-VN", {
							timeZone: "Asia/Ho_Chi_Minh",
						})}
					</p>
				)}
				{canResolve &&
					(customer.replyPending || customer.openIssue) &&
					!customer.uncertain && (
						<>
							<Field>
								<FieldLabel htmlFor={`resolve-${customer.id}`}>
									Kết quả xử lý hội thoại/hỗ trợ
								</FieldLabel>
								<Input
									id={`resolve-${customer.id}`}
									value={resolution}
									onChange={(event) => setResolution(event.target.value)}
									maxLength={500}
								/>
							</Field>
							<Button
								size="touch"
								variant="outline"
								disabled={resolve.isPending || !resolution.trim()}
								onClick={() =>
									resolve.mutate({
										id: customer.id,
										reason: resolution,
										expectedInboundAt: customer.latestInboundAt
											? new Date(customer.latestInboundAt).toISOString()
											: null,
									})
								}
							>
								Đã xử lý phản hồi/hỗ trợ
							</Button>
						</>
					)}
				{canManage && (
					<>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor={`owner-${customer.id}`}>
									Nhân viên phụ trách
								</FieldLabel>
								<Select
									value={ownerId || "UNASSIGNED"}
									onValueChange={(value) =>
										setOwnerId(value === "UNASSIGNED" ? "" : value)
									}
								>
									<SelectTrigger size="touch" id={`owner-${customer.id}`}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectItem value="UNASSIGNED">Chưa phân công</SelectItem>
											{users.data?.map((user) => (
												<SelectItem key={user.id} value={user.id}>
													{user.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel htmlFor={`tags-${customer.id}`}>
									Tag, cách nhau bằng dấu phẩy
								</FieldLabel>
								<Input
									id={`tags-${customer.id}`}
									value={tags}
									onChange={(e) => setTags(e.target.value)}
								/>
							</Field>
						</FieldGroup>
						<Button
							size="touch"
							disabled={save.isPending}
							variant="outline"
							onClick={() =>
								save.mutate({
									id: customer.id,
									ownerId: ownerId || null,
									tags: tags
										.split(",")
										.map((t) => t.trim())
										.filter(Boolean),
									enrolled: customer.enrolled,
								})
							}
						>
							Lưu phân công và tag
						</Button>
						<Button
							size="touch"
							disabled={save.isPending}
							variant={customer.enrolled ? "outline" : "default"}
							onClick={() =>
								save.mutate({
									id: customer.id,
									ownerId: ownerId || null,
									tags: tags
										.split(",")
										.map((t) => t.trim())
										.filter(Boolean),
									enrolled: !customer.enrolled,
								})
							}
						>
							{customer.enrolled ? "Dừng pilot cho khách" : "Đưa vào pilot"}
						</Button>
					</>
				)}
			</CardContent>
		</Card>
	);
}
