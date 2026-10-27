import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { getSellerWorkspace } from "@/lib/workspace";
import { listCollections } from "@/lib/cms/server";
import { getT } from "@/lib/i18n/server";
import { PlanClient } from "./PlanClient";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("cms");
  return { title: t("plan.title") };
}

// Content › Plan with Rex: Rex plans dated ideas for the store's collections and social channels; each idea
// becomes a draft (a collection item, or a social post draft) with one tap.
export default async function ContentPlanPage() {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("cms");
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store ?? null;
  if (!store) redirect("/home/cms");
  const collections = await listCollections(store.id);
  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("plan.title")}
      sub={t("plan.sub")}
      actions={
        <>
          <PillLink href="/home/cms" icon="arrowLeft" iconOnlyOnPhone>{t("col.allContent")}</PillLink>
          <PillLink href="/home/marketing/social" icon="megaphone">{t("plan.socialPlanner")}</PillLink>
        </>
      }
    >
      <PageTip className="mb-5">{tipT("cms.plan")}</PageTip>
      <PlanClient storeId={store.id} collections={collections.map((collection) => ({ id: collection.id, name: collection.name, itemLabel: collection.itemLabel }))} />
    </SellerPage>
  );
}
