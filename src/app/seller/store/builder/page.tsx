import { redirect } from "next/navigation";
import { StoreEditor } from "@/components/builder/StoreEditor";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function SellerStoreBuilderPage({
  searchParams,
}: {
  searchParams?: Promise<{ rex?: string }>;
}) {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const params = await searchParams;
  if (params?.rex === "1") redirect("/builder/rex");

  return <StoreEditor />;
}
