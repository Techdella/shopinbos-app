import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";

export default async function SellerStorePreviewPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { slug: true } });
  redirect(store ? `/s/${store.slug}/preview` : "/builder?firstRun=1");
}
