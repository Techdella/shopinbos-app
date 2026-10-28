import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { DEFAULT_APP_RELEASE, appReleaseKey, parseAppRelease, validateAppReleaseInput, type AppRelease, type AppReleasePlatform } from "@shared/app-release";

// The phone app's latest and minimum builds per platform (shared/app-release.ts), stored in PlatformSetting
// "app.release.<platform>" and set in Admin › App updates. Cached per server instance for a minute, so the phones
// asking on every launch don't each read the database; a save here clears this instance's copy at once.

const CACHE_MS = 60_000;
const cache = new Map<AppReleasePlatform, { at: number; release: AppRelease }>();

export function clearAppReleaseCache() {
  cache.clear();
}

/** The release for this platform; the default (nothing to prompt) when unset or the database can't be read. */
export async function getAppRelease(platform: AppReleasePlatform): Promise<AppRelease> {
  const hit = cache.get(platform);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.release;
  try {
    const row = await db.platformSetting.findUnique({ where: { key: appReleaseKey(platform) }, select: { value: true } });
    const release = parseAppRelease(row?.value);
    cache.set(platform, { at: Date.now(), release });
    return release;
  } catch (error) {
    console.warn("[app-release] couldn't read the release setting", error);
    // A short-lived default: never nag phones because the database hiccuped.
    return hit?.release ?? { ...DEFAULT_APP_RELEASE };
  }
}

export class AppReleaseSaveError extends Error {}

/** Admin › App updates: saves the release and logs the change (who, from what to what, why). */
export async function saveAppRelease(platform: AppReleasePlatform, input: { latestBuild?: unknown; minBuild?: unknown; message?: unknown }, by: { userId: string; note?: string | null }) {
  const checked = validateAppReleaseInput(input);
  if (!checked.ok) throw new AppReleaseSaveError(checked.error);
  const key = appReleaseKey(platform);
  const row = await db.platformSetting.findUnique({ where: { key }, select: { value: true } });
  const before = row ? parseAppRelease(row.value) : null;
  const after = checked.release;
  if (before && before.latestBuild === after.latestBuild && before.minBuild === after.minBuild && (before.message ?? "") === (after.message ?? "")) {
    return { changed: false, release: after };
  }
  const note = by.note?.trim().slice(0, 500) || null;
  const value = after as unknown as Prisma.InputJsonValue;
  await db.$transaction([
    db.platformSetting.upsert({ where: { key }, create: { key, value, updatedById: by.userId }, update: { value, updatedById: by.userId } }),
    db.platformSettingChange.create({ data: { key, before: (before ?? undefined) as Prisma.InputJsonValue | undefined, after: value, note, changedById: by.userId } }),
  ]);
  clearAppReleaseCache();
  return { changed: true, release: after };
}

/** App release changes for the history list. */
export async function appReleaseHistory(limit = 20) {
  return db.platformSettingChange.findMany({
    where: { key: { startsWith: "app.release." } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, key: true, before: true, after: true, note: true, createdAt: true, changedBy: { select: { name: true, email: true } } },
  });
}
