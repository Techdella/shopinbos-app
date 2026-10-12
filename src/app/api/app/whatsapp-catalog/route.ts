import { NextRequest, after } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import {
  catalogView,
  checkPermissions,
  createCatalog,
  disconnectCatalog,
  linkCatalog,
  listCatalogs,
  rotateFeedToken,
  selectCatalog,
  syncCatalog,
  syncIfDirty,
} from "@/lib/whatsapp-catalog/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// The seller's WhatsApp catalog: GET the page's state (and push pending product changes in the background);
// POST actions: check permissions, list / create / choose a catalog, re-link it to WhatsApp, sync now,
// rotate the feed token, stop syncing. Always the signed-in seller's own store.

async function ownStore(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true, name: true } });
}

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await ownStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const view = await catalogView(store.id);
  if (!view) return apiError("NOT_FOUND", "Store not found", 404);
  if (view.catalog.id && view.catalog.dirty && !view.catalog.syncing) after(() => syncIfDirty(store.id).then(() => undefined).catch(() => undefined));
  return ok(view);
});

const metaId = z.string().trim().regex(/^\d{5,25}$/, "That isn't a Meta ID (it's a long number)");

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check_permissions") }).strict(),
  z.object({ action: z.literal("list_catalogs"), businessId: metaId.optional() }).strict(),
  z.object({ action: z.literal("create_catalog"), name: z.string().trim().min(2, "Give the catalog a name").max(100), businessId: metaId.optional() }).strict(),
  z.object({ action: z.literal("select_catalog"), catalogId: metaId }).strict(),
  z.object({ action: z.literal("relink") }).strict(),
  z.object({ action: z.literal("sync"), full: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("rotate_token") }).strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
]);

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await ownStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
  const body = parsed.data;
  const view = async (extra: Record<string, unknown> = {}) => ok({ ...extra, view: await catalogView(store.id) });

  switch (body.action) {
    case "check_permissions": {
      const result = await checkPermissions(store.id);
      if ("error" in result) return apiError("NOT_CONNECTED", result.error, 422);
      return view({ permissions: result });
    }
    case "list_catalogs": {
      const result = await listCatalogs(store.id, body.businessId);
      if ("error" in result) return apiError(result.permission ? "MISSING_PERMISSIONS" : "META_ERROR", result.error, 422);
      return ok(result);
    }
    case "create_catalog": {
      const result = await createCatalog(store.id, body.name, body.businessId);
      if (!result.ok) return apiError(result.permission ? "MISSING_PERMISSIONS" : "META_ERROR", result.error, 422);
      const sync = await syncCatalog(store.id, { manual: true });
      return view({ warnings: result.warnings, sync });
    }
    case "select_catalog": {
      const result = await selectCatalog(store.id, body.catalogId);
      if (!result.ok) return apiError(result.permission ? "MISSING_PERMISSIONS" : "META_ERROR", result.error, 422);
      const sync = await syncCatalog(store.id, { manual: true });
      return view({ warnings: result.warnings, sync });
    }
    case "relink": {
      const result = await linkCatalog(store.id);
      if (!result.ok) return apiError("META_ERROR", result.error, 422);
      return view({ warnings: result.warnings });
    }
    case "sync": {
      const sync = await syncCatalog(store.id, { manual: true, full: body.full });
      if (sync.status === "skipped") return apiError("NO_CATALOG", sync.message ?? "Choose a catalog first.", 422);
      return view({ sync });
    }
    case "rotate_token": {
      await rotateFeedToken(store.id);
      return view();
    }
    case "disconnect": {
      await disconnectCatalog(store.id);
      return view();
    }
  }
});
