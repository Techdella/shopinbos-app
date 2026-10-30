import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { loadShopperInfo } from "@/lib/storefront/shopper-info.server";
import { getStoreEditorData } from "@/lib/store-editor/editor-data.server";
import { loadScheduledPublish } from "@/lib/store-editor/scheduled-publish.server";
import { editorCatalog, pageBodyTemplate, rendererOf, storedDraftVersion } from "@/lib/store-editor/mobile.server";
import {
  buildEditorEnvelope,
  createSnapshotFromTemplate,
  getCurrentTemplateMeta,
  getTemplateManifest,
  resolveDraftSnapshot,
  updateDraftFromSnapshot,
  type StoreBrandSettingsLike,
  type StoreEditorSnapshot,
} from "@/lib/store-templates";
import { draftVersion, versionConflict } from "@shared/store-editor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The phone's store editor (apps/mobile/src/app/store-editor.tsx, design SE-02…SE-16). It edits the web builder's
// own draft (brandSettings.editor.draft), so a change on the phone shows in the web builder and the other way round;
// Publish (./publish) copies that same draft to the live shop through publishStoreDraft, like the web's Publish.
//   GET   → { store, draft, published, version, renderer, catalog, pageBody, collections, live, scheduled }
//           scheduled: the publish set for later ("Schedule for later", ./schedule), or null.
//           store is what the canvas draws (the web builder's own store data: products, shopper info, address).
//   PATCH { snapshot, baseVersion, force? } → { version }
//           The phone's debounced autosave. baseVersion is the draft's save stamp the phone started from: when the
//           server's draft has moved on (an edit on the computer), it answers 409 CONFLICT and saves nothing,
//           unless the seller chose to keep the phone's version (force). Each save gets a new stamp.
// Owners and their staff (withSeller acts as the owner for staff), like the web builder's routes.

function settingsOf(brandSettings: unknown) {
  return ((brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike;
}

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await getStoreEditorData(user.id);
  if (!store) return apiError("NOT_FOUND", "Set up your shop first.", 404);

  const brandSettings = settingsOf(store.brandSettings);
  const template = getCurrentTemplateMeta(brandSettings);
  const manifest = template ? getTemplateManifest(template.templateId) : null;
  // Same as the web builder: no look chosen yet ("blank") and no saved draft means there's nothing to edit yet.
  const envelope = buildEditorEnvelope(brandSettings, manifest ? createSnapshotFromTemplate(manifest) : null);
  const draft = envelope.draft;
  const renderer = rendererOf(draft);
  const [shopper, collections, scheduled] = await Promise.all([
    loadShopperInfo(store.id, store.brandSettings, store.storeProducts),
    db.collection.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, name: true } }).catch(() => []),
    loadScheduledPublish(store.id, store.brandSettings).catch(() => null),
  ]);

  return ok({
    store: { ...store, shopper, storefrontUrl: buildStorefrontUrl(store) },
    draft,
    published: envelope.published,
    version: draftVersion(draft),
    renderer,
    catalog: draft ? editorCatalog(renderer) : {},
    pageBody: draft ? pageBodyTemplate(renderer) : null,
    collections,
    live: store.status === "active" || store.status === "published",
    scheduled,
  });
});

const SnapshotSchema = z
  .object({
    templateId: z.string().min(1).max(120),
    templateName: z.string().max(200),
    themeTokens: z.record(z.string(), z.unknown()),
    pages: z
      .array(
        z
          .object({
            id: z.string().max(200),
            pageType: z.string().min(1).max(120),
            title: z.string().max(200),
            slug: z.string().max(200),
            sections: z.array(z.object({ id: z.string().min(1).max(200), kind: z.string().min(1).max(120), name: z.string().max(200), visible: z.boolean(), blocks: z.array(z.unknown()) }).passthrough()).max(200),
          })
          .passthrough(),
      )
      .min(1)
      .max(60),
  })
  .passthrough();

const PatchBody = z.object({
  snapshot: SnapshotSchema,
  baseVersion: z.string().max(80).nullable().optional(),
  force: z.boolean().optional(),
});

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "That change couldn't be saved. Try again.", 400);

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, brandSettings: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your shop first.", 404);

  const brandSettings = settingsOf(store.brandSettings);
  const template = getCurrentTemplateMeta(brandSettings);
  const manifest = template ? getTemplateManifest(template.templateId) : null;
  const current = resolveDraftSnapshot(brandSettings, manifest ? createSnapshotFromTemplate(manifest) : null);
  const snapshot = parsed.data.snapshot as unknown as StoreEditorSnapshot;

  // The phone edits the look the shop has; switching looks goes through Shop looks (and its plan check).
  if (current && snapshot.templateId !== current.templateId) {
    return apiError("LOOK_CHANGED", "Your shop's look was changed somewhere else. Open the editor again to carry on.", 409);
  }
  if (!parsed.data.force && versionConflict(storedDraftVersion(store.brandSettings), parsed.data.baseVersion)) {
    return apiError("CONFLICT", "Your shop was changed on another device.", 409);
  }

  // A fresh stamp for every save: it's the version the next save is checked against.
  const stamp = new Date(Math.max(Date.now(), (Date.parse(draftVersion(current)) || 0) + 1)).toISOString();
  const next: StoreEditorSnapshot = { ...snapshot, updatedAt: stamp };
  const saved = JSON.parse(JSON.stringify(updateDraftFromSnapshot(brandSettings, next))) as Prisma.InputJsonValue;
  await db.store.update({ where: { id: store.id }, data: { brandSettings: saved } });

  return ok({ version: stamp });
});
