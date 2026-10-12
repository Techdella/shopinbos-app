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
import { formatMinutes } from "@/lib/marketing/flows";
import { TEMPLATE_CATEGORIES, TEMPLATE_FLOWS, TEMPLATE_SERIES } from "@/lib/marketing/template-library";
import { listTemplates } from "@/lib/marketing/templates";
import { TemplateGallery, type GallerySeries, type GalleryTemplate } from "./TemplateGallery";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email templates" };

const label = (category: string) => TEMPLATE_CATEGORIES[category as keyof typeof TEMPLATE_CATEGORIES] ?? category.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default async function TemplatesPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: MARKETING_STORE_SELECT });
  if (!store) redirect("/onboarding");
  const templates = await listTemplates(store.id);
  // Thumbnails are the real emails with this shop's logo and colours and a sample customer.
  const brand = emailBrand(store);
  const shop = previewShopFor(store);
  const render = (bodyHtml: string, preheader: string) => renderEmailPreview({ bodyHtml, preheader, brand, shop });

  const saved: GalleryTemplate[] = templates.saved.map((t) => ({
    id: t.id,
    saved: true,
    name: t.name,
    category: t.category,
    categoryLabel: label(t.category),
    description: `Edited ${formatDate(t.updatedAt)}`,
    subject: previewSubject(t.subject, shop),
    html: render(t.bodyHtml, t.preheader),
  }));
  const library: GalleryTemplate[] = templates.library.map((t) => ({
    id: t.key,
    saved: false,
    name: t.name,
    category: t.category,
    categoryLabel: label(t.category),
    flow: t.flow,
    style: t.style,
    styleLabel: EMAIL_THEME_INFO[t.style].label,
    description: t.description,
    subject: previewSubject(t.subject, shop),
    html: render(t.bodyHtml, t.preheader),
  }));
  // Ready-made series: their emails (in order) and when each one goes out.
  const series: GallerySeries[] = TEMPLATE_SERIES.map((s) => {
    let total = 0;
    return {
      key: s.key,
      name: s.name,
      description: s.description,
      flow: library.find((t) => t.id === s.steps[0].template)?.flow ?? "welcome",
      steps: s.steps.map((step, i) => {
        total += step.waitMinutes;
        return { templateId: step.template, when: total === 0 ? "Right away" : `After ${formatMinutes(total)}`, code: Boolean(step.discount) };
      }),
    };
  });

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Email templates"
      sub="Over 60 ready-made emails in your logo and colours, for every step from welcome to win-back. Preview one, use it in a campaign, make it your own, or switch on a whole series."
      actions={
        <>
          <PillLink href="/home/brand-kit" icon="palette">Brand kit</PillLink>
          <PillLink href="/home/marketing/templates/new" tone="accent" icon="plus">New template</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <AssistantNote action={<PillLink href="/home/marketing/templates/new" size="sm" tone="ink">Write one with Peggy</PillLink>}>
          Not sure where to start? Open a new template and tell Peggy what you need, like &ldquo;a Sallah flash sale with a countdown&rdquo; or &ldquo;the last email of my cart series&rdquo;. Rex can draft one for you in chat too.
        </AssistantNote>
        <TemplateGallery
          saved={saved}
          library={library}
          series={series}
          flows={Object.entries(TEMPLATE_FLOWS).map(([value, text]) => ({ value, label: text }))}
          styles={EMAIL_THEMES.map((value) => ({ value, label: EMAIL_THEME_INFO[value].label }))}
        />
      </div>
    </SellerPage>
  );
}
