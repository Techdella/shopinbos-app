"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { progressMessage, rewardProgress, type ProgressTier } from "@/lib/gamification/logic";
import type { GameColors } from "./client";

// "Add ₦4,500 more for free delivery": one bar for free delivery (from the seller's delivery settings) and
// the seller's reward tiers, with a marker per milestone, a smooth fill, and a short celebration when one
// unlocks. Used by the quick bag, the bag page, checkout and the builder's Reward progress section.

export interface RewardProgressProps {
  subtotal: number;
  freeDeliveryOver: number | null | undefined;
  tiers: ProgressTier[];
  currency: string;
  colors: Pick<GameColors, "ink" | "muted" | "border" | "cta" | "card">;
  giftNames?: Record<string, string>;
  /** Shows "Add your free gift" once a gift tier is unlocked and the gift isn't in the bag. */
  onAddGift?: (productId: string) => void;
  giftInBag?: (productId: string) => boolean;
  compact?: boolean;
}

export function RewardProgress({ subtotal, freeDeliveryOver, tiers, currency, colors, giftNames = {}, onAddGift, giftInBag, compact = false }: RewardProgressProps) {
  const money = (n: number) => formatStoreMoney(n, currency);
  const state = rewardProgress(subtotal, freeDeliveryOver, tiers, giftNames, money);
  const reachedCount = state?.reachedCount ?? 0;
  const previous = useRef<number | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    // Only celebrate a milestone reached while the shopper is here, not on first paint.
    if (previous.current !== null && reachedCount > previous.current) {
      const latest = [...state.milestones].reverse().find((entry) => entry.reached);
      setCelebrate(latest ? latest.label : null);
      const timer = window.setTimeout(() => setCelebrate(null), 3200);
      previous.current = reachedCount;
      return () => window.clearTimeout(timer);
    }
    previous.current = reachedCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachedCount]);

  if (!state) return null;
  const message = progressMessage(state, money);
  const gift = state.milestones.find((entry) => entry.reached && entry.kind === "free_gift" && entry.productId && !giftInBag?.(entry.productId));

  return (
    <div className={`grid ${compact ? "gap-1.5" : "gap-2"}`}>
      <p className={`m-0 flex items-center gap-1.5 ${compact ? "text-[13.5px]" : "text-[14px]"}`} aria-live="polite">
        {celebrate ? (
          <span className="inline-flex items-center gap-1 font-semibold motion-safe:animate-[sib-pop_400ms_ease-out]">
            <Icon name="sparkle" size={14} /> Unlocked: {celebrate}!
          </span>
        ) : (
          <span>
            {state.next ? <><strong>{message.lead}</strong>{message.rest}.</> : <>{message.lead}<strong>{message.rest}</strong>.</>}
          </span>
        )}
      </p>
      <style>{`@keyframes sib-pop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.06);opacity:1}100%{transform:scale(1)}}`}</style>
      <div className="relative pb-0.5">
        <div
          role="progressbar"
          aria-label={state.next ? `Progress to ${state.next.label.toLowerCase()}` : "All rewards unlocked"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={state.percent}
          aria-valuetext={state.next ? `${money(state.next.remaining)} to go` : "Done"}
          className="h-2 w-full overflow-hidden rounded-full"
          style={{ background: colors.border }}
        >
          <div className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${state.percent}%`, background: colors.cta }} />
        </div>
        {state.milestones.length > 1 || state.milestones[0]!.position < 100 ? (
          state.milestones.map((entry) => (
            <span
              key={entry.id}
              aria-hidden
              className="absolute top-1/2 grid h-4 w-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2"
              style={{ left: `${Math.min(97, Math.max(3, entry.position))}%`, background: entry.reached ? colors.cta : colors.card, borderColor: entry.reached ? colors.cta : colors.border }}
            />
          ))
        ) : null}
      </div>
      {!compact && state.milestones.length > 1 ? (
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12.5px]" style={{ color: colors.muted }}>
          {state.milestones.map((entry) => (
            <li key={entry.id} className="inline-flex items-center gap-1" style={entry.reached ? { color: colors.ink, fontWeight: 600 } : undefined}>
              <Icon name={entry.reached ? "checkCircle" : entry.kind === "free_delivery" ? "truck" : "sparkle"} size={12} /> {entry.label} · {money(entry.threshold)}
            </li>
          ))}
        </ul>
      ) : null}
      {gift && onAddGift ? (
        <button type="button" onClick={() => onAddGift(gift.productId!)} className="inline-flex min-h-10 items-center justify-center gap-1.5 justify-self-start rounded-full border px-4 text-[13.5px] font-semibold focus-visible:outline focus-visible:outline-2" style={{ borderColor: colors.ink }}>
          <Icon name="plus" size={13} /> Add your {gift.label.toLowerCase().startsWith("free ") ? gift.label.slice(5) : "free gift"}
        </button>
      ) : null}
    </div>
  );
}
