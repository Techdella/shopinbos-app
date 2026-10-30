// Formatted words (shared/rich-text.ts) drawn everywhere a 2026 theme shows a section's own words, the web builder's
// text toolbar on inline editing (same validated runs as the phone, never HTML), and "Schedule for later" next to
// Publish in the web builder (same API and rules as the phone).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const rich = await import("../shared/rich-text.ts");
const ed = await import("../shared/store-editor.ts");
const logic = await import("../src/components/builder/editor/editor-logic.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const WORD_KEYS = "title|body|eyebrow|summary|faqTitle|cta|primaryCta|secondaryCta|buttonLabel|discountLabel|footnote|badge";

test("2026 themes draw a section's own words with their formatting (no plain copy left as page text)", () => {
  const files = [
    "src/components/storefront/boutique/BoutiqueStorefront.tsx",
    ...readdirSync(new URL("../src/components/storefront/boutique/blocks/", import.meta.url)).filter((name) => name.endsWith(".tsx")).map((name) => `src/components/storefront/boutique/blocks/${name}`),
  ];
  // Words drawn straight into an element (">{text(copy.title) || "Shop"}<", ">{str(copy.body)}<") instead of
  // through rich()/words()/richCopy(), which keep bold, sizes and colours.
  const plain = new RegExp(`>\\{(?:text|str)\\((?:ctx\\.)?copy\\.(?:${WORD_KEYS})\\)(?: \\|\\| [^}]*)?\\}<`);
  const offenders = [];
  for (const file of files) {
    read(file).split("\n").forEach((line, index) => {
      if (plain.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(offenders, []);
  const storefront = read("src/components/storefront/boutique/BoutiqueStorefront.tsx");
  // Headings of product sections, the FAQ heading, the hero's eyebrow and button, and the story's quote.
  assert.match(storefront, />\{rich\(copy, "title", "Best sellers"\)\}<\/SectionTitle>/);
  assert.match(storefront, /const titleRich = rich\(copy, "title", "Questions"\)/);
  assert.match(storefront, /const eyebrowRich = rich\(copy, "eyebrow"\)/);
  assert.match(storefront, /const ctaRich = rich\(copy, "primaryCta", "Shop now"\)/);
  assert.match(storefront, /\{body \? bodyRich : rich\(copy, "title", store\.name\)\}/);
  assert.match(storefront, /summaryCopy=\{copyOf\(footerSection\)\}/);
  assert.match(read("src/components/storefront/boutique/blocks/shared.tsx"), /export function words\(ctx/);
  assert.match(read("src/components/storefront/boutique/BoutiqueChrome.tsx"), /richCopy\(summaryCopy, "summary", shown, themeTone\(t\)\)/);
});

test("the runs drawn must spell the words shown; theme defaults are never formatted", () => {
  const copy = { title: "Fresh hair", richText: { title: [{ text: "Fresh", bold: true }, { text: " hair" }] } };
  assert.deepEqual(rich.richRunsFor(copy, "title", "Fresh hair"), [{ text: "Fresh", bold: true }, { text: " hair" }]);
  assert.equal(rich.richRunsFor(copy, "title", "Best sellers"), null, "a theme default (or other words) draws plain");
  const source = read("src/components/storefront/rich-copy.tsx");
  assert.match(source, /export function richWords\(/);
  assert.match(source, /if \(!own\) return fallback;/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

test("the web toolbar makes the same runs as the phone, and typing keeps them (copyWithWords, setSectionWords)", () => {
  const plain = "Hair that turns heads";
  // Bold on "turns" while the box holds the saved words.
  const bold = rich.formatTyped(null, plain, plain, 10, 15, { bold: "toggle" });
  assert.deepEqual(bold, [{ text: "Hair that " }, { text: "turns", bold: true }, { text: " heads" }]);
  // Typed more, then sized everything (no selection): the bold follows the typing.
  const typed = "Hair that turns heads fast";
  assert.deepEqual(rich.formatTyped(bold, plain, typed, 0, 0, { size: "xl" }), [{ text: "Hair that ", size: "xl" }, { text: "turns", bold: true, size: "xl" }, { text: " heads fast", size: "xl" }]);
  // A colour that isn't allowed is dropped, never drawn.
  assert.equal(rich.formatTyped(null, plain, plain, 0, 4, { color: "url(javascript:alert(1))" }), null);

  const content = rich.copyWithWords({ title: plain }, "title", plain, bold);
  assert.deepEqual(content.richText.title, bold);
  // Typed over (no runs given): formatting follows; other words: dropped.
  assert.deepEqual(rich.copyWithWords(content, "title", "Hair that turns many heads").richText.title, [{ text: "Hair that " }, { text: "turns", bold: true }, { text: " many heads" }]);
  assert.equal(rich.copyWithWords(content, "title", "New words").richText, undefined);
  // The phone's setCopy and the web's setSectionWords agree.
  const section = { id: "hero", kind: "hero", name: "Hero", visible: true, blocks: [{ id: "c", type: "copy", content: { title: plain } }] };
  const snap = { templateId: "t", templateName: "T", themeTokens: {}, updatedAt: "", pages: [{ id: "p", pageType: "home", title: "Home", slug: "", sections: [section] }] };
  const phone = ed.sectionCopy(ed.findSection(ed.setCopy(snap, "home", "hero", "title", plain, bold), "home", "hero"));
  const web = logic.setSectionWords(section, "title", plain, bold).blocks[0].content;
  assert.deepEqual(web, phone);
  assert.deepEqual(logic.setSectionWords({ ...section, blocks: [] }, "title", plain, bold).blocks[0].content.richText.title, bold, "a copy block is made when missing");
});

test("the web builder's inline editor shows the toolbar and saves runs through the builder (never HTML)", () => {
  const editor = read("src/components/storefront/boutique/InlineTextEditor.tsx");
  assert.match(editor, /role="toolbar"/);
  assert.match(editor, /formatTyped\(formatted\.current\.runs, formatted\.current\.base, value, start, end, patch\)/);
  assert.match(editor, /RICH_SIZE_ORDER\.map/);
  assert.match(editor, /RICH_THEME_COLORS\.map/);
  assert.match(editor, /RICH_FIXED_COLORS\.map/);
  // Buttons keep the typing in the text box (no blur, the selection stays).
  assert.match(editor, /event\.preventDefault\(\);\n\s+event\.stopPropagation\(\);/);
  assert.doesNotMatch(editor, /dangerouslySetInnerHTML|innerHTML/);
  const storefront = read("src/components/storefront/boutique/BoutiqueStorefront.tsx");
  assert.match(storefront, /format=\{props\.onUpdateSectionRich \? inlineFormatting\(section, inline\.key, props\.onUpdateSectionRich\) : undefined\}/);
  assert.match(read("src/components/storefront/TemplateStorefrontSurface.tsx"), /onUpdateSectionRich=\{props\.onUpdateSectionRich\}/);
  const builder = read("src/components/builder/editor/Builder.tsx");
  assert.match(builder, /onUpdateSectionRich=\{editing \? \(id, key, value, runs\) => editSection\(id, \(section\) => setSectionWords\(section, key, value, runs\)/);
  assert.match(builder, /onUpdateSectionCopy=\{editing \? \(id, key, value\) => editSection\(id, \(section\) => setSectionWords\(section, key, value\)/);
  // The phone's canvas keeps its own toolbar (it never passes onUpdateSectionRich).
  assert.doesNotMatch(read("src/app/store-canvas/StoreCanvas.tsx"), /onUpdateSectionRich/);
  // Its words are in the builder catalog.
  const words = read("shared/i18n/messages/builder/en.ts");
  for (const label of ["Text style", "Text size", "Extra large", "Own colour", "Shop colour", "Dark text", "Soft grey"]) assert.match(words, new RegExp(`"ed\\.${label}":`), label);
});

test("Schedule for later in the web builder: the phone's API and rules; Publish now reads it again", async () => {
  assert.match(read("src/app/api/store/editor/schedule/route.ts"), /export \{ GET, POST, DELETE \} from "@\/app\/api\/mobile\/store-editor\/schedule\/route"/);
  const control = read("src/components/builder/editor/SchedulePublish.tsx");
  assert.match(control, /const ENDPOINT = "\/api\/store\/editor\/schedule"/);
  for (const key of ["schedule.badge", "schedule.reschedule", "schedule.cancel", "schedule.confirm", "schedule.changed", "schedule.tooSoon"]) assert.match(control, new RegExp(`t\\("${key.replace(".", "\\.")}"`), key);
  assert.match(control, /scheduleDays\(now, 8\)/);
  assert.match(control, /const version = await save\(\);/, "the latest edits are saved before scheduling");
  const builder = read("src/components/builder/editor/Builder.tsx");
  assert.match(builder, /onPublish=\{\(\) => void b\.publish\(\)\.then\(\(\) => scheduling\.refresh\(\)\)\}/);
  assert.match(read("src/components/builder/editor/TopBar.tsx"), /\{editor \? props\.schedule : null\}/);
  // Publishing by hand replaces a waiting schedule on the server (both the phone and the web publish this way).
  assert.match(read("src/lib/store-publishing.ts"), /if \(!options\.scheduled\) await supersedeScheduledPublish\(store\.id\)/);
  // The words the web shows are the phone's ("Scheduled for Sat 9:00").
  const t = (await import("../shared/i18n/index.ts")).formatMessage;
  assert.equal(t((await import("../shared/i18n/messages/storeEditor/en.ts")).default["schedule.badge"], { when: "Sat 9:00" }), "Scheduled for Sat 9:00");
});
