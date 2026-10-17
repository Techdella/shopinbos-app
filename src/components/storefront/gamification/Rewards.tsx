"use client";

import { lazy, Suspense, useEffect, useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { TIER_NAMES, type GamificationConfig, type LoyaltySettings, type LoyaltyTier } from "@/lib/gamification/logic";
import { readWonCode, type GameColors, type WonCode } from "./client";

// Small reward pieces for the bag, checkout and order pages: the prize a shopper won (offered until it's
// used), the loyalty points box at checkout, the points summary and the post-purchase spin on the order page.

const GameDialog = lazy(() => import("./GameDialog"));

/** "You won 10% off: SPIN-7KQ2MX · Use it" until the code is on the bag (or used, or expired). */
export function WonCodeBanner({ storeSlug, appliedCode, onApply, colors, currency }: { storeSlug: string; appliedCode: string | null | undefined; onApply: (code: string) => void; colors: Pick<GameColors, "ink" | "border" | "card" | "muted">; currency: string }) {
  const [won, setWon] = useState<WonCode | null>(null);
  useEffect(() => setWon(readWonCode(storeSlug)), [storeSlug]);
  if (!won || appliedCode?.toUpperCase() === won.code) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-dashed px-3 py-2.5 text-[14px]" style={{ borderColor: colors.ink, background: colors.card }}>
      <Icon name="sparkle" size={15} />
      <span className="min-w-0 flex-1">
        {won.source === "signup" ? "Your sign-up reward" : "You won"} <strong>{won.label.toLowerCase()}</strong>: <span className="font-mono font-semibold">{won.code}</span>
        {won.minOrder ? <span style={{ color: colors.muted }}> · orders over {formatStoreMoney(won.minOrder, currency)}</span> : null}
      </span>
      <button type="button" onClick={() => onApply(won.code)} className="min-h-10 rounded-full px-3 text-[13.5px] font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Use it</button>
    </div>
  );
}

interface PointsLookup {
  found: boolean;
  balance?: number;
  tier?: LoyaltyTier;
  tierName?: string;
  valueOfBalance?: number;
  usable?: { max: number; points: number; amount: number } | null;
}

/**
 * Checkout: once the email and phone match an earlier order, shows the points balance and a switch to use
 * them (up to the store's cap). The server re-checks everything when it quotes and when it takes the order.
 */
export function PointsAtCheckout({ storeSlug, email, phone, base, currency, settings, using, onChange, applied, colors }: {
  storeSlug: string;
  email: string;
  phone: string;
  /** Products after any code: what the cap is worked out from. */
  base: number;
  currency: string;
  settings: LoyaltySettings;
  using: number;
  onChange: (points: number) => void;
  /** What the server's quote actually took off (null until quoted). */
  applied: { points: number; amount: number } | null;
  colors: Pick<GameColors, "ink" | "border" | "card" | "muted" | "cta">;
}) {
  const id = useId();
  const [lookup, setLookup] = useState<PointsLookup | null>(null);
  const ready = settings.enabled && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && phone.replace(/\D/g, "").length >= 7;

  useEffect(() => {
    if (!ready) {
      setLookup(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/game/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ email: email.trim(), phone: phone.trim(), subtotal: Math.max(0, Math.round(base)) }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => setLookup(json?.data ?? null))
        .catch(() => {});
    }, 500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [ready, storeSlug, email, phone, base]);

  // A balance that no longer covers the switch (or a smaller bag) turns it down to what can be used.
  const usable = lookup?.usable;
  useEffect(() => {
    if (using > 0 && usable && usable.max < using) onChange(usable.max);
  }, [usable, using, onChange]);

  if (!settings.enabled || !lookup?.found) return null;
  const money = (n: number) => formatStoreMoney(n, currency);
  const max = usable?.max ?? 0;
  return (
    <div className="grid gap-1.5 rounded-[14px] px-3 py-2.5 text-[14px]" style={{ background: colors.card }}>
      <p className="m-0 flex items-center gap-2">
        <Icon name="star" size={15} />
        <span>
          <strong>{(lookup.balance ?? 0).toLocaleString("en-NG")} points</strong> ({money(lookup.valueOfBalance ?? 0)}) · {lookup.tierName} member
        </span>
      </p>
      {max > 0 ? (
        <label htmlFor={id} className="flex min-h-10 cursor-pointer items-center gap-2.5">
          <input id={id} type="checkbox" checked={using > 0} onChange={(event) => onChange(event.target.checked ? max : 0)} className="h-5 w-5 shrink-0" style={{ accentColor: colors.cta }} />
          <span>
            Use {max.toLocaleString("en-NG")} points for {money(usable?.amount ?? 0)} off
            {applied && using > 0 ? <span className="block text-[12.5px]" style={{ color: colors.muted }}>Applied: −{money(applied.amount)}</span> : null}
          </span>
        </label>
      ) : (
        <p className="m-0 text-[12.5px]" style={{ color: colors.muted }}>
          You can use points once you have {settings.minRedeemPoints.toLocaleString("en-NG")} (up to {settings.maxRedeemPercent}% of an order).
        </p>
      )}
    </div>
  );
}

export interface OrderRewards {
  loyalty: { earned: number; pending: number; used: number; usedValue: number; balance: number; tier: LoyaltyTier; next: { tier: LoyaltyTier; remaining: number } | null } | null;
  postPurchase: { config: GamificationConfig; alreadySpun: boolean } | null;
}

/** Order page: points from this order, the balance, and the one free spin for a code for next time. */
export function OrderRewardsPanel({ rewards, storeSlug, orderId, currency, colors }: { rewards: OrderRewards; storeSlug: string; orderId: string; currency: string; colors: GameColors }) {
  const [open, setOpen] = useState(false);
  const [spun, setSpun] = useState(rewards.postPurchase?.alreadySpun ?? false);
  const loyalty = rewards.loyalty;
  const money = (n: number) => formatStoreMoney(n, currency);
  if (!loyalty && !rewards.postPurchase) return null;
  return (
    <section aria-labelledby={`rewards-${orderId}`} className="grid gap-3 rounded-[18px] border p-5" style={{ borderColor: colors.border, background: colors.paper }}>
      <h2 id={`rewards-${orderId}`} className="m-0 flex items-center gap-2 text-[18px] font-semibold" style={{ fontFamily: colors.heading }}>
        <Icon name="sparkle" size={17} /> Your rewards
      </h2>
      {loyalty ? (
        <div className="grid gap-1 text-[14.5px] leading-6">
          {loyalty.earned > 0 ? <p className="m-0">You earned <strong>{loyalty.earned.toLocaleString("en-NG")} points</strong> on this order.</p> : null}
          {loyalty.pending > 0 ? <p className="m-0">You&apos;ll earn <strong>{loyalty.pending.toLocaleString("en-NG")} points</strong> once this order is paid.</p> : null}
          {loyalty.used > 0 ? <p className="m-0">You used {loyalty.used.toLocaleString("en-NG")} points ({money(loyalty.usedValue)} off).</p> : null}
          <p className="m-0" style={{ color: colors.muted }}>
            Balance: {loyalty.balance.toLocaleString("en-NG")} points · {TIER_NAMES[loyalty.tier]}
            {loyalty.next ? ` · ${loyalty.next.remaining.toLocaleString("en-NG")} more to ${TIER_NAMES[loyalty.next.tier]}` : ""}
          </p>
        </div>
      ) : null}
      {rewards.postPurchase ? (
        spun ? (
          <p className="m-0 text-[14px]" style={{ color: colors.muted }}>You&apos;ve had your spin for this order. Any code you won is saved for your next visit on this device.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="m-0 min-w-0 flex-1 text-[14.5px]">{rewards.postPurchase.config.postPurchase.headline}: one free spin for a code on your next order.</p>
            <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-[15px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: colors.cta, color: colors.ctaText }}>
              <Icon name="sparkle" size={15} /> Spin now
            </button>
          </div>
        )
      ) : null}
      {open && rewards.postPurchase ? (
        <Suspense fallback={null}>
          <GameDialog
            game="post_purchase"
            storeSlug={storeSlug}
            currency={currency}
            config={rewards.postPurchase.config}
            colors={colors}
            orderId={orderId}
            onPlayed={() => setSpun(true)}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
