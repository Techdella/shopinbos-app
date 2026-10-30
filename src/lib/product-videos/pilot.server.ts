import "server-only";

import { db } from "@/lib/db/client";
import { readBusinessAddress } from "@/lib/email/shell";
import { loadSwitchState, placeFrom } from "@/lib/feature-switches.server";
import { isFeatureOn, type FeatureContext, type Place } from "@shared/feature-switches";
import { POST_TO_PLUG } from "@shared/product-videos";

// Is a shop (or supplier) in the Post to Plug pilot? The apps ask "is it on for me, on this app" (featuresFor); the
// shop page and the Discover feed ask about the shop itself, whoever is looking: on when post_to_plug would be on for
// the shop's owner on any of the business apps (web, Android, iPhone), whatever the app version. Kill switches win.
// Answers are cached per server instance for a minute. Never throws: anything unreadable counts as off.

const BUSINESS_APPS = ["business_web", "business_android", "business_ios"] as const;
const CACHE_MS = 60_000;
const answers = new Map<string, { at: number; on: boolean; place: Place | null }>();

type Owner = { kind: "store" | "supplier"; id: string; userId: string; place: Place | null };

async function ownerContexts(kind: "store" | "supplier", ids: readonly string[]): Promise<Owner[]> {
  if (!ids.length) return [];
  if (kind === "store") {
    const rows = await db.store.findMany({ where: { id: { in: [...ids] } }, select: { id: true, userId: true, city: true, brandSettings: true } });
    return rows.map((row) => ({ kind, id: row.id, userId: row.userId, place: placeFrom(row.city, readBusinessAddress(row.brandSettings).state) }));
  }
  const rows = await db.supplier.findMany({ where: { id: { in: [...ids] } }, select: { id: true, userId: true, city: true } });
  return rows.map((row) => ({ kind, id: row.id, userId: row.userId, place: placeFrom(row.city, null) }));
}

/** For each id: { on, place } (place: where the shop is, for the Discover feed's area filter). */
export async function pilotOwners(kind: "store" | "supplier", ids: readonly string[]): Promise<Map<string, { on: boolean; place: Place | null }>> {
  const out = new Map<string, { on: boolean; place: Place | null }>();
  const now = Date.now();
  const missing: string[] = [];
  for (const id of new Set(ids)) {
    const hit = answers.get(`${kind}:${id}`);
    if (hit && now - hit.at < CACHE_MS) out.set(id, { on: hit.on, place: hit.place });
    else missing.push(id);
  }
  if (!missing.length) return out;
  try {
    const state = await loadSwitchState();
    const feature = state.switches.find((row) => row.key === POST_TO_PLUG) ?? null;
    const live = Boolean(feature && !state.killAll && feature.enabled && !feature.killed && BUSINESS_APPS.some((app) => feature.apps.includes(app)));
    const owners = await ownerContexts(kind, missing);
    const uses = live && owners.length
      ? await db.featureInviteUse.findMany({ where: { userId: { in: owners.map((owner) => owner.userId) }, invite: { disabled: false } }, select: { userId: true, invite: { select: { features: true } } } })
      : [];
    for (const owner of owners) {
      const inviteFeatures = uses.filter((use) => use.userId === owner.userId).flatMap((use) => use.invite.features);
      const on = live && BUSINESS_APPS.some((app) => {
        const ctx: FeatureContext = {
          app,
          // The shop is in the pilot whatever app version its owner runs.
          appVersion: feature?.minVersions?.[app] ?? null,
          userId: owner.userId,
          storeId: owner.kind === "store" ? owner.id : null,
          supplierId: owner.kind === "supplier" ? owner.id : null,
          place: owner.place,
          inviteFeatures,
        };
        return isFeatureOn(feature, ctx, state.targets, state.areas, { killAll: state.killAll });
      });
      answers.set(`${kind}:${owner.id}`, { at: now, on, place: owner.place });
      out.set(owner.id, { on, place: owner.place });
    }
  } catch (error) {
    console.warn("[product-videos] couldn't read the post_to_plug switch; treating it as off", error);
  }
  for (const id of missing) if (!out.has(id)) out.set(id, { on: false, place: null });
  return out;
}

export async function storeInPilot(storeId: string | null | undefined): Promise<boolean> {
  if (!storeId) return false;
  return (await pilotOwners("store", [storeId])).get(storeId)?.on ?? false;
}

export async function supplierInPilot(supplierId: string | null | undefined): Promise<boolean> {
  if (!supplierId) return false;
  return (await pilotOwners("supplier", [supplierId])).get(supplierId)?.on ?? false;
}
