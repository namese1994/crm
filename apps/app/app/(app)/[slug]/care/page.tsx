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
import { CareBoard } from "./care-board";

export const metadata = { title: "Chăm sóc khách hàng" };

export default function CarePage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellTitle>Chăm sóc hôm nay</PageShellTitle>
				<PageShellDescription>
					Đúng khách, đúng thời điểm, một nội dung có ích.
				</PageShellDescription>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<AuthenticatedBoard />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function AuthenticatedBoard() {
	const session = await requireSession();
	return <CareBoard userId={session.user.id} />;
}
