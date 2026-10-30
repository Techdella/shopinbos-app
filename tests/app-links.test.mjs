// iPhone universal links (shared/app-links.ts): every listed page has a screen in the phone app, shop and sign-in
// pages stay on the web, the apple-app-site-association file, its route and the app's settings.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const links = await import("../shared/app-links.ts");
const { appRouteFor } = await import("../shared/notifications.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every page that opens the app has a screen there", () => {
  for (const pattern of links.UNIVERSAL_LINK_PATHS) {
    const path = pattern.replace(/\*/g, "abc123").replace(/\?/g, "x");
    assert.ok(links.opensInApp(path), path);
    assert.ok(appRouteFor(path), `the app has no screen for ${path}`);
  }
});

test("pages without a screen, shops, sign-in and web-only areas stay in Safari", () => {
  for (const path of links.UNIVERSAL_LINK_EXCLUDED) {
    assert.equal(links.opensInApp(path), false, path);
    assert.equal(appRouteFor(path), null, `${path} has a screen now: drop it from the excluded list`);
  }
  for (const path of ["/", "/s/ada-fabrics", "/s/ada-fabrics/products/x", "/login", "/signup", "/supplier/signup", "/supplier/login", "/logistics/signup", "/auth/handoff", "/auth/callback", "/admin", "/admin/dashboard", "/api/public/products", "/delete-account", "/r/abc", "/invite/abc", "/homepage", "/supplierx"]) {
    assert.equal(links.opensInApp(path), false, path);
  }
  assert.equal(links.opensInApp("/home/orders/ord_1"), true);
  assert.equal(links.opensInApp("/rider/drop/d1"), true);
});

test("appHostPath: only https links on app.shopinbos.com", () => {
  assert.equal(links.appHostPath("https://app.shopinbos.com/home/orders/abc?x=1"), "/home/orders/abc?x=1");
  assert.equal(links.appHostPath("https://APP.shopinbos.com"), "/");
  assert.equal(links.appHostPath("https://app.shopinbos.com/home#top"), "/home");
  assert.equal(links.appHostPath("https://shopinbos.com/home"), null);
  assert.equal(links.appHostPath("https://app.shopinbos.com.evil.com/home"), null);
  assert.equal(links.appHostPath("http://app.shopinbos.com/home"), null);
  assert.equal(links.appHostPath("shopinbos://auth/callback#access_token=x"), null);
  assert.equal(links.appHostPath("/home/orders"), null);
});

test("the association file: excludes first, then pages; webcredentials for saved passwords", () => {
  assert.equal(links.isAppleTeamId("AB12CD34EF"), true);
  for (const bad of ["", "ab12cd34ef", "AB12CD34E", "AB12CD34EF1", null, undefined]) assert.equal(links.isAppleTeamId(bad), false, String(bad));
  const file = links.appleAppSiteAssociation("AB12CD34EF");
  const detail = file.applinks.details[0];
  assert.deepEqual(detail.appIDs, ["AB12CD34EF.com.shopinbos.app"]);
  assert.deepEqual(file.webcredentials.apps, ["AB12CD34EF.com.shopinbos.app"]);
  const firstPage = detail.components.findIndex((c) => !c.exclude);
  assert.ok(detail.components.slice(0, firstPage).every((c) => c.exclude === true));
  assert.equal(firstPage, links.UNIVERSAL_LINK_EXCLUDED.length);
  assert.ok(JSON.stringify(file).length < 128 * 1024, "Apple's size limit");
});

test("route, app settings and native intent", () => {
  const route = read("src/app/.well-known/apple-app-site-association/route.ts");
  assert.match(route, /APPLE_TEAM_ID/);
  assert.match(route, /isAppleTeamId/);
  assert.match(route, /NextResponse\.json\(/);
  assert.doesNotMatch(route, /NextResponse\.redirect|requireRole/);
  assert.match(read(".env.local.example"), /^APPLE_TEAM_ID=/m);

  const app = JSON.parse(read("apps/mobile/app.json")).expo;
  assert.equal(app.ios.bundleIdentifier, links.IOS_BUNDLE_ID);
  assert.ok(app.ios.associatedDomains.includes(`applinks:${links.APP_LINK_HOST}`));
  assert.ok(app.ios.associatedDomains.includes(`webcredentials:${links.APP_LINK_HOST}`));

  const intent = read("apps/mobile/src/app/+native-intent.tsx");
  assert.match(intent, /export function redirectSystemPath/);
  assert.match(intent, /appHostPath\(path\)/);
  assert.match(intent, /if \(webPath === null\) return path;/);
  assert.match(intent, /catch \{\s*return "\/";/);
});

test("iPhone privacy texts: every one Apple checks for at upload is filled in (App Store Connect error 90683)", () => {
  const app = JSON.parse(read("apps/mobile/app.json")).expo;
  const plugin = (name) => app.plugins.find((entry) => Array.isArray(entry) && entry[0] === name)?.[1] ?? {};
  const filled = (value) => typeof value === "string" && value.trim().length > 20;
  assert.ok(filled(app.ios.infoPlist.NSCameraUsageDescription));
  assert.ok(filled(app.ios.infoPlist.NSPhotoLibraryUsageDescription));
  assert.ok(filled(plugin("expo-audio").microphonePermission));
  assert.ok(filled(plugin("expo-location").locationWhenInUsePermission));
  // expo-location's iOS code includes motion activity (CMMotionActivityManager). The app never asks for it, but
  // Apple rejects the upload unless NSMotionUsageDescription is there; `false` removes it.
  assert.ok(filled(plugin("expo-location").motionUsagePermission), "expo-location motionUsagePermission must be a sentence, not false");
});
