import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server-auth";
import { portalDashboardPath } from "@/lib/portal-routes";
import { registrationPage } from "@/lib/business-registration/service.server";

export const dynamic = "force-dynamic";

// The link in the "you can now register with CAC" email: sends each account to its own portal's
// register-business page (sellers /home, suppliers /supplier, delivery partners /logistics).
export default async function RegisterBusinessRedirect() {
  const user = await requireUser("/login");
  redirect(["seller", "supplier", "logistics_partner"].includes(user.role) ? registrationPage(user.role) : portalDashboardPath(user.role));
}
