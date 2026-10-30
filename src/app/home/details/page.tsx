import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { myDetails } from "@/lib/my-details.server";
import { MyDetailsForm } from "@/components/profile/MyDetailsForm";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getT("details"))("title") };
}

// My details for sellers: their name, email and phone, and the shop's name, phone and address
// (src/components/profile/MyDetailsForm.tsx; the same form for suppliers and delivery partners).
export default async function SellerDetailsPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("details");
  const [workspace, details] = await Promise.all([getSellerWorkspace(user.id), myDetails(user)]);
  return (
    <SellerPage user={user} store={storeSummary(workspace?.store ?? null)} title={t("title")} sub={t("sub")}>
      <div className="w-full">
        <MyDetailsForm initial={details} />
      </div>
    </SellerPage>
  );
}
