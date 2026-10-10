import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";

export default async function AdminCatalogRedirectPage() {
  await requireRole(["admin"], "/admin/login");
  redirect("/admin/supplier-products");
}
