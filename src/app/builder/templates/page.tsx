import { redirect } from "next/navigation";
import { TemplateGallery } from "@/components/builder/TemplateGallery";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function BuilderTemplatesPage() {
  const user = await requireRole(["seller"], "/login");

  const workspace = await getSellerWorkspace(user.id);

  if (!workspace?.store) {
    redirect("/onboarding?role=seller");
  }

  return (
    <TemplateGallery
      currentTemplateId={workspace.settings.template?.templateId}
      storeName={workspace.store.name}
      initialCategory={workspace.settings.onboardingMemory?.category}
    />
  );
}
