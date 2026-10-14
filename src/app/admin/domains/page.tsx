import Link from "next/link";
import { AppPage, Card, EmptyState, Pill, type Tone } from "@/components/app-kit";
import { adminFrame, formatDate, formatMoney, withParams } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { NEEDS_ATTENTION_STATUSES } from "@/lib/domains/billing-pure";

export const dynamic = "force-dynamic";

// Domains sellers bought (or renewed) through Shopinbos: what they paid, the status, and when each runs out.
// Read-only. "failed" and "refund_failed" are highlighted: the seller paid and got no domain, so check Paystack and
// refund by hand if the automatic refund didn't go through. A "buying" row that is more than an hour old means we
// couldn't tell whether the registrar took the order: check it in Vercel (Domains → Orders).

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending_payment: { label: "Waiting for payment", tone: "muted" },
  payment_failed: { label: "Not paid", tone: "muted" },
  paid: { label: "Paid, not bought yet", tone: "warning" },
  buying: { label: "Buying", tone: "info" },
  bought: { label: "Bought", tone: "success" },
  failed: { label: "Failed: check refund", tone: "danger" },
  refunded: { label: "Refunded", tone: "muted" },
  refund_failed: { label: "Refund failed: refund by hand", tone: "danger" },
  expired: { label: "Expired", tone: "muted" },
};

const FILTERS = [
  { id: "", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "bought", label: "Bought" },
  { id: "pending_payment", label: "Waiting for payment" },
] as const;

const HOUR_MS = 60 * 60 * 1000;

export default async function AdminDomainPurchasesPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const filter = (await searchParams)?.status ?? "";
  const where =
    filter === "attention"
      ? { status: { in: [...NEEDS_ATTENTION_STATUSES, "buying", "paid"] } }
      : filter
        ? { status: filter }
        : {};
  const [rows, attention] = await Promise.all([
    db.domainPurchase.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    db.domainPurchase.count({ where: { status: { in: [...NEEDS_ATTENTION_STATUSES] }, coveredByPlan: false } }),
  ]);
  const stores = await db.store.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.storeId))] } }, select: { id: true, name: true, slug: true } });
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const now = Date.now();

  return (
    <AppPage
      frame={adminFrame(user, "Search stores")}
      title="Domains sellers bought"
      sub={attention > 0 ? `${attention} ${attention === 1 ? "purchase needs" : "purchases need"} a person: the seller paid and has no domain.` : "Sellers pay first through Paystack, then we buy the domain on Vercel."}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.id || "all"}
            href={withParams("/admin/domains", { status: item.id || undefined })}
            className={`inline-flex min-h-[38px] items-center rounded-full px-4 text-[13.5px] font-bold no-underline ${filter === item.id ? "bg-app-ink text-white" : "border border-app-line bg-white text-app-ink"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="globe" title="No domain purchases">When a seller buys or renews a domain through Shopinbos, it shows here.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="m-0 list-none divide-y divide-app-line p-0">
            {rows.map((row) => {
              const store = storeById.get(row.storeId);
              const stuck = (row.status === "buying" || row.status === "paid") && now - row.updatedAt.getTime() > HOUR_MS;
              // A free (annual plan) purchase that failed charged nothing: no refund to chase.
              const highlight = (NEEDS_ATTENTION_STATUSES.includes(row.status) && !row.coveredByPlan) || stuck;
              const status = row.coveredByPlan && row.status === "failed"
                ? { label: "Failed (free, nothing charged)", tone: "warning" as Tone }
                : STATUS[row.status] ?? { label: row.status, tone: "muted" as Tone };
              return (
                <li key={row.id} className={`grid gap-2 px-5 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center ${highlight ? "bg-app-danger-tint" : ""}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-all text-[15px] font-extrabold">{row.domain}</span>
                      <Pill tone={stuck ? "danger" : status.tone} dot>{stuck ? `${status.label} (over an hour)` : status.label}</Pill>
                      {row.kind === "renewal" && <Pill tone="muted">Renewal</Pill>}
                      {row.coveredByPlan && <Pill tone="accent">Free (annual plan)</Pill>}
                    </div>
                    <div className="mt-1 text-[13.5px] text-app-ink-soft">
                      {store ? `${store.name} (${store.slug})` : row.storeId} · ref <span className="font-mono">{row.reference}</span>
                      {row.vercelOrderId ? <> · order <span className="font-mono">{row.vercelOrderId}</span></> : null}
                    </div>
                    {row.error && <div className="mt-1 text-[13.5px] text-app-danger">{row.error}</div>}
                  </div>
                  <div className="text-[14px]">
                    <div className="font-bold">{row.coveredByPlan ? "Free (annual plan)" : formatMoney(row.amountNgn)}</div>
                    <div className="text-[13px] text-app-ink-soft">${row.costUsd.toFixed(2)} cost · {formatDate(row.createdAt)}</div>
                  </div>
                  <div className="text-[13.5px] md:text-right">
                    {row.expiresAt ? <>Runs until <strong>{formatDate(row.expiresAt)}</strong></> : <span className="text-app-ink-soft">No expiry yet</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AppPage>
  );
}
