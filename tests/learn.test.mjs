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
    "home", "orders", "record-sale", "inbox", "notifications", "customers", "reviews", "marketplace", "imports", "collections",
    "brand-kit", "rex-studio", "video-studio", "discounts", "invoices", "taxes", "shipping-rates", "seo", "legal-pages", "store-settings",
    "supplier-home", "supplier-wholesale", "supplier-buyers", "verification", "partner-inbox", "partner-performance", "company-profile",
    "partner-home", "partner-riders", "partner-coverage", "partner-connect",
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
    const allPaths = [...intro.paths, ...(intro.exactPaths ?? [])];
    assert.ok(allPaths.length > 0 && allPaths.every((path) => path.startsWith("/")), `${intro.key} has paths`);
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
  assert.equal(at("/home/marketing/chat", "seller"), "inbox", "longest prefix wins");
  assert.equal(at("/home/inbox/auto-replies", "seller"), "automations", "longest prefix wins");
  assert.equal(at("/home/inbox/whatsapp-catalog", "seller"), "channels");
  assert.equal(at("/home/messages/partners", "seller"), "inbox");
  assert.equal(at("/chats", "seller"), "inbox");
  assert.equal(at("/marketplace/logistics", "seller"), "delivery");
  assert.equal(at("/marketplace/wholesale", "seller"), "wholesale");
  assert.equal(at("/marketplace", "seller"), "marketplace");
  assert.equal(at("/find/ankara-print-fabric", "seller"), "marketplace");
  assert.equal(at("/home/dropship", "seller"), "dropship");
  assert.equal(at("/products/new", "seller"), "inventory");
  assert.equal(at("/home/domain/", "seller"), "domain");
  assert.equal(at("/home", "seller"), "home", "Home has its own intro (the host waits for the guided tour)");
  assert.equal(at("/(tabs)/home", "seller"), "home", "the phone's Home tab too");
  assert.equal(at("/home/orders", "seller"), "orders");
  assert.equal(at("/home/orders/abc123", "seller"), "orders");
  assert.equal(at("/home/orders/new", "seller"), "record-sale", "longest prefix wins");
  assert.equal(at("/record-sale", "seller"), "record-sale");
  assert.equal(at("/(tabs)/orders", "seller"), "orders");
  assert.equal(at("/home/video", "seller"), "video-studio");
  assert.equal(at("/home/shipping", "seller"), "shipping-rates");
  assert.equal(at("/supplier/wholesale", "supplier"), "supplier-wholesale");
  assert.equal(at("/supplier/(tabs)/home", "supplier"), "supplier-home");
  assert.equal(at("/logistics/(tabs)/riders", "logistics_partner"), "partner-riders");
  assert.equal(at("/logistics/verification", "logistics_partner"), "verification");
  assert.equal(at("/supplier/quote-requests", "supplier"), "supplier-quotes");
  assert.equal(at("/supplier/(tabs)/quotes", "supplier"), "supplier-quotes", "Expo groups are ignored");
  assert.equal(at("/supplier/(tabs)/money", "supplier"), "supplier-payouts");
  assert.equal(at("/logistics/cash", "logistics_partner"), "partner-cash");
  assert.equal(at("/logistics/(tabs)/jobs", "logistics_partner"), "partner-jobs");
  assert.equal(at("/supplier/products", "seller"), null, "roles filter");
  assert.equal(at("/home/payouts", "supplier"), null);
  assert.equal(intros.normaliseIntroPath("/(tabs)/products?x=1#y"), "/products");
});

test("every seller, supplier and delivery-partner sidebar page has an intro for that role", () => {
  const missing = [];
  for (const role of ["seller", "supplier", "logistics_partner"]) {
    for (const group of NAV_BY_ROLE[role]) {
      for (const item of [...group.items, ...group.items.flatMap((entry) => entry.children ?? [])]) {
        const intro = intros.introForPath(item.href, role);
        if (!intro) missing.push(`${role}: ${item.label} (${item.href})`);
        else assert.ok(intro.roles.includes(role), `${item.href} → ${intro.key} is for ${role}`);
      }
    }
  }
  assert.deepEqual(missing, [], `Nav pages without an intro:\n${missing.join("\n")}`);
  // Everyone can see every intro once: the seen list must be able to hold them all.
  assert.ok(intros.FEATURE_INTROS.length <= intros.MAX_INTROS_SEEN, `${intros.FEATURE_INTROS.length} intros fit in introsSeen (${intros.MAX_INTROS_SEEN})`);
  assert.equal(intros.MAX_INTROS_SEEN, prefs.MAX_INTROS_SEEN);
});

test("exact paths: Home's intro stays on Home and doesn't leak onto pages under it", () => {
  const at = (path, role = "seller") => intros.introForPath(path, role)?.key ?? null;
  assert.equal(at("/home"), "home");
  assert.equal(at("/home/"), "home", "trailing slash");
  assert.equal(at("/home?tab=today"), "home");
  assert.equal(at("/home/start"), "home", "Start here shares it");
  assert.equal(at("/home/some-new-page"), null, "an unknown page under /home gets no intro, not Home's");
  assert.equal(at("/homework"), null);
  for (const path of ["/home/orders", "/home/customers", "/home/reviews", "/home/imports", "/home/brand-kit", "/home/discounts", "/home/video", "/home/invoices", "/home/messages"]) {
    assert.notEqual(at(path), "home", `${path} isn't Home`);
    assert.ok(at(path), `${path} has its own intro`);
  }
  assert.equal(at("/home", "supplier"), null, "roles still filter exact paths");
  const withExact = intros.FEATURE_INTROS.filter((intro) => intro.exactPaths?.length);
  assert.deepEqual(withExact.map((intro) => intro.key), ["home"]);
});

test("new scene arts read their words from the intro, so nothing English is baked in on the phone", () => {
  const mobile = read("apps/mobile/src/components/learn/scenes.tsx");
  const web = read("src/components/learn/scenes.tsx");
  for (const art of ["order-pipeline", "receipt", "invoice-paper", "star-reviews", "customer-cards", "discount-ticket", "brand-palette", "import-ship", "video-reel", "dashboard-tiles", "map-zones", "badge-verify", "rider-team", "inbox-list", "bell-alerts", "search-rank"]) {
    assert.ok(intros.SCENE_ARTS.includes(art), art);
    assert.ok(intros.FEATURE_INTROS.some((intro) => intro.scenes.some((scene) => scene.art === art)), `${art} is used by an intro`);
  }
  // Every art is used somewhere.
  for (const art of intros.SCENE_ARTS) assert.ok(intros.FEATURE_INTROS.some((intro) => intro.scenes.some((scene) => scene.art === art)), `${art} is used`);
  // Reduced motion: the web kit turns animations off, the phone kit draws still frames.
  assert.match(web, /prefers-reduced-motion: reduce/);
  assert.match(web, /fi-swing/);
  assert.match(mobile, /still \?/);
});

test("preferences: introsSeen is validated, capped and only ever adds", () => {
  assert.equal(PreferencesPatchSchema.safeParse({ introsSeen: ["segments", "ads"] }).success, true);
  assert.equal(PreferencesPatchSchema.safeParse({ introsSeen: ["<script>"] }).success, false);
  assert.equal(PreferencesPatchSchema.safeParse({ introsSeen: Array.from({ length: 101 }, (_, i) => `k${i}`) }).success, false);
  assert.equal(PreferencesPatchSchema.safeParse({ tour: "done", hiddenNav: ["ads"] }).success, true);

  assert.deepEqual(prefs.parsePreferences(null), { hiddenNav: [], tour: null }, "no introsSeen until there is one");
  assert.deepEqual(prefs.parsePreferences({ introsSeen: ["ads", "BAD KEY", 3, "segments", "ads"] }).introsSeen, ["segments", "ads"]);
  const many = Array.from({ length: 130 }, (_, i) => `intro-${i}`);
  const parsed = prefs.parsePreferences({ introsSeen: many }).introsSeen;
  assert.equal(parsed.length, prefs.MAX_INTROS_SEEN);
  assert.equal(parsed.at(-1), "intro-129", "newest kept");

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
  assert.match(read("src/components/seller/SellerPage.tsx"), /<LearnPill role="seller" variant="inline" className="mt-3\.5" \/>/);
  assert.match(read("apps/mobile/src/app/_layout.tsx"), /<LearnHost \/>/);
  const intro = read("src/components/learn/FeatureIntro.tsx");
  assert.match(intro, /prefers-reduced-motion/);
  assert.match(intro, /Escape/);
  assert.match(intro, /Watch the video/);
});

test("tips and tooltips: on by default, switched off and back on through preferences", () => {
  assert.equal(prefs.tipsOn(prefs.parsePreferences({})), true);
  assert.equal(prefs.tipsOn(null), true);
  const off = prefs.mergePreferences(prefs.DEFAULT_PREFERENCES, { tips: false }, new Set());
  assert.equal(off.tips, false);
  assert.equal(prefs.tipsOn(prefs.parsePreferences(off)), false, "survives a save and reload");
  const on = prefs.mergePreferences(off, { tips: true }, new Set());
  assert.equal("tips" in on, false, "back on leaves nothing stored");
  assert.equal(prefs.parsePreferences({ tips: "no" }).tips, undefined);
  assert.equal(PreferencesPatchSchema.safeParse({ tips: false }).success, true);
  assert.equal(PreferencesPatchSchema.safeParse({ tips: "off" }).success, false);
  // Switched off: word tooltips, menu tips and automatic intros stop; every tip says where to switch it off.
  assert.match(read("src/components/learn/Term.tsx"), /if \(!entry \|\| !tipsOn\)/);
  assert.match(read("src/components/learn/Term.tsx"), /<TipsOffNote /);
  assert.match(read("src/components/shell/Sidebar.tsx"), /tipsOn \? navTerm\(role, id\) : null/);
  assert.match(read("src/components/learn/FeatureIntroHost.tsx"), /!autoOn/);
  assert.match(read("src/components/settings/CustomiseMenu.tsx"), /id="tips"/);
  assert.match(read("apps/mobile/src/components/learn/LearnHost.tsx"), /useTipsAllowed\(tipsOn\)/);
  assert.match(read("apps/mobile/src/app/settings.tsx"), /<TipsRow \/>/);
});
