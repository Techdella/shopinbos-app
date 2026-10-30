import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { parseBody } from "@/lib/api/validate";
import { EditorUpdateSchema } from "@/lib/schemas";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { loadShopperInfo } from "@/lib/storefront/shopper-info.server";
import { getStoreEditorData } from "@/lib/store-editor/editor-data.server";
import {
  buildEditorEnvelope,
  createSnapshotFromTemplate,
  fallbackDraftSnapshot,
  getCurrentTemplateMeta,
  getTemplateManifest,
  guessPageType,
  hydrateDraftFromStoreConfig,
  resolveDraftSnapshot,
  updateDraftFromOps,
  updateDraftFromSnapshot,
  type StoreBrandSettingsLike,
} from "@/lib/store-templates";
import { checkThemeSwitch } from "@/lib/theme-access";
import { loadSellerThemeAccess } from "@/lib/theme-access.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await getStoreEditorData(user.id);
  if (!store) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });
  }

  const brandSettings = ((store.brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike;
  const selectedTemplate = getCurrentTemplateMeta(brandSettings);
  // "blank" (Start blank) and retired templates have no manifest: then the saved draft is the only source.
  const selectedManifest = selectedTemplate ? getTemplateManifest(selectedTemplate.templateId) : null;
  const fallbackDraft = selectedManifest ? createSnapshotFromTemplate(selectedManifest) : null;
  const envelope = buildEditorEnvelope(brandSettings, fallbackDraft);
  // The builder previews the store as shoppers see it: delivery promises, WhatsApp, collections and real reviews.
  const shopper = await loadShopperInfo(store.id, store.brandSettings, store.storeProducts);

  return NextResponse.json({
    data: {
      store: { ...store, shopper, storefrontUrl: buildStorefrontUrl(store) },
      seller: {
        name: user.name || user.email?.split("@")[0]?.replace(/[._-]/g, " ") || "there",
        email: user.email,
      },
      ...envelope,
      canStartBlank: !envelope.draft,
    },
  });
});

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const store = await getStoreEditorData(user.id);
  if (!store) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });
  }

  const parsed = await parseBody(EditorUpdateSchema, req);
  if ("error" in parsed) return parsed.error;

  const body = parsed.data;

  const brandSettings = ((store.brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike;
  const selectedTemplate = getCurrentTemplateMeta(brandSettings);
  const selectedManifest = selectedTemplate ? getTemplateManifest(selectedTemplate.templateId) : null;
  const fallbackDraft = selectedManifest ? createSnapshotFromTemplate(selectedManifest) : fallbackDraftSnapshot(brandSettings, store.name);

  let nextSettings = brandSettings;
  let draft = resolveDraftSnapshot(brandSettings, fallbackDraft);

  if (body.snapshot && typeof body.snapshot === "object" && !Array.isArray(body.snapshot)) {
    // A saved snapshot can't move the store onto a theme its plan doesn't include (switching goes through
    // /api/store/templates/apply, which checks the same rule).
    const nextThemeId = (body.snapshot as { templateId?: unknown }).templateId;
    if (typeof nextThemeId === "string" && nextThemeId !== draft?.templateId) {
      const themeAccess = await loadSellerThemeAccess(user.id);
      const access = checkThemeSwitch(nextThemeId, themeAccess.tier, draft?.templateId, themeAccess.owned);
      if (!access.ok) return NextResponse.json({ error: { code: "UPGRADE_REQUIRED", message: access.message } }, { status: 403 });
    }
    nextSettings = updateDraftFromSnapshot(brandSettings, body.snapshot as never);
    draft = body.snapshot as never;
  } else if (Array.isArray(body.ops)) {
    const result = updateDraftFromOps(brandSettings, body.ops as never, fallbackDraft);
    nextSettings = result.brandSettings;
    draft = result.updated;
  } else if (body.hydrateFromStoreConfig && typeof body.hydrateFromStoreConfig === "object" && !Array.isArray(body.hydrateFromStoreConfig)) {
    const result = hydrateDraftFromStoreConfig(brandSettings, body.hydrateFromStoreConfig as never, fallbackDraft);
    nextSettings = result.brandSettings;
    draft = result.updated;
  } else {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Provide snapshot, ops, or hydrateFromStoreConfig." } }, { status: 400 });
  }

  const updated = await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: nextSettings as unknown as Prisma.InputJsonValue,
    },
    select: {
      brandSettings: true,
    },
  });

  return NextResponse.json({
    data: {
      draft,
      template: getCurrentTemplateMeta(((updated.brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike),
      pageType: guessPageType(draft?.pages[0]?.pageType ?? "home"),
    },
  });
});
