import { requireRole } from "@/lib/server-auth";
import { getLogisticsPartnerForUser } from "@/lib/role-queries";
import { myDetails } from "@/lib/my-details.server";
import { MyDetailsForm } from "@/components/profile/MyDetailsForm";
import { PartnerPage } from "@/components/logistics/kit";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getT("details"))("title") };
}

// My details for delivery partners: their name, email and phone, and the company's name, phone, base address, city
// and state (src/components/profile/MyDetailsForm.tsx; the same form for sellers and suppliers).
export default async function LogisticsDetailsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const t = await getT("details");
  const [partner, details] = await Promise.all([getLogisticsPartnerForUser(user), myDetails(user)]);
  return (
    <PartnerPage frame={{ user, partner }} title={t("title")} sub={t("sub")}>
      <div className="w-full">
        <MyDetailsForm initial={details} />
      </div>
    </PartnerPage>
  );
}
