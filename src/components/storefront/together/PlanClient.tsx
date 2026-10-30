"use client";

import Link from "next/link";
import { useState } from "react";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { ItemThumb, Panel, PrimaryButton, ProgressBar } from "@/components/storefront/shopper/ShopperShell";
import { Notice, ReturnNotice, Shell, dayLabel, goToPaystack, nairaText, postTogether, useTheme, type TogetherStore } from "./together-ui";
import type { publicPlan } from "@/lib/pay-together/instalments.server";

// A shopper's Pay small small plan (/plan/<id>?t=<signed token>): progress, the weekly schedule, and Pay now. The link
// is in every reminder; the token proves it's theirs.

type Plan = NonNullable<Awaited<ReturnType<typeof publicPlan>>>;

const STATUS_TEXT: Record<string, string> = {
  pending: "Waiting for your first payment",
  active: "In progress",
  completed: "Paid in full",
  cancelled: "Cancelled",
  defaulted: "Closed: a payment was missed",
};

export function PlanClient({ store, storeBasePath, plan, token, returned }: { store: TogetherStore; storeBasePath: string; plan: Plan; token: string; returned: string | null }) {
  const theme = useTheme(store);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const percent = plan.totalKobo > 0 ? Math.min(100, Math.floor((plan.paidKobo / plan.totalKobo) * 100)) : 0;

  async function payNow() {
    setBusy(true);
    setError(null);
    const answer = await postTogether(store.slug, { action: "plan.pay", planId: plan.id, token });
    if (answer.ok) goToPaystack(answer.data.authorizationUrl);
    else {
      setError(answer.message);
      setBusy(false);
    }
  }

  return (
    <Shell store={store} theme={theme} basePath={storeBasePath} title="Your plan">
      <div className="grid gap-5">
        <ReturnNotice theme={theme} returned={returned} paidText={plan.status === "completed" ? "Paid in full. The shop is preparing your order." : "Payment received. Thank you!"} />
        <div className="flex items-center gap-4">
          <ItemThumb theme={theme} src={plan.productImage} alt={plan.productName} size={72} />
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-semibold uppercase tracking-wide" style={{ color: theme.muted }}>Pay small small · {STATUS_TEXT[plan.status] ?? plan.status}</p>
            <h1 className="m-0 text-[24px] font-semibold leading-tight" style={{ fontFamily: theme.heading }}>{plan.productName}{plan.variantLabel ? ` · ${plan.variantLabel}` : ""}</h1>
          </div>
        </div>

        <Panel theme={theme} className="grid gap-3 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px]"><strong>{nairaText(plan.paidKobo)}</strong> of {nairaText(plan.totalKobo)} paid</span>
            <span className="text-[14px]" style={{ color: theme.muted }}>{plan.paidCount} of {plan.weeks} weeks</span>
          </div>
          <ProgressBar theme={theme} percent={percent} label="Paid so far" />
          {plan.status === "active" && plan.nextKobo ? (
            <>
              <p className="m-0 text-[15px]">Next: <strong>{nairaText(plan.nextKobo)}</strong>{plan.nextDueAt ? ` by ${dayLabel(plan.nextDueAt)}` : ""}.{plan.autopay ? ` We'll charge your card${plan.cardLast4 ? ` ending ${plan.cardLast4}` : ""} on the day.` : ""}</p>
              {error ? <Notice theme={theme} tone="error">{error}</Notice> : null}
              <PrimaryButton theme={theme} type="button" disabled={busy} onClick={() => void payNow()}>{busy ? "Opening Paystack…" : `Pay ${nairaText(plan.nextKobo)} now`}</PrimaryButton>
            </>
          ) : null}
          {plan.status === "completed" ? (
            <p className="m-0 text-[15px]">All paid. {plan.orderId ? <Link href={getPublicStorefrontPath(storeBasePath, `/order/${plan.orderId}`)} style={{ color: theme.ink }}>Track your order</Link> : "The shop is preparing your order."}</p>
          ) : null}
          {plan.status === "defaulted" || plan.status === "cancelled" ? <p className="m-0 text-[15px]">This plan is closed. The shop will contact you about what you paid, under their refund rule.</p> : null}
        </Panel>

        {plan.schedule.length ? (
          <Panel theme={theme} className="p-5">
            <h2 className="m-0 mb-3 text-[17px] font-semibold">Schedule</h2>
            <ol className="m-0 grid list-none gap-2 p-0">
              {plan.schedule.map((part) => (
                <li key={part.n} className="flex items-center justify-between gap-3 text-[14.5px]">
                  <span>{part.paid ? "✓ " : ""}Week {part.n} · {dayLabel(part.dueAt)}</span>
                  <span style={{ color: part.paid ? "#1F7A4D" : theme.ink }}>{nairaText(part.amountKobo)}{part.paid ? " paid" : ""}</span>
                </li>
              ))}
            </ol>
          </Panel>
        ) : null}

        <Panel theme={theme} className="grid gap-1 p-5 text-[14px]">
          <p className="m-0"><strong>Refund rule:</strong> {plan.refundRule}</p>
          <p className="m-0"><strong>Price:</strong> {plan.priceLock ? "fixed for your plan." : "the weeks left follow the shop's price if it changes."}</p>
          <p className="m-0" style={{ color: theme.muted }}>Miss a week? You have 2 days to pay before the plan closes. Each payment goes straight to {store.name} through Paystack. {plan.finishedPlans === 1 ? "1 plan" : `${plan.finishedPlans} plans`} finished at this shop.</p>
        </Panel>
      </div>
    </Shell>
  );
}
