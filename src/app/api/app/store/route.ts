import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { mergeBrandSettings, slugify } from "@/lib/workspace";
import type { AuthUser } from "@/lib/auth/types";

async function uniqueStoreSlug(baseName: string, userId: string, currentStoreId?: string) {
  const base = slugify(baseName) || "store";
  const ownedSlug = `${base}-${userId.slice(0, 6)}`;
  const existing = await db.store.findUnique({
    where: { slug: base },
    select: { id: true },
  });

  if (!existing || existing.id === currentStoreId) return base;
  return ownedSlug;
}

async function storeHasPublishedSurface(store: { id: string; brandSettings: unknown }) {
  const settings = store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings)
    ? store.brandSettings as Record<string, unknown>
    : {};
  const editor = settings.editor && typeof settings.editor === "object" && !Array.isArray(settings.editor)
    ? settings.editor as Record<string, unknown>
    : {};
  if (editor.published && typeof editor.published === "object") return true;
  const publishedPages = await db.storePage.count({
    where: {
      storeId: store.id,
      isPublished: true,
      archivedAt: null,
    },
  });
  return publishedPages > 0;
}

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const name = (body?.name as string)?.trim();
  if (!name) return apiError("BAD_REQUEST", "Store name is required");

  const existing = await db.store.findUnique({ where: { userId: user.id } });
  const slug = await uniqueStoreSlug(name, user.id, existing?.id);
  if (existing) {
    const updated = await db.store.update({
      where: { id: existing.id },
      data: {
        name,
        slug,
        country: typeof body?.country === "string" ? body.country : existing.country,
        city: typeof body?.city === "string" ? body.city : existing.city,
        onboardingState: existing.onboardingState ?? "BUILDING_REX",
      },
      select: {
        id: true, name: true, slug: true, description: true, logoUrl: true,
        country: true, city: true, currency: true, brandSettings: true,
        customDomain: true, status: true, createdAt: true,
      },
    });
    return ok(updated);
  }

  const store = await db.store.create({
    data: {
      userId: user.id,
      name,
      slug,
      status: "draft",
      country: user.country ?? "NG",
      city: user.city ?? "",
      currency: "NGN",
      onboardingState: "BUILDING_REX",
    },
    select: {
      id: true, name: true, slug: true, description: true, logoUrl: true,
      country: true, city: true, currency: true, brandSettings: true,
      customDomain: true, status: true, createdAt: true,
    },
  });

  return ok(store, 201);
});

export const GET = withSeller(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: {
      id: true, name: true, slug: true, description: true, logoUrl: true,
      country: true, city: true, currency: true, brandSettings: true,
      customDomain: true, status: true, createdAt: true,
    },
  });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(store);
});

export const PATCH = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return apiError("BAD_REQUEST", "Invalid request body");

  const requestedName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : `${user.name}'s Store`;
  const store =
    (await db.store.findUnique({ where: { userId: user.id } })) ??
    (await db.store.create({
      data: {
        userId: user.id,
        name: requestedName,
        slug: await uniqueStoreSlug(requestedName, user.id),
        status: "draft",
        country: user.country ?? "Nigeria",
        city: user.city ?? "Lagos",
        currency: "NGN",
        onboardingState: "BUILDING_REX",
      },
    }));

  const allowed = [
    "name",
    "description",
    "logoUrl",
    "country",
    "city",
    "currency",
    "brandSettings",
    "onboardingState",
    "firstDashboardVisitComplete",
  ] as const;
  type AllowedKey = typeof allowed[number];

  const updateData: Partial<Record<AllowedKey | "slug" | "status", unknown>> = {};
  for (const key of allowed) {
    if (key in body) {
      if (key === "brandSettings") {
        updateData.brandSettings = mergeBrandSettings(store.brandSettings, body[key] as Record<string, unknown>);
      } else if (key === "name" && typeof body[key] === "string") {
        const name = body[key].trim();
        if (name) {
          updateData.name = name;
          updateData.slug = await uniqueStoreSlug(name, user.id, store.id);
        }
      } else if (typeof body[key] === "string" || typeof body[key] === "boolean" || body[key] === null) {
        updateData[key] = body[key];
      }
    }
  }

  if ("customDomain" in body) {
    return apiError("BAD_REQUEST", "Use the domain connection flow to update custom domains.", 400);
  }

  if ("status" in body) {
    const nextStatus = typeof body.status === "string" ? body.status : "";
    if (!["draft", "active"].includes(nextStatus)) {
      return apiError("BAD_REQUEST", "Invalid store status.", 400);
    }
    if (nextStatus === "active" && !(await storeHasPublishedSurface(store))) {
      return apiError("PUBLISH_REQUIRED", "Publish your storefront before making the store live.", 400);
    }
    updateData.status = nextStatus;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = await db.store.update({
    where: { id: store.id },
    data: updateData as any,
  });

  return ok(updated);
});
