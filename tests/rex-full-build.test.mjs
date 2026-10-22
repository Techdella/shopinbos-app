// Rex's full store build (src/lib/ai/rex/build-plan.ts, src/lib/ai/rex/inspiration.ts): what a build does with the
// seller's free allowance and AI credits, what Rex reads from a store page the seller likes, and the words Rex's
// design prompt gets from the inspiration. Source checks cover the routes, the build setup and the preview.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const plan = await import("../src/lib/ai/rex/build-plan.ts");
const inspo = await import("../src/lib/ai/rex/inspiration.ts");

const costs = { build: 15, text: 1, image: 5 };

test("a full build uses the free allowance first, then credits, for as many photos as it can", () => {
  const free = plan.planBuild({ left: { build: 6, text: 60, image: 8 }, balance: 0, costs }, "full", 8);
  assert.deepEqual(free, { mode: "full", canBuild: true, pages: true, photos: 8, freePhotos: 8, photosShort: 0, credits: 0 });

  // Two free pictures left and 20 credits: two free photos, four paid ones (20 credits), two left as colour blocks.
  const mixed = plan.planBuild({ left: { build: 1, text: 1, image: 2 }, balance: 20, costs }, "full", 8);
  assert.equal(mixed.photos, 6);
  assert.equal(mixed.freePhotos, 2);
  assert.equal(mixed.photosShort, 2);
  assert.equal(mixed.credits, 20);

  // No allowance left: the build itself is paid first, then the page pass, then photos.
  const paid = plan.planBuild({ left: { build: 0, text: 0, image: 0 }, balance: 31, costs }, "full", 8);
  assert.equal(paid.canBuild, true);
  assert.equal(paid.pages, true);
  assert.equal(paid.photos, 3);
  assert.equal(paid.credits, 15 + 1 + 15);
});

test("no allowance and too few credits means no build; a quick build is the design, a banner and a product photo", () => {
  assert.equal(plan.planBuild({ left: { build: 0, text: 5, image: 5 }, balance: 10, costs }, "full", 8).canBuild, false);
  const quick = plan.planBuild({ left: { build: 1, text: 9, image: 8 }, balance: 0, costs }, "quick", 8);
  assert.deepEqual(quick, { mode: "quick", canBuild: true, pages: false, photos: 2, freePhotos: 2, photosShort: 0, credits: 0 });
  const broke = plan.planBuild({ left: { build: 1, text: 0, image: 0 }, balance: 5, costs }, "quick", 8);
  assert.equal(broke.photos, 1, "one paid photo, the other spot a colour block");
  assert.equal(broke.photosShort, 1);
  assert.equal(broke.credits, 5);
});

test("photos that fail are given back, and rebuilds always make a fresh banner and story picture", () => {
  const usage = read("src/lib/ai/usage.ts");
  assert.match(usage, /export async function refundAi\(/);
  assert.match(usage, /units: -Math\.round\(units\)/, "the allowance comes back as a negative usage row");
  assert.match(usage, /addCredits\(userId, credits, "refund"\)/, "credits go back as a 12-month lot");
  const build = read("src/lib/ai/rex/full-build.server.ts");
  assert.match(build, /meterAiCharged\(userId, "image", units, "photo"\)/);
  assert.match(build, /await refundAi\(userId, "image", units, credits\)/);
  assert.doesNotMatch(build, /needsPhoto|isOwnImageUrl/, "existing banner and story pictures are not kept on a rebuild");
  assert.match(build, /mode === "quick" \? products\.slice\(0, 1\)/);
  assert.match(read("src/lib/ai/rex/build-store.ts"), /giveBack\(heroMeter\.credits\)/);
  assert.match(read("src/components/builder/rex/RexStudio.tsx"), /makeBuildPhotos\(plan\.photos, mode\)/);
});

test("photo spots: banner and story plus up to six products", () => {
  assert.equal(plan.photoSlotsFor(0), 2);
  assert.equal(plan.photoSlotsFor(3), 5);
  assert.equal(plan.photoSlotsFor(40), plan.MAX_BUILD_PHOTOS);
});

const page = `<!doctype html><html><head>
<title>Ignored when og:site_name is set</title>
<meta property="og:site_name" content="Kemi &amp; Co">
<meta name="description" content="Handmade leather bags from Abeokuta.">
<meta property="og:image" content="/img/share.jpg">
<meta name="theme-color" content="#B8612F">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400&family=Inter&display=swap" rel="stylesheet">
<style>.a{color:#2b1d14}.b{background:#ffffff}.c{color:#2B1D14}.d{border-color:#777777}</style>
<script>var x = "#00ff00";</script>
</head><body>
<header><nav><a href="/">Home</a><a href="/shop">Shop all</a><a href="/about">Our story</a></nav></header>
<h1>Carry your <em>culture</em></h1><h2>New in</h2><h2>New in</h2>
</body></html>`;

test("Rex reads a store page: name, words, menu, colours, fonts and its share picture", () => {
  const link = inspo.parseInspirationHtml(page, "https://www.kemi.example/ng");
  assert.equal(link.host, "kemi.example");
  assert.equal(link.title, "Kemi & Co");
  assert.equal(link.description, "Handmade leather bags from Abeokuta.");
  assert.deepEqual(link.headings, ["Carry your culture", "New in"]);
  assert.deepEqual(link.menu, ["Home", "Shop all", "Our story"]);
  assert.equal(link.colours[0], "#b8612f", "the theme colour comes first");
  assert.ok(link.colours.includes("#2b1d14"));
  assert.ok(!link.colours.includes("#ffffff") && !link.colours.includes("#777777"), "white and greys say nothing about the brand");
  assert.deepEqual(link.fonts.slice(0, 2), ["Playfair Display", "Inter"]);
  assert.equal(link.imageUrl, "https://www.kemi.example/img/share.jpg");
  assert.equal(inspo.isEmptyInspiration(link), false);
  assert.equal(inspo.isEmptyInspiration(inspo.parseInspirationHtml("<html><body><div id=app></div></body></html>", "https://app.example")), true);
});

test("the inspiration becomes prompt lines and pictures, and Rex is told not to copy", () => {
  const link = inspo.parseInspirationHtml(page, "https://kemi.example");
  const inspiration = { links: [link], screenshots: ["https://x.supabase.co/storage/v1/a.png"], themeId: "adire", note: "Warm and calm" };
  assert.equal(inspo.hasInspiration(inspiration), true);
  assert.equal(inspo.hasInspiration({ links: [], screenshots: [], themeId: null, note: " " }), false);
  assert.deepEqual(inspo.inspirationImages(inspiration), ["https://x.supabase.co/storage/v1/a.png", "https://kemi.example/img/share.jpg"]);
  const prompt = inspo.inspirationPrompt(inspiration, "Adire");
  assert.match(prompt, /Warm and calm/);
  assert.match(prompt, /"Adire" \(id "adire"\)/);
  assert.match(prompt, /kemi\.example/);
  assert.match(prompt, /never copy another store's name, logo, words, products, prices or pictures/);
  assert.equal(inspo.inspirationPrompt(null), "");
});

test("inspiration from the browser is checked: only https pictures, only real colours, capped lists", () => {
  const parsed = inspo.InspirationSchema.parse({
    links: [{ url: "https://a.example", host: "a.example", title: "A", description: "", headings: [], menu: [], colours: ["#123456", "red", "#12"], fonts: [], imageUrl: "http://a.example/x.png" }],
    screenshots: ["https://ok.example/a.png", "javascript:alert(1)"],
    themeId: "adire",
    note: "x".repeat(5000),
  });
  assert.deepEqual(parsed.links[0].colours, ["#123456"]);
  assert.equal(parsed.links[0].imageUrl, null);
  assert.equal(parsed.note.length <= 1200 || parsed.note === "", true);
  assert.equal(inspo.InspirationSchema.safeParse({ links: [], screenshots: ["javascript:alert(1)"], themeId: null, note: "" }).data?.screenshots.length ?? 0, 0);
});

test("a build request is a build; an edit that mentions the store is not", () => {
  const studio = read("src/components/builder/rex/RexStudio.tsx");
  const BUILD_REQUEST = new RegExp(/const BUILD_REQUEST = \/(.+)\/i;/.exec(studio)[1], "i");
  for (const yes of ["Build my store", "build my whole store.", "Make me a new shop for me", "Build my store like kemi.ng", "create a store inspired by zara"]) assert.ok(BUILD_REQUEST.test(yes), yes);
  for (const no of ["make my store colours green", "Make my shop look nicer", "build my store's about page"]) assert.ok(!BUILD_REQUEST.test(no), no);
});

test("the build steps: setup before building, real steps, credits checked on the server, links fetched safely", () => {
  const studio = read("src/components/builder/rex/RexStudio.tsx");
  assert.match(studio, /if \(BUILD_REQUEST\.test\(request\) \|\| phrasedBuild\) \{[\s\S]{0,400}setSetup\(/, "a typed build request opens the setup");
  assert.match(studio, /writeEveryPage\(/);
  assert.match(studio, /makeBuildPhotos\(plan\.photos, mode\)/);
  assert.match(read("src/lib/ai/rex/full-build.server.ts"), /planBuild\(\{ \.\.\.budget/, "the photo step re-plans instead of trusting the browser");
  assert.match(read("src/lib/ai/rex/inspiration.server.ts"), /safeFetch\(/);
  assert.match(read("src/app/api/ai/build-store/route.ts"), /inspiration: InspirationSchema/);
  assert.match(read("src/app/studio/page.tsx"), /tags: \{ has: "rex-sample" \}/, "the preview shows Rex's sample products");
});
