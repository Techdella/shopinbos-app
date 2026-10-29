// Rex as the seller's designer (src/lib/ai/rex/design-review.ts): what it would fix in a draft, the picture spots
// it can fill, and that the Studio greeting and the chat agent both use it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const review = await import("../src/lib/ai/rex/design-review.ts");

const section = (id, kind, copy = {}, extra = {}) => ({ id, kind, name: extra.name ?? kind, visible: extra.visible ?? true, blocks: [{ id: `${id}-c`, type: "copy", content: copy }], ...(extra.settings ? { settings: extra.settings } : {}), ...(extra.items ? { items: extra.items } : {}) });
const draft = (sections, tokens = {}) => ({
  templateId: "gbedu",
  templateName: "Gbedu",
  layoutFamily: "x",
  updatedAt: "",
  themeTokens: { ink: "#111111", paperBg: "#FFFFFF", ctaText: "#FFFFFF", ctaBg: "#111111", heroText: "#FFFFFF", heroBg: "#000000", ...tokens },
  pages: [{ id: "p", pageType: "home", title: "Home", slug: "home", sections: [section("header", "header"), ...sections, section("footer", "footer")] }],
});

test("finds sample photos, empty banners and stories, doubled-up sections, a thin homepage and unreadable colours", () => {
  const result = review.reviewStoreDraft(draft([
    section("hero", "hero-split", { title: "" }, { settings: { layout: "gbedu-impact" } }),
    section("story", "story-split", { title: "Our story", body: "" }, { name: "Our story" }),
    section("faq1", "faq", { title: "Questions" }),
    section("faq2", "faq", { title: "More questions" }),
  ], { ctaText: "#FFFFFF", ctaBg: "#1FC6D6" }), { boutique: true, storeName: "Maxi" });
  const ids = result.findings.map((finding) => finding.id);
  assert.equal(ids[0], "pictures", "pictures first");
  assert.match(result.findings[0].message, /sample photo/);
  assert.equal(result.findings[0].fix, null, "pictures are fixed by fill_section_images");
  assert.ok(ids.includes("words-hero"), "banner with no headline");
  assert.ok(ids.includes("words-story"), "story with no text");
  assert.ok(ids.includes("twice-faq2"), "two FAQ sections back to back");
  assert.ok(ids.includes("look-buttons"), "white on light teal buttons");
  assert.ok(!ids.includes("look-text"), "dark on white reads fine");
  assert.ok(result.findings.length <= 6);
  for (const finding of result.findings.filter((entry) => entry.fix)) assert.match(finding.fix, /\w/);
  assert.deepEqual(result.pictureSlots.map((slot) => `${slot.sectionId}:${slot.field}:${slot.stock}`), ["hero:media:true", "story:media:true"]);
});

test("a stock photo switched off is an empty spot; a picture in place is not a spot", () => {
  const off = review.reviewStoreDraft(draft([section("hero", "hero-split", { title: "Hi" }, { settings: { layout: "gbedu-impact", stockImage: false } })]), { boutique: true });
  assert.equal(off.pictureSlots[0].stock, false);
  assert.match(off.findings[0].message, /no picture yet/);
  const done = review.reviewStoreDraft(draft([section("hero", "hero-split", { title: "Hi" }, { settings: { layout: "gbedu-impact" }, items: [{ imageUrl: "https://cdn.example/x.png" }] })]), { boutique: true });
  assert.equal(done.pictureSlots.length, 0);
});

test("wiring: tools, agent context and instructions, and the Studio greeting", () => {
  const tools = read("src/lib/ai/rex/tools.ts");
  assert.match(tools, /review_store_design: reviewStoreDesign/);
  assert.match(tools, /fill_section_images: fillSectionImages/);
  assert.match(tools, /const giveBack = await meter\(ctx, "image"\);[\s\S]*?catch \(error\) \{\n\s+await giveBack\(\);/, "a picture that fails is given back");
  const agent = read("src/lib/ai/rex/agent.ts");
  assert.match(agent, /designReview:/);
  assert.match(agent, /Want me to make pictures for your store\?/);
  assert.match(agent, /Ask before fill_section_images/);
  const studio = read("src/components/builder/rex/RexStudio.tsx");
  assert.match(studio, /offer: "Make pictures for my store"/);
  assert.match(studio, /offer: "Fix those for me"/);
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    const words = read(`shared/i18n/messages/builder/${lang}.ts`);
    for (const key of ["rex.hi.pictures", "rex.hi.fixes", "rex.offer.Make pictures for my store", "rex.offer.Fix those for me"]) assert.ok(words.includes(`"${key}":`), `${lang}: ${key}`);
  }
});
