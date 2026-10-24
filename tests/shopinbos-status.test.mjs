// Shopinbos's own Status posts and the Getting started card (shared/shopinbos-status.ts): the posts per role, their
// ids, words in all five languages, videos that exist, seen and dismissed kept in User.preferences, and source
// checks on the routes and the phone app (feed first, "Don't show again", long-press, video in the viewer, Help).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sib = await import("../shared/shopinbos-status.ts");
const prefs = await import("../shared/preferences.ts");
const intros = await import("../shared/feature-intros.ts");
const help = await import("../shared/help-videos.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];
const catalogs = Object.fromEntries(await Promise.all(LANGS.map(async (lang) => [lang, (await import(`../shared/i18n/messages/m_familiar/${lang}.ts`)).default])));

test("posts: a few per role, sellers get the five the owner asked for", () => {
  for (const role of ["seller", "supplier", "logistics_partner"]) {
    const posts = sib.shopinbosPosts(role);
    assert.ok(posts.length >= 3 && posts.length <= 6, role);
    assert.equal(new Set(posts.map((post) => post.key)).size, posts.length, `${role}: unique keys`);
    assert.ok(posts.some((post) => post.intro), `${role}: has a video post`);
  }
  assert.deepEqual(sib.shopinbosPosts("seller").map((post) => post.key), ["welcome", "call", "product", "share", "status", "find"]);
  // Every role has the "Call Peggy" post, whose button starts the in-app call.
  for (const role of ["seller", "supplier", "logistics_partner"]) assert.deepEqual(sib.shopinbosPosts(role).find((post) => post.key === "call")?.cta, { kind: "call_peggy" }, role);
  const seller = Object.fromEntries(sib.shopinbosPosts("seller").map((post) => [post.key, post.cta]));
  assert.deepEqual(seller.product, { kind: "open", path: "/add-products" });
  assert.deepEqual(seller.share, { kind: "share" });
  assert.deepEqual(seller.status, { kind: "open", path: "/status/new" });
  assert.deepEqual(seller.find, { kind: "open", path: "/find" });
  assert.deepEqual(sib.shopinbosPosts("admin"), []);
});

test("videos reuse the existing intros and help topics (no invented URLs)", () => {
  for (const role of ["seller", "supplier", "logistics_partner"]) {
    for (const post of sib.shopinbosPosts(role)) {
      if (post.intro) {
        const intro = intros.introByKey(post.intro);
        assert.ok(intro, `${role}.${post.key}: intro ${post.intro}`);
        assert.ok(intro.roles.includes(role), `${role}.${post.key}: intro for the role`);
      }
      if (post.helpTopic) {
        const topic = help.HELP_TOPICS.find((entry) => entry.key === post.helpTopic);
        assert.ok(topic && topic.roles.includes(role), `${role}.${post.key}: help topic ${post.helpTopic}`);
      }
    }
  }
  assert.doesNotMatch(read("shared/shopinbos-status.ts"), /https?:\/\//);
});

test("buttons open real app screens only", () => {
  for (const role of ["seller", "supplier", "logistics_partner"]) {
    for (const post of sib.shopinbosPosts(role)) {
      if (post.cta?.kind !== "open") continue;
      const path = post.cta.path;
      assert.ok(sib.isShopinbosPath(path));
      const file = path.replace(/^\//, "");
      const candidates = [`${file}.tsx`, `${file}/index.tsx`, file.replace(/^(supplier|logistics)\//, "$1/(tabs)/") + ".tsx"];
      assert.ok(candidates.some((candidate) => { try { read(`apps/mobile/src/app/${candidate}`); return true; } catch { return false; } }), `${path} is a phone screen`);
    }
  }
  assert.equal(sib.isShopinbosPath("https://evil.example"), false);
  assert.equal(sib.isShopinbosPath("/settings"), false);
});

test("ids round-trip and refuse anything else", () => {
  assert.equal(sib.shopinbosPostId("logistics_partner", "jobs"), "sib-partner-jobs");
  assert.deepEqual(sib.parseShopinbosPostId("sib-seller-welcome"), { role: "seller", key: "welcome" });
  assert.deepEqual(sib.parseShopinbosPostId("sib-partner-jobs"), { role: "logistics_partner", key: "jobs" });
  for (const bad of ["sib-seller-nope", "sib-admin-welcome", "clx123abc456", "sib-seller-welcome/../x", null, 5]) assert.equal(sib.parseShopinbosPostId(bad), null, String(bad));
});

test("words: every post's title and body (and button) in all five languages", () => {
  for (const role of ["seller", "supplier", "logistics_partner"]) {
    for (const post of sib.shopinbosPosts(role)) {
      const keys = sib.shopinbosMessageKeys(role, post.key);
      for (const lang of LANGS) {
        assert.ok(catalogs[lang][keys.title], `${lang} ${keys.title}`);
        assert.ok(catalogs[lang][keys.body], `${lang} ${keys.body}`);
        if (post.cta) assert.ok(catalogs[lang][keys.cta], `${lang} ${keys.cta}`);
      }
    }
  }
  for (const key of ["role.shopinbos", "sib.dontShow", "sib.watch", "sib.hideTitle", "start.title", "start.count", "start.again", "start.hide", "start.helpTitle"]) {
    for (const lang of LANGS) assert.ok(catalogs[lang][key], `${lang} ${key}`);
  }
  assert.equal(catalogs.en["start.again"], "Watch again any time in Help.");
});

test("preferences: seen only adds, switching off is for good, and PATCH keeps both", () => {
  let p = prefs.parsePreferences({ shopinbosSeen: ["sib-seller-welcome", "junk", "sib-seller-welcome"], shopinbosStatusOff: "yes" });
  assert.deepEqual(p.shopinbosSeen, ["sib-seller-welcome"]);
  assert.equal(p.shopinbosStatusOff, undefined);
  p = prefs.withShopinbos(p, { seen: ["sib-seller-share"] });
  assert.deepEqual(p.shopinbosSeen, ["sib-seller-welcome", "sib-seller-share"]);
  p = prefs.withShopinbos(p, { off: "status" });
  assert.equal(p.shopinbosStatusOff, true);
  assert.equal(p.gettingStartedOff, undefined);
  p = prefs.withShopinbos(p, { off: "start" });
  assert.equal(p.gettingStartedOff, true);
  // The menu PATCH reads and merges the whole object: the Shopinbos fields survive it.
  const merged = prefs.mergePreferences(prefs.parsePreferences(JSON.parse(JSON.stringify(p))), { tour: "done" }, new Set());
  assert.equal(merged.shopinbosStatusOff, true);
  assert.equal(merged.gettingStartedOff, true);
  assert.deepEqual(merged.shopinbosSeen, ["sib-seller-welcome", "sib-seller-share"]);
  assert.deepEqual(prefs.parsePreferences({}), { hiddenNav: [], tour: null });
});

test("server: Shopinbos first in the feed, dismiss and seen on the account, additive contract", () => {
  const route = read("src/app/api/mobile/status/route.ts");
  assert.match(route, /feed: \[shopinbos, \.\.\.home\.feed\]/);
  const server = read("src/lib/status/shopinbos.server.ts");
  assert.match(server, /official: true/);
  assert.match(server, /publishedHelpVideos\(/);
  assert.match(server, /pickHelpVideo\(/);
  assert.match(server, /state\.statusOff \? null : state\.author/);
  const dismiss = read("src/app/api/mobile/status/shopinbos/dismiss/route.ts");
  assert.match(dismiss, /withStatusUser\(/);
  assert.match(dismiss, /z\.enum\(SHOPINBOS_DISMISS\)\.default\("status"\)/);
  assert.match(read("src/app/api/mobile/status/shopinbos/route.ts"), /shopinbosState\(/);
  const view = read("src/app/api/mobile/status/[id]/view/route.ts");
  assert.match(view, /parseShopinbosPostId\(params\.id\)/);
  assert.match(view, /official\.role !== user\.role/);
  assert.match(read("src/lib/status/status.server.ts"), /video\?: \{ intro: string \| null; url: string \| null; watchUrl/);
});

test("phone: ring first with the logo and a long-press, video and Don't show again in the viewer, Home card, Help", () => {
  const row = read("apps/mobile/src/components/familiar/StatusRow.tsx");
  assert.match(row, /onLongPress=\{askHide\}/);
  assert.match(row, /<ShopinbosMark /);
  assert.ok(row.indexOf('testID="shopinbos-ring"') < row.indexOf("{leading}"), "Shopinbos before the team updates ring");
  const viewer = read("apps/mobile/src/components/familiar/StoryViewer.tsx");
  assert.match(viewer, /from "expo-video"/);
  assert.match(viewer, /addListener\("playToEnd"/);
  assert.match(viewer, /startPost = 0/);
  assert.match(viewer, /hideShopinbosStatus\(\)/);
  assert.match(viewer, /runShopinbosCta\(post!\)/);
  const lib = read("apps/mobile/src/lib/familiar.ts");
  assert.match(lib, /\/api\/mobile\/status\/shopinbos\/dismiss/);
  const card = read("apps/mobile/src/components/familiar/GettingStarted.tsx");
  assert.match(card, /dismissShopinbos\("start"\)/);
  // No "Watch again any time in Help" line on the card (round 3: less text); Help lists them all instead.
  assert.doesNotMatch(card, /t\("start\.again"\)/);
  assert.match(card, /t\("start\.title"\)/);
  for (const home of ["apps/mobile/src/app/(tabs)/home.tsx", "apps/mobile/src/app/supplier/(tabs)/home.tsx", "apps/mobile/src/app/logistics/(tabs)/jobs.tsx"]) {
    assert.match(read(home), /<GettingStartedCard \/>/, home);
  }
  assert.match(read("apps/mobile/src/app/help/index.tsx"), /<GettingStartedVideos \/>/);
  assert.doesNotMatch(card, /[Cc]oming soon/);
});
