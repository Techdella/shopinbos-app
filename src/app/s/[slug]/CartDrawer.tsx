"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { lineKey, type CartLine } from "@shared/cart-checkout";
import type { ProgressTier } from "@/lib/gamification/logic";
import { RewardProgress } from "@/components/storefront/gamification/RewardProgress";

// The quick bag every theme opens after "Add to bag": a sheet from the bottom on phones and a drawer from the
// right on bigger screens, with the full bag page and checkout one tap away.

export type CartItem = CartLine;

export interface CartHook {
  items: CartItem[];
  update: (id: string, qty: number, variant?: string) => void;
  remove: (id: string, variant?: string) => void;
  subtotal: number;
  count: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  cart: CartHook;
  storeBasePath: string;
  currency: string;
  accentColor: string;
  accentTextColor: string;
  /** Theme hint from the editor's cart section; "luxury" uses a warmer paper and serif heading. */
  variation?: string;
  deliveryEstimate?: string;
  freeDeliveryThreshold?: number;
  /** Reward tiers from Marketing > Rewards (readGameConfig(brandSettings).progress), shown on the same bar. */
  rewardTiers?: ProgressTier[];
  giftNames?: Record<string, string>;
}

const INK = "#16141F";
const MUTED = "#6E6E68";
const LINE = "rgba(22,20,31,0.1)";

export function CartDrawer({ open, onClose, cart, storeBasePath, currency, accentColor, accentTextColor, variation = "right-drawer", deliveryEstimate, freeDeliveryThreshold, rewardTiers = [], giftNames }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("button, a[href]")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>("button, a[href], input")].filter((el) => !el.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const luxury = variation === "luxury";
  const surface = luxury ? "#FAF7F1" : "#FFFFFF";
  const money = (amount: number) => formatStoreMoney(amount, currency);

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      <button type="button" aria-label="Close bag" tabIndex={-1} onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/40" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-[24px] shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[min(440px,100vw)] md:rounded-none md:rounded-l-[24px]"
        style={{ background: surface, color: INK, fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif" }}
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: LINE }}>
          <h2 id={titleId} className="text-[18px] font-semibold" style={luxury ? { fontFamily: "var(--bq-serif), 'Fraunces', Georgia, serif", fontWeight: 500 } : undefined}>
            Your bag <span style={{ color: MUTED }}>({cart.count})</span>
          </h2>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full focus-visible:outline focus-visible:outline-2" style={{ background: LINE }} aria-label="Close bag">
            <Icon name="x" size={16} />
          </button>
        </div>

        {cart.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full" style={{ background: LINE }}><Icon name="bag" size={22} /></span>
            <p className="text-[16px] font-medium">Your bag is empty</p>
            <button type="button" onClick={onClose} className="min-h-11 rounded-full px-5 text-[14px] font-semibold underline underline-offset-4">Continue shopping</button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {(freeDeliveryThreshold && freeDeliveryThreshold > 0) || rewardTiers.length ? (
                <div className="mb-3 rounded-[14px] px-3 py-2.5" style={{ background: LINE }}>
                  <RewardProgress compact subtotal={cart.subtotal} freeDeliveryOver={freeDeliveryThreshold} tiers={rewardTiers} giftNames={giftNames} currency={currency} colors={{ ink: INK, muted: MUTED, border: "#FFFFFF", cta: accentColor, card: "#FFFFFF" }} />
                </div>
              ) : null}
              <ul className="m-0 list-none divide-y p-0" style={{ borderColor: LINE }}>
                {cart.items.map((item) => (
                  <li key={lineKey(item)} className="flex gap-3 py-3.5" style={{ borderColor: LINE }}>
                    <span className="block h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[12px]" style={{ background: LINE }}>
                      {item.image ? <img src={item.image} alt="" width={72} height={72} loading="lazy" className="h-full w-full object-cover" /> : null}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-[14px] font-semibold">{item.name}</p>
                          {item.variant ? <p className="text-[12.5px]" style={{ color: MUTED }}>{item.variant}</p> : null}
                        </div>
                        <p className="shrink-0 text-[14px] font-semibold tabular-nums">{money(item.price * item.quantity)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center rounded-full border" style={{ borderColor: LINE }} role="group" aria-label={`Quantity of ${item.name}`}>
                          <button type="button" onClick={() => cart.update(item.productId, item.quantity - 1, item.variant)} className="grid h-9 w-9 place-items-center rounded-full focus-visible:outline focus-visible:outline-2" aria-label={item.quantity <= 1 ? `Remove ${item.name}` : `One less ${item.name}`}>
                            <Icon name={item.quantity <= 1 ? "trash" : "minus"} size={14} />
                          </button>
                          <span className="min-w-[24px] text-center text-[14px] font-semibold tabular-nums">{item.quantity}</span>
                          <button type="button" onClick={() => cart.update(item.productId, item.quantity + 1, item.variant)} disabled={typeof item.maxQuantity === "number" && item.quantity >= item.maxQuantity} className="grid h-9 w-9 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 disabled:opacity-30" aria-label={`One more ${item.name}`}>
                            <Icon name="plus" size={14} />
                          </button>
                        </div>
                        <button type="button" onClick={() => cart.remove(item.productId, item.variant)} className="ml-auto min-h-9 px-1 text-[13px] font-medium underline-offset-4 hover:underline" style={{ color: MUTED }} aria-label={`Remove ${item.name} from your bag`}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {deliveryEstimate ? <p className="mt-2 text-[13px]" style={{ color: MUTED }}>Estimated delivery: {deliveryEstimate}</p> : null}
            </div>

            <div className="grid gap-2.5 border-t px-5 pt-4" style={{ borderColor: LINE, paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}>
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] font-medium">Subtotal</span>
                <span className="text-[18px] font-semibold tabular-nums">{money(cart.subtotal)}</span>
              </div>
              <p className="text-[12.5px]" style={{ color: MUTED }}>Delivery and discounts are worked out at checkout.</p>
              <Link
                href={getPublicStorefrontPath(storeBasePath, "/checkout")}
                onClick={onClose}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[16px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ background: accentColor, color: accentTextColor }}
              >
                <Icon name="lock" size={15} /> Checkout
              </Link>
              <Link
                href={getPublicStorefrontPath(storeBasePath, "/cart")}
                onClick={onClose}
                className="inline-flex min-h-11 items-center justify-center rounded-full border px-6 text-[14.5px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ borderColor: LINE }}
              >
                View bag
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
