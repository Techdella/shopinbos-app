import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import {
  buildEditorEnvelope,
  createSnapshotFromTemplate,
  fallbackDraftSnapshot,
  getCurrentTemplateMeta,
  getTemplateManifest,
  normalizeChrome,
  publishDraftState,
  resolveDraftSnapshot,
  snapshotToPublishedPages,
  updateDraftFromSnapshot,
  type StoreBrandSettingsLike,
} from "@/lib/store-templates";
import { fillMissingPageSeo } from "@/lib/store-templates/seo-defaults";

export class StorePublishError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly blockers?: string[],
  ) {
    super(message);
  }
}

function publishBlockers(draft: NonNullable<ReturnType<typeof resolveDraftSnapshot>>) {
  const home = draft.pages.find((page) => page.pageType === "home");
  const hasHomeContent = Boolean(home?.sections.some((section) => section.visible !== false));
  const seoReady = draft.pages.every((page) => {
    const title = page.seo?.metaTitle?.trim() ?? "";
    const description = page.seo?.metaDescription?.trim() ?? "";
    return title.length > 0 && title.length <= 70 && description.length > 0 && description.length <= 180;
  });
  return [
    !hasHomeContent ? "Homepage needs at least one visible section." : null,
    !seoReady ? "Every page needs a title and meta description before publish." : null,
  ].filter((item): item is string => Boolean(item));
}

export async function assertStoreDraftPublishable(where: { userId?: string; storeId?: string }) {
  const store = await db.store.findFirst({
    where: where.storeId ? { id: where.storeId } : { userId: where.userId },
    select: { name: true, brandSettings: true },
  });
  if (!store) throw new StorePublishError("Store not found", "NOT_FOUND", 404);

  const brandSettings = ((store.brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike;
  const selectedTemplate = getCurrentTemplateMeta(brandSettings);
  const manifest = selectedTemplate ? getTemplateManifest(selectedTemplate.templateId) : null;
  if (selectedTemplate && !manifest) throw new StorePublishError("Template not found.", "NOT_FOUND", 404);

  const fallback = manifest ? createSnapshotFromTemplate(manifest) : fallbackDraftSnapshot(brandSettings, store.name);
  const resolved = resolveDraftSnapshot(brandSettings, fallback);
  if (!resolved) throw new StorePublishError("No draft snapshot to publish.", "BAD_REQUEST", 400);
  const draft = fillMissingPageSeo(resolved, store.name);
  const blockers = publishBlockers(draft);
  if (blockers.length) throw new StorePublishError(blockers[0], "PUBLISH_BLOCKED", 400, blockers);
}

export async function publishStoreDraft(where: { userId?: string; storeId?: string }) {
  const store = await db.store.findFirst({
    where: where.storeId ? { id: where.storeId } : { userId: where.userId },
    select: { id: true, name: true, brandSettings: true },
  });
  if (!store) throw new StorePublishError("Store not found", "NOT_FOUND", 404);

  const brandSettings = ((store.brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike;
  const selectedTemplate = getCurrentTemplateMeta(brandSettings);
  const manifest = selectedTemplate ? getTemplateManifest(selectedTemplate.templateId) : null;
  if (selectedTemplate && !manifest) throw new StorePublishError("Template not found.", "NOT_FOUND", 404);

  const fallback = manifest ? createSnapshotFromTemplate(manifest) : fallbackDraftSnapshot(brandSettings, store.name);
  const resolved = resolveDraftSnapshot(brandSettings, fallback);
  if (!resolved) throw new StorePublishError("No draft snapshot to publish.", "BAD_REQUEST", 400);
  // One header, announcement bar and footer on every page (older drafts could differ per page; home's wins).
  const draft = normalizeChrome(fillMissingPageSeo(resolved, store.name));

  const blockers = publishBlockers(draft);
  if (blockers.length) throw new StorePublishError(blockers[0], "PUBLISH_BLOCKED", 400, blockers);

  // A store with no theme chosen yet publishes the starter theme its draft was made from.
  const draftManifest = manifest ?? getTemplateManifest(draft.templateId);
  const published = draftManifest
    ? publishDraftState(brandSettings, draftManifest, draft)
    : {
        brandSettings: {
          ...updateDraftFromSnapshot(brandSettings, draft),
          editor: {
            ...((brandSettings.editor && typeof brandSettings.editor === "object") ? brandSettings.editor : {}),
            published: draft,
          },
        } as StoreBrandSettingsLike,
        pages: snapshotToPublishedPages(draft),
      };

  await db.store.update({
    where: { id: store.id },
    data: { status: "active", onboardingState: "LIVE", brandSettings: published.brandSettings as unknown as Prisma.InputJsonValue },
  });

  for (const page of published.pages) {
    await db.storePage.upsert({
      where: { storeId_slug: { storeId: store.id, slug: page.slug } },
      create: {
        storeId: store.id,
        type: page.type,
        title: page.title,
        slug: page.slug,
        content: page.content as unknown as Prisma.InputJsonValue,
        draftContent: (page.content ?? {}) as unknown as Prisma.InputJsonValue,
        publishedContent: (page.content ?? {}) as unknown as Prisma.InputJsonValue,
        order: page.order,
        isPublished: true,
        status: "published",
      },
      update: {
        type: page.type,
        title: page.title,
        content: page.content as unknown as Prisma.InputJsonValue,
        publishedContent: (page.content ?? {}) as unknown as Prisma.InputJsonValue,
        order: page.order,
        isPublished: true,
        status: "published",
        archivedAt: null,
      },
    });
  }

  return { storeId: store.id, envelope: buildEditorEnvelope(published.brandSettings, draft) };
}
