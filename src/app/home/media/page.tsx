import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { getT } from "@/lib/i18n/server";
import { MediaManager } from "./MediaManager";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("media");
  return { title: t("page.title") };
}

// The seller's media library as a page: everything uploaded or already used in the store (/api/app/media), with
// a title and alt text per picture, copy link, and remove (hides it; files in use keep working).
export default async function MediaPage() {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("media");
  const workspace = await getSellerWorkspace(user.id);
  return (
    <SellerPage user={user} store={storeSummary(workspace?.store ?? null)} title={t("page.title")} sub={t("page.sub")}>
      <PageTip className="mb-5">{tipT("media")}</PageTip>
      <MediaManager />
    </SellerPage>
  );
}
