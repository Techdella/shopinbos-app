import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { TemplateEditor } from "./TemplateEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email template" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/onboarding");
  const template = id === "new" ? null : await db.emailTemplate.findFirst({ where: { id, storeId: store.id } });
  if (id !== "new" && !template) notFound();

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={template ? template.name : "New template"}
      sub="Write once, reuse in campaigns and automations."
      actions={<PillLink href="/home/marketing/templates" icon="arrowLeft">All templates</PillLink>}
    >
      <TemplateEditor initial={{ id: template?.id ?? null, name: template?.name ?? "", subject: template?.subject ?? "", bodyHtml: template?.bodyHtml ?? "", category: template?.category ?? "marketing" }} />
    </SellerPage>
  );
}
