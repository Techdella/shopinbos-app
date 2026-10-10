import { redirect } from "next/navigation";
import { RexAIBuilder } from "@/components/builder/RexAIBuilder";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function BuilderRexPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  if (!workspace?.store) {
    redirect("/onboarding?role=seller");
  }

  return <RexAIBuilder />;
}
