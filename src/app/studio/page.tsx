import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { aiConfigured } from "@/lib/ai/client";
import { isLiveStatus } from "@/lib/ai/rex/build-store";
import { summariseRexVersions } from "@/lib/ai/rex/studio-versions";
import { loadHealthFacts, settingsOf, studioDraft, studioStoreSelect, themeNameFor, versionsOf } from "@/lib/ai/rex/studio.server";
import { getCurrentTemplateMeta, parseEditorState } from "@/lib/store-templates";
import { loadShopperInfo } from "@/lib/storefront/shopper-info.server";
import { buildStorefrontOrigin, buildStorefrontUrl } from "@/lib/domains/storefront";
import { RexStudio } from "@/components/builder/rex/RexStudio";

// Rex Studio opens on a chat with Rex (pictures, logos, videos, store edits, copy, marketing via /api/ai/rex);
// the store preview opens beside it on demand. `?prompt=` prefills the composer, `?preview=1` opens the preview.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rex Studio" };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export default async function StudioPage({ searchParams }: { searchParams?: Promise<{ onboarding?: string; prompt?: string | string[]; preview?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: studioStoreSelect });
  if (!store) redirect("/onboarding?role=seller");
  const params = await searchParams;

  const settings = settingsOf(store) as Record<string, unknown>;
  const { draft, saved } = studioDraft(store);
  const published = parseEditorState(settings.editor).published ?? null;

  const products = await db.storeProduct
    .findMany({
      where: { storeId: store.id, status: "published" },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        name: true,
        description: true,
        images: true,
        retailPrice: true,
        compareAtPrice: true,
        currency: true,
        category: { select: { id: true, name: true, slug: true } },
      },
    })
    .catch(() => []);
  const [facts, shopper] = await Promise.all([loadHealthFacts(store, draft), loadShopperInfo(store.id, store.brandSettings, products)]);

  const memory = (settings.onboardingMemory && typeof settings.onboardingMemory === "object" ? settings.onboardingMemory : {}) as Record<string, unknown>;
  const firstName = text(memory.preferredName)?.split(/\s+/)[0] ?? user.name?.trim().split(/\s+/)[0] ?? "there";
  const template = getCurrentTemplateMeta(settingsOf(store));

  return (
    <RexStudio
      firstName={firstName}
      fromOnboarding={params?.onboarding === "true"}
      initialPrompt={(Array.isArray(params?.prompt) ? params.prompt[0] : params?.prompt)?.slice(0, 2000) ?? ""}
      openPreview={params?.preview === "1"}
      store={{
        id: store.id,
        name: store.name,
        slug: store.slug,
        description: store.description,
        logoUrl: store.logoUrl,
        city: store.city,
        country: store.country,
        currency: store.currency,
        storeProducts: products,
        shopper,
      }}
      storeHost={buildStorefrontOrigin(store).replace(/^https?:\/\//, "")}
      storeUrl={buildStorefrontUrl(store)}
      initialDraft={draft}
      draftSaved={saved}
      themeName={themeNameFor(draft.templateId, draft.templateName)}
      healthFacts={facts}
      versions={summariseRexVersions(versionsOf(store), draft.updatedAt)}
      live={isLiveStatus(store.status) && Boolean(published)}
      hasUnpublishedChanges={!published || published.updatedAt !== draft.updatedAt}
      aiReady={aiConfigured()}
      buildContext={{
        brief: [store.description, text(memory.businessDescription)].filter(Boolean).join("\n") || undefined,
        category: text(memory.category),
        businessDescription: text(memory.businessDescription) ?? store.description ?? undefined,
        template: template ? { templateId: template.templateId, templateName: template.templateName } : null,
      }}
    />
  );
}
