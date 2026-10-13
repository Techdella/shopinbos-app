import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, PillLink } from "@/components/app-kit";
import { readDesign, readFields, readPopupConfig } from "@/lib/marketing/forms";
import { FormsManager, type ManagedForm } from "./FormsManager";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketing");
  return { title: t("reports.forms") };
}

export default async function FormsPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketing");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [rows, stats] = store
    ? await Promise.all([
        // Contact and enquiry forms live with form messages (/home/forms); this page is for growing the list.
        db.storeForm.findMany({ where: { storeId: store.id, OR: [{ isPopup: true }, { type: { in: ["newsletter", "lead", "waitlist", "popup"] } }] }, orderBy: { createdAt: "desc" }, take: 100 }),
        db.marketingFormStat.groupBy({ by: ["formId"], where: { storeId: store.id, day: { gte: since } }, _sum: { views: true, submissions: true } }),
      ])
    : [[], []];

  const forms: ManagedForm[] = rows.map((row) => {
    const stat = stats.find((s) => s.formId === row.id);
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      isPopup: row.isPopup,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      fields: readFields(row.fields),
      design: readDesign(row.design, row.name),
      config: readPopupConfig(row.popupConfig),
      views: stat?._sum.views ?? 0,
      signups: stat?._sum.submissions ?? 0,
    };
  });

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("reports.forms")}
      sub={t("forms.sub")}
      actions={
        <>
          <PillLink href="/home/marketing/subscribers" icon="users">{t("hub.stat.subscribers")}</PillLink>
          <PillLink href="/home/forms" icon="message">{t("forms.formMessages")}</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <FormsManager forms={forms} storeSlug={store?.slug ?? ""} />
        <AssistantNote>{t("forms.note")}</AssistantNote>
      </div>
    </SellerPage>
  );
}
