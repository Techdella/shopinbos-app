import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, PillLink } from "@/components/app-kit";
import { formatDate } from "@/components/growth/kit";
import { MARKETING_STORE_SELECT, emailBrand } from "@/lib/marketing/brand";
import { previewShopFor } from "@/lib/email/compliance.server";
import { previewSubject, renderEmailPreview } from "@/lib/marketing/preview";
import { EMAIL_THEMES, EMAIL_THEME_INFO } from "@/lib/marketing/blocks";
import { TEMPLATE_CATEGORIES, TEMPLATE_FLOWS, TEMPLATE_SERIES } from "@/lib/marketing/template-library";
import { listTemplates } from "@/lib/marketing/templates";
import { TemplateGallery, type GallerySeries, type GalleryTemplate } from "./TemplateGallery";
import { getLocale, getT } from "@/lib/i18n/server";
import { durationText } from "../_kit/duration";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("emailBuilder");
  return { title: t("tpl.title") };
}

export default async function TemplatesPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("emailBuilder");
  const locale = await getLocale();
  const label = (category: string) => t.dynamic(`tplCat.${category}`, TEMPLATE_CATEGORIES[category as keyof typeof TEMPLATE_CATEGORIES] ?? category.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()));
  const store = await db.store.findUnique({ where: { userId: user.id }, select: MARKETING_STORE_SELECT });
  if (!store) redirect("/onboarding");
  const templates = await listTemplates(store.id);
  // Thumbnails are the real emails with this shop's logo and colours and a sample customer.
  const brand = emailBrand(store);
  const shop = previewShopFor(store);
  const render = (bodyHtml: string, preheader: string) => renderEmailPreview({ bodyHtml, preheader, brand, shop });

  const saved: GalleryTemplate[] = templates.saved.map((row) => ({
    id: row.id,
    saved: true,
    name: row.name,
    category: row.category,
    categoryLabel: label(row.category),
    description: t("tpl.edited", { date: formatDate(row.updatedAt, false, locale) }),
    subject: previewSubject(row.subject, shop),
    html: render(row.bodyHtml, row.preheader),
  }));
  const library: GalleryTemplate[] = templates.library.map((row) => ({
    id: row.key,
    saved: false,
    name: row.name,
    category: row.category,
    categoryLabel: label(row.category),
    flow: row.flow,
    style: row.style,
    styleLabel: t.dynamic(`theme.${row.style}`, EMAIL_THEME_INFO[row.style].label),
    description: row.description,
    subject: previewSubject(row.subject, shop),
    html: render(row.bodyHtml, row.preheader),
  }));
  // Ready-made series: their emails (in order) and when each one goes out.
  const series: GallerySeries[] = TEMPLATE_SERIES.map((s) => {
    let total = 0;
    return {
      key: s.key,
      name: s.name,
      description: s.description,
      flow: library.find((row) => row.id === s.steps[0].template)?.flow ?? "welcome",
      steps: s.steps.map((step) => {
        total += step.waitMinutes;
        return { templateId: step.template, when: total === 0 ? t("tpl.rightAway") : t("tpl.after", { time: durationText(total, t) }), code: Boolean(step.discount) };
      }),
    };
  });

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("tpl.title")}
      sub={t("tpl.sub")}
      actions={
        <>
          <PillLink href="/home/brand-kit" icon="palette">{t("tpl.brandKit")}</PillLink>
          <PillLink href="/home/marketing/templates/new" tone="accent" icon="plus">{t("tpl.new")}</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <AssistantNote action={<PillLink href="/home/marketing/templates/new" size="sm" tone="ink">{t("tpl.writeWithPeggy")}</PillLink>}>
          {t("tpl.peggyNote")}
        </AssistantNote>
        <TemplateGallery
          saved={saved}
          library={library}
          series={series}
          flows={Object.entries(TEMPLATE_FLOWS).map(([value, text]) => ({ value, label: t.dynamic(`tplFlow.${value}`, text) }))}
          styles={EMAIL_THEMES.map((value) => ({ value, label: t.dynamic(`theme.${value}`, EMAIL_THEME_INFO[value].label) }))}
        />
      </div>
    </SellerPage>
  );
}
