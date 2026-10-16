// The phone's video studio (apps/mobile/src/app/video): the hub's lists, the studio's saved settings (the web
// studio's VideoConfig, so a phone draft opens on the web as it was left), and the links that now open the app's
// own screens instead of the website. Pure helpers are loaded directly (Node strips the types).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pure = await import("../apps/mobile/src/lib/video-pure.ts");
const projects = await import("../shared/video-projects.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const product = { id: "p1", name: "Ankara tote", images: ["https://x/a.jpg", "https://x/b.jpg"], priceText: "₦29,500", retailPrice: 29500, description: "Hand made" };

test("the phone's purpose defaults are the web's", () => {
  assert.deepEqual(pure.PURPOSE_DEFAULTS, projects.PURPOSE_DEFAULTS);
  assert.deepEqual([...pure.VIDEO_PURPOSES], [...projects.VIDEO_PURPOSES]);
  assert.deepEqual([...pure.VIDEO_STATUSES], [...projects.VIDEO_STATUSES]);
});

test("hub: counts, first tab, covers and where a video went", () => {
  const rows = [
    { id: "1", status: "draft", posterUrl: null, config: { photos: ["https://x/1.jpg"] } },
    { id: "2", status: "saved", posterUrl: "https://x/cover.jpg", config: {} },
    { id: "3", status: "published", posterUrl: null, config: null },
    { id: "4", status: "weird", posterUrl: null, config: {} },
  ];
  assert.deepEqual(pure.countByStatus(rows), { draft: 2, saved: 1, published: 1 });
  assert.equal(pure.firstTab(rows), "draft");
  assert.equal(pure.firstTab([]), "draft");
  assert.equal(pure.firstTab([{ status: "published" }]), "published");
  assert.equal(pure.firstTab([{ status: "saved" }, { status: "published" }]), "saved");
  assert.deepEqual(pure.videosIn(rows, "draft").map((row) => row.id), ["1", "4"]);
  assert.equal(pure.videoCover(rows[0]), "https://x/1.jpg");
  assert.equal(pure.videoCover(rows[1]), "https://x/cover.jpg");
  assert.equal(pure.videoCover(rows[2]), null);
  assert.deepEqual(pure.publishedKinds([{ kind: "ad" }, { kind: "product", id: "p" }, { kind: "ad", id: "x" }, { kind: "tv" }, null]), ["ad", "product"]);
  assert.deepEqual(pure.publishedKinds("nope"), []);
  assert.equal(pure.shareMessage(" Tote ad ", "https://v/1.mp4"), "Tote ad\nhttps://v/1.mp4");
  assert.equal(pure.readPurpose("billboard"), "social");
});

test("studio starts from the product for a new video, and from the draft when there is one", () => {
  const fresh = pure.initialStudio("ad", null, product);
  assert.deepEqual(fresh.photos, product.images);
  assert.equal(fresh.name, "Ankara tote");
  assert.equal(fresh.price, "₦29,500");
  assert.equal(fresh.template, "words");
  assert.equal(fresh.music, "afrobeats");
  assert.equal(fresh.voiceSource, "rex");
  assert.equal(fresh.language, "pidgin");
  assert.equal(fresh.musicTouched, false);

  const saved = pure.readConfig({ template: "grid", photos: ["https://x/s.jpg"], name: "Saved", language: "yoruba", music: "luxury", voiceSource: "record", gender: "male", look: "brand", extra: 1, script: { captions: ["One"], voiceover: "Hi", cta: "Buy" } });
  assert.equal("extra" in saved, false);
  const draft = pure.initialStudio("product", saved, product);
  assert.deepEqual(draft.photos, ["https://x/s.jpg"]);
  assert.equal(draft.name, "Saved");
  assert.equal(draft.language, "yoruba");
  assert.equal(draft.template, "grid");
  assert.equal(draft.music, "luxury");
  assert.equal(draft.musicTouched, true);
  assert.equal(draft.voiceSource, "record");
  assert.equal(draft.gender, "male");
  assert.equal(draft.look, "brand");

  // A draft Rex made has words but no photos: the product's photos fill in.
  const fromRex = pure.initialStudio("social", pure.readConfig(pure.rexCardProject({ product: { id: "p1", name: "Ankara tote" }, script: { captions: ["A"], voiceover: "V", cta: "C" } }).config), product);
  assert.deepEqual(fromRex.photos, product.images);
  assert.deepEqual(fromRex.script, { captions: ["A"], voiceover: "V", cta: "C" });
});

test("what the phone saves passes the web's VideoConfig check unchanged", () => {
  let state = pure.initialStudio("social", null, product);
  state = pure.withCaption(state, "social", 1, "Second line");
  state = pure.withScriptField(state, "social", "cta", "Order today");
  const config = pure.studioConfig(state);
  const parsed = projects.VideoConfigSchema.parse(config);
  assert.deepEqual(parsed, config);
  assert.deepEqual(projects.readVideoConfig(config), config);
  assert.equal(config.script.captions[1], "Second line");
  assert.equal(config.script.cta, "Order today");
  // Local files (not yet uploaded) are never saved.
  assert.deepEqual(pure.studioConfig({ ...state, photos: ["file:///tmp/a.jpg", "https://x/a.jpg"] }).photos, ["https://x/a.jpg"]);
});

test("music follows the style until the seller picks one; a product swaps photos and clears words", () => {
  const start = pure.initialStudio("social", null, null);
  assert.equal(pure.withTemplate(start, "float", "social").music, "chill");
  assert.equal(pure.withTemplate(start, "pop", "social").music, "amapiano");
  assert.equal(pure.withTemplate({ ...start, music: "luxury", musicTouched: true }, "float", "social").music, "luxury");
  const withWords = { ...start, script: { captions: ["x"], voiceover: "y", cta: "z" } };
  const swapped = pure.withProduct(withWords, product);
  assert.equal(swapped.script, null);
  assert.equal(swapped.productId, "p1");
  assert.deepEqual(swapped.photos, product.images);
  assert.equal(pure.worthSaving(start, null), false);
  assert.equal(pure.worthSaving(start, "v1"), true);
  assert.equal(pure.worthSaving({ ...start, name: "Tote" }, null), true);
});

test("photos: no repeats, at most six; Rex's shots replace only the photos he made", () => {
  const six = ["1", "2", "3", "4", "5", "6"].map((n) => `https://x/${n}.jpg`);
  assert.deepEqual(pure.addPhotos(["https://x/1.jpg"], ["https://x/1.jpg", "https://x/2.jpg"]), ["https://x/1.jpg", "https://x/2.jpg"]);
  assert.equal(pure.addPhotos(six, ["https://x/7.jpg"]).length, pure.MAX_PHOTOS);
  const shots = pure.applyShots(["a", "b"], [{ source: "a", url: "a2" }, { source: "b", url: null, error: "Busy" }]);
  assert.deepEqual(shots, { photos: ["a2", "b"], made: 1, total: 2, firstProblem: "Busy" });
});

test("captions: one per photo, starter words until the seller or Rex writes them", () => {
  const state = pure.initialStudio("ad", null, product);
  const captions = pure.captionsFor(state, "ad");
  assert.equal(captions.length, 2);
  assert.ok(captions[0].includes("Ankara tote"));
  assert.equal(pure.currentScript(state, "ad").cta, "Shop now");
  assert.notEqual(pure.currentScript(pure.initialStudio("product", null, product), "product").cta, "Shop now");
  assert.equal(pure.captionsFor({ ...state, photos: [] }, "ad").length, 1);
  assert.deepEqual(pure.voiceChoices("rex"), ["rex", "none"]);
  assert.deepEqual(pure.voiceChoices("record"), ["rex", "none", "record"]);
});

test("web video links open the phone's screens", () => {
  assert.deepEqual(pure.videoScreenFor("/home/video"), { pathname: "/video", params: {} });
  assert.deepEqual(pure.videoScreenFor("/home/video/"), { pathname: "/video", params: {} });
  assert.deepEqual(pure.videoScreenFor("/home/video?product=p1"), { pathname: "/video/studio", params: { purpose: "product", product: "p1" } });
  assert.deepEqual(pure.videoScreenFor("/home/video/studio?purpose=ad"), { pathname: "/video/studio", params: { purpose: "ad" } });
  assert.deepEqual(pure.videoScreenFor("/home/video/studio?id=v1"), { pathname: "/video/studio", params: { id: "v1" } });
  assert.equal(pure.videoScreenFor("/home/videos"), null);
  assert.equal(pure.videoScreenFor("/home/ads/new?video=v1"), null);
  assert.equal(pure.webStudioPath("v 1"), "/home/video/studio?id=v%201");
});

test("the app's screens, links and Rex card use the phone studio", () => {
  for (const screen of ["index", "studio", "[id]"]) assert.ok(existsSync(new URL(`../apps/mobile/src/app/video/${screen}.tsx`, import.meta.url)), screen);
  const web = read("apps/mobile/src/lib/web.ts");
  assert.match(web, /"\/home\/video": "\/video"/);
  assert.match(web, /videoScreenFor\(path\)/);
  const rex = read("apps/mobile/src/app/rex.tsx");
  assert.doesNotMatch(rex, /openWeb\("\/home\/video/);
  assert.match(rex, /startVideoFromRex/);
  const shop = read("apps/mobile/src/app/(tabs)/shop.tsx");
  const grow = shop.slice(shop.indexOf('key: "grow"'), shop.indexOf('key: "settings"'));
  assert.match(grow, /id: "video", label: "Video studio", icon: "play", path: "app:\/video"/);
  // The studio says plainly that the last step is on the web, and nothing on the phone asks with window dialogs.
  const studio = read("apps/mobile/src/app/video/studio.tsx");
  assert.match(studio, /t\("finish\.button"\)/);
  assert.match(studio, /webStudioPath\(id\)/);
  for (const screen of ["index", "studio", "[id]"]) assert.doesNotMatch(read(`apps/mobile/src/app/video/${screen}.tsx`), /window\.|Alert\.alert|confirm\(/);
});
