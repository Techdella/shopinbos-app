// Store builder: the section settings panel always matches the layout the seller picked (one declarative schema per
// section and layout in section-schema.ts), and older saved sections are upgraded in memory without changing how a
// published store looks (section-content.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = await import("../src/components/builder/editor/section-schema.ts");
const content = await import("../src/lib/store-templates/section-content.ts");

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const section = (kind, settings = {}, extra = {}) => ({
  id: "s1",
  kind,
  name: kind,
  visible: true,
  blocks: [{ id: "c", type: "copy", content: { title: "New season", body: "Fresh pieces", primaryCta: "Shop now", eyebrow: "Just in" } }],
  settings,
  ...extra,
});
const ids = (sec, renderer, themeId = "") => schema.visibleFields(sec, renderer, themeId).map((field) => field.id);

const CLASSIC_KINDS = ["announcement-bar", "header", "footer", "hero-split", "trust-strip", "category-list", "category-grid", "lookbook-grid", "featured-products", "story-split", "text-columns", "testimonials", "faq", "promo-banner", "newsletter", "contact-form", "about-section", "delivery-info", "payment-info", "blog-index", "cart-summary", "wishlist-grid", "checkout-form", "product-detail", "filters-toolbar"];
const BOUTIQUE_KINDS = ["announcement-bar", "header", "footer", "hero-split", "payday-countdown", "featured-products", "category-grid", "testimonials", "story-split", "about-section", "faq", "newsletter", "contact-form", "wishlist-grid", "cart-summary", "checkout-form", "product-detail"];

test("hero: picking slides shows a slide list with timing, and hides the single-banner fields", () => {
  for (const [renderer, slider, single, theme] of [["boutique", "plain-slides", "breeze-banner", "breeze"], ["classic", "slideshow", "split-editorial", ""]]) {
    const sliding = ids(section("hero-split", { layout: slider }), renderer, theme);
    assert.ok(sliding.includes("slides"), `${renderer}: slide list`);
    assert.ok(sliding.includes("slideAutoplay") && sliding.includes("slideSeconds"), `${renderer}: timing`);
    for (const stale of ["title", "body", "primaryCta", "primaryButtonAction", "eyebrow", "media"]) assert.ok(!sliding.includes(stale), `${renderer}: ${stale} hidden while sliding`);

    const back = ids(section("hero-split", { layout: single }), renderer, theme);
    assert.ok(!back.includes("slides") && !back.includes("slideAutoplay") && !back.includes("slideSeconds"), `${renderer}: no slide fields after switching back`);
    assert.ok(back.includes("title") && back.includes("body") && back.includes("primaryCta"), `${renderer}: banner words back`);

    const off = ids(section("hero-split", { layout: slider, slideAutoplay: false }), renderer, theme);
    assert.ok(off.includes("slideAutoplay") && !off.includes("slideSeconds"), `${renderer}: seconds only while slides change by themselves`);
  }

  const boutique = ids(section("hero-split", { layout: "breeze-banner" }), "boutique", "breeze");
  assert.ok(boutique.includes("media"), "single banner: one image field");
  const media = schema.visibleFields(section("hero-split", { layout: "breeze-banner" }), "boutique", "breeze").find((field) => field.id === "media");
  assert.equal(media.max, 1, "a one-picture banner only shows one picture");
  assert.equal(schema.visibleFields(section("hero-split", { layout: "asoebi-collage" }), "boutique", "asoebi").find((field) => field.type === "media").max, 3, "the collage takes three");

  const slides = schema.visibleFields(section("hero-split", { layout: "plain-slides" }), "boutique", "plain").find((field) => field.id === "slides");
  assert.equal(slides.type, "repeater");
  assert.deepEqual(slides.fields.map((field) => field.key), ["media", "heading", "text", "buttonLabel", "link", "textTone", "textPosition"]);
  assert.equal(slides.fields.find((field) => field.key === "media").accept, "media", "slides take a picture, a video or a YouTube link");
  assert.ok(slides.max >= 3 && slides.template.link, "slides have a sensible starter and limit");

  // The 2026 "plain" theme's default banner is slides: with no layout saved, the panel shows slides.
  assert.ok(ids(section("hero-split"), "boutique", "plain").includes("slides"));
  // Industry themes offer their own banner, so the panel never claims a layout the shopper doesn't see.
  const layout = schema.sectionSchema("hero-split", "boutique", "ewa").settings.flatMap((group) => group.fields).find((field) => field.id === "layout");
  assert.equal(layout.fallback, "ewa-arch");
  assert.equal(layout.options[0].value, "ewa-arch");
});

test("classic hero: buttons and pictures follow the layout", () => {
  const minimal = ids(section("hero-split", { layout: "minimal-center" }), "classic");
  assert.ok(minimal.includes("primaryCta") && !minimal.includes("secondaryCta") && !minimal.includes("secondaryButtonAction"), "minimal centre has one button");
  const portal = ids(section("hero-split", { layout: "category-portal" }), "classic");
  assert.ok(!portal.includes("primaryCta") && !portal.includes("primaryButtonAction") && portal.includes("portal-note"), "category portal has no buttons");
  assert.ok(ids(section("hero-split", { layout: "video-background" }), "classic").includes("media-video"));
  assert.ok(ids(section("hero-split", { layout: "product-spotlight" }), "classic").includes("products-spotlight"));
  assert.ok(ids(section("hero-split", { layout: "editorial-mosaic" }), "classic").includes("tiles"));
  const external = ids(section("hero-split", { layout: "split-editorial", primaryButtonAction: "external" }), "classic");
  assert.ok(external.includes("primaryButtonUrl"));
  assert.ok(!ids(section("hero-split", { layout: "split-editorial" }), "classic").includes("primaryButtonUrl"), "the link box only shows for 'Another website'");
  assert.ok(schema.SECTION_VARIATIONS["hero-split"].every((option) => option.value !== "slideshow"), "slideshow is added by the schema, not the shared list");
  assert.ok(schema.sectionSchema("hero-split", "classic").settings[0].fields[0].options.some((option) => option.value === "slideshow"));
});

test("other sections with layouts show only what that layout draws", () => {
  // Testimonials: the featured quote has no heading; reviews are an editable list.
  assert.ok(!ids(section("testimonials", { layout: "featured" }), "classic").includes("title"));
  assert.ok(ids(section("testimonials", { layout: "slider" }), "classic").includes("title"));
  assert.equal(schema.visibleFields(section("testimonials"), "classic").find((field) => field.id === "items").type, "repeater");
  assert.ok(ids(section("testimonials", { layout: "carousel" }), "boutique").includes("limit"));

  // Featured products (2026 themes): collection picker only for "One collection", product picks hidden for the full grid.
  assert.ok(ids(section("featured-products", { source: "collection" }), "boutique").includes("collectionId"));
  assert.ok(!ids(section("featured-products", { source: "best-sellers" }), "boutique").includes("collectionId"));
  assert.ok(ids(section("featured-products", { source: "picked" }), "boutique").includes("products-picked"));
  const grid = ids(section("featured-products", { layout: "grid" }), "boutique");
  assert.ok(!grid.includes("products") && !grid.includes("limit") && !grid.includes("source") && grid.includes("grid-note"));
  assert.ok(ids(section("featured-products", { layout: "grid" }), "classic").includes("columns"));
  assert.ok(!ids(section("featured-products", { layout: "editorial-rows" }), "classic").includes("columns"), "rows have no columns setting");

  // Image with text: picture side where the layout has a picture beside the words.
  assert.ok(ids(section("story-split", {}), "boutique").includes("imagePosition"));
  assert.ok(ids(section("story-split", { layout: "image-collage" }), "classic").includes("imagePosition"));
  assert.ok(!ids(section("story-split", { layout: "ritual-steps" }), "classic").some((id) => id.startsWith("imagePosition")));

  // Promo banner: a real end time only for the countdown; the picture only where one is drawn.
  assert.ok(ids(section("promo-banner", { layout: "countdown" }), "classic").includes("endsAt"));
  assert.ok(!ids(section("promo-banner", { layout: "gradient-sale" }), "classic").includes("endsAt"));
  assert.ok(!ids(section("promo-banner", { layout: "minimal-strip" }), "classic").includes("body"));
  assert.ok(ids(section("promo-banner", { layout: "split-offer" }), "classic").includes("media"));

  // Trust bar: icon only for the icon row, card style only where cards are drawn.
  const trust = (layout) => schema.visibleFields(section("trust-strip", { layout }), "classic").find((field) => field.id === "items");
  const itemKeys = (layout) => trust(layout).fields.filter((field) => schema.fieldVisible(section("trust-strip", { layout }), field)).map((field) => field.key);
  assert.deepEqual(itemKeys("icon-row"), ["label", "value", "icon"]);
  assert.deepEqual(itemKeys("compact-badges"), ["label", "variant"]);

  // Category tiles: no picture for the icon row.
  const tiles = schema.visibleFields(section("category-list", { layout: "icon-row" }), "classic").find((field) => field.id === "items");
  assert.ok(!tiles.fields.filter((field) => schema.fieldVisible(section("category-list", { layout: "icon-row" }), field)).some((field) => field.key === "media"));

  // Fields that did nothing are gone: the announcement bar's style, header/footer headings, the trust bar heading.
  assert.ok(!ids(section("announcement-bar"), "classic").includes("layout"));
  for (const kind of ["header", "footer", "trust-strip"]) assert.ok(!ids(section(kind), "classic").includes("title"), `${kind} has no heading`);
  assert.ok(!ids(section("newsletter"), "classic").includes("primaryButtonAction"), "the newsletter button always subscribes");
  assert.ok(!ids(section("story-split"), "classic").includes("cta"), "image with text has no button in older templates");
});

test("every schema is well formed for every layout", () => {
  const check = (renderer, kind, themeId) => {
    const full = schema.sectionSchema(kind, renderer, themeId);
    const layoutField = schema.allFields(full).find((field) => field.id === "layout");
    const layouts = layoutField?.options?.map((option) => option.value) ?? [""];
    for (const layout of layouts) {
      const sec = section(kind, layout ? { layout } : {});
      const visible = schema.visibleFields(sec, renderer, themeId);
      const seen = new Set();
      for (const field of visible) {
        assert.ok(!seen.has(field.id), `${renderer}/${kind}/${layout}: duplicate field ${field.id}`);
        seen.add(field.id);
        if (field.type === "repeater") {
          assert.ok(field.max > 0 && field.itemName && field.addLabel && field.template && field.fields.length, `${renderer}/${kind}: ${field.id} list`);
          const keys = field.fields.filter((item) => schema.fieldVisible(sec, item)).map((item) => item.key);
          assert.equal(new Set(keys).size, keys.length, `${kind}/${layout}: ${field.id} item keys are unique`);
        }
      }
      const lists = visible.filter((field) => field.type === "repeater" || field.type === "items" || field.type === "faq");
      assert.ok(lists.length <= 1, `${renderer}/${kind}/${layout}: at most one list edits the section's items`);
    }
  };
  for (const kind of CLASSIC_KINDS) check("classic", kind, "");
  for (const kind of BOUTIQUE_KINDS) for (const theme of ["breeze", "plain", "noir", "asoebi", "iwe", "ounje"]) check("boutique", kind, theme);
  assert.deepEqual(schema.SLIDER_LAYOUTS, content.SLIDER_HERO_LAYOUTS, "the panel and the renderers agree on which layouts slide");
});

test("slides read older saves the way they looked, and the in-memory upgrade fills each slide", () => {
  // A 2026 "Slides" banner saved before slides had their own words: three pictures, one shared heading.
  const legacy = section("hero-split", { layout: "plain-slides", primaryButtonAction: "about" }, {
    items: [
      { imageUrl: "https://cdn.example/a.jpg", originalSrc: "https://cdn.example/a.jpg", resolvedSrc: "https://cdn.example/a.jpg" },
      { originalSrc: "https://cdn.example/b.jpg" },
      { imageUrl: "https://cdn.example/c.mp4" },
    ],
  });
  const slides = content.readHeroSlides(legacy);
  assert.equal(slides.length, 3);
  assert.deepEqual(slides.map((slide) => slide.heading), ["New season", "New season", "New season"], "every slide shows the shared heading, as before");
  assert.deepEqual(slides.map((slide) => slide.mediaType), ["image", "image", "video"]);
  assert.deepEqual(slides[0].link, { type: "page", value: "about" }, "the old 'Button opens' setting becomes each slide's link");
  assert.equal(slides[1].mediaUrl, "https://cdn.example/b.jpg", "pictures saved only as originalSrc still show");

  const upgraded = content.migrateSection(legacy);
  assert.notEqual(upgraded, legacy);
  assert.equal(legacy.items[1].imageUrl, undefined, "the saved section is not mutated");
  assert.deepEqual(upgraded.items.map((item) => item.heading), ["New season", "New season", "New season"]);
  assert.deepEqual(upgraded.items[0].link, { type: "page", value: "about" });
  assert.equal(upgraded.items[1].imageUrl, "https://cdn.example/b.jpg");
  assert.equal(upgraded.items[2].videoUrl, "https://cdn.example/c.mp4");
  assert.deepEqual(content.readHeroSlides(upgraded), slides, "upgrading changes nothing the shopper sees");
  assert.equal(content.migrateSection(upgraded), upgraded, "an upgraded section is left alone");

  // A slide's own words win; an empty heading stays empty instead of falling back.
  const own = content.readHeroSlides(section("hero-split", { layout: "slideshow" }, { items: [{ imageUrl: "x.jpg", heading: "", text: "Own text", buttonLabel: "Go", link: { type: "product", value: "p1" }, textTone: "dark", textPosition: "center" }] }));
  assert.deepEqual(own[0], { mediaUrl: "x.jpg", mediaType: "image", alt: "", heading: "", text: "Own text", buttonLabel: "Go", link: { type: "product", value: "p1" }, textTone: "dark", textPosition: "center" });

  // The theme default decides when nothing is saved (the "plain" theme slides).
  const plain = section("hero-split", {}, { items: [{ imageUrl: "a.jpg" }] });
  assert.equal(content.migrateSection(plain).items[0].heading, undefined, "not a slider without the theme default");
  assert.equal(content.migrateSection(plain, { heroDefault: "plain-slides" }).items[0].heading, "New season");

  // Single-banner heroes are not given slide fields.
  const single = section("hero-split", { layout: "breeze-banner" }, { items: [{ imageUrl: "a.jpg" }] });
  assert.equal(content.migrateSection(single), single);
});

test("other in-memory upgrades: renamed layouts, trust bar tone, whole snapshots", () => {
  assert.equal(content.migrateSection(section("hero-split", { layout: "full-bleed-split" })).settings.layout, "full-bleed");
  assert.equal(content.migrateSection(section("trust-strip", { tone: "premium-retail" })).settings.layout, "icon-row");
  assert.equal(content.migrateSection(section("trust-strip", {})).settings.layout, "metric-cards");
  const kept = section("trust-strip", { layout: "compact-badges" });
  assert.equal(content.migrateSection(kept), kept);

  const snapshot = { templateId: "plain", templateName: "Plain", layoutFamily: "x", themeTokens: {}, updatedAt: "1", pages: [{ id: "h", pageType: "home", title: "Home", slug: "", sections: [section("faq", {}, { items: [{ question: "Q", answer: "A" }] })] }] };
  assert.equal(content.migrateSnapshot(snapshot), snapshot, "nothing to upgrade keeps the same snapshot (no false 'unsaved changes')");
  assert.equal(content.migrateSnapshot(null), null);
  const old = { ...snapshot, pages: [{ ...snapshot.pages[0], sections: [section("hero-split", {}, { items: [{ originalSrc: "a.jpg" }] })] }] };
  const next = content.migrateSnapshot(old, { heroDefault: "plain-slides" });
  assert.notEqual(next, old);
  assert.equal(next.pages[0].sections[0].items[0].imageUrl, "a.jpg");
  assert.equal(next.pages[0].sections[0].items[0].heading, "New season");
});

test("media links, slide links and timing", () => {
  assert.equal(content.youTubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(content.youTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), "dQw4w9WgXcQ");
  assert.equal(content.youTubeId("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(content.youTubeId("https://cdn.example/a.jpg"), null);
  assert.match(content.youTubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ", { background: true }), /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1&mute=1&loop=1&playlist=dQw4w9WgXcQ/);
  assert.equal(content.mediaKind("https://youtu.be/dQw4w9WgXcQ"), "youtube");
  assert.deepEqual(content.mediaItemFields("https://cdn.example/v.webm"), { imageUrl: "https://cdn.example/v.webm", originalSrc: "https://cdn.example/v.webm", resolvedSrc: "https://cdn.example/v.webm", videoUrl: "https://cdn.example/v.webm" });
  assert.equal(content.mediaItemFields("https://cdn.example/a.jpg").videoUrl, undefined, "a picture clears an old video");

  assert.deepEqual(content.readSlideLink(undefined, { primaryButtonAction: "external", primaryButtonUrl: "https://x.example" }), { type: "url", value: "https://x.example" });
  assert.deepEqual(content.readSlideLink("https://x.example"), { type: "url", value: "https://x.example" });
  assert.deepEqual(content.readSlideLink({ type: "page" }), { type: "page", value: "products" });
  assert.deepEqual(content.readSlideTiming({}), { autoplay: true, seconds: 6 });
  assert.deepEqual(content.readSlideTiming({ slideAutoplay: false, slideSeconds: 99 }), { autoplay: false, seconds: 15 });
  assert.equal(content.readProductLimit({ limit: 4 }, 8), 4);
  assert.equal(content.readProductLimit({}, 8), 8);
  assert.equal(content.readCountdownEnd({ endsAt: "nonsense" }), null);
  assert.equal(content.readCountdownEnd({ endsAt: "2026-12-01T18:00:00.000Z" }).toISOString(), "2026-12-01T18:00:00.000Z");
});

test("the storefronts draw the slides: one accessible slider for both renderers", () => {
  const slider = read("../src/components/storefront/HeroSlider.tsx");
  assert.match(slider, /snap-x snap-mandatory/, "swipe on phones with CSS scroll-snap");
  assert.match(slider, /prefers-reduced-motion: reduce/, "no autoplay for reduced motion");
  assert.match(slider, /onMouseEnter=\{\(\) => setHovered\(true\)\}/, "pauses on hover");
  assert.match(slider, /onFocusCapture/, "pauses on focus");
  assert.match(slider, /aria-roledescription="carousel"/);
  assert.match(slider, /Pause slides/, "a pause button");
  assert.match(slider, /Previous slide[\s\S]*Next slide/, "arrows");
  assert.match(slider, /Show slide \$\{index \+ 1\} of \$\{count\}/, "dots");

  const boutique = read("../src/components/storefront/boutique/BoutiqueStorefront.tsx");
  assert.match(boutique, /if \(layout === "plain-slides"\) \{[\s\S]{0,300}readHeroSlides\(section\)/);
  assert.match(boutique, /<HeroSlider/);
  assert.match(boutique, /source === "collection"/, "featured products can show one collection");
  assert.match(boutique, /imagePosition === "right"/, "image with text can put the picture on the right");

  const classic = read("../src/components/storefront/TemplateStorefrontSurface.tsx");
  assert.match(classic, /heroLayout === "slideshow"[\s\S]{0,200}readHeroSlides\(kindSection\)/);
  assert.match(classic, /<PromoCountdown endsAt=\{endsAt\}/, "the promo countdown counts to the seller's end time");
  assert.doesNotMatch(classic, /\["02", "14", "36"\]/, "no made-up countdown numbers");
  assert.match(classic, /title=\{cleanCustomerCopy\(copy\.title, "What our customers say"\)\}/, "the testimonials heading is editable");

  const inspector = read("../src/components/builder/editor/Inspector.tsx");
  assert.match(inspector, /migrateSection\(updater\(current\), \{ heroDefault \}\)/, "edits go through the same upgrade as loading");
  assert.match(inspector, /function RepeaterField/);
  assert.match(inspector, /<MediaPicker/);
  const builder = read("../src/components/builder/editor/useBuilder.ts");
  assert.match(builder, /migrateSnapshot\(/, "saved drafts are upgraded when the builder opens");
});

test("footer settings carry the Built with Shopinbos badge switch, locked on for free plans", () => {
  for (const renderer of ["boutique", "classic"]) assert.ok(ids(section("footer"), renderer, "breeze").includes("shopinbosBadge"), renderer);
  const inspector = read("../src/components/builder/editor/Inspector.tsx");
  assert.match(inspector, /fetch\("\/api\/app\/store\/badge", \{ method: "PATCH"/);
  assert.match(inspector, /if \(json\?\.data\) setState\(json\.data\)/, "the switch follows the saved answer");
  assert.match(inspector, /Free plans show this badge\. Upgrade to turn it off\./);
  assert.match(inspector, /href="\/home\/settings\?tab=Billing"/);
  assert.match(inspector, /aria-checked="true" aria-label=\{tx\(label\)\} disabled/, "free sellers get a disabled switch that stays on");
});
