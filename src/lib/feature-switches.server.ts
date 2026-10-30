import "server-only";

import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { readBusinessAddress } from "@/lib/email/shell";
import { findCities, placeArea, stateOf } from "@shared/ng-places";
import {
  FEATURE_KEYS,
  KILL_ALL_SETTING_KEY,
  featuresOn,
  inviteCodeFrom,
  inviteUsable,
  normalizeInviteCode,
  readApps,
  readMinVersions,
  readPlaces,
  type FeatureApp,
  type FeatureContext,
  type FeatureSwitchRule,
  type FeatureTargetRule,
  type Place,
  type PilotAreaRule,
} from "@shared/feature-switches";

// Pilot feature switches on the server (shared/feature-switches.ts decides; Admin › Pilot features sets them).
// The switches, targets and areas are cached per server instance for 30 seconds, so every app opening doesn't read
// them; an admin change clears this instance's copy at once (others catch up within 30s). Never throws: if anything
// can't be read, every feature is off (fail closed).

const CACHE_MS = 30_000;

export type SwitchState = { switches: FeatureSwitchRule[]; targets: FeatureTargetRule[]; areas: PilotAreaRule[]; killAll: boolean };

let cache: { at: number; state: SwitchState } | null = null;

export function clearFeatureSwitchCache() {
  cache = null;
}

function killedValue(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as { killed?: unknown }).killed === true);
}

/** Every switch, target and area, and the global kill switch (cached ~30s). Throws when the database can't answer. */
export async function loadSwitchState(): Promise<SwitchState> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.state;
  const [switches, targets, areas, kill] = await Promise.all([
    db.featureSwitch.findMany({ select: { key: true, enabled: true, killed: true, everyone: true, apps: true, minVersions: true } }),
    db.featureTarget.findMany({ select: { featureKey: true, kind: true, value: true } }),
    db.pilotArea.findMany({ select: { id: true, places: true } }),
    db.platformSetting.findUnique({ where: { key: KILL_ALL_SETTING_KEY }, select: { value: true } }),
  ]);
  const state: SwitchState = {
    switches: switches.map((row) => ({ key: row.key, enabled: row.enabled, killed: row.killed, everyone: row.everyone, apps: readApps(row.apps), minVersions: readMinVersions(row.minVersions) })),
    targets,
    areas: areas.map((row) => ({ id: row.id, places: readPlaces(row.places) })),
    killAll: killedValue(kill?.value),
  };
  cache = { at: Date.now(), state };
  return state;
}

/** A typed city and state → the place areas are matched against ("Yaba" → Lagos state, Lagos city, Yaba area). */
export function placeFrom(cityText: string | null | undefined, stateText: string | null | undefined): Place | null {
  const city = String(cityText ?? "").trim();
  const typedState = String(stateText ?? "").trim();
  if (!city && !typedState) return null;
  const match = city ? placeArea(city, { state: typedState || null }) : null;
  const cities = findCities(city);
  return {
    state: stateOf(typedState) ?? match?.state ?? cities[0]?.state ?? stateOf(city) ?? (typedState || null),
    city: match?.city ?? cities[0]?.name ?? (city || null),
    area: match?.area ?? null,
  };
}

/** Who this account is for the switches: its shop or supplier account, where it is, and the features its invites give. */
async function contextFor(user: { id: string; role?: string | null }, app: FeatureApp | null, appVersion: string | null): Promise<FeatureContext> {
  const [account, store, supplier, uses] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { city: true } }),
    db.store.findUnique({ where: { userId: user.id }, select: { id: true, city: true, brandSettings: true } }),
    db.supplier.findUnique({ where: { userId: user.id }, select: { id: true, city: true } }),
    db.featureInviteUse.findMany({ where: { userId: user.id }, select: { invite: { select: { features: true, disabled: true } } } }),
  ]);
  const place = store
    ? placeFrom(store.city, readBusinessAddress(store.brandSettings).state)
    : supplier
      ? placeFrom(supplier.city, null)
      : placeFrom(account?.city, null);
  const inviteFeatures = [...new Set(uses.filter((use) => !use.invite.disabled).flatMap((use) => use.invite.features))];
  return { app, appVersion, userId: user.id, storeId: store?.id ?? null, supplierId: supplier?.id ?? null, place, inviteFeatures };
}

/** The keys of the features on for this account on this app and version. Never throws: [] when anything fails. */
export async function featuresFor(user: { id: string; role?: string | null }, app: FeatureApp | null, version: string | null): Promise<string[]> {
  if (!app) return [];
  try {
    const state = await loadSwitchState();
    if (state.killAll) return [];
    const live = state.switches.filter((row) => row.enabled && !row.killed && row.apps.includes(app));
    if (!live.length) return [];
    const ctx = await contextFor(user, app, version);
    return featuresOn(live, ctx, state.targets, state.areas, { killAll: state.killAll });
  } catch (error) {
    console.warn("[feature-switches] couldn't read the switches; every pilot feature is off", error);
    return [];
  }
}

/** For web pages (business_web): is this feature on for this account? Never throws (false on any failure). */
export async function featureOn(userId: string | null | undefined, key: string): Promise<boolean> {
  if (!userId) return false;
  return (await featuresFor({ id: userId }, "business_web", null)).includes(key);
}

// ─── Invite codes (the user side) ───────────────────────────────────────────────

export type RedeemResult = { ok: true; features: string[] } | { ok: false; reason: "not_found" | "expired" | "used_up" };

/**
 * Redeems a pilot invite code for this user: records the use (once per person; redeeming again is fine and changes
 * nothing) and counts it. Returns the features it gives.
 */
export async function redeemInvite(userId: string, rawCode: string): Promise<RedeemResult> {
  const code = normalizeInviteCode(rawCode);
  if (code.length < 4) return { ok: false, reason: "not_found" };
  const invite = await db.featureInvite.findUnique({ where: { code } });
  if (!invite) return { ok: false, reason: "not_found" };
  const features = invite.features.filter((key) => (FEATURE_KEYS as readonly string[]).includes(key));
  const already = await db.featureInviteUse.findUnique({ where: { inviteId_userId: { inviteId: invite.id, userId } }, select: { id: true } });
  if (already) return invite.disabled ? { ok: false, reason: "not_found" } : { ok: true, features };
  const usable = inviteUsable(invite, new Date());
  if (usable !== "ok") return { ok: false, reason: usable };
  const done = await db.$transaction(async (tx) => {
    // Count the use only while there's room (two people redeeming the last use at once: one wins).
    const counted = await tx.featureInvite.updateMany({
      where: { id: invite.id, disabled: false, ...(invite.maxUses !== null ? { uses: { lt: invite.maxUses } } : {}) },
      data: { uses: { increment: 1 } },
    });
    if (!counted.count) return false;
    await tx.featureInviteUse.create({ data: { inviteId: invite.id, userId } });
    await tx.featureSwitchLog.create({ data: { action: "invite.redeemed", after: { code, inviteId: invite.id, userId } as Prisma.InputJsonValue, actorUserId: userId } });
    return true;
  }).catch((error: unknown) => {
    // Already redeemed by this person in a request that raced this one.
    if (error && typeof error === "object" && (error as { code?: string }).code === "P2002") return true;
    throw error;
  });
  return done ? { ok: true, features } : { ok: false, reason: "used_up" };
}

// ─── Admin › Pilot features ───────────────────────────────────────────────────────

export function newInviteCode(prefix?: string) {
  return inviteCodeFrom(randomBytes(8), prefix ? normalizeInviteCode(prefix).slice(0, 12) || "PILOT" : "PILOT");
}

/** Logs one admin change (who, when, what). */
export async function logFeatureChange(entry: { featureKey?: string | null; action: string; before?: unknown; after?: unknown; actorUserId: string }) {
  await db.featureSwitchLog.create({
    data: {
      featureKey: entry.featureKey ?? null,
      action: entry.action,
      before: entry.before === undefined || entry.before === null ? undefined : (entry.before as Prisma.InputJsonValue),
      after: entry.after === undefined || entry.after === null ? undefined : (entry.after as Prisma.InputJsonValue),
      actorUserId: entry.actorUserId,
    },
  });
}

/** Everything the admin page shows. Throws FeatureSwitchesNotReady when the migration hasn't run yet. */
export class FeatureSwitchesNotReady extends Error {}

function missingTable(error: unknown) {
  const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined;
  return code === "P2021" || code === "P2022" || /does not exist/i.test(String((error as Error)?.message ?? ""));
}

export async function adminFeatureData() {
  try {
    const [switches, targets, areas, invites, log, kill] = await Promise.all([
      db.featureSwitch.findMany({ orderBy: { createdAt: "asc" } }),
      db.featureTarget.findMany({ orderBy: { createdAt: "asc" } }),
      db.pilotArea.findMany({ orderBy: { createdAt: "asc" } }),
      db.featureInvite.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { redeemed: { orderBy: { createdAt: "desc" }, take: 50, select: { userId: true, createdAt: true } } } }),
      db.featureSwitchLog.findMany({ orderBy: { createdAt: "desc" }, take: 80 }),
      db.platformSetting.findUnique({ where: { key: KILL_ALL_SETTING_KEY }, select: { value: true } }),
    ]);
    const userIds = [...new Set([...log.map((row) => row.actorUserId), ...invites.flatMap((invite) => invite.redeemed.map((use) => use.userId))].filter((id): id is string => Boolean(id)))];
    const people = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
    const names = new Map(people.map((person) => [person.id, person.email || person.name]));
    // Keep the seed order of known features, then any others.
    const order = (key: string) => {
      const index = (FEATURE_KEYS as readonly string[]).indexOf(key);
      return index === -1 ? FEATURE_KEYS.length : index;
    };
    return {
      killAll: killedValue(kill?.value),
      switches: [...switches].sort((a, b) => order(a.key) - order(b.key)).map((row) => ({ ...row, apps: readApps(row.apps), minVersions: readMinVersions(row.minVersions) })),
      targets,
      areas: areas.map((row) => ({ ...row, places: readPlaces(row.places) })),
      invites: invites.map((invite) => ({ ...invite, redeemed: invite.redeemed.map((use) => ({ ...use, who: names.get(use.userId) ?? use.userId })) })),
      log: log.map((row) => ({ ...row, actor: row.actorUserId ? (names.get(row.actorUserId) ?? row.actorUserId) : null })),
    };
  } catch (error) {
    if (missingTable(error)) throw new FeatureSwitchesNotReady("Run docs/migrations/2026-12-13-feature-switches.sql first.");
    throw error;
  }
}
