"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { ItemThumb, Panel, PrimaryButton } from "@/components/storefront/shopper/ShopperShell";
import { planProblem, splitIntoParts } from "@shared/instalments";
import { savingKobo } from "@shared/group-buy";
import { Check, DetailsFields, Notice, Shell, dayLabel, detailsBody, goToPaystack, nairaText, postTogether, useDetails, useTheme, type TogetherStore } from "./together-ui";
import type { PaySmallOffer } from "@/lib/pay-together/instalments.server";
import type { GroupOffer } from "@/lib/pay-together/group-buy.server";

// "Other ways to buy" one product (pilots pay_small_small, group_buy, ajo): pay in weekly parts, buy with friends for a
// lower price, or join one of the shop's ajo groups. Every payment goes through Paystack straight to the shop's bank.

type Way = "small" | "group" | "ajo";

export function BuyWaysClient({
  store,
  storeBasePath,
  product,
  paySmall,
  group,
  ajo,
}: {
  store: TogetherStore;
  storeBasePath: string;
  product: { id: string; name: string; image: string | null; retailKobo: number; variants: Array<{ id: string; name: string; priceKobo: number }> };
  paySmall: (PaySmallOffer & { allowedWeeks: number[] }) | null;
  group: GroupOffer | null;
  ajo: Array<{ id: string; size: number; weeklyKobo: number; startDay: string; joined: number; variantLabel: string | null }>;
}) {
  const theme = useTheme(store);
  const ways: Way[] = [...(paySmall ? (["small"] as const) : []), ...(group ? (["group"] as const) : []), ...(ajo.length ? (["ajo"] as const) : [])];
  const [way, setWay] = useState<Way>(ways[0] ?? "small");
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const unitKobo = product.variants.find((variant) => variant.id === variantId)?.priceKobo ?? product.retailKobo;
  const [details, setDetails] = useDetails(store.slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label: Record<Way, string> = { small: "Pay small small", group: "Buy with friends", ajo: "Join an ajo" };

  const plans = useMemo(
    () => (paySmall?.allowedWeeks ?? []).flatMap((weeks) => (planProblem(unitKobo, weeks) ? [] : [{ weeks, parts: splitIntoParts(unitKobo, weeks)! }])),
    [paySmall, unitKobo],
  );
  const [weeks, setWeeks] = useState<number>(plans[0]?.weeks ?? 4);
  const chosen = plans.find((plan) => plan.weeks === weeks) ?? plans[0] ?? null;
  const [autopay, setAutopay] = useState(false);

  async function start(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const answer = await postTogether(store.slug, { ...body, ...detailsBody(details), ...(variantId ? { variantId } : {}) });
    if (answer.ok) goToPaystack(answer.data.authorizationUrl);
    else {
      setError(answer.message);
      setBusy(false);
    }
  }

  return (
    <Shell store={store} theme={theme} basePath={storeBasePath} title="Other ways to buy">
      <div className="grid gap-5">
        <div className="flex items-center gap-4">
          <ItemThumb theme={theme} src={product.image} alt={product.name} size={72} />
          <div className="min-w-0">
            <h1 className="m-0 text-[24px] font-semibold leading-tight" style={{ fontFamily: theme.heading }}>{product.name}</h1>
            <p className="m-0 mt-1 text-[15px]" style={{ color: theme.muted }}>{nairaText(unitKobo)} · <Link href={getPublicStorefrontPath(storeBasePath, `/product/${product.id}`)} style={{ color: theme.ink }}>Back to the product</Link></p>
          </div>
        </div>

        {product.variants.length ? (
          <label className="block text-[14px] font-semibold">
            Choose
            <select value={variantId} onChange={(event) => setVariantId(event.target.value)} className="mt-1.5 block h-12 w-full rounded-[14px] border bg-white px-4 text-[16px]" style={{ borderColor: theme.border }}>
              {product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · {nairaText(variant.priceKobo)}</option>)}
            </select>
          </label>
        ) : null}

        {ways.length > 1 ? (
          <div role="tablist" aria-label="Ways to buy" className="flex flex-wrap gap-2">
            {ways.map((entry) => (
              <button key={entry} type="button" role="tab" aria-selected={way === entry} onClick={() => { setWay(entry); setError(null); }} className="min-h-11 rounded-full border px-4 text-[14px] font-semibold" style={way === entry ? { background: theme.cta, color: theme.ctaText, borderColor: theme.cta } : { borderColor: theme.border, color: theme.ink }}>
                {label[entry]}
              </button>
            ))}
          </div>
        ) : null}

        {way === "small" && paySmall ? (
          <Panel theme={theme} className="grid gap-4 p-5">
            <div>
              <h2 className="m-0 text-[20px] font-semibold" style={{ fontFamily: theme.heading }}>Pay small small</h2>
              <p className="m-0 mt-1 text-[14px]" style={{ color: theme.muted }}>Pay part now and the rest weekly. You get it when the last part is paid.</p>
            </div>
            {plans.length ? (
              <fieldset className="grid gap-2 border-0 p-0">
                <legend className="mb-1 text-[14px] font-semibold">How many weeks?</legend>
                {plans.map((plan) => (
                  <label key={plan.weeks} className="flex cursor-pointer items-center justify-between gap-3 rounded-[14px] border px-4 py-3" style={{ borderColor: plan.weeks === chosen?.weeks ? theme.ink : theme.border }}>
                    <span className="flex items-center gap-3">
                      <input type="radio" name="weeks" checked={plan.weeks === chosen?.weeks} onChange={() => setWeeks(plan.weeks)} style={{ accentColor: theme.cta }} />
                      <span className="text-[15px] font-semibold">{plan.weeks} weeks</span>
                    </span>
                    <span className="text-right text-[14px]">
                      <strong>{nairaText(plan.parts[0]!)}</strong> a week
                      {plan.parts.at(-1) !== plan.parts[0] ? <span className="block text-[12.5px]" style={{ color: theme.muted }}>last week {nairaText(plan.parts.at(-1)!)}</span> : null}
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <Notice theme={theme} tone="info">This version is too small to pay in parts.</Notice>
            )}
            <div className="grid gap-1 text-[14px]">
              <p className="m-0"><strong>Price:</strong> {nairaText(unitKobo)}{paySmall.priceLock ? " — fixed for your plan, even if the price changes." : " — the weeks left follow the shop's price if it changes."}</p>
              <p className="m-0"><strong>Refunds:</strong> {paySmall.refundRule}</p>
              <p className="m-0" style={{ color: theme.muted }}>{paySmall.finishedPlans === 1 ? "1 plan finished at this shop" : `${paySmall.finishedPlans} plans finished at this shop`}</p>
              <p className="m-0" style={{ color: theme.muted }}>Miss a week? You have 2 days to pay, then the plan closes and the shop's refund rule applies.</p>
            </div>
            <DetailsFields theme={theme} details={details} onChange={setDetails} addressNote="Where should it be delivered when it's paid off?" />
            <Check theme={theme} checked={autopay} onChange={setAutopay}>Pay automatically each week. Paystack keeps your card safely and charges it on each due day; you can still pay early from your plan page.</Check>
            {error ? <Notice theme={theme} tone="error">{error}</Notice> : null}
            <PrimaryButton theme={theme} type="button" disabled={busy || !chosen} onClick={() => chosen && void start({ action: "plan.start", productId: product.id, weeks: chosen.weeks, quantity: 1, autopay })}>
              {busy ? "Opening Paystack…" : chosen ? `Pay ${nairaText(chosen.parts[0]!)} now` : "Pay now"}
            </PrimaryButton>
          </Panel>
        ) : null}

        {way === "group" && group ? (
          <Panel theme={theme} className="grid gap-4 p-5">
            <div>
              <h2 className="m-0 text-[20px] font-semibold" style={{ fontFamily: theme.heading }}>Buy with friends</h2>
              <p className="m-0 mt-1 text-[15px]">
                <strong>{nairaText(group.priceKobo)} each when {group.size} join</strong>
                {group.open ? ` (ends in ${group.open.timeLeft})` : ` (open for ${group.hours} hours after the first person joins)`}
              </p>
              <p className="m-0 mt-1 text-[14px]" style={{ color: theme.muted }}>
                Save {nairaText(savingKobo(product.retailKobo, group.priceKobo))}. {group.open ? `${group.open.joined} of ${group.size} have joined.` : "Start the group and share the link."} Nobody pays unless the group fills.
              </p>
            </div>
            <DetailsFields theme={theme} details={details} onChange={setDetails} />
            <p className="m-0 text-[13px]" style={{ color: theme.muted }}>To save your card, Paystack checks it with ₦50 and sends it straight back. When the group fills, your card is charged {nairaText(group.priceKobo)}. If it doesn't fill in time, nothing is charged.</p>
            {error ? <Notice theme={theme} tone="error">{error}</Notice> : null}
            <PrimaryButton theme={theme} type="button" disabled={busy} onClick={() => void start({ action: "group.join", productId: product.id, ...(group.open ? { groupId: group.open.id } : {}) })}>
              {busy ? "Opening Paystack…" : group.open ? "Join the group" : "Start a group"}
            </PrimaryButton>
          </Panel>
        ) : null}

        {way === "ajo" && ajo.length ? (
          <Panel theme={theme} className="grid gap-3 p-5">
            <h2 className="m-0 text-[20px] font-semibold" style={{ fontFamily: theme.heading }}>Join an ajo</h2>
            <p className="m-0 text-[14px]" style={{ color: theme.muted }}>Everyone pays a small amount each week; each week one member gets theirs.</p>
            {ajo.map((entry) => (
              <Link key={entry.id} href={getPublicStorefrontPath(storeBasePath, `/ajo/${entry.id}`)} className="flex items-center justify-between gap-3 rounded-[14px] border px-4 py-3 no-underline" style={{ borderColor: theme.border, color: theme.ink }}>
                <span>
                  <strong>{nairaText(entry.weeklyKobo)} a week</strong> for {entry.size} weeks{entry.variantLabel ? ` · ${entry.variantLabel}` : ""}
                  <span className="block text-[13px]" style={{ color: theme.muted }}>Starts {dayLabel(entry.startDay)} · {entry.joined} of {entry.size} joined</span>
                </span>
                <span aria-hidden>→</span>
              </Link>
            ))}
          </Panel>
        ) : null}
      </div>
    </Shell>
  );
}
