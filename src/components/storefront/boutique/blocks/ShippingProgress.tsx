"use client";

import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/hooks/useCart";
import { freeDeliveryEverywhereOver } from "@/lib/storefront/shopper-info";
import { fillAmount, freeShippingThreshold, shippingProgress, str } from "./block-logic";
import { money, type BlockContext } from "./shared";

/**
 * Free-delivery bar: how far the shopper's bag is from free delivery. The amount comes from the store's delivery
 * settings when every delivery zone has one (so the promise matches checkout), else from the amount typed in the block.
 */
export function ShippingProgress({ ctx }: { ctx: BlockContext }) {
  const { copy, look, shopper, store } = ctx;
  const t = look.tokens;
  const cart = useCart(store.slug);
  const threshold = freeShippingThreshold(freeDeliveryEverywhereOver(shopper.delivery), copy.amount);
  if (!threshold) return ctx.editorHint("Set a free-delivery amount in your delivery settings, or type one in the panel on the right.");
  const subtotal = ctx.live ? cart.subtotal : Math.round(threshold.amount * 0.6);
  const state = shippingProgress(subtotal, threshold.amount)!;
  const format = (amount: number) => money(amount, store.currency);
  const message = state.reached
    ? str(copy.doneText) || "You've unlocked free delivery"
    : subtotal > 0
      ? fillAmount(str(copy.progressText) || "You're {amount} away from free delivery", format(state.remaining))
      : fillAmount(str(copy.emptyText) || "Free delivery on orders over {amount}", format(threshold.amount));
  return (
    <section aria-label="Free delivery" className="bq-wrap py-5">
      <div className="mx-auto max-w-[720px] rounded-[14px] px-4 py-3.5" style={{ background: look.raised, borderRadius: Math.max(look.cardRadius, 8) }}>
        <p className="m-0 flex items-center gap-2 text-[14px] font-semibold" role="status" aria-live="polite" style={{ color: t.ink }}>
          <Icon name={state.reached ? "checkCircle" : "truck"} size={17} /> {message}
        </p>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full" style={{ background: `${t.ink}1A` }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent} aria-label="Progress to free delivery">
          <div className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${state.percent}%`, background: state.reached ? "#2E7E78" : t.accent }} />
        </div>
        {ctx.editor ? (
          <p className="m-0 mt-2 text-[12px]" style={{ color: t.muted }}>
            {ctx.say("Preview with a sample bag.")} {threshold.source === "store" ? ctx.say("The amount comes from your delivery settings.") : ctx.say("Add the same free-delivery amount to your delivery settings so checkout charges match.")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
