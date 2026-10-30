// The phone store editor's extras: "Schedule for later" in Lagos time (SE-13), "Show prices" on a products section
// (SE-16), formatted words from the text toolbar kept as safe runs (SE-04), and the photo tools: Brighten, Remove
// background and a picture-only "Make with Rex" charged once (SE-05/06).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ed = await import("../shared/store-editor.ts");
const rich = await import("../shared/rich-text.ts");
const content = await import("../src/lib/store-templates/section-content.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];

const section = (id, kind, extra = {}) => ({ id, kind, name: kind, visible: true, blocks: [{ id: `${id}-copy`, type: "copy", content: { title: `${id} title` } }], ...extra });
const draft = () => ({
  templateId: "lagos-luxe",
  templateName: "Lagos Luxe",
  themeTokens: { accent: "#FF6A2B" },
  updatedAt: "2026-12-18T10:00:00.000Z",
  pages: [{ id: "p-home", pageType: "home", title: "Home", slug: "", sections: [section("hero", "hero-split"), section("best", "featured-products", { settings: { source: "best-sellers" } }), section("foot", "footer")] }],
});

// ─── Schedule for later, Lagos time ─────────────────────────────────────────

test("schedule: Lagos is UTC+1 all year; days, times and labels follow the Lagos clock", () => {
  // Saturday 19 Dec 2026, 08:00 UTC = 9:00 in Lagos.
  const sat9 = new Date("2026-12-19T08:00:00.000Z");
  assert.deepEqual(ed.lagosParts(sat9), { year: 2026, month: 11, day: 19, weekday: 6, hour: 9, minute: 0 });
  assert.equal(ed.lagosTime(2026, 11, 19, 9).toISOString(), sat9.toISOString());
  // Mid-year too: no daylight saving.
  assert.equal(ed.lagosTime(2026, 6, 1, 9, 30).toISOString(), "2026-07-01T08:30:00.000Z");
  assert.equal(ed.lagosClock(sat9), "9:00");
  assert.equal(ed.lagosClock(new Date("2026-12-19T20:30:00.000Z")), "21:30");

  // 23:30 UTC on Friday is already Saturday 00:30 in Lagos: "today" is Saturday.
  const lateFriday = new Date("2026-12-18T23:30:00.000Z");
  const days = ed.scheduleDays(lateFriday, 8);
  assert.equal(days.length, 8);
  assert.deepEqual([days[0].day, days[0].weekday, days[0].offset], [19, 6, 0]);
  assert.deepEqual([days[1].day, days[1].weekday], [20, 0]);
  // Over a month end.
  assert.deepEqual(ed.scheduleDays(new Date("2026-12-30T12:00:00.000Z"), 4).map((d) => `${d.month + 1}/${d.day}`), ["12/30", "12/31", "1/1", "1/2"]);

  // The picker's first choice: tomorrow 9:00 Lagos.
  assert.equal(ed.defaultScheduleTime(new Date("2026-12-18T10:00:00.000Z")).toISOString(), "2026-12-19T08:00:00.000Z");

  const now = new Date("2026-12-18T10:00:00.000Z"); // Friday 11:00 Lagos
  assert.equal(ed.scheduleProblem(new Date(now.getTime() - 1000), now), "past");
  assert.equal(ed.scheduleProblem(new Date(now.getTime() + 5 * 60_000), now), "tooSoon");
  assert.equal(ed.scheduleProblem(new Date(now.getTime() + 61 * 86_400_000), now), "tooFar");
  assert.equal(ed.scheduleProblem(sat9, now), null);

  assert.deepEqual(ed.scheduleWhen(sat9, now), { day: "tomorrow", weekday: 6, date: 19, month: 11, time: "9:00" });
  assert.equal(ed.scheduleWhen("2026-12-18T17:00:00.000Z", now).day, "today");
  assert.equal(ed.scheduleWhen("2026-12-22T08:00:00.000Z", now).day, "weekday");
  assert.equal(ed.scheduleWhen("2027-01-08T08:00:00.000Z", now).day, "date");

  // Edited after scheduling: the scheduled snapshot goes live and the seller is told.
  assert.equal(ed.scheduleOutcome("2026-12-18T10:00:00.000Z", "2026-12-18T10:00:00.000Z"), "same");
  assert.equal(ed.scheduleOutcome("2026-12-18T11:00:00.000Z", "2026-12-18T10:00:00.000Z"), "changed");
  assert.equal(ed.scheduleOutcome("", "2026-12-18T10:00:00.000Z"), "same");
});

test("schedule: the server keeps the snapshot, publishes it once at its time, tells the seller, and is on a schedule", () => {
  const lib = read("src/lib/store-editor/scheduled-publish.server.ts");
  assert.match(lib, /snapshot: JSON\.parse\(JSON\.stringify\(draft\)\)/, "the draft as it is when scheduled");
  assert.match(lib, /updateMany\(\{ where: \{ id: row\.id, status: row\.status/, "claimed before publishing");
  assert.match(lib, /publishStoreDraft\(\{ storeId: store\.id \}, \{ snapshot: row\.snapshot as unknown as StoreEditorSnapshot, keepDraft: changed, scheduled: true \}\)/);
  assert.match(lib, /notify\(\{/);
  assert.match(lib, /Changes you made after scheduling are still in your draft/);

  const publishing = read("src/lib/store-publishing.ts");
  assert.match(publishing, /options\.snapshot \?\? savedDraft/);
  assert.match(publishing, /options\.keepDraft && savedDraft/);
  assert.match(publishing, /if \(!options\.scheduled\) await supersedeScheduledPublish/, "a publish by hand replaces the scheduled one");

  const route = read("src/app/api/mobile/store-editor/schedule/route.ts");
  for (const verb of ["GET", "POST", "DELETE"]) assert.match(route, new RegExp(`export const ${verb} = withSeller`));
  assert.match(read("src/app/api/cron/store-publish/route.ts"), /cronDenied/);
  assert.match(read("scripts/qstash-schedules.mjs"), /id: "store-publish", path: "\/api\/cron\/store-publish", cron: "\*\/5 \* \* \* \*"/);

  const sql = read("docs/migrations/2026-12-19-scheduled-publish.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ScheduledStorePublish"/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledStorePublish_one_active_per_store"[^;]+WHERE "status" IN \('scheduled', 'publishing'\)/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /\b(DROP|DELETE|TRUNCATE|ALTER TABLE \S+ (DROP|RENAME))\b/i, "additive only");
  const schema = read("prisma/schema.prisma");
  assert.ok(schema.trimEnd().endsWith("}") && schema.lastIndexOf("model ScheduledStorePublish") > schema.lastIndexOf("model GroupBuyMember"), "the model is at the end");
});

// ─── Show prices (SE-16) ────────────────────────────────────────────────────

test("show prices: on unless the seller turns it off, for that section's cards only", () => {
  assert.equal(ed.showsPrices(undefined), true);
  assert.equal(ed.showsPrices({}), true);
  assert.equal(ed.showsPrices({ showPrice: false }), false);
  const off = ed.setShowPrices(draft(), "home", "best", false);
  assert.equal(ed.findSection(off, "home", "best").settings.showPrice, false);
  assert.equal(ed.findSection(off, "home", "best").settings.source, "best-sellers", "other settings kept");
  assert.equal(ed.summariseChanges(draft(), off)[0].kind, "products");

  // The storefront reads the same setting.
  assert.equal(content.readProductCardOptions(undefined).showPrice, true);
  assert.equal(content.readProductCardOptions({ showPrice: false }).showPrice, false);
  assert.equal(content.readProductCardOptions({ showPrice: true }).showPrice, true);

  const tile = read("src/components/storefront/boutique/ProductTile.tsx");
  assert.match(tile, /showPrice = true/);
  assert.match(tile, /\{showPrice \? <span className="mt-1 flex items-baseline gap-2">/);
  const boutique = read("src/components/storefront/boutique/BoutiqueStorefront.tsx");
  assert.match(boutique, /onQuickAdd: quickAdd, showPrice: options\.showPrice/);
  assert.ok((boutique.match(/const priced = readProductCardOptions\(section\.settings\)\.showPrice;/g) ?? []).length >= 6, "every products layout");
  const classic = read("src/components/storefront/TemplateStorefrontSurface.tsx");
  assert.match(classic, /const priced = readProductCardOptions\(kindSection\.settings\)\.showPrice;/);
  assert.match(classic, /\.map\(withPrice\)/);
  // Product pages always show the price: the product page views never read the setting.
  for (const file of ["src/components/storefront/boutique/BoutiqueProductView.tsx", "src/components/storefront/boutique/BoutiqueProductPage.tsx"]) {
    if (existsSync(new URL(`../${file}`, import.meta.url))) assert.doesNotMatch(read(file), /showPrice/, file);
  }
  // The web builder edits the same setting (both kinds of theme, and the product carousel block).
  const schema = read("src/components/builder/editor/section-schema.ts");
  assert.equal((schema.match(/id: "showPrice", type: "toggle", label: "Show prices", target: setting\("showPrice"\), fallback: true/g) ?? []).length, 2);
  assert.match(read("src/components/storefront/boutique/blocks/block-catalog.ts"), /toggle\("showPrice", "Show prices", true/);
  for (const lang of LANGS) assert.ok(CATALOGS.builder[lang]["ed.Show prices"]?.trim(), `builder ${lang}`);
  assert.match(read("apps/mobile/src/components/store-editor/sheets.tsx"), /setShowPrices\(current, ctx\.page, section\.id, on\)/);
});

// ─── Formatted words: safe runs (SE-04) ──────────────────────────────────────

test("rich text: only text, bold, four sizes and safe colours; runs must spell the plain words", () => {
  assert.equal(rich.sanitizeRuns(null), null);
  assert.equal(rich.sanitizeRuns("<b>hi</b>"), null);
  assert.equal(rich.sanitizeRuns([{ text: "Hi" }]), null, "nothing formatted: nothing kept");
  assert.equal(rich.sanitizeRuns([{ text: 5, bold: true }]), null);
  // Unknown fields, bad sizes and bad colours are dropped.
  assert.deepEqual(rich.sanitizeRuns([{ text: "Hair ", bold: true, onclick: "x", style: "color:red", html: "<script>" }, { text: "that", size: "huge", color: "red; background:url(javascript:alert(1))" }, { text: " turns", color: "#ff6a2b" }]), [
    { text: "Hair ", bold: true },
    { text: "that" },
    { text: " turns", color: "#FF6A2B" },
  ]);
  assert.equal(rich.safeRichColor("theme:accent"), "theme:accent");
  for (const bad of ["theme:evil", "url(x)", "#fff;", "expression(1)", "rgb(0,0,0)", "javascript:alert(1)"]) assert.equal(rich.safeRichColor(bad), null, bad);
  // Markup in the words is just words (drawn as React text, never HTML).
  const markup = rich.sanitizeRuns([{ text: "<img src=x onerror=alert(1)>", bold: true }]);
  assert.equal(markup[0].text, "<img src=x onerror=alert(1)>");
  // Must spell the words shown: changed somewhere else, the formatting falls away, never the words.
  assert.equal(rich.sanitizeRuns([{ text: "Old", bold: true }], "New"), null);
  assert.equal(rich.richRunsFor({ title: "New", richText: { title: [{ text: "Old", bold: true }] } }, "title", "New"), null);
  // Neighbours with the same style are joined; at most 200 runs.
  assert.deepEqual(rich.sanitizeRuns([{ text: "a", bold: true }, { text: "b", bold: true }]), [{ text: "ab", bold: true }]);
  assert.equal(rich.sanitizeRuns(Array.from({ length: 201 }, () => ({ text: "a", bold: true }))), null);

  // The CSS it draws: only these three properties, colours resolved from the theme.
  const tone = (name) => ({ accent: "#FF6A2B", ink: "#16141F", muted: "#6B6779", cta: "#0C4A44" })[name];
  assert.deepEqual(rich.richRunStyle({ text: "x", bold: true, size: "xl", color: "theme:accent" }, tone), { fontWeight: 800, fontSize: "1.5em", color: "#FF6A2B" });
  assert.deepEqual(rich.richRunStyle({ text: "x", color: "theme:ink" }, () => "red;position:fixed"), {}, "a bad theme value isn't drawn");
  assert.deepEqual(rich.richRunStyle({ text: "x", size: "m" }, tone), {});
});

test("rich text: formatting a selection, typing over formatted words, and saving a draft", () => {
  const plain = "Hair that turns heads.";
  const bold = rich.applyRichFormat(null, plain, 10, 15, { bold: "toggle" });
  assert.deepEqual(bold, [{ text: "Hair that " }, { text: "turns", bold: true }, { text: " heads." }]);
  const sized = rich.applyRichFormat(bold, plain, 0, 0, { size: "l" });
  assert.ok(sized.every((run) => run.size === "l"), "no selection: all the words");
  const coloured = rich.applyRichFormat(bold, plain, 16, 22, { color: "theme:accent" });
  assert.deepEqual(coloured.at(-1), { text: "heads.", color: "theme:accent" });
  assert.equal(rich.applyRichFormat(bold, plain, 10, 15, { bold: "toggle" }), null, "toggled off: nothing left");
  assert.deepEqual(rich.formatAt(bold, 10, 15), { bold: true, size: "m", color: null });
  assert.deepEqual(rich.formatAt(bold, 5, 15), { bold: false, size: "m", color: null });

  // Typing keeps the formatting where the words stayed the same.
  assert.deepEqual(rich.remapRuns(bold, plain, "Hair that turns many heads."), [{ text: "Hair that " }, { text: "turns", bold: true }, { text: " many heads." }]);
  assert.deepEqual(rich.remapRuns(bold, plain, "Hair that turnsss heads."), [{ text: "Hair that " }, { text: "turnsss", bold: true }, { text: " heads." }]);
  assert.equal(rich.remapRuns(bold, plain, "Totally new"), null);

  // In the draft: the plain words stay a plain string (search titles, previews, Rex and the web builder read them).
  let snap = ed.setCopy(draft(), "home", "hero", "title", plain, bold);
  const copy = ed.sectionCopy(ed.findSection(snap, "home", "hero"));
  assert.equal(copy.title, plain);
  assert.equal(typeof copy.title, "string");
  assert.deepEqual(ed.readRich(ed.findSection(snap, "home", "hero"), "title"), bold);
  snap = ed.setCopy(snap, "home", "hero", "title", "Hair that turns many heads.");
  assert.deepEqual(ed.readRich(ed.findSection(snap, "home", "hero"), "title")[1], { text: "turns", bold: true }, "kept while typing");
  snap = ed.setCopy(snap, "home", "hero", "title", "Hair that turns many heads.", null);
  assert.equal(ed.sectionCopy(ed.findSection(snap, "home", "hero")).richText, undefined, "cleared");
  assert.equal(rich.plainText([{ text: "a", bold: true }, { text: "b" }]), "ab");

  // Saving: every copy block is cleaned on the server.
  const dirty = draft();
  dirty.pages[0].sections[0].blocks[0].content = { title: "Hi there", richText: { title: [{ text: "Hi", bold: true, onload: "x" }, { text: " there" }], body: [{ text: "<script>", bold: true }], __proto__: { x: 1 } } };
  const clean = rich.sanitizeSnapshotRich(dirty);
  assert.deepEqual(clean.pages[0].sections[0].blocks[0].content, { title: "Hi there", richText: { title: [{ text: "Hi", bold: true }, { text: " there" }] } });
  assert.match(read("src/lib/store-templates/http.ts"), /const clean = sanitizeSnapshotRich\(snapshot\);/);
  // Drawn as spans with a style object, never as HTML.
  const draw = read("src/components/storefront/rich-copy.tsx");
  assert.doesNotMatch(draw, /dangerouslySetInnerHTML/);
  assert.match(draw, /richRunsFor\(copy, key, shown\)/);
  assert.match(read("src/components/storefront/TemplateStorefrontSurface.tsx"), /const shown = richCopy\(sectionCopyOf\(sectionId\), key, text,/);
  assert.match(read("src/components/storefront/boutique/BoutiqueStorefront.tsx"), /const titleRich = richCopy\(copy, "title", title, richTone\);/);
});

test("the canvas formats what's selected and the phone's text toolbar talks to it", () => {
  const canvas = read("src/app/store-canvas/StoreCanvas.tsx");
  assert.match(canvas, /case "format":/);
  assert.match(canvas, /post\(\{ t: "rich", id: target\.sectionId, key: target\.key, value: target\.value, runs \}\)/);
  assert.match(canvas, /post\(\{ t: "textState"/);
  const screen = read("apps/mobile/src/app/store-editor.tsx");
  for (const id of ["text-bold", "text-colour", "text-smaller", "text-bigger"]) assert.match(screen, new RegExp(`testID="${id}"`), id);
  assert.match(screen, /case "rich":\s+ed\.commit\(\(current\) => setCopy\(current, page, message\.id, message\.key, message\.value, message\.runs\)/);
  assert.deepEqual(ed.parseCanvasMessage(JSON.stringify({ t: "textState", bold: true, size: "l", color: null })), { t: "textState", bold: true, size: "l", color: null });
});

// ─── Photo tools and Make with Rex (SE-05/06) ────────────────────────────────

test("photo tools: brighten steps from the original; Rex's picture and Remove background are one charge each", () => {
  assert.equal(ed.brightenParams(0), null);
  assert.deepEqual(ed.brightenParams(1), { brightness: 1.08, contrast: 1.06, saturation: 1.05 });
  assert.equal(ed.brightenParams(9).brightness, ed.brightenParams(3).brightness, "capped at 3");
  const prompt = ed.rexPhotoPrompt({ sectionLabel: "Banner", sectionWords: "Hair that turns heads.", shopName: "Ada's Hair", ask: "a woman in a lace wig" });
  assert.match(prompt, /Banner/);
  assert.match(prompt, /Ada's Hair/);
  assert.match(prompt, /lace wig/);
  assert.doesNotMatch(ed.rexPhotoPrompt({ sectionLabel: "Banner" }), /seller asks/);

  const route = read("src/app/api/mobile/store-editor/photo/route.ts");
  const rexPart = route.slice(route.indexOf('// "Make with Rex": one picture'));
  const cutPart = route.slice(route.indexOf('if (input.action === "cutout")'), route.indexOf('// "Make with Rex": one picture'));
  // Make with Rex: a Rex job (survives a dropped connection), ONE picture charge, no banner words.
  assert.match(rexPart, /runRexJob\(\{ user, kind: "image", clientKey: input\.clientKey/);
  assert.deepEqual(rexPart.match(/rex\.charge\([^)]*\)/g), ['rex.charge("image", 1, "photo")']);
  assert.doesNotMatch(rexPart, /aiText|bannerCopyPrompt|charge\("text"/);
  // Remove background: OpenAI image edit, transparent, ONE picture charge (priced as bg_remove).
  assert.deepEqual(cutPart.match(/rex\.charge\([^)]*\)/g), ['rex.charge("image", 1, "bg_remove")']);
  assert.match(cutPart, /editImage\(\{ sourceUrl: input\.url, prompt: EDIT_PROMPTS\.remove_background, transparent: true/);
  // Brighten: our own server (sharp), free, only for our own stored photos.
  const brightPart = route.slice(route.indexOf('if (input.action === "brighten")'), route.indexOf('if (input.action === "cutout")'));
  assert.doesNotMatch(brightPart, /charge|meterAi/);
  assert.match(brightPart, /isOwnImageUrl\(input\.url\)/);
  assert.match(route, /\.modulate\(\{ brightness: params\.brightness, saturation: params\.saturation \}\)/);

  // The phone: Make with Rex no longer goes through the banner route (which also writes banner words).
  const photo = read("apps/mobile/src/components/store-editor/photo.tsx");
  assert.doesNotMatch(photo, /buildBanner/);
  assert.match(photo, /makeRexPhoto\(/);
  assert.match(photo, /testID="photo-cutout"/);
  assert.match(photo, /testID="photo-brighten"/);
  assert.match(photo, /testID="photo-tool-undo"/);
  assert.match(read("apps/mobile/src/lib/store-editor.ts"), /rexApi<\{ url: string; creditsLeft: number \| null \}>\("\/api\/mobile\/store-editor\/photo", \{ action: "rex"/);
});

test("every new word is in all five languages", () => {
  const keys = [
    "schedule.button", "schedule.badge", "schedule.confirm", "schedule.changed", "schedule.when", "day.today", "day.tomorrow", "day.0", "day.6",
    "products.prices", "products.pricesHint", "text.bold", "text.colour.none", "text.size.xl",
    "photo.brighten", "photo.removeBg", "photo.rexMake", "photo.rexCost", "crop.removeBg",
  ];
  for (const lang of LANGS) for (const key of keys) assert.ok(CATALOGS.storeEditor[lang][key]?.trim(), `${lang} ${key}`);
  for (const lang of LANGS) assert.match(CATALOGS.storeEditor[lang]["schedule.badge"], /\{when\}/, lang);
});
