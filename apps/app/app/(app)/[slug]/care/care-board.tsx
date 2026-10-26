"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardFooter,
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
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { CareCustomers } from "./care-customers";
import { CareTemplates } from "./care-templates";

type CareTask = RouterOutputs["care"]["list"]["rows"][number];
const purposeLabel = {
	CHECK_IN: "Hỏi trải nghiệm ban đầu",
	USE_VALUE: "Hướng dẫn sử dụng",
	EXPERIENCE: "Lắng nghe trải nghiệm",
	REORDER: "Gợi ý mua lại",
	REACTIVATE: "Kết nối lại",
	REVIEW: "Đánh giá chăm sóc",
};
const stateLabel = {
	OPEN: "Đến lịch",
	CLAIMED: "Đang xử lý",
	COPIED: "Đã chuẩn bị, chưa xác nhận gửi",
	WAITING: "Đang chờ",
	DONE: "Đã xử lý",
	CANCELLED: "Đã hủy",
};
const outcomeLabel = new Map([
	["COPY_PREPARED", "Lượt chuẩn bị/copy"],
	["SENT_MANUAL", "Nhân viên xác nhận gửi"],
	["RECONCILED_SENT", "Đối soát xác nhận đã gửi"],
	["BLOCKED", "Gửi bị chặn"],
	["UNCERTAIN", "Chưa rõ đã gửi"],
	["REPLIED", "Nhân viên ghi nhận khách trả lời"],
	["ISSUE", "Cần hỗ trợ"],
	["OPT_OUT", "Từ chối nhận liên hệ"],
	["SNOOZE", "Hoãn lại"],
	["PROMISED", "Hẹn theo yêu cầu khách"],
	["SKIPPED", "Bỏ qua"],
	["RESOLVED", "Đã xử lý/đối soát"],
]);

export function CareBoard({ userId }: { userId: string }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [brand, setBrand] = useState<"ALL" | "UMEHA" | "LI_EN_SPORT">("ALL");
	const [state, setState] = useState<"ACTIVE" | "WAITING" | "DONE" | "ALL">(
		"ACTIVE",
	);
	const [mine, setMine] = useState(true);
	const [page, setPage] = useState(1);
	const summary = useQuery({
		...trpc.care.summary.queryOptions(),
		refetchInterval: 30_000,
	});
	const metrics = useQuery(trpc.care.metrics.queryOptions());
	const tasks = useQuery({
		...trpc.care.list.queryOptions({
			brand: brand === "ALL" ? undefined : brand,
			mine,
			page,
			state,
		}),
		refetchInterval: 30_000,
	});
	const reconcile = useMutation(
		trpc.care.reconcile.mutationOptions({
			onSuccess: async () => {
				await cache.care();
				toast.success("Đã kiểm tra lịch chăm sóc");
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	return (
		<div className="flex min-w-0 flex-col gap-5">
			{summary.data?.demo && (
				<Alert>
					<AlertTitle>Môi trường thử nghiệm</AlertTitle>
					<AlertDescription>
						Dữ liệu minh họa và trạng thái duyệt minh họa chỉ phục vụ kiểm thử.
						Chưa phải pilot với khách thật.
					</AlertDescription>
				</Alert>
			)}
			{summary.data && !summary.data.syncConfigured && (
				<Alert>
					<AlertTitle>Đồng bộ trực tiếp chưa cấu hình</AlertTitle>
					<AlertDescription>
						Dữ liệu nguồn và hoạt động tin nhắn cần được xác minh trước khi sử
						dụng thật.
					</AlertDescription>
				</Alert>
			)}
			<div className="flex flex-wrap gap-2">
				<Badge variant="secondary">Chỉ nhắc việc + copy</Badge>
				<Badge variant="outline">
					{summary.data?.open ?? "—"} việc cần làm
				</Badge>
				<Badge variant="outline">{summary.data?.waiting ?? "—"} đang chờ</Badge>
				<Badge variant="outline">
					{summary.data?.sentManual ?? "—"} nhân viên xác nhận gửi
				</Badge>
			</div>
			<Tabs defaultValue="queue" touch>
				<TabsList>
					<TabsTrigger value="queue">Hôm nay</TabsTrigger>
					<TabsTrigger value="customers">Khách hàng</TabsTrigger>
					<TabsTrigger value="templates">Nội dung</TabsTrigger>
					<TabsTrigger value="metrics">Hiệu quả</TabsTrigger>
				</TabsList>
				<TabsContent value="queue">
					<div className="flex flex-col gap-4">
						<div className="flex flex-wrap items-center gap-3">
							<Select
								value={brand}
								onValueChange={(v) => {
									setBrand(v as typeof brand);
									setPage(1);
								}}
							>
								<SelectTrigger size="touch" aria-label="Thương hiệu">
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
								value={state}
								onValueChange={(v) => {
									setState(v as typeof state);
									setPage(1);
								}}
							>
								<SelectTrigger size="touch" aria-label="Trạng thái công việc">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="ACTIVE">Cần xử lý</SelectItem>
										<SelectItem value="WAITING">Đang chờ</SelectItem>
										<SelectItem value="DONE">Đã xử lý</SelectItem>
										<SelectItem value="ALL">Tất cả</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
							<Button
								size="touch"
								variant="outline"
								onClick={() => {
									setMine(!mine);
									setPage(1);
								}}
							>
								{mine ? "Việc của tôi" : "Việc cả nhóm"}
							</Button>
							{summary.data?.canManage && (
								<Button
									size="touch"
									variant="outline"
									disabled={reconcile.isPending}
									onClick={() => reconcile.mutate()}
								>
									Kiểm tra lịch
								</Button>
							)}
						</div>
						{tasks.isError && (
							<Alert variant="destructive">
								<AlertTitle>Chưa tải được công việc</AlertTitle>
								<AlertDescription>{tasks.error.message}</AlertDescription>
							</Alert>
						)}
						{tasks.isPending && <p role="status">Đang tải công việc…</p>}
						{tasks.data?.rows.length === 0 && (
							<Alert>
								<AlertTitle>Chưa có việc chăm sóc đến lịch</AlertTitle>
								<AlertDescription>
									Khách cần có đơn giao thành công, được quản lý đưa vào pilot
									và có hội thoại đã xác minh. Nội dung cần được duyệt trước khi
									sử dụng.
								</AlertDescription>
							</Alert>
						)}
						<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
							{tasks.data?.rows.map((task) => (
								<TaskCard key={task.id} task={task} userId={userId} />
							))}
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<Button
								size="touch"
								variant="outline"
								disabled={page === 1}
								onClick={() => setPage(page - 1)}
							>
								Trang trước
							</Button>
							<span>
								Trang {page} · {tasks.data?.total ?? 0} việc
							</span>
							<Button
								size="touch"
								variant="outline"
								disabled={
									!tasks.data || page * tasks.data.pageSize >= tasks.data.total
								}
								onClick={() => setPage(page + 1)}
							>
								Trang sau
							</Button>
						</div>
					</div>
				</TabsContent>
				<TabsContent value="customers">
					<CareCustomers canManage={summary.data?.canManage === true} />
				</TabsContent>
				<TabsContent value="templates">
					<CareTemplates canManage={summary.data?.canManage === true} />
				</TabsContent>
				<TabsContent value="metrics">
					<div className="flex flex-col gap-4">
						{metrics.isError && (
							<Alert variant="destructive">
								<AlertTitle>Chưa tải được thống kê</AlertTitle>
								<AlertDescription>{metrics.error.message}</AlertDescription>
							</Alert>
						)}
						{metrics.data && (
							<>
								<Card>
									<CardHeader>
										<CardTitle>Kết quả chăm sóc trong 30 ngày</CardTitle>
									</CardHeader>
									<CardContent>
										<p>
											{formatDate(metrics.data.activity.since)} –{" "}
											{formatDate(metrics.data.activity.until)}
										</p>
										<p>
											Mỗi kết quả là một lần ghi nhận. Một việc có thể có nhiều
											lần chuẩn bị hoặc thay đổi kết quả. Xác nhận thủ công chưa
											chứng minh nền tảng đã gửi hoặc khách đã nhận.
										</p>
										{metrics.data.activity.outcomes.length === 0 && (
											<p>Chưa có kết quả chăm sóc để thống kê.</p>
										)}
										<dl className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
											{metrics.data.activity.outcomes.map((row) => (
												<div
													key={row.kind}
													className="flex flex-wrap justify-between gap-2"
												>
													<dt>
														{outcomeLabel.get(row.kind) ?? "Kết quả khác"}
													</dt>
													<dd>{row.count}</dd>
												</div>
											))}
										</dl>
									</CardContent>
								</Card>
								<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
									{metrics.data.activity.staff.map((staff) => (
										<Card key={staff.id}>
											<CardHeader>
												<CardTitle>{staff.name}</CardTitle>
											</CardHeader>
											<CardContent>
												<p>{staff.prepared} lượt chuẩn bị/copy</p>
												<p>
													{staff.confirmed} lần xác nhận hoặc đối soát đã gửi
												</p>
											</CardContent>
										</Card>
									))}
								</div>
								<Alert>
									<AlertTitle>Tin đến quan sát được sau chăm sóc</AlertTitle>
									<AlertDescription>
										<p>
											Mỗi khách chỉ tính lần xác nhận gửi gần nhất trong 30
											ngày. Mẫu số là khách có hoạt động hội thoại được kiểm tra
											sau lần xác nhận đó. Chỉ quan sát đoạn tin nhắn đã đọc;
											chưa phải tỷ lệ phản hồi đầy đủ hoặc bằng chứng tin chăm
											sóc gây ra phản hồi.
										</p>
										{metrics.data.activity.responses.length === 0 && (
											<p>Chưa có lần xác nhận gửi để đối chiếu.</p>
										)}
										{metrics.data.activity.responses.map((row) => (
											<p key={row.brand}>
												{row.brand === "UMEHA" ? "UMEHA" : "Li En Sport"}:{" "}
												{row.checked}/{row.confirmed} khách đã được kiểm tra;{" "}
												{row.replied} khách có tin đến sau xác nhận
												{row.rate === null
													? ", chưa tính tỷ lệ"
													: ` (${Math.round(row.rate * 100)}% nhóm đã kiểm tra)`}
												.
											</p>
										))}
									</AlertDescription>
								</Alert>
							</>
						)}
						<Alert>
							<AlertTitle>Mua lại trong lịch sử đã đồng bộ</AlertTitle>
							<AlertDescription>
								Chỉ tính nhóm đã đủ 30/60/90 ngày kể từ đơn giao đầu tiên có
								trong CRM. Cần đối soát đầy đủ lịch sử POSCake trước khi gọi đây
								là lần mua đầu tiên. Các đơn hoàn bị loại. Chưa có dữ liệu lợi
								nhuận và chưa kết luận chăm sóc tạo ra đơn mua lại.
							</AlertDescription>
						</Alert>
						{metrics.isError && <p role="alert">{metrics.error.message}</p>}
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{metrics.data?.cohorts.map((cohort) => (
								<Card key={`${cohort.brand}-${cohort.days}`}>
									<CardHeader>
										<CardTitle>
											{cohort.brand === "UMEHA" ? "UMEHA" : "Li En Sport"} ·{" "}
											{cohort.days} ngày
										</CardTitle>
									</CardHeader>
									<CardContent>
										<p>
											{cohort.rate === null
												? "Chưa đủ dữ liệu"
												: `${Math.round(cohort.rate * 100)}% mua lại`}
										</p>
										<p>
											{cohort.repeat} khách mua lại / {cohort.mature} khách đủ
											thời gian quan sát
										</p>
									</CardContent>
								</Card>
							))}
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}

function TaskCard({ task, userId }: { task: CareTask; userId: string }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const workspaceUrl = useWorkspaceUrl();
	const [text, setText] = useState(task.snapshot ?? "");
	const [version, setVersion] = useState<number | null>(null);
	const [reason, setReason] = useState("");
	const [until, setUntil] = useState("");
	const [resolution, setResolution] = useState<
		"SENT" | "NOT_SENT" | undefined
	>();
	const claim = useMutation(
		trpc.care.claim.mutationOptions({
			onSuccess: async () => {
				await cache.care();
				toast.success("Đã nhận xử lý trong 30 phút");
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const copy = useMutation(
		trpc.care.copy.mutationOptions({
			onSuccess: async (data) => {
				setText(data.text);
				setVersion(data.version);
				try {
					await navigator.clipboard.writeText(data.text);
					toast.success("Đã copy. Chưa ghi nhận gửi.");
				} catch {
					toast.info("Chọn nội dung bên dưới để copy thủ công.");
				}
				await cache.care();
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const action = useMutation(
		trpc.care.action.mutationOptions({
			onSuccess: async () => {
				setVersion(null);
				await cache.care();
				toast.success("Đã ghi kết quả chăm sóc");
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const busy = claim.isPending || copy.isPending || action.isPending;
	const owned = task.customer.ownerId === userId;
	const terminal = task.state === "DONE" || task.state === "CANCELLED";
	const result = (
		value:
			| "SENT_MANUAL"
			| "BLOCKED"
			| "UNCERTAIN"
			| "SNOOZE"
			| "SKIPPED"
			| "REPLIED"
			| "ISSUE"
			| "OPT_OUT"
			| "RESOLVED",
	) => {
		let promised: string | undefined;
		if (value === "SNOOZE") {
			if (!until) {
				toast.error("Chọn ngày hẹn");
				return;
			}
			promised = new Date(`${until}T09:00:00+07:00`).toISOString();
		}
		action.mutate({
			id: task.id,
			version: version ?? task.version,
			result: value,
			reason,
			until: promised,
			resolution,
		});
	};
	return (
		<Card>
			<CardHeader>
				<CardTitle>
					{task.customer.name} ·{" "}
					{task.customer.brand === "UMEHA" ? "UMEHA" : "Li En Sport"}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex flex-wrap gap-2">
					<Badge variant="outline">D+{task.milestone}</Badge>
					<Badge variant="secondary">{stateLabel[task.state]}</Badge>
					{task.customer.tags.map((tag) => (
						<Badge key={tag} variant="outline">
							{tag}
						</Badge>
					))}
				</div>
				<p>{purposeLabel[task.purpose]}</p>
				<p className="text-sm text-muted-foreground">
					Đơn {task.order.sourceOrderId} · Nhận{" "}
					{formatDate(task.order.deliveredAt)} · Lịch {formatDate(task.dueAt)}
				</p>
				<p className="break-words text-sm">
					{task.products
						.map((p) => `${p.name} (${p.sku}) × ${p.quantity}`)
						.join("; ")}
				</p>
				<p className="text-xs text-muted-foreground">
					Đơn cập nhật {formatDate(task.customer.syncedAt)} · Tin nhắn được kiểm
					tra {formatDate(task.customer.conversations[0]?.activityVerifiedAt)}
				</p>
				{task.blockReason && (
					<Alert>
						<AlertTitle>Cần kiểm tra trước khi liên hệ</AlertTitle>
						<AlertDescription>{task.blockReason}</AlertDescription>
					</Alert>
				)}
				{task.channelRestricted && (
					<Alert>
						<AlertTitle>Pancake đang hạn chế gửi qua API</AlertTitle>
						<AlertDescription>
							Nội dung vẫn có thể chuẩn bị và copy. Kiểm tra khả năng gửi trực
							tiếp trong Pancake rồi ghi đúng kết quả. Copy không thay đổi trạng
							thái hạn chế của nền tảng.
						</AlertDescription>
					</Alert>
				)}
				{!terminal && (
					<div className="flex flex-wrap gap-2">
						<Button
							size="touch"
							variant="outline"
							disabled={busy || !owned || Boolean(task.blockReason)}
							onClick={() => claim.mutate({ id: task.id })}
						>
							Nhận xử lý
						</Button>
						<Button
							size="touch"
							disabled={
								busy || !owned || Boolean(task.blockReason) || !task.leaseUntil
							}
							onClick={() => copy.mutate({ id: task.id })}
						>
							Chuẩn bị và copy
						</Button>
						{task.conversationUrl && (
							<Button size="touch" variant="outline" asChild>
								<a
									href={task.conversationUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
									Mở Pancake
								</a>
							</Button>
						)}
					</div>
				)}
				{text && (
					<Field>
						<FieldLabel htmlFor={`text-${task.id}`}>
							Nội dung đã chuẩn bị
						</FieldLabel>
						<Textarea
							id={`text-${task.id}`}
							value={text}
							readOnly
							rows={5}
							onFocus={(e) => e.target.select()}
						/>
					</Field>
				)}
				{task.customer.uncertain && (
					<Field>
						<FieldLabel>Kết quả đối soát</FieldLabel>
						<Select
							value={resolution ?? ""}
							onValueChange={(v) => setResolution(v as "SENT" | "NOT_SENT")}
						>
							<SelectTrigger size="touch" aria-label="Kết quả đối soát">
								<SelectValue placeholder="Chọn kết quả đã xác minh" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="SENT">Đã gửi thủ công</SelectItem>
									<SelectItem value="NOT_SENT">Chưa gửi</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
				)}
				{!terminal && owned && (
					<>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor={`reason-${task.id}`}>
									Ghi chú kết quả / lý do
								</FieldLabel>
								<Input
									id={`reason-${task.id}`}
									value={reason}
									onChange={(e) => setReason(e.target.value)}
									maxLength={500}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor={`until-${task.id}`}>
									Hẹn lại lúc 09:00, giờ Việt Nam
								</FieldLabel>
								<Input
									id={`until-${task.id}`}
									type="date"
									value={until}
									onChange={(e) => setUntil(e.target.value)}
								/>
							</Field>
						</FieldGroup>
						<div className="flex flex-wrap gap-2">
							<Button
								size="touch"
								disabled={
									busy || task.state !== "COPIED" || Boolean(task.blockReason)
								}
								onClick={() => result("SENT_MANUAL")}
							>
								Tôi đã gửi thủ công
							</Button>
							<Button
								size="touch"
								variant="outline"
								disabled={busy}
								onClick={() => result("SNOOZE")}
							>
								Hẹn lại
							</Button>
							<Button
								size="touch"
								variant="outline"
								disabled={busy}
								onClick={() => result("BLOCKED")}
							>
								Bị chặn
							</Button>
							<Button
								size="touch"
								variant="outline"
								disabled={busy}
								onClick={() => result("UNCERTAIN")}
							>
								Chưa rõ đã gửi
							</Button>
							<Button
								size="touch"
								variant="outline"
								disabled={busy}
								onClick={() => result("REPLIED")}
							>
								Khách trả lời
							</Button>
							<Button
								size="touch"
								variant="outline"
								disabled={busy}
								onClick={() => result("ISSUE")}
							>
								Cần hỗ trợ
							</Button>
							<Button
								size="touch"
								variant="outline"
								disabled={busy}
								onClick={() => result("RESOLVED")}
							>
								Đã xử lý / đối soát
							</Button>
							<Button
								size="touch"
								variant="outline"
								disabled={busy}
								onClick={() => result("SKIPPED")}
							>
								Bỏ qua
							</Button>
							<Button
								size="touch"
								variant="destructive"
								disabled={busy}
								onClick={() => result("OPT_OUT")}
							>
								Khách từ chối nhận
							</Button>
						</div>
					</>
				)}
				{task.customer.events.length > 0 && (
					<details>
						<summary>Lịch sử chăm sóc</summary>
						<ul className="flex flex-col gap-2">
							{task.customer.events.map((event) => (
								<li key={event.id} className="break-words text-sm">
									{formatDate(event.createdAt)} · {event.kind}
									{event.reason ? ` · ${event.reason}` : ""}
								</li>
							))}
						</ul>
					</details>
				)}
			</CardContent>
			<CardFooter>
				<Link href={workspaceUrl("/care")}>
					Copy và xác nhận thủ công không phải bằng chứng khách đã nhận tin.
				</Link>
			</CardFooter>
		</Card>
	);
}

function formatDate(value?: string | Date | null) {
	return value
		? new Intl.DateTimeFormat("vi-VN", {
				dateStyle: "short",
				timeStyle: "short",
				timeZone: "Asia/Ho_Chi_Minh",
			}).format(new Date(value))
		: "chưa xác minh";
}
