import type { Metadata } from "next";
import { AppPage, Card, CardHead, EmptyState, ListCard, ListRow, Pill, PillLink } from "@/components/app-kit";
import { Field, adminFrame, buttonClass, fieldClass, formatDate } from "@/components/admin/AdminKit";
import { applyPlanPrices, savePlan } from "@/app/actions/pricing";
import { requireRole } from "@/lib/server-auth";
import { getPlanCatalog, pendingPriceChanges, planHistory, subscribersByCode } from "@/lib/plans/catalog.server";
import { PLAN_TIERS, PLAN_TIER_KEYS, annualSaving, type PlanBilling, type PlanTier } from "@shared/plan-catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscription plans" };

// Plan prices and monthly AI credits (shared/plan-catalog.ts; what each plan includes is shared/plans.ts). Paystack
// charges each subscriber the amount of the plan they joined, so a new price is a new Paystack plan: new subscribers
// pay it, people already subscribed keep their price until they cancel, unless "Apply the new prices" moves them.

const naira = (amount: number | null) => (amount === null ? "—" : `₦${amount.toLocaleString("en-NG")}`);
const BILLING_LABEL: Record<PlanBilling, string> = { monthly: "Monthly", annual: "Yearly" };
const ROLE_LABEL = { seller: "Sellers", supplier: "Suppliers", logistics_partner: "Delivery partners" } as const;

function historyLine(key: string, value: unknown) {
  if (value === null || value === undefined) return "—";
  if (key.endsWith(".credits")) return `${value} credits/month`;
  const v = value as { amountNgn?: number; code?: string };
  return `${naira(v.amountNgn ?? null)}${v.code ? ` (${v.code})` : ""}`;
}

function historyTitle(key: string) {
  const [, tier, what] = key.split(".");
  const info = PLAN_TIERS[tier as PlanTier];
  return `${info?.label ?? tier}: ${what === "credits" ? "monthly AI credits" : `${BILLING_LABEL[what as PlanBilling]?.toLowerCase() ?? what} price`}`;
}

export default async function AdminPlansPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const [query, catalog, history, subscribers, pending] = await Promise.all([searchParams, getPlanCatalog(), planHistory(), subscribersByCode(), pendingPriceChanges()]);
  const changes = pending.moves.length + pending.missing.length;

  return (
    <AppPage
      frame={adminFrame(user)}
      title="Subscription plans"
      sub="Plan prices and monthly AI credits. A new price creates a new Paystack plan; people already subscribed keep their price."
      actions={<PillLink href="/admin/pricing" size="sm" icon="arrowLeft">Prices and fees</PillLink>}
    >
      {query.error ? (
        <div role="alert" className="mb-5 rounded-[22px] border border-app-danger bg-white p-4 text-[14px] text-app-danger">{query.error}</div>
      ) : query.saved ? (
        <div role="status" className="mb-5 rounded-[22px] border border-app-line bg-white p-4 text-[14px]">{query.saved}</div>
      ) : null}

      {changes > 0 ? (
        <Card className="mb-5 border-2 border-app-ink p-5">
          <CardHead title="Apply the new prices" sub="Today's prices aren't on Paystack yet. This moves existing subscribers onto them (they pay the new amount from their next renewal) and puts a plan on sale for every tier that has none." />
          <ul className="mb-0 mt-3 grid gap-1 pl-4 text-[14px]">
            {pending.moves.map((move) => (
              <li key={move.code}>
                <strong>{PLAN_TIERS[move.tier].label}</strong> {BILLING_LABEL[move.billing].toLowerCase()} <code className="font-mono text-[12px]">{move.code}</code>: {naira(move.fromNgn)} → {naira(move.toNgn)} · {move.subscribers} subscribed {move.fromNgn !== null && move.toNgn > move.fromNgn ? "(a price rise for them)" : ""}
              </li>
            ))}
            {pending.missing.map((gap) => (
              <li key={`${gap.tier}-${gap.billing}`}>
                <strong>{PLAN_TIERS[gap.tier].label}</strong> {BILLING_LABEL[gap.billing].toLowerCase()}: {gap.reuse ? `sell ${gap.reuse} again at ${naira(gap.amountNgn)}` : `new Paystack plan at ${naira(gap.amountNgn)}`}
              </li>
            ))}
          </ul>
          <form action={applyPlanPrices} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex min-h-[44px] items-center gap-2 text-[14px] font-bold">
              <input type="checkbox" name="confirm" value="yes" className="h-5 w-5" /> I've told subscribers about any price rise
            </label>
            <Field label="Note (optional)" htmlFor="apply-note" className="min-w-[220px] flex-1">
              <input id="apply-note" name="note" maxLength={500} placeholder="October 2026 prices" className={fieldClass} />
            </Field>
            <button type="submit" className={buttonClass("ink")}>Apply at Paystack</button>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-5">
        {PLAN_TIER_KEYS.map((tier) => {
          const info = PLAN_TIERS[tier];
          const offer = catalog.tiers[tier];
          const older = catalog.versions.filter((version) => version.tier === tier && !version.current);
          const saving = offer.monthly?.amountNgn && offer.annual?.amountNgn ? annualSaving(offer.monthly.amountNgn, offer.annual.amountNgn) : null;
          return (
            <div key={tier} id={tier} className="scroll-mt-24">
              <Card className="p-5">
                <CardHead
                  title={info.label}
                  sub={`${ROLE_LABEL[info.role]} · ${[info.hideBadge ? "can hide “Built with Shopinbos”" : null, info.freeDomainAnnual ? "yearly plan includes a free domain" : null].filter(Boolean).join(" · ") || "no extra perks"}`}
                />
                <div className="mt-3 grid gap-2 text-[14px]">
                  {info.billings.map((billing) => {
                    const version = offer[billing];
                    return (
                      <div key={billing} className="flex flex-wrap items-center gap-2">
                        <span className="w-[70px] font-bold">{BILLING_LABEL[billing]}</span>
                        <span className="font-extrabold">{naira(version?.amountNgn ?? null)}</span>
                        {version && <code className="rounded-[8px] bg-app-canvas px-2 py-0.5 font-mono text-[12px]">{version.code}</code>}
                        {version && <span className="text-app-ink-soft">{subscribers.get(version.code) ?? 0} subscribed</span>}
                      </div>
                    );
                  })}
                  <div className="text-app-ink-soft">
                    {offer.creditsPerMonth} AI credits a month, refilled each month
                    {saving ? ` · Yearly works out at ${naira(saving.perMonth)}/month, ${saving.months} months free` : ""}
                  </div>
                </div>

                <form action={savePlan} className="mt-4 grid gap-4">
                  <input type="hidden" name="tier" value={tier} />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="New monthly price (₦)" htmlFor={`${tier}-monthly`} hint="Empty: no change.">
                      <input id={`${tier}-monthly`} name="monthlyNgn" type="number" min={100} step={1} placeholder={String(offer.monthly?.amountNgn ?? "")} className={fieldClass} />
                    </Field>
                    {info.billings.includes("annual") && (
                      <Field label="New yearly price (₦)" htmlFor={`${tier}-annual`} hint="Empty: no change.">
                        <input id={`${tier}-annual`} name="annualNgn" type="number" min={100} step={1} placeholder={String(offer.annual?.amountNgn ?? "")} className={fieldClass} />
                      </Field>
                    )}
                    <Field label="AI credits a month" htmlFor={`${tier}-credits`} hint="From each subscriber's next monthly refill.">
                      <input id={`${tier}-credits`} name="creditsPerMonth" type="number" min={0} step={1} defaultValue={offer.creditsPerMonth} required className={fieldClass} />
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label="Note (optional)" htmlFor={`${tier}-note`} className="min-w-[220px] flex-1">
                      <input id={`${tier}-note`} name="note" maxLength={500} placeholder="Why it changed" className={fieldClass} />
                    </Field>
                    <button type="submit" className={buttonClass("ink")}>Save {info.label}</button>
                  </div>
                </form>

                {older.length > 0 && (
                  <div className="mt-4 border-t border-app-line pt-3">
                    <p className="m-0 text-[13px] font-bold">Older prices (people on them keep them until they cancel)</p>
                    <ul className="mb-0 mt-1.5 grid gap-1 pl-4 text-[13px] text-app-ink-soft">
                      {older.map((version) => (
                        <li key={version.code}>
                          {BILLING_LABEL[version.billing]} {naira(version.amountNgn)} · <code className="font-mono text-[12px]">{version.code}</code> · {subscribers.get(version.code) ?? 0} subscribed
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 mt-8 text-[17px] font-extrabold">Change history</h2>
      {history.length ? (
        <ListCard>
          {history.map((row) => (
            <ListRow key={row.id}>
              <div className="min-w-0 flex-1 basis-[240px]">
                <div className="text-[14.5px] font-extrabold">{historyTitle(row.key)}</div>
                <div className="text-[13px] text-app-ink-soft">
                  {formatDate(row.createdAt)} · {row.changedBy?.name || row.changedBy?.email || "Unknown admin"}
                  {row.note ? ` · “${row.note}”` : ""}
                </div>
              </div>
              <Pill tone="muted">{historyLine(row.key, row.before)}</Pill>
              <span aria-hidden className="text-app-ink-soft">→</span>
              <Pill tone="success">{historyLine(row.key, row.after)}</Pill>
            </ListRow>
          ))}
        </ListCard>
      ) : (
        <EmptyState icon="clock" title="No changes yet">Every price and credit change shows here with who made it and why.</EmptyState>
      )}
    </AppPage>
  );
}
