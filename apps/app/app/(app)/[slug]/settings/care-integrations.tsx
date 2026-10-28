"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
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
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Integration = NonNullable<
	RouterOutputs["careIntegrations"]["status"]["source"]
>;
type Channel = {
	uiId: string;
	brand: "UMEHA" | "LI_EN_SPORT";
	pageId: string;
	token: string;
};

export function CareIntegrationSettings({ kind }: { kind: "POSCAKE" | "LLM" }) {
	const trpc = useTRPC();
	const url = useWorkspaceUrl();
	const status = useQuery({
		...trpc.careIntegrations.status.queryOptions(),
		refetchInterval: 5000,
	});
	if (status.isPending) return <p>Đang đọc cấu hình…</p>;
	if (status.error)
		return (
			<Alert variant="destructive">
				<AlertTitle>Không tải được cấu hình</AlertTitle>
				<AlertDescription>{status.error.message}</AlertDescription>
			</Alert>
		);
	if (!status.data) return null;
	const row = kind === "POSCAKE" ? status.data.source : status.data.ai;
	return (
		<div className="flex min-w-0 flex-col gap-5">
			<div className="flex flex-wrap gap-2">
				<Button asChild variant="outline">
					<Link href={url("/care")}>Chăm sóc khách hàng</Link>
				</Button>
				<Button asChild variant="outline">
					<Link
						href={url(
							kind === "POSCAKE"
								? "/settings/care-ai"
								: "/settings/connections/poscake",
						)}
					>
						{kind === "POSCAKE" ? "Cấu hình AI" : "Nguồn POSCake"}
					</Link>
				</Button>
			</div>
			<Alert>
				<AlertTitle>
					{kind === "POSCAKE"
						? "Nguồn đơn hàng và hội thoại"
						: "AI hỗ trợ nhân viên"}
				</AlertTitle>
				<AlertDescription>
					{kind === "POSCAKE"
						? "Nhập: đơn POSCake và hoạt động hội thoại Pancake. Gửi: không có. Khách mới chỉ được nhập dữ liệu, chưa tự tham gia chăm sóc."
						: "AI nhận yêu cầu của nhân viên, chính sách đã nhập và dữ liệu cần thiết. Kết quả cần người xem lại; mẫu được lưu ở trạng thái nháp."}
				</AlertDescription>
			</Alert>
			{!status.data.encryptionReady && (
				<Alert variant="destructive">
					<AlertTitle>Server chưa có khóa mã hóa</AlertTitle>
					<AlertDescription>
						Quản trị server cần đặt CARE_CONFIG_ENCRYPTION_KEY trước khi lưu
						khóa kết nối.
					</AlertDescription>
				</Alert>
			)}
			{status.data.demoDatabase && kind === "POSCAKE" && (
				<Alert>
					<AlertTitle>Database minh họa</AlertTitle>
					<AlertDescription>
						Chuyển sang database vận hành riêng trước khi bật nguồn thật.
					</AlertDescription>
				</Alert>
			)}
			<Card>
				<CardHeader>
					<CardTitle>
						{row?.name ??
							(kind === "POSCAKE" ? "POSCake" : "LLM cho trợ lý chăm sóc")}
					</CardTitle>
					<CardDescription>
						Lưu → kiểm tra kết nối → bật. Mỗi lần sửa cấu hình sẽ tạm dừng kết
						nối.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="mb-4 flex flex-wrap gap-2">
						<Badge variant="outline">
							{row?.enabled ? "Đang bật" : "Đang tắt"}
						</Badge>
						<Badge variant="outline">
							{row && row.checkedVersion === row.version
								? "Đã kiểm tra phiên bản hiện tại"
								: "Chưa kiểm tra"}
						</Badge>
					</div>
					{row?.checkRequestedAt && (
						<p role="status">Đang chờ worker kiểm tra…</p>
					)}
					{row?.lastError && <p role="status">Trạng thái: {row.lastError}</p>}
					{row?.lastCheckedAt && (
						<p>
							Lần kiểm tra:{" "}
							{new Date(row.lastCheckedAt).toLocaleString("vi-VN")}
						</p>
					)}
					{status.data.canManage ? (
						<IntegrationForm
							key={`${kind}-${row?.version ?? 0}`}
							kind={kind}
							row={row}
							ready={status.data.encryptionReady}
							refresh={async () => {
								await status.refetch();
							}}
						/>
					) : (
						<p>Chỉ quản lý được sửa cấu hình và xem khóa webhook.</p>
					)}
				</CardContent>
			</Card>
			{kind === "POSCAKE" && status.data.canManage && (
				<WebhookPanel row={row} totals={status.data.webhooks} />
			)}
		</div>
	);
}

function IntegrationForm({
	kind,
	row,
	ready,
	refresh,
}: {
	kind: "POSCAKE" | "LLM";
	row: Integration | null;
	ready: boolean;
	refresh: () => Promise<void>;
}) {
	const trpc = useTRPC();
	const [name, setName] = useState(row?.name ?? "POSCake");
	const [shopId, setShopId] = useState(row?.source?.shopId ?? "");
	const [apiKey, setApiKey] = useState("");
	const [dirty, setDirty] = useState(false);
	const [channels, setChannels] = useState<Channel[]>(
		row?.source?.channels.map((channel) => ({
			...channel,
			token: "",
			uiId: crypto.randomUUID(),
		})) ?? [
			{ brand: "UMEHA", pageId: "", token: "", uiId: crypto.randomUUID() },
		],
	);
	const [baseUrl, setBaseUrl] = useState(
		row?.ai?.baseUrl ?? "https://api.openai.com/v1",
	);
	const [model, setModel] = useState(row?.ai?.model ?? "");
	const [dailyLimit, setDailyLimit] = useState(row?.ai?.dailyLimit ?? 50);
	const [maxOutputTokens, setMaxOutputTokens] = useState(
		row?.ai?.maxOutputTokens ?? 2048,
	);
	const [umeha, setUmeha] = useState(row?.ai?.policies.UMEHA ?? "");
	const [lien, setLien] = useState(row?.ai?.policies.LI_EN_SPORT ?? "");
	const onError = (error: { message: string }) => toast.error(error.message);
	const onSaved = async () => {
		setApiKey("");
		await refresh();
		toast.success("Đã lưu. Kiểm tra kết nối rồi bật khi sẵn sàng.");
	};
	const source = useMutation(
		trpc.careIntegrations.saveSource.mutationOptions({
			onSuccess: onSaved,
			onError,
		}),
	);
	const ai = useMutation(
		trpc.careIntegrations.saveAi.mutationOptions({
			onSuccess: onSaved,
			onError,
		}),
	);
	const check = useMutation(
		trpc.careIntegrations.check.mutationOptions({
			onSuccess: refresh,
			onError,
		}),
	);
	const toggle = useMutation(
		trpc.careIntegrations.toggle.mutationOptions({
			onSuccess: refresh,
			onError,
		}),
	);
	const busy =
		source.isPending || ai.isPending || check.isPending || toggle.isPending;
	function editChannel(index: number, patch: Partial<Channel>) {
		setDirty(true);
		setChannels((items) =>
			items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
		);
	}
	return (
		<form
			className="mt-5"
			onChange={() => setDirty(true)}
			onSubmit={(event) => {
				event.preventDefault();
				if (kind === "POSCAKE")
					source.mutate({
						expectedVersion: row?.version ?? null,
						name,
						shopId,
						channels: channels.map(({ brand, pageId }) => ({ brand, pageId })),
						apiKey,
						pancakeTokens: channels.map(({ pageId, token }) => ({
							pageId,
							token,
						})),
					});
				else
					ai.mutate({
						expectedVersion: row?.version ?? null,
						baseUrl,
						model,
						apiKey,
						dailyLimit,
						maxOutputTokens,
						policies: { UMEHA: umeha, LI_EN_SPORT: lien },
					});
			}}
		>
			<FieldGroup>
				{kind === "POSCAKE" ? (
					<>
						<Field>
							<FieldLabel htmlFor="source-name">Tên nguồn</FieldLabel>
							<Input
								id="source-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
								maxLength={160}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="shop-id">Shop ID POSCake</FieldLabel>
							<Input
								id="shop-id"
								inputMode="numeric"
								pattern="[0-9]+"
								value={shopId}
								onChange={(e) => setShopId(e.target.value)}
								required
							/>
						</Field>
					</>
				) : (
					<>
						<Field>
							<FieldLabel htmlFor="llm-url">
								Endpoint tương thích OpenAI
							</FieldLabel>
							<Input
								id="llm-url"
								type="url"
								value={baseUrl}
								onChange={(e) => setBaseUrl(e.target.value)}
								required
							/>
							<p>
								HTTPS công khai, gồm đường dẫn API như /v1. Khóa được gửi tới
								endpoint này.
							</p>
						</Field>
						<Field>
							<FieldLabel htmlFor="llm-model">Model ID</FieldLabel>
							<Input
								id="llm-model"
								value={model}
								onChange={(e) => setModel(e.target.value)}
								placeholder="Model hỗ trợ tool và JSON schema"
								required
								maxLength={160}
							/>
						</Field>
					</>
				)}
				<Field>
					<FieldLabel htmlFor="integration-api-key">
						API key {kind === "POSCAKE" ? "POSCake" : "LLM"}
					</FieldLabel>
					<Input
						id="integration-api-key"
						type="password"
						autoComplete="new-password"
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
						required={!row?.apiKeyConfigured}
						maxLength={8192}
						placeholder={
							row?.apiKeyConfigured
								? "Đã lưu khóa; để trống để giữ nguyên"
								: "Nhập khóa"
						}
					/>
				</Field>
				{kind === "POSCAKE" ? (
					<>
						{channels.map((channel, index) => (
							<FieldGroup key={channel.uiId}>
								<Field>
									<FieldLabel htmlFor={`brand-${index}`}>
										Thương hiệu của page {index + 1}
									</FieldLabel>
									<Select
										value={channel.brand}
										onValueChange={(value) =>
											editChannel(index, { brand: value as Channel["brand"] })
										}
									>
										<SelectTrigger id={`brand-${index}`}>
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
									<FieldLabel htmlFor={`page-${index}`}>Page ID</FieldLabel>
									<Input
										id={`page-${index}`}
										inputMode="numeric"
										pattern="[0-9]+"
										value={channel.pageId}
										onChange={(e) =>
											editChannel(index, { pageId: e.target.value })
										}
										required
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor={`token-${index}`}>
										Pancake Page Access Token
									</FieldLabel>
									<Input
										id={`token-${index}`}
										type="password"
										autoComplete="new-password"
										value={channel.token}
										onChange={(e) =>
											editChannel(index, { token: e.target.value })
										}
										placeholder={
											row?.pancakePagesConfigured.includes(channel.pageId)
												? "Đã lưu; để trống để giữ"
												: "Tùy chọn, cần để xác minh hội thoại"
										}
										maxLength={8192}
									/>
									<p>
										Thiếu token vẫn nhập đơn. Chăm sóc chủ động bị chặn khi chưa
										xác minh hoạt động hội thoại.
									</p>
								</Field>
								{channels.length > 1 && (
									<Button
										type="button"
										variant="outline"
										onClick={() =>
											setChannels((items) =>
												items.filter((_, i) => i !== index),
											)
										}
									>
										Bỏ page {index + 1}
									</Button>
								)}
							</FieldGroup>
						))}
						<Button
							type="button"
							variant="outline"
							disabled={channels.length >= 10}
							onClick={() =>
								setChannels((items) => [
									...items,
									{
										brand: "LI_EN_SPORT",
										pageId: "",
										token: "",
										uiId: crypto.randomUUID(),
									},
								])
							}
						>
							Thêm page
						</Button>
					</>
				) : (
					<>
						<Field>
							<FieldLabel htmlFor="daily-limit">
								Giới hạn yêu cầu mỗi ngày, giờ Việt Nam
							</FieldLabel>
							<Input
								id="daily-limit"
								type="number"
								min={1}
								max={1000}
								value={dailyLimit}
								onChange={(e) => setDailyLimit(Number(e.target.value))}
								required
							/>
							<p>
								Mỗi yêu cầu có tối đa ba bước gọi model. Đây là giới hạn lượt,
								không phải hạn mức tiền.
							</p>
						</Field>
						<Field>
							<FieldLabel htmlFor="max-tokens">
								Token đầu ra tối đa mỗi bước
							</FieldLabel>
							<Input
								id="max-tokens"
								type="number"
								min={256}
								max={8192}
								value={maxOutputTokens}
								onChange={(e) => setMaxOutputTokens(Number(e.target.value))}
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="policy-umeha">
								Chính sách và dữ kiện UMEHA cho AI
							</FieldLabel>
							<Textarea
								id="policy-umeha"
								rows={7}
								value={umeha}
								onChange={(e) => setUmeha(e.target.value)}
								maxLength={16000}
							/>
							<p>
								Nhập chính sách đã xác minh, gồm ưu đãi theo nhóm và điều kiện
								áp dụng. Không nhập khóa hoặc dữ liệu nhạy cảm.
							</p>
						</Field>
						<Field>
							<FieldLabel htmlFor="policy-lien">
								Chính sách và dữ kiện Li En Sport cho AI
							</FieldLabel>
							<Textarea
								id="policy-lien"
								rows={7}
								value={lien}
								onChange={(e) => setLien(e.target.value)}
								maxLength={16000}
							/>
						</Field>
						<p>
							Kiểm tra kết nối thực hiện một yêu cầu model ngắn và có thể tính
							phí theo nhà cung cấp.
						</p>
					</>
				)}
				<div className="flex flex-wrap gap-2">
					<Button type="submit" disabled={!ready || busy}>
						Lưu cấu hình
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={!row || busy || dirty || Boolean(row.checkRequestedAt)}
						onClick={() =>
							row && check.mutate({ kind, expectedVersion: row.version })
						}
					>
						Kiểm tra kết nối
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={
							!row ||
							busy ||
							(dirty && !row.enabled) ||
							(!row.enabled && row.checkedVersion !== row.version)
						}
						onClick={() =>
							row &&
							toggle.mutate({
								kind,
								expectedVersion: row.version,
								enabled: !row.enabled,
							})
						}
					>
						{row?.enabled ? "Tạm dừng kết nối" : "Bật kết nối"}
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}

function WebhookPanel({
	row,
	totals,
}: {
	row: Integration | null;
	totals: { pending: number; failed: number; completed: number };
}) {
	const trpc = useTRPC();
	const info = useMutation(
		trpc.careIntegrations.webhookInfo.mutationOptions({
			onError: (e) => toast.error(e.message),
		}),
	);
	const receipts = useQuery({
		...trpc.careIntegrations.receipts.queryOptions(),
		refetchInterval: 5000,
	});
	async function copy(value: string) {
		try {
			await navigator.clipboard.writeText(value);
			toast.success("Đã copy");
		} catch {
			toast.error("Không copy được; chọn trường bên dưới để sao chép thủ công");
		}
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle>Webhook POSCake</CardTitle>
				<CardDescription>
					Nhận sự kiện để đọc lại đơn từ POSCake. Đồng bộ định kỳ tiếp tục đối
					soát dữ liệu.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex min-w-0 flex-col gap-4">
					<p>
						Trong POSCake, bật webhook cho sự kiện đơn hàng. Giữ các cấu hình
						webhook đang phục vụ hệ thống khác.
					</p>
					<Button
						type="button"
						variant="outline"
						disabled={!row || info.isPending}
						onClick={() => info.mutate()}
					>
						Lấy cấu hình webhook
					</Button>
					{info.data && (
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="webhook-url">Webhook URL</FieldLabel>
								<Input id="webhook-url" value={info.data.url} readOnly />
								<Button
									type="button"
									variant="outline"
									onClick={() => copy(info.data.url)}
								>
									Copy URL
								</Button>
							</Field>
							<Field>
								<FieldLabel htmlFor="webhook-header">
									Tên custom header
								</FieldLabel>
								<Input id="webhook-header" value={info.data.header} readOnly />
							</Field>
							<Field>
								<FieldLabel htmlFor="webhook-key">
									Giá trị custom header
								</FieldLabel>
								<Input
									id="webhook-key"
									type="password"
									value={info.data.key}
									readOnly
								/>
								<Button
									type="button"
									variant="outline"
									onClick={() => copy(info.data.key)}
								>
									Copy khóa webhook
								</Button>
							</Field>
						</FieldGroup>
					)}
					<p>
						{totals.pending} đang chờ · {totals.completed} đã nhập ·{" "}
						{totals.failed} lỗi
					</p>
					{row?.lastWebhookAt && (
						<p>
							Sự kiện gần nhất:{" "}
							{new Date(row.lastWebhookAt).toLocaleString("vi-VN")}
						</p>
					)}
					{receipts.error && (
						<p>Không đọc được lịch sử webhook: {receipts.error.message}</p>
					)}
					{receipts.data?.map((receipt) => (
						<p key={receipt.id} className="break-words">
							Đơn {receipt.orderId}: {receipt.state}
							{receipt.lastError ? ` · ${receipt.lastError}` : ""}
						</p>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
