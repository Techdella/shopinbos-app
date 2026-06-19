import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import {
  buildEditorEnvelope,
  createSnapshotFromTemplate,
  createBlankEditorSnapshot,
  getCurrentTemplateMeta,
  getTemplateManifest,
  publishDraftState,
  resolveDraftSnapshot,
  snapshotToPublishedPages,
  updateDraftFromSnapshot,
  type StoreBrandSettingsLike,
} from "@/lib/store-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getPublishBlockers(draft: NonNullable<ReturnType<typeof resolveDraftSnapshot>>) {
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

export const POST = withSeller(async (_req: NextRequest, { user }) => {
  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      brandSettings: true,
    },
  });

  if (!store) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });
  }

  const brandSettings = ((store.brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike;
  const selectedTemplate = getCurrentTemplateMeta(brandSettings);
  if (!selectedTemplate) {
    const draft = resolveDraftSnapshot(brandSettings, createBlankEditorSnapshot(store.name));
    if (!draft) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: "No draft snapshot to publish." } }, { status: 400 });
    }

    const blockers = getPublishBlockers(draft);
    if (blockers.length > 0) {
      return NextResponse.json({ error: { code: "PUBLISH_BLOCKED", message: blockers[0], blockers } }, { status: 400 });
    }

    const nextSettings = updateDraftFromSnapshot(brandSettings, draft);
    const pages = snapshotToPublishedPages(draft);

    await db.store.update({
      where: { id: store.id },
      data: {
        status: "active",
        brandSettings: {
          ...nextSettings,
          editor: {
            ...((nextSettings.editor && typeof nextSettings.editor === "object") ? nextSettings.editor : {}),
            published: draft,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });

    for (const page of pages) {
      const existingPage = await db.storePage.findUnique({
        where: { storeId_slug: { storeId: store.id, slug: page.slug } },
        select: { draftContent: true },
      });

      await db.storePage.upsert({
        where: {
          storeId_slug: {
            storeId: store.id,
            slug: page.slug,
          },
        },
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

    return NextResponse.json({
      data: {
        ...buildEditorEnvelope(nextSettings, draft),
      },
    });
  }

  const manifest = getTemplateManifest(selectedTemplate.templateId);
  if (!manifest) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Template not found." } }, { status: 404 });
  }

  const draft = resolveDraftSnapshot(brandSettings, createSnapshotFromTemplate(manifest));
  if (!draft) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "No draft snapshot to publish." } }, { status: 400 });
  }

  const blockers = getPublishBlockers(draft);
  if (blockers.length > 0) {
    return NextResponse.json({ error: { code: "PUBLISH_BLOCKED", message: blockers[0], blockers } }, { status: 400 });
  }

  const { brandSettings: nextSettings, pages } = publishDraftState(brandSettings, manifest, draft);

  await db.store.update({
    where: { id: store.id },
    data: {
      status: "active",
      brandSettings: nextSettings as unknown as Prisma.InputJsonValue,
    },
  });

  for (const page of pages) {
    const existingPage = await db.storePage.findUnique({
      where: { storeId_slug: { storeId: store.id, slug: page.slug } },
      select: { draftContent: true },
    });

    await db.storePage.upsert({
      where: {
        storeId_slug: {
          storeId: store.id,
          slug: page.slug,
        },
      },
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
      },
    });
  }

  return NextResponse.json({
    data: {
      ...buildEditorEnvelope(nextSettings, draft),
    },
  });
});
