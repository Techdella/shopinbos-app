import { redirect } from "next/navigation";
import { ChipBuilder } from "@/components/builder/ChipBuilder";
import { requireRole } from "@/lib/server-auth";
import { getTemplateManifest } from "@/lib/store-templates";
import { getSellerWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function BuilderPage({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string; firstRun?: string }>;
}) {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const params = await searchParams;

  if (!workspace?.store) {
    redirect("/onboarding?role=seller");
  }

  if (!workspace.settings.template?.templateId && params?.mode !== "rex") {
    redirect("/builder/templates?next=/builder");
  }
  const selectedManifest = workspace.settings.template?.templateId
    ? getTemplateManifest(workspace.settings.template.templateId)
    : null;

  return (
    <ChipBuilder
      userName={user.name}
      selectedTemplate={workspace.settings.template ? {
        templateId: workspace.settings.template.templateId,
        templateName: workspace.settings.template.templateName,
        layoutFamily: selectedManifest?.layoutFamily ?? workspace.settings.template.layoutFamily,
        category: selectedManifest?.category ?? workspace.settings.template.category,
        sourcePack: selectedManifest?.sourcePack ?? workspace.settings.template.sourcePack,
        sourcePath: selectedManifest?.sourcePath,
        supportedPages: selectedManifest?.supportedPages,
        aiHints: selectedManifest?.aiHints,
      } : null}
      existingStore={workspace?.store ? {
        name: workspace.store.name,
        slug: workspace.store.slug,
        description: workspace.store.description,
      } : null}
      onboardingMemory={workspace.settings.onboardingMemory ?? null}
      initialPhase={params?.mode === "rex" ? "products" : undefined}
    />
  );
}
