import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, EmptyState, ListCard, ListRow, Pill, PillLink } from "@/components/app-kit";
import { formatDate, humanize } from "@/components/growth/kit";
import { listTemplates } from "@/lib/marketing/templates";
import { TemplateCopyButton } from "./TemplateCopyButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email templates" };

export default async function TemplatesPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const templates = store ? await listTemplates(store.id) : { saved: [], library: [] };

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Email templates"
      sub="Layouts you reuse in campaigns and automations. They pick up your logo and colours from the brand kit."
      actions={
        <>
          <PillLink href="/home/brand-kit" icon="palette">Brand kit</PillLink>
          <PillLink href="/home/marketing/templates/new" tone="accent" icon="plus">New template</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <section className="grid gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Your templates</h2>
          {templates.saved.length ? (
            <ListCard>
              {templates.saved.map((template) => (
                <ListRow key={template.id} href={`/home/marketing/templates/${template.id}`}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-app-canvas text-[16px] font-extrabold">{template.name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 basis-[200px]">
                    <span className="block truncate text-[15px] font-extrabold">{template.name}</span>
                    <span className="block truncate text-[13px] text-app-ink-soft">{template.subject}</span>
                  </span>
                  <Pill tone="muted">{humanize(template.category)}</Pill>
                  <span className="text-[13px] text-app-ink-soft sm:w-[120px]">Edited {formatDate(template.updatedAt)}</span>
                  <span className="text-[13px] font-extrabold text-app-accent-ink">Edit</span>
                </ListRow>
              ))}
            </ListCard>
          ) : (
            <EmptyState icon="mail" title="No saved templates yet">Start from one below, or make your own. Saved templates show up when you write a campaign.</EmptyState>
          )}
        </section>

        <section className="grid gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Starter templates</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {templates.library.map((template) => (
              <Card key={template.key} as="article" className="flex flex-col gap-2 p-5">
                <CardHead title={template.name} action={<Pill tone="muted">{humanize(template.category)}</Pill>} />
                <p className="m-0 text-[14px] text-app-ink-soft">{template.subject}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <PillLink href={`/home/marketing/campaigns/new?template=${template.key}`} size="sm" tone="ink">Use in a campaign</PillLink>
                  <TemplateCopyButton templateKey={template.key} />
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </SellerPage>
  );
}
