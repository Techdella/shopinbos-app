// Phone app updates (shared/app-release.ts): which builds are asked to update or must update, where "Update now"
// goes, "Later" for three days, the hourly check, the admin form's rules, the API route, the admin page and nav,
// and the words in every language.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ar = await import("../shared/app-release.ts");
const nav = await import("../src/lib/nav.ts");
const team = await import("../src/lib/admin-team/pure.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("defaults: nothing to prompt", () => {
  assert.deepEqual(ar.DEFAULT_APP_RELEASE, { latestBuild: 0, minBuild: 0 });
  assert.equal(ar.updateState(5, ar.DEFAULT_APP_RELEASE), "current");
  assert.equal(ar.appReleaseKey("android"), "app.release.android");
});

test("updateState: required below the minimum, available below the latest, else current", () => {
  const release = { latestBuild: 20, minBuild: 12 };
  assert.equal(ar.updateState(11, release), "required");
  assert.equal(ar.updateState(12, release), "available");
  assert.equal(ar.updateState(19, release), "available");
  assert.equal(ar.updateState(20, release), "current");
  assert.equal(ar.updateState(25, release), "current");
  assert.equal(ar.updateState("11", release), "required");
  assert.equal(ar.updateState(5, { latestBuild: 0, minBuild: 0 }), "current");
  assert.equal(ar.updateState(5, { latestBuild: 9, minBuild: 0 }), "available");
});

test("updateState: an unknown build is always current", () => {
  const release = { latestBuild: 20, minBuild: 12 };
  for (const build of [null, undefined, NaN, 0, -1, "", "abc", "1.0.3"]) assert.equal(ar.updateState(build, release), "current", String(build));
  assert.equal(ar.updateState(3, null), "current");
});

test("parseAppRelease: anything odd reads as the default; the minimum never passes the latest", () => {
  assert.deepEqual(ar.parseAppRelease(null), { latestBuild: 0, minBuild: 0 });
  assert.deepEqual(ar.parseAppRelease("x"), { latestBuild: 0, minBuild: 0 });
  assert.deepEqual(ar.parseAppRelease({ latestBuild: 30, minBuild: 40 }), { latestBuild: 30, minBuild: 30 });
  assert.deepEqual(ar.parseAppRelease({ latestBuild: 3.5, minBuild: -2 }), { latestBuild: 0, minBuild: 0 });
  assert.deepEqual(ar.parseAppRelease({ latestBuild: 30, minBuild: 10, message: "  <b>New</b>\n Orders  " }), { latestBuild: 30, minBuild: 10, message: "New Orders" });
  assert.equal(ar.parseAppRelease({ latestBuild: 1, message: "x".repeat(500) }).message.length, ar.APP_RELEASE_MESSAGE_MAX);
});

test("validateAppReleaseInput: whole numbers, minimum ≤ latest, empty is 0", () => {
  assert.deepEqual(ar.validateAppReleaseInput({ latestBuild: "42", minBuild: "40", message: "" }), { ok: true, release: { latestBuild: 42, minBuild: 40 } });
  assert.deepEqual(ar.validateAppReleaseInput({ latestBuild: "", minBuild: "" }), { ok: true, release: { latestBuild: 0, minBuild: 0 } });
  assert.equal(ar.validateAppReleaseInput({ latestBuild: "4.2", minBuild: "0" }).ok, false);
  assert.equal(ar.validateAppReleaseInput({ latestBuild: "-1" }).ok, false);
  assert.equal(ar.validateAppReleaseInput({ latestBuild: "10", minBuild: "11" }).ok, false);
  assert.equal(ar.validateAppReleaseInput({ latestBuild: "10", minBuild: "x" }).ok, false);
  assert.equal(ar.validateAppReleaseInput({ latestBuild: "10", minBuild: "2", message: "Faster photos" }).release.message, "Faster photos");
});

test("store links: the Play Store app, then its website; iOS does nothing until listed", () => {
  assert.deepEqual(ar.storeUrls("android"), ["market://details?id=com.shopinbos.app", "https://play.google.com/store/apps/details?id=com.shopinbos.app"]);
  assert.deepEqual(ar.storeUrls("ios"), ["https://apps.apple.com/app/id6828637131"]);
  assert.equal(ar.IOS_APP_STORE_URL, `https://apps.apple.com/app/id${ar.IOS_APP_STORE_ID}`);
  assert.deepEqual(ar.storeUrls("ios", "javascript:alert(1)"), []);
  assert.deepEqual(ar.storeUrls("ios", "https://apps.apple.com/app/id123"), ["https://apps.apple.com/app/id123"]);
  assert.deepEqual(ar.storeUrls("web"), []);
});

test("Later: once per three days per latest build; a newer build asks again", () => {
  const day = 24 * 60 * 60 * 1000;
  const t0 = Date.parse("2026-10-28T10:00:00Z");
  assert.equal(ar.availablePromptDue(null, 20, t0), true);
  const snooze = ar.snoozeFor(20, t0);
  assert.deepEqual(ar.parseSnooze(JSON.stringify(snooze)), snooze);
  assert.equal(ar.parseSnooze("nope"), null);
  assert.equal(ar.parseSnooze(null), null);
  assert.equal(ar.availablePromptDue(snooze, 20, t0 + day), false);
  assert.equal(ar.availablePromptDue(snooze, 20, t0 + 3 * day - 1), false);
  assert.equal(ar.availablePromptDue(snooze, 20, t0 + 3 * day), true);
  assert.equal(ar.availablePromptDue(snooze, 21, t0 + day), true, "a newer build");
  assert.equal(ar.availablePromptDue(snooze, 20, t0 - day), true, "clock moved back");
});

test("the foreground check runs at most once an hour", () => {
  const t0 = 1_000_000;
  assert.equal(ar.releaseCheckDue(null, t0), true);
  assert.equal(ar.releaseCheckDue(t0, t0 + 59 * 60_000), false);
  assert.equal(ar.releaseCheckDue(t0, t0 + 60 * 60_000), true);
});

test("API route: public, rate limited, CORS and short caching; admin page logs changes", () => {
  const route = read("src/app/api/mobile/app-release/route.ts");
  assert.match(route, /overPublicLimit\(req\.headers, "appRelease"\)/);
  assert.match(route, /withCors\(/);
  assert.match(route, /max-age=60/);
  assert.doesNotMatch(route, /requireRole|withStatusUser|Authorization/);
  const server = read("src/lib/app-release.server.ts");
  assert.match(server, /CACHE_MS = 60_000/);
  assert.match(server, /platformSettingChange\.create/);
  const page = read("src/app/admin/app-release/page.tsx");
  assert.match(page, /requireAdminSection\("developers"\)/);
  assert.match(page, /getAppRelease\("android"\)[\s\S]*getAppRelease\("ios"\)/);
  const admin = read("src/components/admin/AppReleaseAdmin.tsx");
  assert.match(admin, /Set the latest build only after the version is live on \{info\.store\}\./);
  assert.match(admin, /<PlatformCard platform="android"[\s\S]*<PlatformCard platform="ios"/);
  assert.match(admin, /name="platform" value=\{platform\}/);
  assert.match(read("src/app/actions/app-release.ts"), /requireAdminSection\("developers"\)/);
});

test("admin nav: App updates, for the roles that open Developers", () => {
  const item = nav.NAV_BY_ROLE.admin.flatMap((g) => g.items).find((i) => i.id === "app-release");
  assert.equal(item?.href, "/admin/app-release");
  assert.equal(team.adminCanOpen("developer", "/admin/app-release"), true);
  assert.equal(team.adminCanOpen("support", "/admin/app-release"), false);
  assert.ok(team.adminNavIds("developer").includes("app-release"));
});

test("phone app: the prompt is mounted, waits for launch and calls, and reads the real build", () => {
  const layout = read("apps/mobile/src/app/_layout.tsx");
  assert.match(layout, /<UpdatePrompt \/>/);
  const prompt = read("apps/mobile/src/components/UpdatePrompt.tsx");
  assert.match(prompt, /pathname === "\/"/);
  assert.match(prompt, /calling/);
  const lib = read("apps/mobile/src/lib/app-update.ts");
  assert.match(lib, /Application\.nativeBuildVersion/);
  assert.match(lib, /Platform\.OS === "web"[\s\S]*DEV_BUILD_KEY/);
  assert.match(read("apps/mobile/package.json"), /"expo-application"/);
});

test("phone app: iPhones ask only when the build knows its App Store link", () => {
  const lib = read("apps/mobile/src/lib/app-update.ts");
  assert.match(lib, /const IOS_STORE_URL = process\.env\.EXPO_PUBLIC_IOS_APP_STORE_URL \|\| IOS_APP_STORE_URL;/);
  // eas submit uses the same App Store Connect app and team.
  const ios = JSON.parse(read("apps/mobile/eas.json")).submit.production.ios;
  assert.deepEqual(ios, { ascAppId: ar.IOS_APP_STORE_ID, appleTeamId: "WV64KZXVML" });
  assert.match(lib, /Platform\.OS === "ios" && storeUrls\("ios", IOS_STORE_URL\)\.length/);
  assert.match(lib, /"update\.storeFailedIos"/);
});

test("the update words are in every language", () => {
  const keys = ["update.title", "update.body", "update.now", "update.later", "update.requiredTitle", "update.requiredBody", "update.help", "update.storeFailed", "update.storeFailedIos"];
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    for (const key of keys) assert.ok(CATALOGS.m_ui[locale]?.[key], `${locale} m_ui ${key}`);
  }
});
