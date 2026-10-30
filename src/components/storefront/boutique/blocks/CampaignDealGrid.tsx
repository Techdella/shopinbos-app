"use client";

import { useT } from "@/components/i18n/I18nProvider";
import { CampaignContext, useStoreCampaigns } from "../../campaign/CampaignContext";
import { SectionTitle } from "../BoutiqueChrome";
import { boolSetting, intSetting, str } from "./block-logic";
import { sourcedProducts } from "./ProductCarousel";
import { BlockProductCard, type BlockContext, words } from "./shared";

/**
 * Deal grid: sale products (or a collection, or picked ones) in a grid with was and now prices and the campaign's
 * badges, two across on phones.
 */
export function CampaignDealGrid({ ctx }: { ctx: BlockContext }) {
  const t = useT("campaigns");
  const { copy, settings, look, headingId } = ctx;
  const campaigns = useStoreCampaigns();
  const list = sourcedProducts(ctx, intSetting(settings.limit, 2, 24, 8));
  if (!list.length) return ctx.editorHint(t("section.dealsHint"));
  const title = str(copy.title) || t("section.dealsTitle");
  const cta = str(copy.cta);
  const grid = (
    <section aria-labelledby={headingId} className="bq-wrap py-10">
      <style>{`.bqb-deals{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}@container bq (min-width:760px){.bqb-deals{grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}}`}</style>
      <SectionTitle
        look={look}
        id={headingId}
        action={cta ? <button type="button" onClick={() => ctx.go("products")} className="border-0 bg-transparent p-0 text-[14px] font-semibold underline underline-offset-4" style={{ color: look.tokens.ink, cursor: "pointer" }}>{words(ctx, "cta", cta)}</button> : undefined}
      >
        {words(ctx, "title", title)}
      </SectionTitle>
      <ul className="bqb-deals m-0 list-none p-0">
        {list.map((product, index) => (
          <li key={product.id} className="min-w-0">
            <BlockProductCard ctx={ctx} product={product} eager={index < 2} rating={false} add />
          </li>
        ))}
      </ul>
    </section>
  );
  // "Show campaign badges" off: the same grid without them.
  if (campaigns && !boolSetting(settings.showBadges, true)) {
    return <CampaignContext.Provider value={{ ...campaigns, view: { ...campaigns.view, badges: {} } }}>{grid}</CampaignContext.Provider>;
  }
  return grid;
}
