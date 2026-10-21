"use client";

import { Icon, type IconName } from "@/components/ui/Icon";
import { deliveryLines, freeDeliveryPromise, whatsappLink, type StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import { str } from "./block-logic";
import type { BlockContext } from "./shared";

const ICONS: IconName[] = ["truck", "card", "lock", "whatsapp", "refresh", "star", "shield", "clock", "package", "leaf", "heart", "check"];

/** A badge's text: what the seller wrote, else (for delivery, payment and chat badges) what their settings say. */
export function trustText(item: Record<string, unknown>, shopper: StorefrontShopperInfo, currency: string) {
  const written = str(item.text);
  if (written) return written;
  if (item.source === "delivery") {
    const promise = freeDeliveryPromise(shopper.delivery);
    if (promise) return promise;
    const line = deliveryLines(shopper, currency)[0];
    return line ? `${line.place}: ${line.detail}` : "";
  }
  if (item.source === "payment") {
    if (shopper.payOnDelivery) return shopper.paymentLabels.length > 1 ? "Pay online or on delivery" : "Pay on delivery";
    return shopper.paymentLabels.length ? shopper.paymentLabels.join(", ") : "";
  }
  if (item.source === "whatsapp") return shopper.whatsappNumber ? "Quick answers on WhatsApp" : "";
  return "";
}

/** Trust badges: icons with short promises in a row (or cards), filled from the seller's real settings when blank. */
export function TrustBadges({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, items, look, shopper, store, headingId } = ctx;
  const t = look.tokens;
  const badges = items
    .map((item, index) => {
      const icon = ICONS.includes(item.icon as IconName) ? (item.icon as IconName) : "check";
      const body = trustText(item, shopper, store.currency);
      const sourced = typeof item.source === "string" && !str(item.text);
      return { key: index, icon, title: str(item.title), body, missing: sourced && !body, whatsapp: item.source === "whatsapp" && !str(item.text) };
    })
    .filter((badge) => (badge.title || badge.body) && (!badge.missing || ctx.editor));
  if (!badges.length) return ctx.editorHint("Add badges in the panel on the right.");
  const cards = settings.style === "cards";
  // Centred tiles with the icon above the words: on light panels ("tiles", Èso) or on the ink colour ("dark", Ẹ̀rín).
  const tiles = settings.style === "tiles" || settings.style === "dark";
  const dark = settings.style === "dark";
  const title = str(copy.title);
  return (
    <section aria-labelledby={title ? headingId : undefined} aria-label={title ? undefined : "Why shop with us"} className="bq-wrap py-8">
      {title ? <h2 id={headingId} className={`bq-h text-center ${tiles ? "mb-8 text-[30px] @3xl:text-[38px]" : "mb-5 text-[24px]"}`} style={look.headingStyle}>{title}</h2> : null}
      <ul className="m-0 grid list-none gap-3 p-0" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${tiles ? 210 : cards ? 200 : 160}px, 1fr))`, gap: tiles ? 20 : undefined }}>
        {badges.map((badge) => {
          const content = (
            <>
              <span className={`grid shrink-0 place-items-center rounded-full ${tiles ? "h-16 w-16" : "h-11 w-11"}`} style={dark ? { border: `2px solid ${t.paperBg}`, color: t.paperBg } : tiles ? { background: t.accent, color: look.onAccent } : { background: `${t.accent}1F`, color: t.ink }} aria-hidden><Icon name={badge.icon} size={tiles ? 26 : 20} /></span>
              <span className="min-w-0">
                {badge.title ? <span className={`block font-semibold ${tiles ? "text-[16px]" : "text-[14.5px]"}`}>{badge.title}</span> : null}
                {badge.body ? <span className="mt-0.5 block text-[13px] leading-5" style={{ color: dark ? t.paperBg : t.muted, opacity: dark ? 0.8 : 1 }}>{badge.body}</span> : null}
                {badge.missing ? <span className="mt-0.5 block text-[12px]" style={{ color: dark ? t.paperBg : t.muted, opacity: dark ? 0.75 : 1 }}>Fills in from your settings. Hidden from shoppers until set up.</span> : null}
              </span>
            </>
          );
          const style = tiles
            ? { color: dark ? t.paperBg : t.ink, background: dark ? t.ink : look.raised, borderRadius: look.cardRadius, padding: "30px 20px" }
            : { color: t.ink, ...(cards ? { background: look.raised, borderRadius: look.cardRadius, padding: 18 } : { padding: "6px 0" }) };
          const layout = tiles ? "flex-col justify-center gap-4 text-center" : `items-center gap-3 ${cards ? "" : "@3xl:justify-center"}`;
          return (
            <li key={badge.key} className={cards || tiles ? "" : "@3xl:justify-center"} style={{ display: "flex" }}>
              {badge.whatsapp && shopper.whatsappNumber && ctx.live
                ? <a href={whatsappLink(shopper.whatsappNumber, `Hi ${store.name}`)} target="_blank" rel="noopener noreferrer" className={`flex w-full items-center ${layout}`} style={style}>{content}</a>
                : <div className={`flex w-full items-center ${layout}`} style={{ ...style, opacity: badge.missing ? 0.55 : 1 }}>{content}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
