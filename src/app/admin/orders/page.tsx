import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";

export default async function AdminOrdersLegacyPage() {
  await requireRole(["admin"], "/admin/login");
  redirect("/admin/dashboard");
}
