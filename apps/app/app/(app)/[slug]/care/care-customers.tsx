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
}: {
	canManage: boolean;
	userId: string;
}) {
	const trpc = useTRPC();
	const [page, setPage] = useState(1);
	const rows = useQuery(trpc.care.customers.queryOptions({ page }));
	return (
		<div className="flex flex-col gap-4">
			<Alert>
				<AlertTitle>Khách từ POSCake</AlertTitle>
				<AlertDescription>
					Chỉ quản lý được đưa khách vào pilot, giao người phụ trách và sửa tag.
					Tên và mã SKU giữ theo nguồn.
				</AlertDescription>
			</Alert>
			{rows.isError && <p role="alert">{rows.error.message}</p>}
			{rows.data?.rows.length === 0 && (
				<p>Chưa có dữ liệu nguồn đã xác minh.</p>
			)}
			<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
				{rows.data?.rows.map((customer) => (
					<CustomerCard
						key={customer.id}
						customer={customer}
						canManage={canManage}
						canResolve={canManage || customer.ownerId === userId}
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
					disabled={!rows.data || page * 30 >= rows.data.total}
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
}: {
	customer: Customer;
	canManage: boolean;
	canResolve: boolean;
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
