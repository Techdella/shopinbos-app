import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, PillLink } from "@/components/app-kit";
import { formatDate } from "@/components/growth/kit";
import { MARKETING_STORE_SELECT, emailBrand, storeUrl } from "@/lib/marketing/brand";
import { previewSubject, renderEmailPreview } from "@/lib/marketing/preview";
import { TEMPLATE_CATEGORIES } from "@/lib/marketing/template-library";
import { listTemplates } from "@/lib/marketing/templates";
import { TemplateGallery, type GalleryTemplate } from "./TemplateGallery";

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
  const shop = { name: store.name, url: storeUrl(store) };
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
    description: t.description,
    subject: previewSubject(t.subject, shop),
    html: render(t.bodyHtml, t.preheader),
  }));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Email templates"
      sub="Ready-made emails in your logo and colours. Preview one, then use it in a campaign or make it your own."
      actions={
        <>
          <PillLink href="/home/brand-kit" icon="palette">Brand kit</PillLink>
          <PillLink href="/home/marketing/templates/new" tone="accent" icon="plus">New template</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <AssistantNote action={<PillLink href="/home/marketing/templates/new" size="sm" tone="ink">Write one with Peggy</PillLink>}>
          Not sure where to start? Open a new template and tell Peggy what you need, like &ldquo;a Sallah sale email with my best sellers&rdquo;. Rex can draft one for you in chat too.
        </AssistantNote>
        <TemplateGallery saved={saved} library={library} categories={Object.entries(TEMPLATE_CATEGORIES).map(([value, text]) => ({ value, label: text }))} />
      </div>
    </SellerPage>
  );
}
