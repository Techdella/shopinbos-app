import { requireRole } from "@/lib/server-auth";
import { getSupplierForUser } from "@/lib/role-queries";
import { myDetails } from "@/lib/my-details.server";
import { MyDetailsForm } from "@/components/profile/MyDetailsForm";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getT("details"))("title") };
}

// My details for suppliers: their name, email and phone, and the business's name, phone, pickup address, city and
// state (src/components/profile/MyDetailsForm.tsx; the same form for sellers and delivery partners).
export default async function SupplierDetailsPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const t = await getT("details");
  const [supplier, details] = await Promise.all([getSupplierForUser(user), myDetails(user)]);
  return (
    <AppPage frame={supplierFrame(user, supplier)} title={t("title")} sub={t("sub")}>
      <div className="w-full">
        <MyDetailsForm initial={details} />
      </div>
    </AppPage>
  );
}
