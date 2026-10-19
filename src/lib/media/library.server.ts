import "server-only";
import { db } from "@/lib/db/client";
import { uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";
import {
  mediaDisplayName,
  mediaFileProblem,
  mediaKindOfType,
  mediaKindOfUrl,
  type MediaAssetView,
  type MediaKind,
  type MediaQuery,
  type MediaSource,
} from "@shared/media";
import type { MediaDetails } from "@shared/media-details";

// The media library (MediaAsset): everything a person has uploaded or already uses in their store, so a picture is
// uploaded once and picked again anywhere. Rules live in shared/media.ts; the table and the sync function in
// docs/migrations/2026-10-26-media-library.sql. Recording is best effort: an upload never fails because the
// library couldn't note it (e.g. before the migration has run).

export class MediaRejectedError extends Error {}

const SELECT = { id: true, url: true, kind: true, name: true, title: true, alt: true, width: true, height: true, bytes: true, source: true, createdAt: true } as const;

type Row = { id: string; url: string; kind: string; name: string | null; title: string | null; alt: string | null; width: number | null; height: number | null; bytes: number | null; source: string; createdAt: Date };

export function toView(row: Row): MediaAssetView {
  return {
    id: row.id,
    url: row.url,
    kind: row.kind === "video" ? "video" : "image",
    name: row.name,
    title: row.title,
    alt: row.alt,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface RecordMediaInput {
  userId: string;
  /** Undefined: looked up from the user's store. Null: none. */
  storeId?: string | null;
  url: string;
  path?: string | null;
  name?: string | null;
  kind?: MediaKind;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  source: MediaSource;
}

/** Notes a stored file in its owner's library (once per url; re-adding brings back a hidden one). */
export async function recordMedia(input: RecordMediaInput): Promise<MediaAssetView | null> {
  try {
    const storeId = input.storeId !== undefined ? input.storeId : (await db.store.findUnique({ where: { userId: input.userId }, select: { id: true } }))?.id ?? null;
    const row = await db.mediaAsset.upsert({
      where: { userId_url: { userId: input.userId, url: input.url } },
      create: {
        userId: input.userId,
        storeId,
        url: input.url,
        path: input.path ?? null,
        name: input.name?.slice(0, 200) ?? null,
        kind: input.kind ?? mediaKindOfUrl(input.url),
        width: input.width ?? null,
        height: input.height ?? null,
        bytes: input.bytes ?? null,
        source: input.source,
      },
      // Uploading the same file again (same url) puts it back in the library.
      update: { hiddenAt: null },
      select: SELECT,
    });
    return toView(row);
  } catch (error) {
    console.warn("[media] could not record", input.source, error instanceof Error ? error.message : error);
    return null;
  }
}

const lastSync = new Map<string, number>();
const SYNC_EVERY_MS = 60_000;

/**
 * Adds pictures already in the person's store (product photos, logo, editor images…) to their library. Runs at
 * most once a minute per person per server; never throws.
 */
export async function syncLibrary(userId: string, force = false) {
  const now = Date.now();
  if (!force && now - (lastSync.get(userId) ?? 0) < SYNC_EVERY_MS) return;
  lastSync.set(userId, now);
  if (lastSync.size > 5000) lastSync.clear();
  try {
    await db.$queryRaw`SELECT shopinbos_media_sync(${userId}::text)`;
  } catch (error) {
    console.warn("[media] sync skipped", error instanceof Error ? error.message : error);
  }
}

/** One page of the person's own, visible library, newest first. */
export async function listMedia(userId: string, query: MediaQuery): Promise<{ rows: MediaAssetView[]; total: number }> {
  const where = {
    userId,
    hiddenAt: null,
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { title: { contains: query.q, mode: "insensitive" as const } },
            { alt: { contains: query.q, mode: "insensitive" as const } },
            { source: { contains: query.q.toLowerCase() } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.mediaAsset.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit, select: SELECT }),
    db.mediaAsset.count({ where }),
  ]);
  return { rows: rows.map(toView), total };
}

/** Uploads a file into the person's library (checks type, size and content) and returns the new entry. */
export async function uploadToLibrary(
  userId: string,
  file: File,
  meta: { width?: number | null; height?: number | null; allow?: "image" | "any" } = {},
): Promise<MediaAssetView> {
  const problem = mediaFileProblem(file, meta.allow ?? "any");
  if (problem) throw new MediaRejectedError(problem);
  // assertUploadContent (inside uploadFileServer) checks the real bytes and rejects SVGs with script.
  const stored = await uploadFileServer("brand", file, uploadPath(`media/${userId}`, file));
  const kind = mediaKindOfType(file.type) ?? "image";
  const recorded = await recordMedia({
    userId,
    url: stored.publicUrl,
    path: stored.path,
    name: mediaDisplayName(file.name),
    kind,
    width: meta.width ?? null,
    height: meta.height ?? null,
    bytes: file.size,
    source: "upload",
  });
  return recorded ?? {
    id: "",
    url: stored.publicUrl,
    kind,
    name: mediaDisplayName(file.name),
    title: null,
    alt: null,
    width: meta.width ?? null,
    height: meta.height ?? null,
    bytes: file.size,
    source: "upload",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Saves a title and / or alt text on one of the person's own, visible entries (already cleaned by
 * MediaDetailsSchema; a missing key is left alone). Null when it isn't theirs (or is hidden).
 */
export async function updateMediaDetails(userId: string, id: string, details: MediaDetails): Promise<MediaAssetView | null> {
  const data = {
    ...(details.title !== undefined ? { title: details.title } : {}),
    ...(details.alt !== undefined ? { alt: details.alt } : {}),
  };
  const result = await db.mediaAsset.updateMany({ where: { id, userId, hiddenAt: null }, data });
  if (!result.count) return null;
  const row = await db.mediaAsset.findFirst({ where: { id, userId }, select: SELECT });
  return row ? toView(row) : null;
}

/**
 * Takes a picture out of the person's library. Only hides it: the file stays in storage because a product, page or
 * email that already uses it must keep working. False when it isn't theirs (or is already gone).
 */
export async function hideMedia(userId: string, id: string): Promise<boolean> {
  const result = await db.mediaAsset.updateMany({ where: { id, userId, hiddenAt: null }, data: { hiddenAt: new Date() } });
  return result.count > 0;
}

/** Whether a link is (visibly) in the person's library, so files there aren't deleted from under other uses. */
export async function isInLibrary(userId: string, url: string | null | undefined): Promise<boolean> {
  if (!url) return false;
  try {
    return Boolean(await db.mediaAsset.findFirst({ where: { userId, url, hiddenAt: null }, select: { id: true } }));
  } catch {
    return false;
  }
}
