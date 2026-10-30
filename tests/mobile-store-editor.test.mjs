// The phone's store editor (design SE-00…SE-16): the pure rules in shared/store-editor.ts (undo history, changes to
// the draft, photos and framing, theme, products, pages, "what changed" before publishing, the save version check),
// the routes and the canvas page it uses, and its words in all five languages.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);
const ed = await import("../shared/store-editor.ts");
const { CATALOGS, NAMESPACES } = await import("../shared/i18n/catalog.ts");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];

const section = (id, kind, extra = {}) => ({ id, kind, name: kind, visible: true, blocks: [{ id: `${id}-copy`, type: "copy", content: { title: `${id} title` } }], ...extra });
const chrome = () => [section("bar", "announcement-bar"), section("head", "header")];
function draft() {
  return {
    templateId: "lagos-luxe",
    templateName: "Lagos Luxe",
    themeTokens: { accent: "#FF6A2B", ctaBg: "#FF6A2B", ctaText: "#16141F" },
    updatedAt: "2026-12-18T10:00:00.000Z",
    pages: [
      { id: "p-home", pageType: "home", title: "Home", slug: "", sections: [...chrome(), section("hero", "hero-split", { items: [{ imageUrl: "https://img/a.jpg" }] }), section("best", "featured-products", { items: [], settings: { source: "best-sellers", layout: "carousel" } }), section("faq", "faq"), section("foot", "footer")] },
      { id: "p-about", pageType: "about", title: "About", slug: "about", sections: [...chrome(), section("story", "story-split"), section("foot", "footer")] },
      { id: "p-cart", pageType: "cart", title: "Cart", slug: "cart", sections: [...chrome(), section("cart", "cart-summary"), section("foot", "footer")] },
    ],
  };
}
const ids = (snapshot, page = "home") => ed.findPage(snapshot, page).sections.map((entry) => entry.id);

test("undo history: steps, undo/redo, typing merged into one step, a new change clears redo", () => {
  let history = ed.createHistory("a");
  history = ed.pushHistory(history, "b", { now: 1000 });
  history = ed.pushHistory(history, "c", { key: "hero:title", now: 2000 });
  history = ed.pushHistory(history, "cc", { key: "hero:title", now: 2500 });
  assert.deepEqual(history.past, ["a", "b"], "typing the same words is one step");
  history = ed.pushHistory(history, "ccc", { key: "hero:title", now: 2500 + ed.HISTORY_MERGE_MS + 1 });
  assert.deepEqual(history.past, ["a", "b", "cc"], "after a pause it's a new step");
  history = ed.undoHistory(ed.undoHistory(history));
  assert.equal(history.present, "b");
  assert.ok(ed.canRedo(history));
  history = ed.redoHistory(history);
  assert.equal(history.present, "cc");
  history = ed.pushHistory(history, "d", { now: 9999 });
  assert.equal(ed.canRedo(history), false);
  let long = ed.createHistory(0);
  for (let n = 1; n <= ed.HISTORY_LIMIT + 10; n += 1) long = ed.pushHistory(long, n, { now: n * 10_000 });
  assert.equal(long.past.length, ed.HISTORY_LIMIT, "bounded");
});

test("words, sections and moves change the draft; the header, bar and footer stay put and stay shared", () => {
  const start = draft();
  const typed = ed.setCopy(start, "home", "hero", "title", "Hair that turns heads.");
  assert.equal(ed.sectionCopy(ed.findSection(typed, "home", "hero")).title, "Hair that turns heads.");
  assert.equal(ed.sectionCopy(ed.findSection(start, "home", "hero")).title, "hero title", "the old draft is untouched (undo)");
  // The header is the same on every page: its words change everywhere.
  const header = ed.setCopy(start, "home", "head", "logoText", "Ada's Hair");
  assert.equal(ed.sectionCopy(ed.findSection(header, "about", "head")).logoText, "Ada's Hair");
  // A section with no words yet gets a copy block.
  const bare = { ...start, pages: [{ ...start.pages[0], sections: [{ id: "x", kind: "text", name: "Text", visible: true, blocks: [] }] }] };
  assert.equal(ed.sectionCopy(ed.setCopy(bare, "home", "x", "title", "Hi").pages[0].sections[0]).title, "Hi");

  assert.deepEqual(ids(ed.moveSection(start, "home", "faq", -1)), ["bar", "head", "hero", "faq", "best", "foot"]);
  assert.equal(ed.moveSection(start, "home", "hero", -1), start, "never above the header");
  assert.equal(ed.moveSection(start, "home", "faq", 1), start, "never below the footer");
  assert.equal(ed.canMove(start, "home", "head", 1), false, "the header doesn't move");
  assert.deepEqual(ids(ed.moveSectionTo(start, "home", "faq", 0)), ["bar", "head", "faq", "hero", "best", "foot"], "drag to reorder");
  assert.equal(ed.toggleSection(start, "home", "faq", false).pages[0].sections.find((entry) => entry.id === "faq").visible, false, "hidden, not deleted");
  assert.deepEqual(ids(ed.removeSection(start, "home", "faq")), ["bar", "head", "hero", "best", "foot"]);
  assert.equal(ed.removeSection(start, "home", "foot"), start, "the footer can't be deleted from the phone");
  const copied = ed.duplicateSection(start, "home", "faq", "faq-2");
  assert.deepEqual(ids(copied), ["bar", "head", "hero", "best", "faq", "faq-2", "foot"]);
  assert.equal(ed.findSection(copied, "home", "faq-2").blocks[0].id, "faq-2-copy", "the copy has its own ids");
});

test("a ready-made section drops in where the seller asked, never below the footer", () => {
  const start = draft();
  const reviews = ed.withNewIds({ id: "testimonials-new", kind: "testimonials", name: "Testimonials", visible: true, blocks: [{ id: "testimonials-new-copy", type: "copy", content: { title: "What customers say" } }], items: [] }, "rev-1");
  assert.equal(reviews.blocks[0].id, "rev-1-copy");
  assert.deepEqual(ids(ed.insertSection(start, "home", reviews, "hero")), ["bar", "head", "hero", "rev-1", "best", "faq", "foot"], "under the Banner (SE-07)");
  assert.deepEqual(ids(ed.insertSection(start, "home", reviews, null)), ["bar", "head", "rev-1", "hero", "best", "faq", "foot"], "at the top: under the header");
  assert.deepEqual(ids(ed.insertSection(start, "home", reviews, "foot")), ["bar", "head", "hero", "best", "faq", "rev-1", "foot"], "after the footer means just above it");
  assert.equal(ed.defaultInsertAfter(start, "home", "best"), "best");
  assert.equal(ed.defaultInsertAfter(start, "home", null), "faq", "nothing selected: the end of the page");
  assert.match(ed.newSectionId("testimonials", 1_700_000_000_000, 0.5), /^testimonials-[a-z0-9]+$/);
});

test("photos: where each section keeps its picture, set like the web builder's media field", () => {
  const start = draft();
  const hero = ed.findSection(start, "home", "hero");
  assert.deepEqual(ed.photoSlot(hero), { mode: "item", index: 0 });
  assert.equal(ed.readPhoto(hero), "https://img/a.jpg");
  const next = ed.setPhoto(start, "home", "hero", " https://img/b.jpg ");
  assert.deepEqual(ed.findSection(next, "home", "hero").items[0], { imageUrl: "https://img/b.jpg", originalSrc: "https://img/b.jpg", resolvedSrc: "https://img/b.jpg" });
  assert.deepEqual(ed.photoSlot(section("s", "split-hero")), { mode: "copy", key: "mediaUrl" }, "ready-made blocks: a copy field");
  assert.equal(ed.photoSlot(section("f", "faq")), null, "no photo to change");
  assert.deepEqual(ed.shopPhotos(next, ["https://img/p1.jpg", "nope", "https://img/b.jpg"]), ["https://img/b.jpg", "https://img/p1.jpg"]);
});

test("drag to frame it: the crop is what shows in the frame, inside the photo", () => {
  const photo = { width: 2000, height: 1000 };
  const frame = { width: 300, height: 300 };
  const centred = ed.coverCrop(photo, frame, 1, { x: 0, y: 0 });
  assert.deepEqual([centred.originX, centred.originY, centred.width, centred.height], [500, 0, 1000, 1000]);
  const right = ed.coverCrop(photo, frame, 1, { x: -9999, y: 0 });
  assert.equal(right.originX, 1000, "dragged all the way: the right edge, never past it");
  assert.deepEqual(right.offset, { x: -150, y: 0 });
  const zoomed = ed.coverCrop(photo, frame, 2, { x: 0, y: 0 });
  assert.deepEqual([zoomed.width, zoomed.height], [500, 500]);
});

test("theme: presets, custom colour, headline font and buttons (SE-10)", () => {
  const start = draft();
  const teal = ed.applyThemePreset(start, "teal");
  assert.equal(ed.themePresetOf(teal.themeTokens).id, "teal");
  assert.equal(ed.themePresetOf(start.themeTokens), null);
  const custom = ed.applyAccent(start, "#f2a93b");
  assert.deepEqual([custom.themeTokens.accent, custom.themeTokens.ctaBg, custom.themeTokens.ctaText], ["#F2A93B", "#F2A93B", "#16141F"]);
  assert.equal(ed.readableOn("#16141F"), "#FFFFFF");
  const elegant = ed.applyTokens(start, ed.FONT_CHOICES.find((entry) => entry.id === "elegant").tokens);
  assert.equal(ed.fontChoiceOf(elegant.themeTokens), "elegant");
  assert.equal(elegant.themeTokens.headingStyle, "serif");
  const square = ed.applyTokens(start, ed.BUTTON_CHOICES.find((entry) => entry.id === "square").tokens);
  assert.equal(ed.buttonChoiceOf(square.themeTokens), "square");
});

test("products section: what shows and the layout, per kind of theme (SE-16)", () => {
  const start = draft();
  const best = ed.findSection(start, "home", "best");
  assert.deepEqual(ed.productsShowOf(best, "boutique"), { kind: "best-sellers" });
  const collection = ed.setProductsShow(start, "home", "best", { kind: "collection", collectionId: "c1" }, "boutique");
  assert.deepEqual(ed.findSection(collection, "home", "best").settings, { source: "collection", layout: "carousel", collectionId: "c1" });
  const picked = ed.setProductsShow(start, "home", "best", { kind: "picked" }, "boutique", ["p2", "p1", "p2"]);
  assert.deepEqual(ed.pickedProductIds(ed.findSection(picked, "home", "best")), ["p2", "p1"]);
  assert.deepEqual(ed.productsShowOf(ed.findSection(picked, "home", "best"), "boutique"), { kind: "picked" });
  const three = ed.setProductsLayout(start, "home", "best", "three", "boutique");
  assert.equal(ed.findSection(three, "home", "best").settings.layout, "dense");
  assert.equal(ed.productsLayoutOf(ed.findSection(three, "home", "best"), "boutique"), "three");
  const classic = ed.setProductsLayout(start, "home", "best", "two", "classic");
  assert.equal(ed.findSection(classic, "home", "best").settings.columns, "2");
  assert.deepEqual(ed.productsShowOf(ed.findSection(ed.setProductsShow(start, "home", "best", { kind: "new" }, "classic"), "home", "best"), "classic"), { kind: "new" });
});

test("pages: the list leaves out cart and checkout; a blank page gets the shared header and footer (SE-15)", () => {
  const start = draft();
  assert.deepEqual(ed.pageRows(start).map((row) => [row.key, row.sections]), [["home", 3], ["about", 1]]);
  const body = { id: "text-new", kind: "text", name: "Text", visible: true, blocks: [{ id: "text-new-copy", type: "copy", content: { title: "", body: "" } }] };
  const added = ed.addPage(start, "Lookbook", body, "Ada's Hair");
  assert.equal(added.key, "lookbook");
  const page = ed.findPage(added.snapshot, "lookbook");
  assert.deepEqual(page.sections.map((entry) => entry.kind), ["announcement-bar", "header", "text", "footer"]);
  assert.equal(ed.sectionCopy(page.sections[2]).title, "Lookbook");
  assert.equal(ed.addPage(added.snapshot, "Lookbook", body, "Ada's Hair").key, "lookbook-2", "a taken address gets -2");
  assert.equal(ed.addPage(start, "Cart", body, "x").key, "cart-page", "never a store route");
});

test("what changed before publishing: one plain row per change, the shared header once (SE-13)", () => {
  const published = draft();
  let next = ed.setPhoto(published, "home", "hero", "https://img/new.jpg");
  next = ed.setCopy(next, "home", "hero", "title", "New headline");
  next = ed.insertSection(next, "home", section("rev", "testimonials"), "hero");
  next = ed.applyThemePreset(next, "teal");
  next = ed.setCopy(next, "home", "head", "logoText", "Ada");
  next = ed.toggleSection(next, "home", "faq", false);
  const changes = ed.summariseChanges(published, next);
  const kinds = changes.map((change) => `${change.kind}:${change.sectionKind ?? change.preset ?? ""}`);
  assert.deepEqual(kinds, ["theme:teal", "text:header", "photo:hero-split", "headline:hero-split", "added:testimonials", "hidden:faq"]);
  assert.equal(changes.filter((change) => change.sectionKind === "header").length, 1, "the header is on every page but counted once");
  assert.deepEqual(ed.summariseChanges(published, ed.moveSection(published, "home", "faq", -1)).map((change) => change.kind), ["moved"]);
  const products = ed.setProductsLayout(published, "home", "best", "two", "boutique");
  assert.deepEqual(ed.summariseChanges(published, products).map((change) => change.kind), ["products"]);
  assert.deepEqual(ed.summariseChanges(published, ed.removeSection(published, "home", "faq")).map((change) => change.kind), ["removed"]);
  assert.deepEqual(ed.summariseChanges(published, published), []);
  assert.deepEqual(ed.summariseChanges(null, next), [], "never published: the whole shop is new");
  const added = ed.addPage(published, "Lookbook", section("t", "text"), "x").snapshot;
  assert.deepEqual(ed.summariseChanges(published, added).map((change) => change.kind), ["pageAdded"]);
  assert.equal(ed.changeLabelKey("theme", "teal"), "change.themePreset");
  assert.equal(ed.changeLabelKey("photo"), "change.photo");
  assert.equal(ed.changeTone("photo").icon, "image");
  for (const kind of ["photo", "headline", "text", "added", "removed", "hidden", "shown", "moved", "products", "settings", "pageAdded", "pageRemoved"]) assert.ok(CATALOGS.storeEditor.en[ed.changeLabelKey(kind)], kind);
  assert.ok(CATALOGS.storeEditor.en[ed.changeLabelKey("theme")]);
});

test("saving: the version check, the save stamp isn't a change, and a phone copy survives a dropped network", () => {
  assert.equal(ed.versionConflict("v2", "v1"), true, "the computer saved after the phone loaded");
  assert.equal(ed.versionConflict("v1", "v1"), false);
  assert.equal(ed.versionConflict("", "v1"), false, "nothing saved yet: nothing to overwrite");
  assert.equal(ed.versionConflict("v2", null), false);
  const start = draft();
  assert.ok(ed.sameSnapshot(start, { ...start, updatedAt: "later" }));
  assert.equal(ed.statusKey("saving", true), "status.saving");
  assert.equal(ed.statusKey("idle", false), "status.live");
  assert.equal(ed.statusKey("saved", true), "status.saved");
  assert.equal(ed.statusKey("offline", true), "status.offline");
  const edited = ed.setCopy(start, "home", "hero", "title", "Offline edit");
  const backup = { storeId: "s1", baseVersion: start.updatedAt, snapshot: edited, savedAt: 1 };
  assert.equal(ed.usableBackup(backup, "s1", start), backup, "same store, same base: put it back");
  assert.equal(ed.usableBackup(backup, "s2", start), null, "another store's");
  assert.equal(ed.usableBackup(backup, "s1", { ...start, updatedAt: "2026-12-19T00:00:00.000Z" }), null, "the draft moved on elsewhere");
  assert.equal(ed.usableBackup({ ...backup, snapshot: start }, "s1", start), null, "nothing new in it");
  assert.equal(ed.draftBackupKey("s1"), "shopinbos.storeEditor.draft.s1");
});

test("the canvas messages: a safe script for the WebView, and only well-formed messages back", () => {
  const script = ed.canvasScript({ t: "snapshot", snapshot: { ...draft(), templateName: "</script><b>\u2028" }, labels: {} });
  assert.doesNotMatch(script, /<\/script>/);
  assert.doesNotMatch(script, /\u2028/);
  assert.match(script, /window\.__sibCanvas\(m\)/);
  assert.match(script, /__sibCanvasQueue/, "waits for the page when it isn't ready yet");
  assert.match(script, /true;$/);
  assert.deepEqual(ed.parseCanvasMessage('{"t":"copy","id":"hero","key":"title","value":"Hi"}'), { t: "copy", id: "hero", key: "title", value: "Hi" });
  assert.equal(ed.parseCanvasMessage("not json"), null);
  assert.equal(ed.parseCanvasMessage('{"nope":1}'), null);
  assert.equal(ed.shownHost("https://adashair.mybos.store/"), "adashair.mybos.store");
});

test("the Add sheet's blocks exist for both kinds of theme and have names", () => {
  assert.deepEqual(ed.EDITOR_BLOCKS.map((block) => block.id), ["banner", "products", "text", "photoText", "reviews", "countdown", "video", "faq", "whatsapp", "delivery", "instagram", "newsletter"]);
  assert.ok(ed.blocksFor("classic").every((block) => block.kinds.classic));
  assert.equal(ed.blocksFor("classic").some((block) => block.id === "video"), false, "video is a 2026-theme block");
  assert.deepEqual(ed.blocksFor("boutique", "trust").map((block) => block.id), ["reviews", "faq", "delivery"]);
  for (const block of ed.EDITOR_BLOCKS) assert.ok(CATALOGS.storeEditor.en[block.label], block.label);
  for (const group of ed.BLOCK_GROUPS) assert.ok(CATALOGS.storeEditor.en[`group.${group}`], group);
  for (const kind of ["header", "hero-split", "featured-products", "testimonials", "faq", "footer", "ugc-grid", "story-split"]) assert.ok(CATALOGS.storeEditor.en[ed.kindLabelKey(kind)], kind);
  assert.equal(ed.kindLabelKey("mystery"), null, "unknown kinds use the section's own name");
});

test("server: the phone's routes edit the web builder's own draft, with the version check, and publish the same way", () => {
  const route = read("src/app/api/mobile/store-editor/route.ts");
  assert.match(route, /export const GET = withSeller/);
  assert.match(route, /export const PATCH = withSeller/);
  assert.match(route, /getStoreEditorData\(user\.id\)/, "the same store data as the web builder");
  assert.match(route, /buildEditorEnvelope\(/);
  assert.match(route, /versionConflict\(storedDraftVersion\(store\.brandSettings\), parsed\.data\.baseVersion\)/);
  assert.match(route, /apiError\("CONFLICT"/);
  assert.match(route, /updateDraftFromSnapshot\(brandSettings, next\)/, "saved where the web builder saves its draft");
  assert.match(route, /editorCatalog\(renderer\)/);
  const publish = read("src/app/api/mobile/store-editor/publish/route.ts");
  assert.match(publish, /publishStoreDraft\(\{ userId: user\.id \}\)/, "the web builder's own publish");
  assert.match(publish, /versionConflict\(/);
  const rex = read("src/app/api/mobile/store-editor/rex/route.ts");
  assert.match(rex, /runStudioEdit\(store, \{ message, label: parsed\.data\.message \}\)/, "Rex's own store-edit path");
  assert.match(rex, /meterAi\(user\.id, "text"\)/);
  assert.match(rex, /changes: result\.changes/);
  // The web builder still loads the same data (moved, not changed).
  const web = read("src/app/api/store/editor/route.ts");
  assert.match(web, /import \{ getStoreEditorData \} from "@\/lib\/store-editor\/editor-data\.server"/);
  assert.doesNotMatch(web, /async function getStoreEditorData/);
  const catalog = read("src/lib/store-editor/mobile.server.ts");
  assert.match(catalog, /newBoutiqueSection\(kind, id\)/);
  assert.match(catalog, /createSectionFromLibrary\(kind\)/);
  // No new table or column: the draft is brandSettings.editor.draft, as the web builder keeps it.
  assert.equal(existsSync(new URL("../docs/migrations/2026-12-18-store-editor-draft.sql", import.meta.url)), false);
});

test("the canvas page draws the real shop and talks to the phone", () => {
  const canvas = read("src/app/store-canvas/StoreCanvas.tsx");
  assert.match(canvas, /<TemplateStorefrontSurface/);
  assert.match(canvas, /mode="editor"/);
  assert.match(canvas, /window\.ReactNativeWebView\.postMessage/);
  assert.match(canvas, /window\.__sibCanvas = handle/);
  assert.match(canvas, /post\(\{ t: "copy", id, key, value \}\)/, "words typed on the page");
  assert.match(canvas, /post\(\{ t: "add", afterId/, "the + buttons");
  assert.match(canvas, /DESKTOP_WIDTH = 1280/, "computer preview");
  assert.match(read("src/app/store-canvas/page.tsx"), /robots: "noindex, nofollow"/);
  assert.match(read("src/components/storefront/TemplateStorefrontSurface.tsx"), /data-section-id=\{sectionId\}/, "classic themes' sections can be found too");
});

test("phone: the editor screen, the WebView canvas, the Shop tab entry and old entry points", () => {
  assert.ok(JSON.parse(read("apps/mobile/package.json")).dependencies["react-native-webview"], "react-native-webview is installed");
  const native = app("components/store-editor/Canvas.native.tsx");
  assert.match(native, /from "react-native-webview"/);
  assert.match(native, /keyboardDisplayRequiresUserAction=\{false\}/, "typing on the page opens the keyboard on iPhone");
  assert.match(native, /onShouldStartLoadWithRequest/);
  assert.match(app("components/store-editor/Canvas.tsx"), /CANVAS_SUPPORTED = false/, "the web build shows a note instead");
  const lib = app("lib/store-editor.ts");
  assert.match(lib, /api<EditorLoad>\("\/api\/mobile\/store-editor"\)/);
  assert.match(lib, /method: "PATCH", json: \{ snapshot, baseVersion/);
  assert.match(lib, /"\/api\/mobile\/store-editor\/publish"/);
  assert.match(lib, /"\/api\/mobile\/store-editor\/rex"/);
  const hook = app("components/store-editor/useStoreEditor.ts");
  assert.match(hook, /setTimeout\(\(\) => void save\(\), AUTOSAVE_MS\)/, "autosave after a pause");
  assert.match(hook, /writeBackup\(backupKey, \{ storeId/, "a copy on the phone until the server has it");
  assert.match(hook, /error\.status === 409/);
  const screen = app("app/store-editor.tsx");
  for (const id of ["editor-close", "editor-undo", "editor-redo", "editor-page", "editor-preview", "editor-publish", "tool-add", "tool-text", "tool-photos", "tool-theme", "tool-sections", "tool-rex", "float-text", "float-photo", "float-button", "float-move", "float-copy", "float-delete", "preview-desktop", "text-done", "editor-try"]) {
    assert.match(screen, new RegExp(`testID[=:]\\{?["\`]${id.replace("-desktop", "-\\$\\{device\\}")}`), id);
  }
  assert.match(screen, /<CropOverlay/);
  assert.match(screen, /<LiveScreen/);
  assert.match(app("components/store-editor/rex-publish.tsx"), /shareOnWhatsApp\(t\("live\.shareMessage"/);
  const shop = app("app/(tabs)/shop.tsx");
  assert.match(shop, /<ShopEntry/);
  assert.match(shop, /path: "app:\/store-editor"/);
  const entry = app("components/store-editor/ShopEntry.tsx");
  assert.match(entry, /router\.push\("\/store-editor" as never\)/);
  assert.match(entry, /params: \{ sheet: "theme" \}/);
  assert.match(entry, /params: \{ sheet: "pages" \}/);
  assert.match(entry, /router\.push\("\/domain"\)/);
  assert.match(app("lib/web.ts"), /"\/builder": "\/store-editor"/);
  for (const name of ["undo", "redo", "eye", "eyeOff", "type", "palette", "layers", "grip", "trash", "mobile", "monitor", "crop"]) assert.match(app("components/icons.tsx"), new RegExp(`\\b${name}: \\(`), name);
});

test("every word the editor shows is in all five languages", () => {
  assert.ok(NAMESPACES.includes("storeEditor"));
  const en = CATALOGS.storeEditor.en;
  for (const lang of LANGS) for (const key of Object.keys(en)) assert.ok(CATALOGS.storeEditor[lang][key]?.trim(), `${lang} ${key}`);
  // Every literal t("…") in the editor's files is a key in the catalog (m_shop's own for the shop link line).
  const dir = new URL("../apps/mobile/src/components/store-editor/", import.meta.url);
  const files = ["app/store-editor.tsx", ...readdirSync(dir).map((name) => `components/store-editor/${name}`)];
  const missing = [];
  for (const file of files) {
    for (const [, key] of app(file).matchAll(/\bt\("([A-Za-z0-9.]+)"/g)) if (!en[key] && !CATALOGS.m_shop.en[key]) missing.push(`${file}: ${key}`);
  }
  assert.deepEqual(missing, []);
  for (const preset of ed.THEME_PRESETS) assert.ok(en[preset.label], preset.label);
  for (const choice of [...ed.FONT_CHOICES, ...ed.BUTTON_CHOICES]) assert.ok(en[choice.label], choice.label);
  for (const key of ["status.live", "status.saving", "status.saved", "status.offline", "status.conflict", "products.one", "products.two", "products.three", "products.slider"]) assert.ok(en[key], key);
});
