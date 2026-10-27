import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { CareIntegrationSettings } from "../care-integrations";

export const metadata = { title: "AI chăm sóc" };
export default function CareAiPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellTitle>AI chăm sóc</PageShellTitle>
				<PageShellDescription>
					Cấu hình LLM, chính sách và giới hạn sử dụng.
				</PageShellDescription>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Content />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}
async function Content() {
	await requireSession();
	return <CareIntegrationSettings kind="LLM" />;
}
