// Edit my shop › Banner on the phone (apps/mobile/src/components/seller/BannerEditor.tsx): the banner button's link,
// the announcement bar (on/off, words, link, colour), "Build it with Rex", "Make a logo with Rex" and "Write a
// tagline with Peggy". The draft is changed with the web builder's own operations (PATCH /api/store/editor), and the
// storefronts read what the phone saves (shared/store-banner.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

// The web builder's patcher imports "./chrome" without an extension: resolve those to the .ts file.
register(`data:text/javascript,${encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("./") && context.parentURL?.includes("/src/lib/store-templates/") && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
    const url = new URL(specifier + ".ts", context.parentURL);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  return next(specifier, context);
}
`)}`);

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);
const banner = await import("../shared/store-banner.ts");
const edit = await import("../apps/mobile/src/lib/shop-edit-pure.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const { applyEditorPatchOps } = await import("../src/lib/store-templates/editor.ts");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];

const draft = {
  templateId: "breeze",
  pages: [{
    pageType: "home",
    sections: [
      { id: "announcement", kind: "announcement-bar", name: "Announcement Bar", visible: false, settings: { source: "store-settings" }, blocks: [{ id: "announcement-copy", type: "copy", content: { text: "" } }] },
      { id: "header", kind: "header", name: "Header", visible: true, blocks: [] },
      { id: "hero", kind: "hero-split", name: "Hero", visible: true, settings: { layout: "editorial", primaryButtonAction: "products" }, blocks: [{ id: "hero-copy", type: "copy", content: { title: "Hello", body: "", primaryCta: "Shop" } }], items: [] },
      { id: "footer", kind: "footer", name: "Footer", visible: true, blocks: [] },
    ],
  }],
};

test("the banner button can open the shop, a collection, a product or a WhatsApp chat", () => {
  assert.deepEqual(banner.readHeroLink(undefined), { action: "products", target: "" }, "no setting: the shop");
  assert.deepEqual(banner.readHeroLink({ primaryButtonAction: "product", primaryButtonTarget: "p1" }), { action: "product", target: "p1" });
  assert.deepEqual(banner.readHeroLink({ primaryButtonAction: "collection" }), { action: "products", target: "" }, "a collection link without its id goes to the shop");
  assert.equal(banner.readHeroLink({ primaryButtonAction: "about" }), null, "pages the web builder set are left alone");
  const settings = banner.heroLinkSettings({ layout: "editorial", primaryButtonAction: "product", primaryButtonTarget: "p1" }, { action: "whatsapp", target: "" });
  assert.deepEqual(settings, { layout: "editorial", primaryButtonAction: "whatsapp" }, "the layout is kept; the old product id goes");
  const model = edit.readShopEdit(draft);
  assert.deepEqual(edit.heroSettingsOp(model, settings), { op: "update-section", pageType: "home", sectionId: "hero", changes: { settings } });
});

test("the announcement bar: on or off, an optional link and a colour that keeps its text readable", () => {
  const model = edit.readShopEdit(draft);
  assert.equal(model.announcement.visible, false);
  assert.deepEqual(edit.announcementVisibleOp(model, true), { op: "toggle-section", pageType: "home", sectionId: "announcement", visible: true });
  const linked = banner.barSettings(model.announcement.settings, { link: { action: "collection", target: "c1" }, color: "#2e7e78" });
  assert.deepEqual(linked, { source: "store-settings", linkAction: "collection", linkTarget: "c1", barColor: "#2E7E78" });
  assert.deepEqual(banner.readBarLink(linked), { action: "collection", target: "c1" });
  assert.equal(banner.readBarColor(linked), "#2E7E78");
  assert.deepEqual(banner.barSettings(linked, { link: null, color: null }), { source: "store-settings" }, "No link and Auto take them off");
  assert.equal(banner.readBarColor({ barColor: "red" }), null, "only #RRGGBB");
  assert.equal(banner.readableText("#16141F"), "#FFFFFF");
  assert.equal(banner.readableText("#F2A93B"), "#16141F");
  assert.equal(edit.announcementSettingsOp(model, linked).changes.settings, linked);
  const added = edit.addAnnouncementOp(" Free delivery ", "bar1");
  assert.equal(added.op, "add-section");
  assert.equal(added.index, 0);
  assert.deepEqual(added.section.blocks[0], { id: "bar1-copy", type: "copy", content: { text: "Free delivery" } });
});

test("links become real addresses on the live store", () => {
  const store = { page: (key, params) => `/s/ada/${key === "products" ? "shop" : key}${params ? `?${params}` : ""}`, product: (id) => `/s/ada/product/${id}`, whatsapp: "2348012345678", name: "Ada" };
  assert.equal(banner.bannerLinkHref({ action: "products", target: "" }, store), "/s/ada/shop");
  assert.equal(banner.bannerLinkHref({ action: "collection", target: "c1" }, store), "/s/ada/shop?collection=c1");
  assert.equal(banner.bannerLinkHref({ action: "product", target: "p1" }, store), "/s/ada/product/p1");
  assert.match(banner.bannerLinkHref({ action: "whatsapp", target: "" }, store), /^https:\/\/wa\.me\/2348012345678\?text=/);
  assert.equal(banner.bannerLinkHref({ action: "whatsapp", target: "" }, { ...store, whatsapp: null }), null, "no number: no link");
});

test("the phone's operations apply with the web builder's own patcher", () => {
  const model = edit.readShopEdit(draft);
  const ops = [
    edit.heroSettingsOp(model, banner.heroLinkSettings(model.hero.settings, { action: "product", target: "p1" })),
    edit.announcementVisibleOp(model, true),
    edit.announcementSettingsOp(model, banner.barSettings(model.announcement.settings, { color: "#E86A4F" })),
    edit.heroCopyOp(model, { title: "Ankara season", body: "Bright prints", cta: "Shop the drop" }),
  ];
  const next = applyEditorPatchOps(draft, ops);
  const after = edit.readShopEdit(next);
  assert.deepEqual(banner.readHeroLink(after.hero.settings), { action: "product", target: "p1" });
  assert.equal(after.hero.settings.layout, "editorial");
  assert.equal(after.announcement.visible, true);
  assert.equal(banner.readBarColor(after.announcement.settings), "#E86A4F");
  assert.equal(after.hero.title, "Ankara season");
});

test("Rex's banner words and Peggy's taglines are cleaned and capped", () => {
  const copy = banner.parseBannerCopy({ options: [
    { heading: "“Ankara season”", text: "Bright prints for every owambe.", button: "Shop now" },
    { heading: "ankara SEASON", text: "dup" },
    { title: "x".repeat(200), body: "y", cta: "Go" },
    { heading: "" },
    { heading: "Fourth", text: "", button: "" },
    { heading: "Fifth" },
  ] });
  assert.equal(copy.length, 3);
  assert.equal(copy[0].heading, "Ankara season", "quotes come off");
  assert.equal(copy[1].heading.length, banner.BANNER_LIMITS.heading);
  assert.equal(copy[2].heading, "Fourth");
  assert.deepEqual(banner.parseTaglines({ taglines: ["Wear your story", "wear your story", "Made in Lagos", "Proudly yours", "Extra"] }), ["Wear your story", "Made in Lagos", "Proudly yours"]);
  assert.deepEqual(banner.parseTaglines("1. One\n- Two\n• Three"), ["One", "Two", "Three"]);
  const brief = { storeName: "Ada's Kloset", business: "Ankara dresses", category: null, audience: null, vibe: "festive", prompt: "Christmas sale", language: "Yoruba" };
  assert.match(banner.bannerCopyPrompt(brief), /Write the banner in Yoruba/);
  assert.match(banner.bannerImagePrompt(brief), /No words, letters, logos/);
  assert.match(banner.taglinePrompt({ storeName: "Ada", business: null, audience: null, tone: "warm", current: "", language: "Hausa" }), /in Hausa/);
});

test("the routes: seller only, checked bodies, a per-seller cap, metered and given back when they fail", () => {
  const build = read("src/app/api/mobile/banner/route.ts");
  const taglines = read("src/app/api/mobile/banner/taglines/route.ts");
  for (const source of [build, taglines]) {
    assert.match(source, /export const POST = withSeller\(/);
    assert.match(source, /readJson\(req, Body\)/);
    assert.match(source, /overLimit\("mobile-/);
    // The banner meters inside a Rex job (src/lib/ai/rex-jobs.server.ts): one charge per tap, parts given back.
    assert.match(source, /meterAiCharged\(user\.id, "text", 1|rex\.charge\("text", 1\)/);
    assert.match(source, /refundAi\(user\.id, "text", 1|rex\.refund\("text", 1/);
    assert.doesNotMatch(source, /top up|buy credits|upgrade/i, "no purchase words in what the phone shows");
  }
  assert.match(build, /rex\.charge\("image", 1, "photo"\)/, "the picture costs what Rex Studio's does");
  assert.match(build, /rex\.refund\("image", 1, pictureCredits\)/);
  assert.match(build, /if \(job\.status === "blocked"\) return job\.response;/);
  assert.match(build, /makeBrandImage\(\{ brand, prompt: bannerImagePrompt\(brief\), size: "1536x1024"/, "Rex's own picture maker, wide");
  assert.match(read("src/app/api/mobile/banner/_shared.ts"), /checkRateLimitShared\(rateLimitKey\(scope, userId\)/);
});

test("the phone: preview, helpers, links, bar and saving through the web builder's routes", () => {
  const screen = app("app/shop-edit.tsx");
  const editor = app("components/seller/BannerEditor.tsx");
  assert.match(screen, /<BannerPreview/);
  assert.match(screen, /<BannerHelpers onBuild=/);
  assert.match(screen, /<LinkPicker label=\{tb\("link\.buttonOpens"\)\}/);
  assert.match(screen, /<LinkPicker label=\{tb\("link\.barOpens"\)\}[^>]*optional/);
  assert.match(screen, /<BarColours/);
  assert.match(screen, /<RexBannerSheet[\s\S]*<RexLogoSheet[\s\S]*<PeggyTaglineSheet/);
  assert.match(screen, /saveEditorOps\(/, "saved with PATCH /api/store/editor like the web builder");
  assert.match(screen, /uploadPhoto\(picked\[0\], "store-banners"\)/, "the picture upload helper is only called");
  const lib = app("lib/banner.ts");
  assert.match(lib, /"\/api\/mobile\/banner"/);
  assert.match(lib, /"\/api\/mobile\/banner\/taglines"/);
  assert.match(lib, /"\/api\/ai\/generate-logo"/, "the same logo ideas as sign-up");
  assert.match(lib, /language: appLocale\(\)/, "written in the app's language");
  assert.doesNotMatch(editor + lib, /openWeb\(|credits\.refill|topUp/i, "stays in the app, no purchase prompt");
});

test("every Banner word is in all five languages", () => {
  const keys = Object.keys(CATALOGS.m_banner.en);
  assert.ok(keys.length > 50);
  for (const key of keys) for (const lang of LANGS) assert.ok(CATALOGS.m_banner[lang][key], `${lang} ${key}`);
  for (const vibe of banner.BANNER_VIBES) assert.ok(CATALOGS.m_banner.en[`vibe.${vibe.id}`], vibe.id);
  const screen = app("app/shop-edit.tsx");
  for (const [, key] of screen.matchAll(/\btb\("([\w.]+)"/g)) assert.ok(CATALOGS.m_banner.en[key], key);
  for (const [, key] of app("components/seller/BannerEditor.tsx").matchAll(/\bt\("([\w.]+)"/g)) assert.ok(CATALOGS.m_banner.en[key], key);
});
