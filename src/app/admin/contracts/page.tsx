import Link from "next/link";
import type { Metadata } from "next";
import { AppPage, Card, EmptyState, Pill } from "@/components/app-kit";
import { adminFrame, formatDate, withParams } from "@/components/admin/AdminKit";
import { requireRole } from "@/lib/server-auth";
import { contractsForAdmin } from "@/lib/contracts/contracts.server";
import { CONTRACT_TITLE, type ContractKind } from "@shared/contracts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contracts" };

// Contracts between businesses (src/lib/contracts/contracts.server.ts). Owners and admins only (src/lib/admin-team:
// not in any section). The team sees who signed what and when, never the text, notes or signatures: a contract only
// opens while one of the two businesses has a dispute open, with a reason both of them are told about.

const STATUS: Record<string, string> = { awaiting: "Waiting for the second signature", signed: "Signed by both", declined: "Declined", ended: "Ended" };

export default async function AdminContractsPage({ searchParams }: { searchParams?: Promise<{ show?: string; q?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const params = (await searchParams) ?? {};
  const show = params.show === "all" ? "all" : "disputes";
  const q = params.q?.trim().slice(0, 80) || undefined;
  const rows = await contractsForAdmin(show, q);
  return (
    <AppPage frame={adminFrame(user)} title="Contracts" sub="Dropship and delivery agreements businesses signed with each other. Sealed: you can open one only while a dispute is open on it, and both businesses are told.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([["disputes", "Disputes open"], ["all", "All contracts"]] as const).map(([id, label]) => (
          <Link key={id} href={withParams("/admin/contracts", { show: id === "disputes" ? undefined : id, q })} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold no-underline ${show === id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink"}`}>{label}</Link>
        ))}
        <form action="/admin/contracts" className="ml-auto flex gap-2">
          {show === "all" ? <input type="hidden" name="show" value="all" /> : null}
          <input name="q" defaultValue={q} placeholder="Business name" className="min-h-[36px] rounded-full border border-app-line bg-white px-3 text-[13px]" />
        </form>
      </div>
      {rows.length ? (
        <div className="grid gap-3">
          {rows.map((row) => (
            <Link key={row.id} href={`/admin/contracts/${row.id}`} className="text-app-ink no-underline">
              <Card className="grid gap-1.5 p-4 text-[13.5px] hover:border-app-ink/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[15px] font-extrabold">{CONTRACT_TITLE[row.kind as ContractKind] ?? row.title} <span className="font-mono text-[11.5px] font-normal text-app-ink-soft">{row.reference}</span></span>
                  <span className="flex flex-wrap gap-1.5">
                    {row.disputeStatus === "open" ? <Pill tone="danger" dot>Dispute open</Pill> : <Pill tone="muted">🔒 Sealed</Pill>}
                    <Pill tone={row.status === "signed" ? "success" : "muted"}>{STATUS[row.status] ?? row.status}</Pill>
                  </span>
                </div>
                <div>{row.partyAName} <span className="text-app-ink-soft">({row.partyARole})</span> ↔ {row.partyBName} <span className="text-app-ink-soft">({row.partyBRole === "logistics_partner" ? "delivery partner" : row.partyBRole})</span></div>
                <div className="text-app-ink-soft">First signed {formatDate(row.partyASignedAt)}{row.partyBSignedAt ? ` · countersigned ${formatDate(row.partyBSignedAt)}` : ""}</div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon="document" title={show === "disputes" ? "No disputes open" : "No contracts found"}>{show === "disputes" ? "When a business raises a dispute on a contract, it shows here." : "Try another name."}</EmptyState>
      )}
    </AppPage>
  );
}
