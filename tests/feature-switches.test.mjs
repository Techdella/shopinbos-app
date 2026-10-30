// Turning pilot features on (shared/feature-switches.ts): the decision (kill switches win, then master, app,
// minimum version, then everyone / targets / invites), versions, places and pilot areas, invite codes, and the
// wiring around it (migration, admin page and actions, API routes, phone app, words in every language).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fs = await import("../shared/feature-switches.ts");
const team = await import("../src/lib/admin-team/pure.ts");
const nav = await import("../src/lib/nav.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sw = (over = {}) => ({ key: "live", enabled: true, killed: false, everyone: false, apps: ["business_android"], minVersions: {}, ...over });
const ctx = (over = {}) => ({ app: "business_android", appVersion: "1.2.0", userId: "u1", storeId: "s1", supplierId: null, place: null, inviteFeatures: [], ...over });
const on = (feature, context = ctx(), targets = [], areas = [], options) => fs.isFeatureOn(feature, context, targets, areas, options);

test("versions compare as numbers, not text", () => {
  assert.equal(fs.compareVersions("1.0.10", "1.0.9") > 0, true);
  assert.equal(fs.compareVersions("1.0.3", "1.0.3"), 0);
  assert.equal(fs.compareVersions("1.2", "1.2.0"), 0);
  assert.equal(fs.compareVersions("2", "1.99.99") > 0, true);
  assert.equal(fs.compareVersions("v1.4.0-beta.2", "1.4.0"), 0);
  assert.equal(fs.compareVersions("0.9.9", "1.0.0") < 0, true);
  assert.equal(fs.compareVersions("abc", "1.0.0"), null);
  assert.equal(fs.compareVersions(null, "1.0.0"), null);
  assert.deepEqual(fs.parseVersion("3.1.4 (52)"), [3, 1, 4]);
});

test("versionAtLeast: no minimum passes; a minimum with no readable version fails closed", () => {
  assert.equal(fs.versionAtLeast("1.0.0", undefined), true);
  assert.equal(fs.versionAtLeast(null, ""), true);
  assert.equal(fs.versionAtLeast(null, "1.0.3"), false);
  assert.equal(fs.versionAtLeast("garbage", "1.0.3"), false);
  assert.equal(fs.versionAtLeast("1.0.2", "1.0.3"), false);
  assert.equal(fs.versionAtLeast("1.0.3", "1.0.3"), true);
  assert.equal(fs.versionAtLeast("1.1", "1.0.3"), true);
});

test("apps: only the five known apps, from the header", () => {
  assert.deepEqual([...fs.FEATURE_APPS], ["business_android", "business_ios", "business_web", "plug_android", "plug_ios"]);
  assert.equal(fs.parseFeatureApp(" Business_IOS "), "business_ios");
  assert.equal(fs.parseFeatureApp("plug_ios"), "plug_ios");
  assert.equal(fs.parseFeatureApp("windows_phone"), null);
  assert.equal(fs.parseFeatureApp(null), null);
  assert.deepEqual(fs.readApps(["plug_android", "nope", "business_web"]), ["business_web", "plug_android"]);
  assert.deepEqual(fs.readApps("business_web"), []);
  assert.deepEqual(fs.readMinVersions({ business_ios: "1.0.3", business_android: "soon", other: "1.0.0" }), { business_ios: "1.0.3" });
  assert.deepEqual(fs.readMinVersions(null), {});
});

test("off by default: master off, no apps, or no app asking", () => {
  assert.equal(on(sw({ enabled: false, everyone: true })), false);
  assert.equal(on(sw({ apps: [], everyone: true })), false);
  assert.equal(on(sw({ everyone: true }), ctx({ app: null })), false);
  assert.equal(on(null), false);
  assert.equal(on(sw({ everyone: true }), ctx({ app: "business_ios" })), false, "app not ticked");
  // On, ticked, but nobody targeted and no invite: off.
  assert.equal(on(sw()), false);
});

test("kill switches win over everything", () => {
  const everyone = sw({ everyone: true });
  assert.equal(on(everyone), true);
  assert.equal(on({ ...everyone, killed: true }), false);
  assert.equal(on(everyone, ctx(), [], [], { killAll: true }), false);
  assert.equal(on(sw({ killed: true }), ctx({ inviteFeatures: ["live"] })), false, "an invite doesn't beat the kill switch");
  assert.equal(on(sw({ killed: true }), ctx(), [{ featureKey: "live", kind: "store", value: "s1" }]), false, "a target doesn't either");
  assert.deepEqual(fs.featuresOn([everyone], ctx(), [], [], { killAll: true }), []);
});

test("minimum version per app: too old or unknown → hidden even when on", () => {
  const feature = sw({ everyone: true, apps: ["business_android", "business_ios"], minVersions: { business_ios: "1.0.3" } });
  assert.equal(on(feature, ctx({ app: "business_ios", appVersion: "1.0.2" })), false);
  assert.equal(on(feature, ctx({ app: "business_ios", appVersion: null })), false);
  assert.equal(on(feature, ctx({ app: "business_ios", appVersion: "1.0.3" })), true);
  assert.equal(on(feature, ctx({ app: "business_android", appVersion: null })), true, "no minimum for Android");
});

test("targets: shop, supplier account, user, and invite holders", () => {
  const feature = sw();
  const targets = [
    { featureKey: "live", kind: "store", value: "s9" },
    { featureKey: "live", kind: "supplier", value: "sup1" },
    { featureKey: "live", kind: "user", value: "u7" },
    { featureKey: "group_buy", kind: "store", value: "s1" },
  ];
  assert.equal(on(feature, ctx({ storeId: "s9" }), targets), true);
  assert.equal(on(feature, ctx({ storeId: null, supplierId: "sup1" }), targets), true);
  assert.equal(on(feature, ctx({ storeId: null, userId: "u7" }), targets), true);
  assert.equal(on(feature, ctx({ storeId: "s1" }), targets), false, "a target for another feature doesn't count");
  assert.equal(on(feature, ctx({ storeId: null, userId: "u1", inviteFeatures: ["live"] }), targets), true);
  assert.equal(on(feature, ctx({ storeId: null, userId: null }), targets), false);
});

test("areas: a named list of places; state, then city or area", () => {
  const areas = [{ id: "a1", places: [{ state: "Lagos", area: "Yaba" }, { state: "Lagos", area: "Surulere" }] }, { id: "a2", places: [{ state: "Ogun" }] }];
  const targets = [{ featureKey: "live", kind: "area", value: "a1" }];
  const feature = sw();
  assert.equal(on(feature, ctx({ storeId: null, place: { state: "Lagos", city: "Lagos", area: "Yaba" } }), targets, areas), true);
  assert.equal(on(feature, ctx({ storeId: null, place: { state: "Lagos State", city: "surulere", area: null } }), targets, areas), true, "city typed as the area");
  assert.equal(on(feature, ctx({ storeId: null, place: { state: "Lagos", city: "Lagos", area: "Ikeja" } }), targets, areas), false);
  assert.equal(on(feature, ctx({ storeId: null, place: { state: "Oyo", city: null, area: "Yaba" } }), targets, areas), false, "same name, other state");
  assert.equal(on(feature, ctx({ storeId: null, place: null }), targets, areas), false);
  assert.equal(on(feature, ctx({ storeId: null, place: { state: "Ogun", city: "Abeokuta" } }), [{ featureKey: "live", kind: "area", value: "a2" }], areas), true, "a whole state");
  assert.equal(on(feature, ctx({ storeId: null, place: { state: "Ogun" } }), [{ featureKey: "live", kind: "area", value: "gone" }], areas), false, "a deleted area matches nobody");
  assert.equal(fs.placeMatches({}, { state: "Lagos" }), false, "an empty rule matches nobody");
});

test("the area editor: one place per line", () => {
  assert.deepEqual(fs.parsePlaceLine("Lagos"), { state: "Lagos" });
  assert.deepEqual(fs.parsePlaceLine("Lagos > Yaba"), { state: "Lagos", area: "Yaba" });
  assert.deepEqual(fs.parsePlaceLine(" Lagos / Lagos / Surulere "), { state: "Lagos", city: "Lagos", area: "Surulere" });
  assert.equal(fs.parsePlaceLine("   "), null);
  assert.deepEqual(fs.parsePlaces("Lagos > Yaba\n\nLagos > Surulere\r\nOgun"), [{ state: "Lagos", area: "Yaba" }, { state: "Lagos", area: "Surulere" }, { state: "Ogun" }]);
  for (const line of ["Lagos", "Lagos > Yaba", "Lagos > Lagos > Surulere"]) assert.equal(fs.formatPlaceRule(fs.parsePlaceLine(line)), line);
  assert.deepEqual(fs.readPlaces([{ state: "Lagos", area: "Yaba", extra: 1 }, "junk", {}, null]), [{ state: "Lagos", area: "Yaba" }]);
  assert.equal(fs.placeKey("Yaba-Surulere"), "yaba surulere");
  assert.equal(fs.placeKey("Lagos State"), "lagos");
});

test("featuresOn lists the keys on, sorted", () => {
  const features = [sw({ key: "resell", everyone: true }), sw({ key: "ajo", everyone: true }), sw({ key: "live" })];
  assert.deepEqual(fs.featuresOn(features, ctx(), [], []), ["ajo", "resell"]);
  assert.deepEqual(fs.featuresOn(features, ctx({ inviteFeatures: ["live"] }), [], []), ["ajo", "live", "resell"]);
});

test("invite codes: typed any way, made readable, usable until expired or used up", () => {
  assert.equal(fs.normalizeInviteCode(" plug-yaba 12 "), "PLUGYABA12");
  const code = fs.inviteCodeFrom([0, 1, 2, 3, 4, 5, 6, 7]);
  assert.match(code, /^PILOT[A-Z2-9]{8}$/);
  assert.doesNotMatch(code.slice(5), /[01OIL]/);
  const now = new Date("2026-12-13T10:00:00Z");
  assert.equal(fs.inviteUsable({ features: ["live"], maxUses: null, uses: 40, expiresAt: null }, now), "ok");
  assert.equal(fs.inviteUsable({ features: ["live"], maxUses: 5, uses: 5, expiresAt: null }, now), "used_up");
  assert.equal(fs.inviteUsable({ features: ["live"], maxUses: 5, uses: 1, expiresAt: "2026-12-13T09:59:00Z" }, now), "expired");
  assert.equal(fs.inviteUsable({ features: ["live"], maxUses: null, uses: 0, expiresAt: null, disabled: true }, now), "not_found");
  assert.equal(fs.inviteUsable(null, now), "not_found");
});

test("the migration is additive and seeds every feature off, in step with FEATURES", () => {
  const sql = read("docs/migrations/2026-12-13-feature-switches.sql");
  assert.match(sql, /^-- /);
  assert.doesNotMatch(sql, /\bDROP\b|\bDELETE FROM\b|\bTRUNCATE\b|\bUPDATE "/i);
  for (const table of ["FeatureSwitch", "FeatureTarget", "PilotArea", "FeatureInvite", "FeatureInviteUse", "FeatureSwitchLog"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`), table);
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`), table);
  }
  assert.match(sql, /"enabled" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /"killed" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /"everyone" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /ON CONFLICT \("key"\) DO NOTHING/);
  assert.equal(fs.FEATURES.length, 11);
  for (const key of ["post_to_plug", "resell", "creator_briefs", "notify_followers", "group_buy", "ajo", "pay_small_small", "personal_shopper", "live", "rex_studio_creators", "plug_follow_card"]) {
    assert.ok(fs.FEATURE_KEYS.includes(key), key);
    assert.match(sql, new RegExp(`\\('${key}', `), `${key} is seeded`);
  }
  const schema = read("prisma/schema.prisma");
  for (const model of ["FeatureSwitch", "FeatureTarget", "PilotArea", "FeatureInvite", "FeatureInviteUse", "FeatureSwitchLog"]) assert.match(schema, new RegExp(`^model ${model} \\{`, "m"), model);
});

test("the server fails closed and caches the switches briefly", () => {
  const server = read("src/lib/feature-switches.server.ts");
  assert.match(server, /const CACHE_MS = 30_000/);
  assert.match(server, /catch \(error\) \{\s*console\.warn\("\[feature-switches\][^"]*"[^)]*\);\s*return \[\];/);
  assert.match(server, /export async function featureOn\(/);
  assert.match(server, /"business_web"/);
});

test("API: GET /api/app/features for any signed-in role; invite redeeming is rate limited", () => {
  const get = read("src/app/api/app/features/route.ts");
  assert.match(get, /export const GET = withAuth\(async/);
  assert.doesNotMatch(get, /withAuth\([^)]*\[/, "no role list: every signed-in role may ask");
  assert.match(get, /ok\(\{ features \}\)/);
  const invite = read("src/app/api/app/features/invite/route.ts");
  assert.match(invite, /export const POST = withAuth\(async/);
  assert.match(invite, /checkRateLimitShared\(rateLimitKey\("feature-invite", user\.id\)/);
  assert.match(read("src/app/api/admin/features/route.ts"), /withAdmin\(/);
});

test("admin: the page and every action are for owners and admins, and every change is logged", () => {
  assert.equal(team.sectionForPath("/admin/features"), "restricted");
  assert.equal(team.adminCanOpen("support", "/api/admin/features"), false);
  assert.equal(team.adminCanOpen("admin", "/admin/features"), true);
  assert.ok(nav.navLinks("admin").some((link) => link.href === "/admin/features"));
  const actions = read("src/app/actions/admin-features.ts");
  assert.ok(actions.startsWith('"use server"'));
  const exported = [...actions.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
  assert.ok(exported.length >= 8);
  for (const name of exported) {
    const body = actions.slice(actions.indexOf(`export async function ${name}(`)).split(/\nexport /)[0];
    assert.match(body, /await featureAdmin\(\)/, `${name} checks the caller`);
    if (!/createFeatureInvite|setKillAll|savePilotArea|deletePilotArea|setFeatureInviteDisabled|saveFeatureSwitch|setFeatureKilled|addFeatureTarget|removeFeatureTarget/.test(name)) continue;
    assert.match(body, /logFeatureChange\(/, `${name} logs the change`);
  }
  assert.match(actions, /async function featureAdmin\(\) \{\s*const user = await requireRole\(\["admin"\], "\/admin\/login"\);\s*if \(!isFullAdmin/);
  const page = read("src/app/admin/features/page.tsx");
  assert.match(page, /requireRole\(\["admin"\], "\/admin\/login"\)/);
  assert.match(page, /Kill all pilot features/);
});

test("phone: sends its app and version, loads on open and foreground, defaults off", () => {
  const api = read("apps/mobile/src/lib/api.ts");
  assert.match(api, /export function appHeaders\(\)/);
  assert.match(api, /APP_PLATFORM_HEADER/);
  assert.match(api, /nativeApplicationVersion/);
  const lib = read("apps/mobile/src/lib/features.ts");
  assert.match(lib, /export function useFeature\(key: string\): boolean/);
  assert.match(lib, /AppState\.addEventListener\("change"/);
  assert.match(lib, /\/api\/app\/features", \{ headers: appHeaders\(\) \}/);
  assert.match(lib, /localStorage/);
  assert.match(read("apps/mobile/src/app/settings.tsx"), /<PilotInviteCard \/>/);
});

test("the invite words exist in every language", () => {
  const keys = ["pilot.section", "pilot.title", "pilot.hint", "pilot.redeem", "pilot.empty", "pilot.done", "pilot.notFound", "pilot.expired", "pilot.usedUp", "pilot.tooMany"];
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    for (const key of keys) assert.ok(CATALOGS.m_settings[locale]?.[key], `${locale} m_settings ${key}`);
  }
});
