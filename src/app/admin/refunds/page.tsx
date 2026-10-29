import Link from "next/link";
import type { Metadata } from "next";
import { AppPage, Card, EmptyState, Pill, type Tone } from "@/components/app-kit";
import { adminFrame, formatDate, withParams } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { REFUND_REASON_TEXT, REFUND_SEND_DAYS, type RefundReason } from "@shared/order-refunds";
import { RefundDecision } from "./RefundDecision";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Refunds" };

// Customer refunds (shared/order-refunds.ts). Shopinbos never holds the money: the seller sends it from their own bank
// and taps "Refund sent", the customer says whether it arrived. Here: refunds the customer says didn't arrive, and
// ones stuck with the seller, for the team to decide. Who pays the seller back is under Money owed.

const STATUS: Record<string, { label: string; tone: Tone }> = {
  awaiting_account: { label: "Waiting for the customer's account", tone: "muted" },
  to_send: { label: "Seller to send", tone: "warning" },
  sent: { label: "Sent: customer to confirm", tone: "info" },
  confirmed: { label: "Received", tone: "success" },
  disputed: { label: "Customer says it didn't arrive", tone: "danger" },
  cancelled: { label: "Closed", tone: "muted" },
};

const FILTERS = [
  { id: "", label: "Needs a decision" },
  { id: "open", label: "All open" },
  { id: "closed", label: "Closed" },
] as const;

const DAY_MS = 86_400_000;
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export default async function AdminRefundsPage({ searchParams }: { searchParams?: Promise<{ show?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const show = (await searchParams)?.show ?? "";
  const stuck = new Date(Date.now() - REFUND_SEND_DAYS * 2 * DAY_MS);
  const where =
    show === "open" ? { status: { in: ["awaiting_account", "to_send", "sent", "disputed"] } }
    : show === "closed" ? { status: { in: ["confirmed", "cancelled"] } }
    : { OR: [{ status: "disputed" }, { status: "to_send", accountGivenAt: { lte: stuck } }] };
  const refunds = await db.orderRefund.findMany({ where, orderBy: { updatedAt: "asc" }, take: 200 });
  const [orders, stores] = await Promise.all([
    db.retailOrder.findMany({ where: { id: { in: [...new Set(refunds.map((row) => row.retailOrderId))] } }, select: { id: true, orderNumber: true, buyerName: true, buyerPhone: true } }),
    db.store.findMany({ where: { id: { in: [...new Set(refunds.map((row) => row.storeId))] } }, select: { id: true, name: true, user: { select: { email: true } } } }),
  ]);

  return (
    <AppPage frame={adminFrame(user)} title="Refunds" sub="Sellers send customer refunds from their own bank; Shopinbos holds none of it. Decide the ones a customer says didn't arrive, or that the seller hasn't sent.">
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Link key={option.id} href={withParams("/admin/refunds", { show: option.id || undefined })} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold no-underline ${show === option.id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink"}`}>
            {option.label}
          </Link>
        ))}
      </div>
      {refunds.length ? (
        <div className="grid gap-3">
          {refunds.map((refund) => {
            const status = STATUS[refund.status] ?? STATUS.to_send!;
            const order = orders.find((row) => row.id === refund.retailOrderId);
            const store = stores.find((row) => row.id === refund.storeId);
            return (
              <Card key={refund.id} className="grid gap-2 p-4 text-[13.5px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-extrabold">{store?.name ?? "A store"} → {order?.buyerName ?? "customer"} · {naira(refund.amountKobo)}</div>
                  <Pill tone={status.tone}>{status.label}</Pill>
                </div>
                <div className="text-app-ink-soft">
                  {REFUND_REASON_TEXT[refund.reason as RefundReason] ?? refund.reason} · order {order?.orderNumber ?? refund.retailOrderId} · fault: {refund.fault} · opened {formatDate(refund.createdAt)}
                  {store?.user?.email ? ` · ${store.user.email}` : ""}{order?.buyerPhone ? ` · customer ${order.buyerPhone}` : ""}
                </div>
                {refund.accountNumber ? <div>To {refund.accountName ?? "?"} · {refund.bankName} {refund.accountNumber}{refund.accountGivenAt ? ` (given ${formatDate(refund.accountGivenAt)})` : ""}</div> : null}
                {refund.sentAt ? <div>Seller marked sent {formatDate(refund.sentAt)}{refund.sentReference ? ` · ref ${refund.sentReference}` : ""}</div> : null}
                {refund.disputeNote ? <p className="m-0 whitespace-pre-line"><span className="font-bold">Customer:</span> {refund.disputeNote}</p> : null}
                {refund.note ? <p className="m-0 whitespace-pre-line text-app-ink-soft">{refund.note}</p> : null}
                {["awaiting_account", "to_send", "sent", "disputed"].includes(refund.status) ? <RefundDecision refundId={refund.id} /> : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="coin" title="Nothing here">{show ? "No refunds match this." : "No refund is waiting for a decision."}</EmptyState>
      )}
    </AppPage>
  );
}
