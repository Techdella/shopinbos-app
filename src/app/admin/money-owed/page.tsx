import Link from "next/link";
import type { Metadata } from "next";
import { AppPage, Card, EmptyState, Pill, type Tone } from "@/components/app-kit";
import { adminFrame, formatDate, withParams } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { debtReasonLabel, remainingKobo, PAY_WITHIN_DAYS } from "@/lib/money-owed/rules";
import { DebtDecision, RecordDebtForm } from "./MoneyOwedActions";
import { SupplierReviewDone } from "./SupplierReview";
import { STRIKE_DAYS, STRIKE_LABELS, type StrikeKind } from "@shared/fault-matrix";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Money owed" };

// Money owed between businesses (src/lib/money-owed). Shopinbos never holds it: the team is the referee. Claims a
// business disputed, or didn't answer within PAY_WITHIN_DAYS, wait here for a decision; overdue debts are being
// paid off from the debtor's later sales, and 7 days overdue the debtor is paused from new business automatically
// ("Give 7 more days" moves the due date and lifts it);
// chargebacks Paystack took from Shopinbos's balance are recorded here against the business that sold.

const STATUS: Record<string, { label: string; tone: Tone }> = {
  claimed: { label: "Waiting for their answer", tone: "warning" },
  disputed: { label: "Disputed: decide", tone: "danger" },
  open: { label: "Owed", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  rejected: { label: "Rejected", tone: "muted" },
  waived: { label: "Cancelled", tone: "muted" },
};

const FILTERS = [
  { id: "", label: "Needs a decision" },
  { id: "overdue", label: "Overdue" },
  { id: "open", label: "Owed" },
  { id: "claimed", label: "Waiting for an answer" },
  { id: "closed", label: "Closed" },
  { id: "review", label: "Suppliers to review" },
] as const;

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const DAY_MS = 24 * 60 * 60 * 1000;

export default async function AdminMoneyOwedPage({ searchParams }: { searchParams?: Promise<{ show?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const show = (await searchParams)?.show ?? "";
  const now = new Date();
  const unanswered = new Date(now.getTime() - PAY_WITHIN_DAYS * DAY_MS);
  const where =
    show === "overdue" ? { status: "open", dueAt: { lte: now } }
    : show === "open" ? { status: "open" }
    : show === "claimed" ? { status: "claimed" }
    : show === "closed" ? { status: { in: ["paid", "rejected", "waived"] } }
    : { OR: [{ status: "disputed" }, { status: "claimed", createdAt: { lte: unanswered } }] };
  // Three strikes in 90 days (shared/fault-matrix.ts): flagged for the team, never suspended automatically.
  const flagged = show === "review"
    ? await db.supplier.findMany({ where: { reviewFlaggedAt: { not: null } }, orderBy: { reviewFlaggedAt: "asc" }, take: 100, select: { id: true, displayName: true, reviewFlaggedAt: true, user: { select: { email: true } }, strikes: { where: { expiresAt: { gt: now } }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, createdAt: true, retailOrderId: true } } } })
    : [];
  const debts = show === "review" ? [] : await db.businessDebt.findMany({
    where,
    orderBy: [{ createdAt: "asc" }],
    take: 200,
    include: {
      debtor: { select: { name: true, email: true, role: true, debtPausedAt: true } },
      creditor: { select: { name: true, email: true, role: true } },
      payments: { where: { status: "applied" }, orderBy: { createdAt: "asc" }, select: { method: true, amountKobo: true, createdAt: true } },
    },
  });
  const orderIds = [...new Set(debts.flatMap((debt) => (debt.retailOrderId ? [debt.retailOrderId] : [])))];
  const orders = orderIds.length ? await db.retailOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true } }) : [];

  return (
    <AppPage frame={adminFrame(user)} title="Money owed" sub="What businesses owe each other when an order goes wrong. Shopinbos holds none of it: we keep the record and decide disputes.">
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Link key={option.id} href={withParams("/admin/money-owed", { show: option.id || undefined })} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold no-underline ${show === option.id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink"}`}>
            {option.label}
          </Link>
        ))}
      </div>
      {show === "review" ? (
        flagged.length ? (
          <div className="grid gap-3">
            {flagged.map((supplier) => (
              <Card key={supplier.id} className="grid gap-2 p-4 text-[13.5px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-extrabold">{supplier.displayName} · {supplier.user.email}</div>
                  <Pill tone="danger">{supplier.strikes.length} strikes in {STRIKE_DAYS} days</Pill>
                </div>
                <ul className="m-0 grid list-none gap-1 p-0 text-app-ink-soft">
                  {supplier.strikes.map((strike) => <li key={strike.id}>{STRIKE_LABELS[strike.kind as StrikeKind] ?? strike.kind} · {formatDate(strike.createdAt)}</li>)}
                </ul>
                <SupplierReviewDone supplierId={supplier.id} />
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon="coin" title="No supplier to review">Suppliers with 3 strikes in {STRIKE_DAYS} days (late or out of stock after payment) show up here.</EmptyState>
        )
      ) : debts.length ? (
        <div className="grid gap-3">
          {debts.map((debt) => {
            const status = STATUS[debt.status] ?? STATUS.open!;
            const overdue = debt.status === "open" && debt.dueAt && debt.dueAt.getTime() <= now.getTime() && remainingKobo(debt) > 0;
            const order = orders.find((row) => row.id === debt.retailOrderId);
            return (
              <Card key={debt.id} className="grid gap-2 p-4 text-[13.5px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-extrabold">
                    {debt.debtor.name} → {debt.creditor ? debt.creditor.name : "Shopinbos"} · {naira(debt.amountKobo)}
                    {debt.paidKobo > 0 && debt.status === "open" ? <span className="font-bold text-app-ink-soft"> ({naira(remainingKobo(debt))} left)</span> : null}
                  </div>
                  <div className="flex gap-2">
                    {debt.debtor.debtPausedAt ? <Pill tone="danger">Paused from new business</Pill> : null}
                    {overdue ? <Pill tone="danger">Overdue</Pill> : null}
                    <Pill tone={status.tone}>{debt.status === "claimed" && debt.createdAt <= unanswered ? "No answer: decide" : status.label}</Pill>
                  </div>
                </div>
                <div className="text-app-ink-soft">
                  {debtReasonLabel(debt.reason)}{order ? ` · order ${order.orderNumber}` : ""} · {debt.debtor.email} owes {debt.creditor?.email ?? "Shopinbos"} · raised {formatDate(debt.createdAt)}{debt.dueAt ? ` · due ${formatDate(debt.dueAt)}` : ""}
                </div>
                {debt.details ? <p className="m-0 whitespace-pre-line"><span className="font-bold">Claim:</span> {debt.details}</p> : null}
                {debt.response ? <p className="m-0 whitespace-pre-line"><span className="font-bold">Their answer:</span> {debt.response}</p> : null}
                {debt.decisionNote ? <p className="m-0 whitespace-pre-line"><span className="font-bold">Decision:</span> {debt.decisionNote}</p> : null}
                {debt.payments.length ? (
                  <p className="m-0 text-app-ink-soft">Paid: {debt.payments.map((payment) => `${naira(payment.amountKobo)} ${payment.method === "deduction" ? "from a sale" : payment.method === "paystack" ? "in the app" : "confirmed by them"} (${formatDate(payment.createdAt)})`).join(", ")}</p>
                ) : null}
                {["claimed", "disputed", "open"].includes(debt.status) ? <DebtDecision debtId={debt.id} pending={debt.status !== "open"} amount={(debt.amountKobo / 100).toString()} /> : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="coin" title="Nothing here">{show ? "No money owed matches this." : "No claim is waiting for a decision."}</EmptyState>
      )}
      <Card className="mt-6 grid gap-3 p-5">
        <div>
          <h2 className="m-0 text-[16px] font-extrabold">Record money owed</h2>
          <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">
            For a decision made outside the app, or a card chargeback Paystack took from Shopinbos&apos;s balance (leave &quot;owed to&quot; empty: it&apos;s owed to Shopinbos). It&apos;s owed straight away and due in {PAY_WITHIN_DAYS} days; after that their later sales pay it off.
          </p>
        </div>
        <RecordDebtForm />
      </Card>
    </AppPage>
  );
}
