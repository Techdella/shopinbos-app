// Teaching the standard words: the glossary (shared/glossary.ts), the 60-second feature intros
// (shared/feature-intros.ts) and their scene kits on web and mobile, and the "intros seen" preference.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const glossary = await import("../shared/glossary.ts");
const intros = await import("../shared/feature-intros.ts");
const prefs = await import("../shared/preferences.ts");
const { NAV_BY_ROLE } = await import("../src/lib/nav.ts");
const { PreferencesPatchSchema } = await import("../src/lib/preferences-schema.ts");

const STANDARD_TERMS = [
  "Segments", "Campaigns", "Automations", "Analytics", "Domain", "Dropship", "Wholesale", "Payouts", "Inventory", "Variants", "SKU",
  "Templates", "Themes", "Checkout", "Abandoned carts", "Audiences", "Budget", "CTR", "ROAS", "COD", "Subscribers", "Collections",
  "Affiliates", "Quote requests", "White label", "Fulfilment", "Integrations", "Escrow", "Settlement",
];

test("glossary: every standard term has a short plain meaning and an example", () => {
  for (const word of STANDARD_TERMS) {
    const entry = glossary.findTerm(word, { exact: true });
    assert.ok(entry, `${word} is in the glossary`);
    assert.equal(entry.term.toLowerCase(), word.toLowerCase(), `${word} keeps its standard name`);
  }
  const keys = new Set();
  for (const entry of glossary.GLOSSARY) {
    assert.ok(!keys.has(entry.key), `${entry.key} is unique`);
    keys.add(entry.key);
    assert.match(entry.key, /^[a-z0-9-]+$/);
    assert.ok(entry.short.length > 10 && entry.short.length <= 120, `${entry.key}: short meaning is one line (${entry.short.length})`);
    assert.ok(entry.example.length > 8, `${entry.key} has an example`);
    if (entry.introKey) assert.ok(intros.introByKey(entry.introKey), `${entry.key} → intro ${entry.introKey} exists`);
  }
  assert.ok(glossary.GLOSSARY.length >= 40);
});

test("glossary lookups: by key, exact titles and words inside text", () => {
  assert.equal(glossary.glossaryTerm("segments").term, "Segments");
  assert.equal(glossary.glossaryTerm("nope"), null);
  assert.equal(glossary.findTerm("Abandoned carts", { exact: true }).key, "abandoned-carts");
  assert.equal(glossary.findTerm("Groups of customers", { exact: true }).key, "segments");
  assert.equal(glossary.findTerm("Your orders", { exact: true }), null);
  assert.equal(glossary.findTerm("Remind people about abandoned carts").key, "abandoned-carts", "longest phrase wins over 'cart'");
  assert.equal(glossary.findTerm("What's a good ROAS?").key, "roas");
  assert.equal(glossary.findTerm("broadcasting"), null, "whole words only");
});

test("glossary covers every sidebar item: a term, or an everyday word on purpose", () => {
  for (const role of ["seller", "supplier", "logistics_partner"]) {
    for (const group of NAV_BY_ROLE[role]) {
      for (const item of [...group.items, ...group.items.flatMap((entry) => entry.children ?? [])]) {
        const entry = glossary.navTerm(role, item.id);
        assert.ok(entry || glossary.PLAIN_NAV.has(item.id), `${role} nav "${item.label}" (${item.id}) has a glossary term or is marked plain`);
      }
    }
    for (const termKey of Object.values(glossary.NAV_TERMS[role])) assert.ok(glossary.glossaryTerm(termKey), `${role}: ${termKey} exists`);
  }
  // Labels that are themselves glossary words map to that word.
  for (const role of ["seller", "supplier", "logistics_partner"]) {
    for (const group of NAV_BY_ROLE[role]) {
      for (const item of [...group.items, ...group.items.flatMap((entry) => entry.children ?? [])]) {
        const byLabel = glossary.findTerm(item.label, { exact: true });
        if (byLabel && !glossary.PLAIN_NAV.has(item.id)) assert.ok(glossary.navTerm(role, item.id), `${role} "${item.label}" is mapped`);
      }
    }
  }
  // Mobile tab labels that are selling words (Home, Orders, Money and My shop are everyday words).
  for (const label of ["Jobs", "Riders", "Chats", "Earnings"]) assert.ok(glossary.findTerm(label, { exact: true }), `mobile tab ${label}`);
});

test("intros: every one runs about a minute, in five-ish scenes, with known art", async () => {
  const required = [
    "segments", "campaigns", "automations", "analytics", "subscribers", "domain", "dropship", "wholesale", "payouts", "inventory",
    "abandoned-carts", "ads", "affiliates", "channels", "templates", "delivery",
    "supplier-products", "supplier-orders", "supplier-quotes", "supplier-payouts", "partner-jobs", "partner-cash",
  ];
  for (const key of required) assert.ok(intros.introByKey(key), `${key} intro exists`);
  const keys = new Set();
  for (const intro of intros.FEATURE_INTROS) {
    assert.ok(!keys.has(intro.key), `${intro.key} unique`);
    keys.add(intro.key);
    assert.match(intro.key, intros.INTRO_KEY_PATTERN);
    const total = intros.introDurationMs(intro);
    assert.ok(total >= 50_000 && total <= 70_000, `${intro.key} lasts ${total / 1000}s`);
    assert.ok(intro.scenes.length >= 4 && intro.scenes.length <= 7, `${intro.key} has ${intro.scenes.length} scenes`);
    assert.ok(glossary.glossaryTerm(intro.term), `${intro.key} teaches a glossary word (${intro.term})`);
    assert.ok(intro.paths.length > 0 && intro.paths.every((path) => path.startsWith("/")));
    if (intro.cta) assert.ok(intro.cta.href.startsWith("/") && intro.cta.label.length <= 32);
    for (const scene of intro.scenes) {
      assert.ok(intros.SCENE_ARTS.includes(scene.art), `${intro.key}: ${scene.art} is a known art`);
      assert.ok(scene.caption.length > 0 && scene.caption.length <= 60, `${intro.key}: caption "${scene.caption}"`);
      assert.ok(scene.sub.length > 0 && scene.sub.length <= 120, `${intro.key}: sub "${scene.sub}"`);
    }
  }
  const helpTopics = (await import("../shared/help-videos.ts")).HELP_TOPICS.map((topic) => topic.key);
  for (const intro of intros.FEATURE_INTROS) if (intro.helpTopic) assert.ok(helpTopics.includes(intro.helpTopic), `${intro.key}: help topic ${intro.helpTopic}`);
});

test("every scene art is drawn by the web kit and the mobile kit", () => {
  const web = read("src/components/learn/scenes.tsx");
  const mobile = read("apps/mobile/src/components/learn/scenes.tsx");
  for (const art of intros.SCENE_ARTS) {
    assert.match(web, new RegExp(`"${art}":\\s*\\w+`), `web kit draws ${art}`);
    assert.match(mobile, new RegExp(`"${art}":\\s*\\w+`), `mobile kit draws ${art}`);
  }
});

test("path matching picks the right intro for web and mobile screens", () => {
  const at = (path, role) => intros.introForPath(path, role)?.key ?? null;
  assert.equal(at("/home/marketing/segments", "seller"), "segments");
  assert.equal(at("/home/marketing/segments?tab=new", "seller"), "segments");
  assert.equal(at("/home/marketing/campaigns/abc", "seller"), "campaigns");
  assert.equal(at("/home/marketing", "seller"), "campaigns");
  assert.equal(at("/home/marketing/chat", "seller"), "channels", "longest prefix wins");
  assert.equal(at("/marketplace/logistics", "seller"), "delivery");
  assert.equal(at("/marketplace/wholesale", "seller"), "wholesale");
  assert.equal(at("/marketplace", "seller"), "dropship");
  assert.equal(at("/products/new", "seller"), "inventory");
  assert.equal(at("/home/domain/", "seller"), "domain");
  assert.equal(at("/home", "seller"), null, "no intro on Home (the guided tour runs there)");
  assert.equal(at("/home/orders", "seller"), null);
  assert.equal(at("/supplier/quote-requests", "supplier"), "supplier-quotes");
  assert.equal(at("/supplier/(tabs)/quotes", "supplier"), "supplier-quotes", "Expo groups are ignored");
  assert.equal(at("/supplier/(tabs)/money", "supplier"), "supplier-payouts");
  assert.equal(at("/logistics/cash", "logistics_partner"), "partner-cash");
  assert.equal(at("/logistics/(tabs)/jobs", "logistics_partner"), "partner-jobs");
  assert.equal(at("/supplier/products", "seller"), null, "roles filter");
  assert.equal(at("/home/payouts", "supplier"), null);
  assert.equal(intros.normaliseIntroPath("/(tabs)/products?x=1#y"), "/products");
});

test("preferences: introsSeen is validated, capped and only ever adds", () => {
  assert.equal(PreferencesPatchSchema.safeParse({ introsSeen: ["segments", "ads"] }).success, true);
  assert.equal(PreferencesPatchSchema.safeParse({ introsSeen: ["<script>"] }).success, false);
  assert.equal(PreferencesPatchSchema.safeParse({ introsSeen: Array.from({ length: 61 }, (_, i) => `k${i}`) }).success, false);
  assert.equal(PreferencesPatchSchema.safeParse({ tour: "done", hiddenNav: ["ads"] }).success, true);

  assert.deepEqual(prefs.parsePreferences(null), { hiddenNav: [], tour: null }, "no introsSeen until there is one");
  assert.deepEqual(prefs.parsePreferences({ introsSeen: ["ads", "BAD KEY", 3, "segments", "ads"] }).introsSeen, ["segments", "ads"]);
  const many = Array.from({ length: 80 }, (_, i) => `intro-${i}`);
  const parsed = prefs.parsePreferences({ introsSeen: many }).introsSeen;
  assert.equal(parsed.length, prefs.MAX_INTROS_SEEN);
  assert.equal(parsed.at(-1), "intro-79", "newest kept");

  const allowed = new Set(["ads"]);
  const one = prefs.mergePreferences(prefs.parsePreferences({}), { introsSeen: ["segments"] }, allowed);
  assert.deepEqual(one.introsSeen, ["segments"]);
  const two = prefs.mergePreferences(one, { introsSeen: ["ads"] }, allowed);
  assert.deepEqual(two.introsSeen, ["segments", "ads"], "another tab's save doesn't drop the first");
  assert.deepEqual(prefs.mergePreferences(two, { tour: "done" }, allowed).introsSeen, ["segments", "ads"], "other patches keep it");
  assert.deepEqual(intros.withIntroSeen(["a", "b"], "a"), ["b", "a"]);
});

test("the intro host waits for the server's preferences and the guided tour, and marks seen on open", () => {
  const host = read("src/components/learn/FeatureIntroHost.tsx");
  assert.match(host, /confirmed/);
  assert.match(host, /tour-title/);
  assert.match(host, /markRef\.current\(key\)/);
  assert.match(read("src/components/shell/AppFrame.tsx"), /<FeatureIntroHost role=\{role\} \/>/);
  assert.match(read("src/components/seller/SellerPage.tsx"), /<LearnPill role="seller" \/>/);
  assert.match(read("apps/mobile/src/app/_layout.tsx"), /<LearnHost \/>/);
  const intro = read("src/components/learn/FeatureIntro.tsx");
  assert.match(intro, /prefers-reduced-motion/);
  assert.match(intro, /Escape/);
  assert.match(intro, /Watch the video/);
});
