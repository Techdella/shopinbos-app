import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { readPreheader, withPreheader } from "@/lib/marketing/blocks";
import { MARKETING_STORE_SELECT, emailBrand } from "@/lib/marketing/brand";
import { previewShopFor } from "@/lib/email/compliance.server";
import { TEMPLATE_LIBRARY } from "@/lib/marketing/template-library";
import { TemplateEditor } from "./TemplateEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email template" };

// /home/marketing/templates/new (blank, or ?from=<starter key> to start from a starter without saving a copy
// first) and /home/marketing/templates/<id>.
export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: MARKETING_STORE_SELECT });
  if (!store) redirect("/onboarding");
  const template = id === "new" ? null : await db.emailTemplate.findFirst({ where: { id, storeId: store.id } });
  if (id !== "new" && !template) notFound();
  const starter = !template && query.from ? TEMPLATE_LIBRARY.find((t) => t.key === query.from) : undefined;
  const bodyHtml = template?.bodyHtml ?? (starter ? withPreheader(starter.bodyHtml, starter.preheader) : "");

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={template ? template.name : starter ? `New: ${starter.name}` : "New template"}
      sub="Build it once with blocks or HTML, then reuse it in campaigns and automations."
      actions={<PillLink href="/home/marketing/templates" icon="arrowLeft">All templates</PillLink>}
    >
      <TemplateEditor
        initial={{
          id: template?.id ?? null,
          name: template?.name ?? starter?.name ?? "",
          subject: template?.subject ?? starter?.subject ?? "",
          preheader: readPreheader(bodyHtml),
          bodyHtml,
          category: template?.category ?? starter?.category ?? "newsletter",
        }}
        brand={emailBrand(store)}
        shop={previewShopFor(store)}
      />
    </SellerPage>
  );
}
