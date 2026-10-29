import { NextRequest, NextResponse } from "next/server";
import { themeProblem } from "@/lib/plans/gates.server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import {
  buildTemplateSelectionMeta,
  createBlankEditorSnapshot,
  createSnapshotFromTemplate,
  getTemplateManifest,
  isBlankStarter,
  resolveDraftSnapshot,
  resolvePublishedSnapshot,
  switchThemeDraft,
  withoutBlankPlaceholders,
  type StoreBrandSettingsLike,
} from "@/lib/store-templates";
import { THEME_PRODUCTS_SELECT, hydrateDraftWithStoreData, settingsWithThemeDraft } from "@/lib/themes/apply.server";
import { seedDefaultAbandonedCartAutomation } from "@/lib/automations/defaults";
import { LEGACY_LOOK_THEME_IDS } from "@shared/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as { templateId?: string } | null;
  // Older phone builds send their look ids ("heritage"); they stand for library themes.
  const sent = body?.templateId?.trim();
  const templateId = sent ? LEGACY_LOOK_THEME_IDS[sent] ?? sent : sent;

  if (!templateId) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "templateId is required" } }, { status: 400 });
  }

  const manifest = getTemplateManifest(templateId);
  if (!manifest) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Template not found" } }, { status: 404 });
  }

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      currency: true,
      brandSettings: true,
      // The seller's own and dropshipped products alike; archived ones never fill a section.
      storeProducts: THEME_PRODUCTS_SELECT,
    },
  });

  if (!store) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });
  }

  const currentSettings = ((store.brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike;
  const previousDraft = resolveDraftSnapshot(currentSettings, null);
  const published = resolvePublishedSnapshot(currentSettings, null);
  const previousManifest = previousDraft ? getTemplateManifest(previousDraft.templateId) : null;

  // Premium and platinum themes need a plan that includes them or a one-off purchase; re-applying the theme the
  // store already has is always fine.
  const themeRefusal = await themeProblem(user.id, manifest.id, previousDraft?.templateId ?? published?.templateId);
  if (themeRefusal) {
    return NextResponse.json({ error: { code: "UPGRADE_REQUIRED", message: themeRefusal } }, { status: 403 });
  }

  // Switching keeps the seller's own copy, images, picked products, hidden sections and extra pages. Products,
  // prices and orders live in their own tables and never change here.
  // Off the blank starter, its seed tells the seller's words from the starter's, and its empty colour tiles stay behind.
  const fromBlank = previousDraft && isBlankStarter(previousDraft) ? previousDraft : null;
  const previousSeed = previousManifest
    ? createSnapshotFromTemplate(previousManifest)
    : fromBlank ? withoutBlankPlaceholders(createBlankEditorSnapshot(store.name)) : null;
  const switched = switchThemeDraft(fromBlank ? withoutBlankPlaceholders(fromBlank) : previousDraft, createSnapshotFromTemplate(manifest), previousSeed);
  const draft = hydrateDraftWithStoreData(switched.snapshot, store);

  // A live store keeps its published look until the seller publishes; only the draft changes. A store that
  // has never published takes the theme straight away.
  const cleanSettings = settingsWithThemeDraft(currentSettings, manifest, draft);

  const updated = await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: cleanSettings as unknown as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      slug: true,
      brandSettings: true,
    },
  });

  await seedDefaultAbandonedCartAutomation({ id: store.id, name: store.name });

  return NextResponse.json({
    data: {
      template: buildTemplateSelectionMeta(manifest),
      draft,
      published,
      storeId: updated.id,
      storeSlug: updated.slug,
      /** True when the live storefront still shows the previous theme until the seller publishes. */
      draftOnly: Boolean(published),
      previousTemplateId: previousDraft?.templateId ?? null,
      carriedSections: switched.carriedSections,
      keptPages: switched.keptPages,
    },
  });
});
