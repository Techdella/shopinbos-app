import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";

export default async function AdminLogisticsRedirectPage() {
  await requireRole(["admin"], "/admin/login");
  redirect("/admin/logistics-partners");
}
