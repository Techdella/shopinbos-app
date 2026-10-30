"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { adminRoleOf } from "@/lib/admin-team/service.server";
import { isFullAdmin } from "@/lib/admin-team/pure";
import { db } from "@/lib/db/client";
import { clearFeatureSwitchCache, logFeatureChange, newInviteCode } from "@/lib/feature-switches.server";
import { requireRole } from "@/lib/server-auth";
import {
  FEATURE_APPS,
  FEATURE_KEYS,
  KILL_ALL_SETTING_KEY,
  TARGET_KINDS,
  formatPlaceRule,
  isValidVersion,
  normalizeInviteCode,
  parsePlaces,
  readApps,
  readMinVersions,
  type TargetKind,
} from "@shared/feature-switches";

// Admin › Pilot features (src/app/admin/features/page.tsx): the switches, who each is on for, pilot areas, invite
// codes and the global kill switch. Owners and admins only (like every admin page not in a team section). Every
// change is logged in FeatureSwitchLog and clears this server's cached switches; other servers catch up within 30s.

const PAGE = "/admin/features";

/** Signed in as an owner or admin (not a team role limited to some sections). */
async function featureAdmin() {
  const user = await requireRole(["admin"], "/admin/login");
  if (!isFullAdmin(await adminRoleOf(user.id))) redirect("/admin/dashboard");
  return user;
}

function back(params: Record<string, string>, anchor?: string): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?${new URLSearchParams(params).toString()}${anchor ? `#${anchor}` : ""}`);
}

function text(formData: FormData, name: string, max = 200) {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

function featureKeyFrom(formData: FormData) {
  const key = text(formData, "key", 64);
  return /^[a-z0-9_]{2,64}$/.test(key) ? key : null;
}

function snapshot(row: { enabled: boolean; killed: boolean; everyone: boolean; apps: unknown; minVersions: unknown }) {
  return { enabled: row.enabled, killed: row.killed, everyone: row.everyone, apps: readApps(row.apps), minVersions: readMinVersions(row.minVersions) };
}

/** A feature's master switch, everyone, apps and minimum versions. */
export async function saveFeatureSwitchAction(formData: FormData) {
  const user = await featureAdmin();
  const key = featureKeyFrom(formData);
  if (!key) back({ error: "Pick a feature." });
  const row = await db.featureSwitch.findUnique({ where: { key } });
  if (!row) back({ error: "That feature isn't in the database yet. Run the feature switches migration." });
  const apps = FEATURE_APPS.filter((app) => formData.get(`app_${app}`) === "on");
  const minVersions: Record<string, string> = {};
  for (const app of FEATURE_APPS) {
    const version = text(formData, `min_${app}`, 20);
    if (!version) continue;
    if (!isValidVersion(version)) back({ error: `“${version}” isn't a version. Use numbers like 1.0.3.` }, key);
    minVersions[app] = version;
  }
  const after = { enabled: formData.get("enabled") === "on", killed: row.killed, everyone: formData.get("everyone") === "on", apps, minVersions };
  const before = snapshot(row);
  if (JSON.stringify(before) === JSON.stringify(after)) back({ saved: "Nothing changed." }, key);
  await db.featureSwitch.update({ where: { key }, data: { enabled: after.enabled, everyone: after.everyone, apps: after.apps, minVersions: after.minVersions, updatedBy: user.id } });
  await logFeatureChange({ featureKey: key, action: "switch.saved", before, after, actorUserId: user.id });
  clearFeatureSwitchCache();
  back({ saved: `Saved ${row.name}. Apps pick it up within a minute.` }, key);
}

/** One feature's kill switch: off for everyone at once (or back to its settings). */
export async function setFeatureKilledAction(formData: FormData) {
  const user = await featureAdmin();
  const key = featureKeyFrom(formData);
  if (!key) back({ error: "Pick a feature." });
  const killed = formData.get("killed") === "true";
  const row = await db.featureSwitch.findUnique({ where: { key } });
  if (!row) back({ error: "That feature isn't in the database yet." });
  if (row.killed !== killed) {
    await db.featureSwitch.update({ where: { key }, data: { killed, updatedBy: user.id } });
    await logFeatureChange({ featureKey: key, action: killed ? "switch.killed" : "switch.unkilled", before: { killed: row.killed }, after: { killed }, actorUserId: user.id });
    clearFeatureSwitchCache();
  }
  back({ saved: killed ? `${row.name} is off for everyone.` : `${row.name}'s kill switch is off; its settings apply again.` }, key);
}

/** "Kill all pilot features": every pilot feature off for everyone, whatever its own settings say. */
export async function setKillAllAction(formData: FormData) {
  const user = await featureAdmin();
  const killed = formData.get("killed") === "true";
  const current = await db.platformSetting.findUnique({ where: { key: KILL_ALL_SETTING_KEY }, select: { value: true } });
  const wasKilled = Boolean(current?.value && typeof current.value === "object" && (current.value as { killed?: unknown }).killed === true);
  if (wasKilled !== killed) {
    const value = { killed } as Prisma.InputJsonValue;
    await db.platformSetting.upsert({ where: { key: KILL_ALL_SETTING_KEY }, create: { key: KILL_ALL_SETTING_KEY, value, updatedById: user.id }, update: { value, updatedById: user.id } });
    await logFeatureChange({ action: killed ? "global.killed" : "global.unkilled", before: { killed: wasKilled }, after: { killed }, actorUserId: user.id });
    clearFeatureSwitchCache();
  }
  back({ saved: killed ? "Every pilot feature is off for everyone." : "The global kill switch is off; each feature's own settings apply again." });
}

type Match = { value: string; label: string };

async function findTargets(kind: TargetKind, query: string): Promise<Match[]> {
  const q = query.trim();
  if (kind === "store") {
    const slug = q.toLowerCase().replace(/^https?:\/\//, "").replace(/\.mybos\.store.*$/, "").replace(/^.*\/s\//, "").replace(/^@/, "").replace(/\/.*$/, "");
    const exact = await db.store.findMany({ where: { OR: [{ slug }, { previousSlugs: { has: slug } }] }, select: { id: true, name: true, slug: true }, take: 2 });
    if (exact.length) return exact.map((row) => ({ value: row.id, label: `${row.name} (${row.slug})` }));
    const named = await db.store.findMany({ where: { name: { contains: q, mode: "insensitive" } }, select: { id: true, name: true, slug: true }, take: 6, orderBy: { createdAt: "asc" } });
    return named.map((row) => ({ value: row.id, label: `${row.name} (${row.slug})` }));
  }
  if (kind === "supplier") {
    const exact = await db.supplier.findMany({ where: { slug: q.toLowerCase() }, select: { id: true, businessName: true, slug: true }, take: 2 });
    if (exact.length) return exact.map((row) => ({ value: row.id, label: `${row.businessName} (${row.slug})` }));
    const named = await db.supplier.findMany({
      where: { OR: [{ businessName: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] },
      select: { id: true, businessName: true, slug: true },
      take: 6,
    });
    return named.map((row) => ({ value: row.id, label: `${row.businessName} (${row.slug})` }));
  }
  if (kind === "user") {
    const people = await db.user.findMany({ where: { email: { equals: q, mode: "insensitive" } }, select: { id: true, email: true, name: true }, take: 2 });
    return people.map((row) => ({ value: row.id, label: row.email || row.name }));
  }
  const area = await db.pilotArea.findUnique({ where: { id: q }, select: { id: true, name: true } });
  return area ? [{ value: area.id, label: area.name }] : [];
}

/** Turns a feature on for a shop (slug or name), a supplier (slug or name), a person (email) or a pilot area. */
export async function addFeatureTargetAction(formData: FormData) {
  const user = await featureAdmin();
  const key = featureKeyFrom(formData);
  const kind = text(formData, "kind", 20) as TargetKind;
  const query = text(formData, "query", 200);
  if (!key || !(TARGET_KINDS as readonly string[]).includes(kind)) back({ error: "Pick a feature and what to turn it on for." });
  if (!query) back({ error: kind === "user" ? "Type the person's email." : kind === "area" ? "Pick an area." : "Type a slug or name." }, key);
  const matches = await findTargets(kind, query);
  if (!matches.length) back({ error: `Nothing matches “${query}”.` }, key);
  if (matches.length > 1) back({ error: `${matches.length >= 6 ? "Several" : matches.length} match “${query}”: ${matches.map((m) => m.label).join(", ")}. Type the exact slug.` }, key);
  const match = matches[0];
  const existing = await db.featureTarget.findUnique({ where: { featureKey_kind_value: { featureKey: key, kind, value: match.value } }, select: { id: true } });
  if (existing) back({ saved: `${match.label} already has it.` }, key);
  await db.featureTarget.create({ data: { featureKey: key, kind, value: match.value, label: match.label, createdBy: user.id } });
  await logFeatureChange({ featureKey: key, action: "target.added", after: { kind, value: match.value, label: match.label }, actorUserId: user.id });
  clearFeatureSwitchCache();
  back({ saved: `Added ${match.label}.` }, key);
}

export async function removeFeatureTargetAction(formData: FormData) {
  const user = await featureAdmin();
  const id = text(formData, "id", 64);
  const row = id ? await db.featureTarget.findUnique({ where: { id } }) : null;
  if (!row) back({ error: "That's already gone." });
  await db.featureTarget.delete({ where: { id: row.id } });
  await logFeatureChange({ featureKey: row.featureKey, action: "target.removed", before: { kind: row.kind, value: row.value, label: row.label }, actorUserId: user.id });
  clearFeatureSwitchCache();
  back({ saved: `Removed ${row.label ?? row.value}.` }, row.featureKey);
}

/** A pilot area: a name and its places, one per line ("Lagos", "Lagos > Yaba", "Lagos > Lagos > Surulere"). */
export async function savePilotAreaAction(formData: FormData) {
  const user = await featureAdmin();
  const id = text(formData, "id", 64);
  const name = text(formData, "name", 80);
  const places = parsePlaces(String(formData.get("places") ?? ""));
  if (!name) back({ error: "Give the area a name." }, "areas");
  if (!places.length) back({ error: "Add at least one place (a state, or “State > area”)." }, "areas");
  const value = places as unknown as Prisma.InputJsonValue;
  if (id) {
    const row = await db.pilotArea.findUnique({ where: { id } });
    if (!row) back({ error: "That area is gone." }, "areas");
    await db.pilotArea.update({ where: { id }, data: { name, places: value } });
    await logFeatureChange({ action: "area.saved", before: { id, name: row.name, places: row.places }, after: { id, name, places: places.map(formatPlaceRule) }, actorUserId: user.id });
  } else {
    const row = await db.pilotArea.create({ data: { name, places: value, createdBy: user.id } });
    await logFeatureChange({ action: "area.created", after: { id: row.id, name, places: places.map(formatPlaceRule) }, actorUserId: user.id });
  }
  clearFeatureSwitchCache();
  back({ saved: `Saved ${name}.` }, "areas");
}

export async function deletePilotAreaAction(formData: FormData) {
  const user = await featureAdmin();
  const id = text(formData, "id", 64);
  const row = id ? await db.pilotArea.findUnique({ where: { id } }) : null;
  if (!row) back({ error: "That area is gone." }, "areas");
  await db.$transaction([db.featureTarget.deleteMany({ where: { kind: "area", value: row.id } }), db.pilotArea.delete({ where: { id: row.id } })]);
  await logFeatureChange({ action: "area.deleted", before: { id: row.id, name: row.name, places: row.places }, actorUserId: user.id });
  clearFeatureSwitchCache();
  back({ saved: `Deleted ${row.name}; features targeting it no longer do.` }, "areas");
}

/** A new invite code that gives each person who redeems it a set of features. */
export async function createFeatureInviteAction(formData: FormData) {
  const user = await featureAdmin();
  const features = FEATURE_KEYS.filter((key) => formData.get(`feature_${key}`) === "on");
  if (!features.length) back({ error: "Tick at least one feature for the code." }, "invites");
  const typed = normalizeInviteCode(text(formData, "code", 40));
  if (typed && typed.length < 6) back({ error: "Codes need at least 6 letters or numbers." }, "invites");
  const maxText = text(formData, "maxUses", 8);
  const maxUses = maxText ? Number(maxText) : null;
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100_000)) back({ error: "Uses must be a whole number from 1, or empty for no limit." }, "invites");
  const daysText = text(formData, "days", 5);
  const days = daysText ? Number(daysText) : null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) back({ error: "Days must be a whole number from 1, or empty for no expiry." }, "invites");
  const expiresAt = days ? new Date(Date.now() + days * 86_400_000) : null;
  const note = text(formData, "note", 200) || null;
  const code = typed || newInviteCode();
  if (await db.featureInvite.findUnique({ where: { code }, select: { id: true } })) back({ error: `${code} is already a code. Pick another.` }, "invites");
  const row = await db.featureInvite.create({ data: { code, features, maxUses, expiresAt, note, createdBy: user.id } });
  await logFeatureChange({ action: "invite.created", after: { id: row.id, code, features, maxUses, expiresAt, note }, actorUserId: user.id });
  back({ saved: `Made ${code}.` }, "invites");
}

export async function setFeatureInviteDisabledAction(formData: FormData) {
  const user = await featureAdmin();
  const id = text(formData, "id", 64);
  const disabled = formData.get("disabled") === "true";
  const row = id ? await db.featureInvite.findUnique({ where: { id } }) : null;
  if (!row) back({ error: "That code is gone." }, "invites");
  if (row.disabled !== disabled) {
    await db.featureInvite.update({ where: { id: row.id }, data: { disabled } });
    await logFeatureChange({ action: disabled ? "invite.disabled" : "invite.enabled", before: { code: row.code, disabled: row.disabled }, after: { code: row.code, disabled }, actorUserId: user.id });
    clearFeatureSwitchCache();
  }
  back({ saved: disabled ? `${row.code} is off: it no longer works, and people who redeemed it lose its features.` : `${row.code} works again.` }, "invites");
}
