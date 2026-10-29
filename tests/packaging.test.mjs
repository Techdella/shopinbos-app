// Packaging designer: dielines, words, text fitting, colours and the print-ready PDF.
import test from "node:test";
import assert from "node:assert/strict";

const pack = await import("../shared/packaging.ts");
const { buildPrintPdf, pdfText } = await import("../shared/print-pdf.ts");
const { barcodeBars, ean13Modules } = await import("../shared/barcodes.ts");

test("every format lays out flat with panels inside the sheet and a front panel", () => {
  for (const format of pack.PACK_FORMATS) {
    for (const size of pack.PACK_FORMAT_INFO[format].sizes) {
      const layout = pack.packLayout(format, size);
      assert.ok(layout.panels.some((panel) => panel.role === "front"), `${format} has a front`);
      for (const panel of layout.panels) {
        assert.ok(panel.x >= 0 && panel.y >= 0 && panel.x + panel.w <= layout.width + 1e-9 && panel.y + panel.h <= layout.height + 1e-9, `${format} ${panel.id} inside`);
      }
      for (const outline of layout.cuts) for (const [x, y] of outline) assert.ok(x >= 0 && y >= 0 && x <= layout.width && y <= layout.height, `${format} cut inside`);
      assert.ok(layout.cuts.length + layout.circles.length > 0, `${format} has a cut`);
    }
  }
});

test("a tuck-end box is two faces and two sides wide plus the glue flap, with lids top and bottom", () => {
  const layout = pack.packLayout("box", { w: 80, h: 120, d: 50 });
  assert.equal(layout.width, 80 * 2 + 50 * 2 + 12);
  assert.equal(layout.height, 120 + 2 * (50 + 15));
  assert.deepEqual(layout.panels.map((panel) => panel.id), ["front", "side-left", "back", "side-right", "top", "bottom"]);
  assert.equal(layout.folds.length, 12);
});

test("sizes are clamped, round stickers stay round and flat formats ignore depth", () => {
  assert.deepEqual(pack.clampSize("round_sticker", { w: 60, h: 10 }), { w: 60, h: 60, d: 0 });
  assert.deepEqual(pack.clampSize("jar_label", { w: 5000, h: -3, d: 40 }), { w: 600, h: 80, d: 0 });
  assert.equal(pack.clampSize("pouch", { w: 150, h: 220, d: "x" }).d, 80);
});

test("designs from the browser or Rex are cleaned: bad colours, urls and fields fall back", () => {
  const design = pack.cleanDesign({
    format: "box",
    style: "nope",
    productType: "beauty",
    colours: { ground: "red", ink: "#abcdef" },
    content: { name: " Shea Glow ", claims: ["a", "b", "c", "d", "e"], qrUrl: "javascript:alert(1)", nutrition: [{ label: "Energy", value: "540 kcal" }, { value: "x" }] },
    image: { url: "http://insecure/x.png" },
    logoUrl: "https://cdn.example/logo.png",
  });
  assert.equal(design.style, "midnight");
  assert.equal(design.colours.ground, pack.PACK_STYLE_INFO.midnight.colours.ground);
  assert.equal(design.colours.ink, "#ABCDEF");
  assert.equal(design.content.name, "Shea Glow");
  assert.equal(design.content.claims.length, 4);
  assert.equal(design.content.qrUrl, "");
  assert.deepEqual(design.content.nutrition, [{ label: "Energy", value: "540 kcal" }]);
  assert.equal(design.image, null);
  assert.equal(design.logoUrl, "https://cdn.example/logo.png");
});

test("new designs start from the product type's formats, styles, claims and net content", () => {
  const design = pack.newDesign({ productType: "beauty", brand: "Ada", name: "Shea butter" });
  assert.equal(design.format, "jar_label");
  assert.ok(pack.PACK_STYLE_INFO[design.style].best.includes("beauty"));
  assert.equal(design.content.netContent, "250 g");
  assert.equal(design.content.claims.length, 3);
  assert.equal(pack.guessProductType("Roasted cashew nuts 500g"), "food");
  assert.equal(pack.guessProductType("Zobo drink 50cl"), "drinks");
  assert.equal(pack.guessProductType("Whipped shea body butter"), "beauty");
  assert.equal(pack.guessProductType("Ankara tote bag"), "fashion");
  assert.equal(pack.stylesFor("fashion")[0], "ankara");
});

test("text fitting: font sizes shrink to the width and back-of-pack words fit the box", () => {
  assert.equal(pack.fitFontSize("MIXED", 100, 30, "condensed"), 30);
  assert.ok(pack.fitFontSize("A VERY LONG PRODUCT NAME INDEED", 40, 30, "heavy") < 3);
  assert.deepEqual(pack.wrapText("one two three four", 9), ["one two", "three", "four"]);
  assert.deepEqual(pack.wrapText("abcdefghij", 4), ["abcd", "efgh", "ij"]);
  const blocks = pack.infoBlocks({ ...pack.EMPTY_CONTENT, ingredients: "Cashew, almond, walnut, salt.", allergens: "Contains nuts.", storage: "Keep cool and dry." }, "food");
  assert.deepEqual(blocks.map((block) => block.heading), ["Ingredients", "Allergens", "Storage"]);
  const fitted = pack.layoutInfo(blocks, 50, 60);
  assert.equal(fitted.overflow, false);
  assert.ok(fitted.lines[fitted.lines.length - 1].y <= 60);
  const crammed = pack.layoutInfo([{ text: "word ".repeat(2000) }], 20, 10);
  assert.equal(crammed.overflow, true);
  assert.ok(crammed.lines.every((line) => line.y <= 10));
});

test("colours: CMYK for the spec sheet and readable text on any ground", () => {
  assert.deepEqual(pack.hexToCmyk("#000000"), [0, 0, 0, 100]);
  assert.deepEqual(pack.hexToCmyk("#FF0000"), [0, 100, 100, 0]);
  assert.equal(pack.readableOn("#FFFFFF"), "#111111");
  assert.equal(pack.readableOn("#1E1E1E"), "#FFFFFF");
  const sheet = pack.specSheet(pack.newDesign({ brand: "Ada", name: "Nuts" }), "Ada Nuts");
  assert.ok(sheet.some((line) => line.includes("bleed")));
  assert.ok(sheet.some((line) => /C\d+ M\d+ Y\d+ K\d+/.test(line)));
});

test("barcode bars match the EAN modules", () => {
  const { bars, total, label, kind } = barcodeBars("5901234123457");
  assert.equal(kind, "ean13");
  assert.equal(label, "5901234123457");
  const modules = ean13Modules("5901234123457");
  assert.equal(total, modules.length + 20);
  assert.equal(bars.reduce((sum, [, w]) => sum + w, 0), [...modules].filter((bit) => bit === "1").length);
});

test("the print PDF has trim and bleed boxes, spot-colour dieline, crop marks, vector barcode and a valid xref", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const layout = pack.packLayout("box", { w: 80, h: 120, d: 50 });
  const bytes = buildPrintPdf({
    title: "Ada — Mixed nuts ₦",
    width: layout.width,
    height: layout.height,
    bleed: 3,
    artwork: { jpeg, pxWidth: 10, pxHeight: 10 },
    dieline: layout,
    barcodes: [{ x: 10, y: 10, w: 30, h: 15, value: "5901234123457" }],
    spec: ["Spec", "Line two"],
  });
  const text = new TextDecoder("latin1").decode(bytes);
  assert.ok(text.startsWith("%PDF-1.6"));
  assert.match(text, /\/TrimBox \[/);
  assert.match(text, /\/BleedBox \[/);
  assert.match(text, /\/Separation \/CutContour/);
  assert.match(text, /\/Separation \/Crease/);
  assert.match(text, /\/Count 2/);
  assert.match(text, /\(Ada - Mixed nuts NGN \)/);
  const startxref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.ok(text.slice(startxref).startsWith("xref"));
  const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((offset, index) => assert.ok(text.slice(offset).startsWith(`${index + 1} 0 obj`), `object ${index + 1} offset`));
  assert.equal(pdfText("a(b)\\"), "a\\(b\\)\\\\");
});

test("creative prompts carry the concept, placement, exact words and products", async () => {
  const creatives = await import("../shared/creatives.ts");
  const prompt = creatives.creativePrompt({ placement: "story", concept: "bold_headline", headline: 'Tough "choice".', cta: "Shop now", products: ["Medjool dates", "Omani dates"], brandName: "Superfarms" });
  assert.match(prompt, /9:16/);
  assert.match(prompt, /giant chunky/);
  assert.match(prompt, /"Tough 'choice'\."/);
  assert.match(prompt, /Medjool dates, Omani dates/);
  assert.match(creatives.creativePrompt({ placement: "store_banner", concept: "minimal_studio" }), /No text at all/);
  for (const placement of creatives.CREATIVE_PLACEMENTS) assert.ok(["square", "portrait", "landscape"].includes(creatives.CREATIVE_PLACEMENT_INFO[placement].shape));
});

test("sample designs exist for every product type and style, and Rex can design packaging and creatives", async () => {
  const { sampleDesign } = await import("../shared/packaging-samples.ts");
  for (const type of pack.PRODUCT_TYPES) for (const style of pack.PACK_STYLES) assert.ok(sampleDesign(type, style).content.name);
  const { readFileSync } = await import("node:fs");
  const tools = readFileSync(new URL("../src/lib/ai/rex/tools.ts", import.meta.url), "utf8");
  assert.match(tools, /design_packaging: designPackaging/);
  assert.match(tools, /make_creative: makeCreative/);
  assert.match(tools, /saveLabelDesign\(/, "Rex's print labels are saved to Labels and print");
});

test("print orders: prices scale with quantity, size, material and delivery, and the minimum applies", async () => {
  const po = await import("../shared/print-orders.ts");
  const size = pack.PACK_FORMAT_INFO.pouch.sizes[1];
  const small = po.quotePrint({ format: "pouch", size, quantity: 100, zone: "lagos" });
  const big = po.quotePrint({ format: "pouch", size, quantity: 5000, zone: "lagos" });
  assert.ok(big.unitPrice < small.unitPrice, "bigger runs cost less each");
  assert.equal(small.total, small.printCost + small.setupFee + small.deliveryFee);
  assert.equal(po.quotePrint({ format: "sachet", size: pack.PACK_FORMAT_INFO.sachet.sizes[1], quantity: 10, zone: "lagos" }).quantity, 1000, "minimum run");
  const large = po.quotePrint({ format: "pouch", size: pack.PACK_FORMAT_INFO.pouch.sizes[2], quantity: 500, zone: "lagos" });
  assert.ok(large.unitPrice > po.quotePrint({ format: "pouch", size, quantity: 500, zone: "lagos" }).unitPrice, "bigger packs cost more");
  const foil = po.quotePrint({ format: "pouch", size, quantity: 500, finish: "foil", material: "clear_window", zone: "lagos" });
  assert.equal(foil.material.id, "clear_window");
  assert.ok(foil.unitPrice > po.quotePrint({ format: "pouch", size, quantity: 500, zone: "lagos" }).unitPrice);
  assert.equal(po.quotePrint({ format: "pouch", size, quantity: 500, material: "made-up", zone: "pickup" }).material.id, "kraft_zip", "unknown material falls back");
  assert.equal(po.quotePrint({ format: "pouch", size, quantity: 500, zone: "pickup" }).deliveryFee, 0);
  assert.ok(po.quotePrint({ format: "pouch", size, quantity: 500, zone: "rest" }).days > po.quotePrint({ format: "pouch", size, quantity: 500, zone: "lagos" }).days);
  for (const format of pack.PACK_FORMATS) assert.ok(po.PRINT_MATERIALS[format].length > 0, format);
  assert.equal(po.PrintOrderSchema.safeParse({ designId: "d1", quantity: 500, zone: "lagos", contactName: "Ada", contactPhone: "08031234567", proofOk: false }).success, false, "the seller must check the proof");
  assert.equal(po.PrintOrderSchema.safeParse({ designId: "d1", quantity: 500, zone: "lagos", contactName: "Ada", contactPhone: "08031234567", proofOk: true }).success, true);
});

test("print orders are priced on the server from the saved design and paid through the Paystack webhook", async () => {
  const { readFileSync } = await import("node:fs");
  const server = readFileSync(new URL("../src/lib/packaging/print-orders.server.ts", import.meta.url), "utf8");
  assert.match(server, /quotePrint\(\{ format: design\.format, size: design\.size/);
  assert.match(server, /Number\(verified\.amount\) < row\.total \* 100/, "underpayment is refused");
  const webhook = readFileSync(new URL("../src/app/api/webhooks/paystack/route.ts", import.meta.url), "utf8");
  assert.match(webhook, /PRINT_ORDER_REFERENCE_PREFIX/);
});

test("premium packaging renders: concept, pack, scene, exact words and the range", async () => {
  const pc = await import("../shared/pack-concepts.ts");
  for (const concept of pc.PACK_CONCEPTS) {
    assert.ok(pc.PACK_CONCEPT_INFO[concept].shapes.every((shape) => pc.isPackShape(shape)), `${concept} shapes are real packs`);
    assert.ok(pc.PACK_CONCEPT_PHOTO[concept].url.startsWith("https://images.unsplash.com/"), `${concept} has a card photo`);
    assert.match(pc.packConceptPrompt({ concept, productName: "Mixed Nuts" }), /"Mixed Nuts"/);
  }
  const mascot = pc.packConceptPrompt({ concept: "mascot", shape: "carton", brandName: 'Strikers "Co"', productName: "Cookie", hasLogo: true, hasProductPhoto: true, accent: "#ff6a2b" });
  assert.match(mascot, /die-cut transparent window/);
  assert.match(mascot, /gable-top/);
  assert.match(mascot, /the brand "Strikers 'Co'"/, "quotes are cleaned so the lettering stays exact");
  assert.match(mascot, /#FF6A2B/);
  assert.match(mascot, /logo from the reference image exactly/);
  const moods = pc.packConceptPrompt({ concept: "mood_range", productName: "Puffs" });
  assert.match(moods, /Show 4 packs, one per mood/);
  assert.match(moods, /2 × 2 grid/, "the mood range is a grid by default");
  const range = pc.packConceptPrompt({ concept: "flavour_family", productName: "Juice", variants: ["Mango", "mango", "Mango", "Guava", "", "Zobo", "Tiger nut", "Extra"] });
  assert.equal(pc.packVariants(["Mango", "Mango", "", "Guava"]).length, 2);
  assert.match(range, /range of 4 packs/, "variants are de-duplicated and capped at four");
  assert.doesNotMatch(range, /Extra/);
  assert.equal(pc.packConceptShape("grid", 4), "portrait");
  assert.equal(pc.packConceptShape("studio", 3), "landscape");
  assert.equal(pc.packConceptShape("studio", 1), "portrait");
  assert.equal(pc.defaultPackShape("ingredient_fusion"), "tub");
  const tools = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/lib/ai/rex/tools.ts", import.meta.url), "utf8"));
  assert.match(tools, /make_packaging_mockup: makePackagingMockup/);
});
