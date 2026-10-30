"use client";

import { useT } from "@/components/i18n/I18nProvider";
import { Icon } from "@/components/ui/Icon";
import { needsOptions } from "../../shopper/catalog";
import { CampaignBadges } from "../../campaign/CampaignBadges";
import { percentOff, str } from "./block-logic";
import { pickedProductIds } from "./ProductCarousel";
import { money, quickAdd, type BlockContext, words } from "./shared";
import { SectionCountdown } from "./campaign-timer";

/** Featured deal: one product in the spotlight (the picked one, else the biggest discount) with a countdown and add to bag. */
export function CampaignFeaturedDeal({ ctx }: { ctx: BlockContext }) {
  const t = useT("campaigns");
  const { copy, look, headingId, products } = ctx;
  const picked = pickedProductIds(ctx.items)[0];
  const product =
    products.find((entry) => entry.id === picked) ??
    [...products].filter((entry) => percentOff(entry) !== null).sort((a, b) => (percentOff(b) ?? 0) - (percentOff(a) ?? 0))[0] ??
    null;
  if (!product) return ctx.editorHint(t("section.featuredHint"));
  const was = product.compareAtPrice && product.compareAtPrice > product.retailPrice ? product.compareAtPrice : null;
  const title = str(copy.title) || product.name;
  const cta = str(copy.cta) || t("section.addToBag");
  const href = ctx.productHref(product.id);
  const tokens = look.tokens;
  return (
    <section aria-labelledby={headingId} className="bq-wrap py-10">
      <div className="grid overflow-hidden @3xl:grid-cols-2" style={{ background: tokens.cardBg, borderRadius: look.cardRadius, border: `1px solid ${tokens.border}` }}>
        <div className="relative" style={{ background: look.placeholder, aspectRatio: "4 / 5", maxHeight: 560 }}>
          {product.images[0] ? <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
          <CampaignBadges productId={product.id} size="md" />
        </div>
        <div className="flex flex-col justify-center gap-3 p-6 @3xl:p-10" style={{ color: tokens.ink }}>
          {str(copy.eyebrow) ? <p className="m-0 text-[12px] font-bold uppercase" style={{ letterSpacing: "0.2em", color: tokens.accent, fontFamily: look.eyebrowFont }}>{words(ctx, "eyebrow")}</p> : null}
          <h2 id={headingId} className="bq-h m-0" style={{ ...look.headingStyle, fontSize: "clamp(26px, 4cqi, 44px)", lineHeight: 1.08 }}>{words(ctx, "title", title)}</h2>
          {str(copy.body) ? <p className="m-0 text-[15px] leading-7" style={{ color: tokens.muted }}>{words(ctx, "body")}</p> : null}
          <p className="m-0 flex items-baseline gap-3">
            <span className="text-[24px] font-bold">{money(product.retailPrice, product.currency)}</span>
            {was ? <span className="text-[16px] line-through" style={{ color: tokens.muted }}><span className="sr-only">{t("section.was")} </span>{money(was, product.currency)}</span> : null}
          </p>
          <SectionCountdown ctx={ctx} className="block" look={{ style: "boxed", format: "dhms", color: tokens.ink, boxBackground: tokens.paperBg, boxBorder: tokens.border }} />
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              className="bq-btn"
              style={{ ...look.solidButton, minHeight: 48, padding: "0 26px" }}
              disabled={!ctx.live}
              onClick={() => quickAdd(ctx, product)}
            >
              <Icon name="bag" size={16} /> {needsOptions(product) ? t("section.chooseOptions") : cta}
            </button>
            {href ? <a href={href} className="bq-btn" style={{ ...look.secondaryButton, minHeight: 48, padding: "0 22px" }}>{t("section.seeDetails")}</a> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
