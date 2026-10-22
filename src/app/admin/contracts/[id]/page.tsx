import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppPage, Card, Pill } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { adminFrame, formatDate } from "@/components/admin/AdminKit";
import { requireRole } from "@/lib/server-auth";
import { contractForAdmin } from "@/lib/contracts/contracts.server";
import { ContractCopyView } from "@/components/contracts/ContractViews";
import { AdminCloseDispute, AdminOpenContract } from "@/components/contracts/ContractActions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contract" };

// One contract for the team. Sealed (who, what, when) unless a dispute is open and this admin opened it with a
// reason in the last hour: then the full copy, with every opening in its history (src/lib/contracts).

export default async function AdminContractPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const { id } = await params;
  const view = await contractForAdmin(user.id, id.slice(0, 40));
  if (!view) notFound();

  if (!view.sealed) {
    const { copy } = view;
    return (
      <AppPage frame={adminFrame(user)} title={copy.contract.title} sub={`${copy.reference} · ${copy.contract.partyAName} ↔ ${copy.contract.partyBName}`}>
        <div className="grid gap-4">
          <Notice tone="info">You opened this contract for the dispute. It stays open to you until {view.openedUntil.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}. Don&apos;t copy it out of Shopinbos.</Notice>
          <Card className="grid gap-3 p-5">
            <h2 className="m-0 text-[15px] font-extrabold">Settle the dispute</h2>
            <p className="m-0 text-[13.5px] text-app-ink-soft">Record money owed under <Link href="/admin/money-owed" className="font-bold text-app-ink">Money owed</Link>, then close the dispute. Closing seals the contract again.</p>
            <AdminCloseDispute contractId={copy.contract.id} />
          </Card>
          <ContractCopyView copy={copy} back="/admin/contracts" intact={view.intact} />
        </div>
      </AppPage>
    );
  }

  const { summary, reference } = view;
  return (
    <AppPage frame={adminFrame(user)} title="Contract (sealed)" sub={`${reference} · ${summary.partyAName} ↔ ${summary.partyBName}`}>
      <div className="grid max-w-[760px] gap-4">
        <Link href="/admin/contracts" className="text-[14px] font-bold text-app-ink no-underline">‹ All contracts</Link>
        <Card className="grid gap-2 p-5 text-[14px]">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[16px] font-extrabold">{summary.title}</span><Pill tone="muted">🔒 Sealed</Pill></div>
          <div>{summary.partyAName} ({summary.partyARole}) ↔ {summary.partyBName} ({summary.partyBRole === "logistics_partner" ? "delivery partner" : summary.partyBRole})</div>
          <div className="text-app-ink-soft">Status: {summary.status} · version {summary.version} · first signed {formatDate(summary.partyASignedAt)}{summary.partyBSignedAt ? ` · countersigned ${formatDate(summary.partyBSignedAt)}` : ""}</div>
          <p className="m-0 text-[13.5px] text-app-ink-soft">The text, notes, signatures and signing details are private to the two businesses (Nigeria Data Protection Act 2023). You can only open this contract while one of them has a dispute open on it.</p>
        </Card>
        {summary.disputeStatus === "open" ? (
          <Card className="grid gap-3 p-5">
            <div className="flex flex-wrap items-center gap-2"><h2 className="m-0 text-[15px] font-extrabold">Dispute open</h2><Pill tone="danger" dot>Since {formatDate(summary.disputeOpenedAt)}</Pill></div>
            <p className="m-0 text-[14px]">Raised by {summary.disputeOpenedBy === "a" ? summary.partyAName : summary.partyBName}: &ldquo;{summary.disputeReason}&rdquo;</p>
            <AdminOpenContract contractId={summary.id} />
          </Card>
        ) : (
          <Notice tone="info">No dispute is open, so this contract stays sealed.</Notice>
        )}
      </div>
    </AppPage>
  );
}
