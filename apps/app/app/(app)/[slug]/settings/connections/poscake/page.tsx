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
import { CareIntegrationSettings } from "../../care-integrations";

export const metadata = { title: "Nguồn POSCake" };
export default function PosCakePage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellTitle>Nguồn POSCake</PageShellTitle>
				<PageShellDescription>
					Kết nối đơn hàng, hội thoại và webhook.
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
	return <CareIntegrationSettings kind="POSCAKE" />;
}
