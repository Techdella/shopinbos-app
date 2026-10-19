// FAQ styles shared by the page FAQ section and the product page: reading styles, old stores keeping their look,
// the product page following the FAQ section (then its own setting, then one product's choice), and the builder.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const faq = await import("../src/components/storefront/boutique/faq/faq-logic.ts");
const pdp = await import("../src/components/storefront/boutique/pdp/pdp-logic.ts");
const classic = await import("../src/components/storefront/boutique/pdp/classic-pdp.ts");
const override = await import("../src/components/storefront/boutique/pdp/product-override.ts");
const schema = await import("../src/components/builder/editor/section-schema.ts");
const en = (await import("../shared/i18n/messages/builder/en.ts")).default;
const productTypesEn = (await import("../shared/i18n/messages/productTypes/en.ts")).default;

const faqSection = (settings = {}, items = [], extra = {}) => ({ kind: "faq", settings, items, blocks: [{ type: "copy", content: {} }], ...extra });

const snapshot = ({ pdpSettings = {}, pdpCopy = {}, faqSettings, faqItems = [], faqPage = "faq" } = {}) => ({
  pages: [
    { pageType: "home", sections: [] },
    ...(faqSettings ? [{ pageType: faqPage, sections: [faqSection(faqSettings, faqItems)] }] : []),
    { pageType: "product", sections: [{ kind: "product-detail", settings: pdpSettings, blocks: [{ type: "copy", content: pdpCopy }] }] },
  ],
});

test("FAQ styles: at least five, each with a label and hint, plus and minus by default", () => {
  assert.deepEqual(faq.FAQ_STYLES, ["plus", "chevron", "cards", "numbered", "split", "boxed"]);
  for (const option of faq.FAQ_STYLE_OPTIONS) assert.ok(option.label && option.hint, option.value);
  assert.equal(faq.DEFAULT_FAQ_STYLE, "plus");
  assert.equal(faq.readFaqStyle("numbered"), "numbered");
  for (const junk of ["", "accordion", "CARDS", null, undefined, 3, {}]) assert.equal(faq.readFaqStyle(junk), null, String(junk));
  assert.ok(faq.faqAlwaysOpen("cards") && faq.faqAlwaysOpen("split"));
  assert.ok(!faq.faqAlwaysOpen("plus") && !faq.faqAlwaysOpen("chevron") && !faq.faqAlwaysOpen("numbered") && !faq.faqAlwaysOpen("boxed"));
});

test("FAQ section style: old sections keep their look, a picked style wins", () => {
  // 2026 themes.
  assert.equal(faq.faqSectionStyle(null), "plus");
  assert.equal(faq.faqSectionStyle(faqSection()), "plus", "no style yet: the + / − accordion it always had");
  assert.equal(faq.faqSectionStyle(faqSection({ layout: "two-column" })), "plus");
  assert.equal(faq.faqSectionStyle(faqSection({ layout: "cards" })), "cards", "open cards stay cards");
  assert.equal(faq.faqSectionStyle(faqSection({ layout: "cards", faqStyle: "chevron" })), "cards", "the cards layout is always cards");
  assert.equal(faq.faqSectionStyle(faqSection({ layout: "accordion", faqStyle: "boxed" })), "boxed");
  assert.equal(faq.faqSectionStyle(faqSection({ faqStyle: "nonsense" })), "plus", "unknown styles are ignored");
  // Classic templates: the grid layouts show every answer.
  assert.equal(faq.faqSectionStyle(faqSection({ layout: "accordion" }), "classic"), "plus");
  assert.equal(faq.faqSectionStyle(faqSection({ layout: "sidebar" }), "classic"), "plus");
  for (const layout of ["cards", "two-column", "support-center"]) assert.equal(faq.faqSectionStyle(faqSection({ layout }), "classic"), "cards", layout);
  assert.equal(faq.faqSectionStyle(faqSection({ layout: "cards", faqStyle: "split" }), "classic"), "split", "a picked style wins on classic");
});

test("the store's FAQ section: the FAQ page first, shown sections first", () => {
  const home = faqSection({ faqStyle: "chevron" });
  const page = faqSection({ faqStyle: "numbered" });
  assert.equal(faq.storeFaqSection({ pages: [{ pageType: "home", sections: [home] }, { pageType: "faq", sections: [page] }] }), page);
  assert.equal(faq.storeFaqSection({ pages: [{ pageType: "home", sections: [home] }] }), home);
  const hidden = faqSection({ faqStyle: "cards" }, [], { visible: false });
  assert.equal(faq.storeFaqSection({ pages: [{ pageType: "faq", sections: [hidden] }, { pageType: "home", sections: [home] }] }), home);
  assert.equal(faq.storeFaqSection({ pages: [{ pageType: "faq", sections: [hidden] }] }), hidden, "a hidden one still sets the style when it's the only one");
  assert.equal(faq.storeFaqSection(null), null);
});

test("product page follows the FAQ section style by default", () => {
  const plain = pdp.pdpSettingsForSnapshot(snapshot(), "breeze");
  assert.equal(plain.faq.style, "plus", "no FAQ section: the + / − accordion");
  assert.equal(plain.faq.choice, "auto");
  assert.equal(plain.faq.title, "FAQs");
  assert.equal(plain.faq.placement, "tab", "questions stay with the product details");
  assert.equal(plain.faq.firstOpen, false);
  assert.equal(plain.faq.storeQuestions, false);

  const followed = pdp.pdpSettingsForSnapshot(snapshot({ faqSettings: { faqStyle: "numbered" } }), "breeze");
  assert.equal(followed.faq.style, "numbered", "same as my FAQ section");
  assert.equal(followed.faq.sectionStyle, "numbered");
  assert.equal(pdp.pdpSettingsForSnapshot(snapshot({ faqSettings: { layout: "cards" } }), "noir").faq.style, "cards");
  assert.equal(pdp.pdpSettingsForSnapshot(snapshot({ faqSettings: { faqStyle: "split" }, faqPage: "home" }), "noir").faq.style, "split", "a FAQ section on the home page counts too");

  const picked = pdp.pdpSettingsForSnapshot(snapshot({ faqSettings: { faqStyle: "numbered" }, pdpSettings: { faqStyle: "boxed", faqPlacement: "section", faqOpen: "first", faqStoreQuestions: true }, pdpCopy: { faqTitle: " Questions " } }), "breeze");
  assert.equal(picked.faq.style, "boxed", "the product page's own pick wins");
  assert.equal(picked.faq.choice, "boxed");
  assert.equal(picked.faq.title, "Questions");
  assert.equal(picked.faq.placement, "section");
  assert.equal(picked.faq.firstOpen, true);
  assert.equal(picked.faq.storeQuestions, true);

  const auto = pdp.pdpSettingsForSnapshot(snapshot({ faqSettings: { faqStyle: "chevron" }, pdpSettings: { faqStyle: "auto", faqPlacement: "elsewhere", faqOpen: "all" } }), "breeze");
  assert.equal(auto.faq.style, "chevron", "auto follows the section");
  assert.equal(auto.faq.placement, "tab", "unknown values fall back");
  assert.equal(auto.faq.firstOpen, false);
});

test("classic product page follows the classic FAQ section too", () => {
  const snap = snapshot({ faqSettings: { layout: "two-column" } });
  assert.equal(classic.classicPdpSettingsForSnapshot(snap).faq.style, "cards", "two-column classic FAQ shows open answers");
  assert.equal(classic.classicPdpSettingsForSnapshot(snapshot({ faqSettings: { faqStyle: "chevron" } })).faq.style, "chevron");
  assert.equal(classic.readClassicPdpSettings(null).faq.style, "plus");
  assert.equal(classic.readClassicPdpSettings(null, { faqSection: faqSection({ faqStyle: "split" }) }).faq.style, "split");
  assert.equal(classic.readClassicPdpSettings({ kind: "product-detail", settings: { faqStyle: "numbered" } }, { faqSection: faqSection({ faqStyle: "split" }) }).faq.style, "numbered");
});

test("one product's FAQ style beats the store's product page setting", () => {
  const store = pdp.pdpSettingsForSnapshot(snapshot({ faqSettings: { faqStyle: "numbered" } }), "breeze");
  const own = override.readProductPageOverride({ override: true, faqStyle: "cards" });
  assert.equal(own.faqStyle, "cards");
  assert.ok(override.hasProductPageOverride(own));
  const merged = override.applyProductPageOverride(store, own);
  assert.equal(merged.faq.style, "cards");
  assert.equal(merged.faq.title, store.faq.title, "everything else is the store's");
  assert.equal(merged.layout, store.layout);
  assert.equal(override.readProductPageOverride({ override: true, faqStyle: "huge" }).faqStyle, undefined, "unknown styles are dropped");
  assert.equal(override.readProductPageOverride({ faqStyle: "cards" }).faqStyle, undefined, "no marker, no override");
  assert.deepEqual(override.writeProductPageOverride({ layout: null, buyBox: null, sections: null, faqStyle: "split" }), { override: true, faqStyle: "split" });
  assert.equal(override.applyProductPageOverride(store, override.readProductPageOverride({ override: true })).faq.style, "numbered");
});

test("product questions: the product's own, then the store's with answers from settings", () => {
  const shopper = { delivery: [], flatRate: null, payOnDelivery: true, payOnDeliveryLimit: null, paymentLabels: ["Pay on delivery", "Card"] };
  const items = faq.productFaqItems(
    [{ question: "Is it leather?", answer: "Yes." }],
    [{ question: "Can I pay on delivery?", answer: "", answerSource: "payment" }, { question: "is it leather?", answer: "Other" }, { question: "Do you deliver?", answer: "", answerSource: "delivery" }],
    shopper,
    "NGN",
  );
  assert.deepEqual(items.map((item) => item.question), ["Is it leather?", "Can I pay on delivery?"], "repeats and unanswered questions are skipped");
  assert.match(items[1].answer, /^Yes\. Pay on delivery is available\. You can also pay by card\.$/);
  assert.deepEqual(faq.readStoreFaqItems(faqSection({}, [{ question: " Hi ", answer: " There " }, { question: "", answer: "x" }])), [{ question: "Hi", answer: "There" }]);
});

test("detail panels: questions use the FAQ heading and leave when they have their own section", () => {
  const product = { description: "A bag", faqs: [{ question: "Q", answer: "A" }] };
  assert.deepEqual(pdp.detailPanels(product).map((panel) => panel.title), ["Description", "FAQs"], "unchanged without options");
  assert.equal(pdp.detailPanels(product, 0, undefined, { count: 1, title: "Questions" }).at(-1).title, "Questions");
  assert.deepEqual(pdp.detailPanels(product, 0, undefined, { count: 1, inDetails: false }).map((panel) => panel.id), ["description"]);
  assert.equal(pdp.detailPanels({ description: "A bag" }, 0, undefined, { count: 2 }).at(-1).id, "faqs", "store questions alone still make a panel");
});

test("the builder edits the FAQ style on the FAQ section and the product page", () => {
  const boutiqueFaq = schema.sectionSchema("faq", "boutique", "breeze").settings.flatMap((group) => group.fields);
  const style = boutiqueFaq.find((field) => field.id === "faqStyle");
  assert.equal(style.type, "cards");
  assert.equal(style.thumbs, "faq");
  assert.equal(style.fallback, "plus");
  assert.deepEqual(style.target, { scope: "settings", key: "faqStyle" });
  assert.deepEqual(style.options.map((option) => option.value), faq.FAQ_STYLES);
  const shown = (settings) => schema.visibleFields({ id: "f", kind: "faq", name: "FAQ", visible: true, blocks: [{ id: "c", type: "copy", content: {} }], settings }, "boutique", "breeze").map((field) => field.id);
  assert.ok(shown({}).includes("faqStyle"));
  assert.ok(!shown({ layout: "cards" }).includes("faqStyle"), "open cards are always cards");

  const classicFaq = schema.sectionSchema("faq", "classic").settings.flatMap((group) => group.fields).find((field) => field.id === "faqStyle");
  assert.equal(classicFaq.fallback, "", "classic templates keep their own look until a style is picked");
  assert.equal(classicFaq.options[0].value, "");

  for (const [renderer, theme] of [["boutique", "plug"], ["classic", undefined]]) {
    const fields = Object.fromEntries(schema.sectionSchema("product-detail", renderer, theme).settings.flatMap((group) => group.fields).map((field) => [field.id, field]));
    assert.equal(fields.faqStyle.fallback, "auto", renderer);
    assert.equal(fields.faqStyle.options[0].label, "Same as my FAQ section");
    assert.deepEqual(fields.faqStyle.options.slice(1).map((option) => option.value), faq.FAQ_STYLES);
    assert.deepEqual(fields.faqTitle.target, { scope: "copy", key: "faqTitle" });
    assert.deepEqual(fields.faqPlacement.options.map((option) => option.value), ["tab", "section"]);
    assert.deepEqual(fields.faqOpen.options.map((option) => option.value), ["closed", "first"]);
    assert.equal(fields.faqStoreQuestions.type, "toggle");
  }
});

test("every new builder word has a key, and the product form's words too", () => {
  const groups = [
    ...schema.sectionSchema("product-detail", "boutique", "plug").settings,
    ...schema.sectionSchema("faq", "boutique", "breeze").settings,
    ...schema.sectionSchema("faq", "classic").settings,
  ];
  const fields = groups.flatMap((group) => group.fields).filter((field) => /^faq/.test(field.id));
  assert.ok(fields.length >= 6);
  for (const field of fields) {
    assert.ok(en[`ed.${field.label}`], `label "${field.label}"`);
    if (field.help) assert.ok(en[`ed.${field.help}`], `help for ${field.id}`);
    if (field.placeholder) assert.ok(en[`ed.${field.placeholder}`], `placeholder for ${field.id}`);
    for (const option of field.options ?? []) {
      assert.ok(en[`ed.${option.label}`], `option "${option.label}"`);
      if (option.hint) assert.ok(en[`ed.${option.hint}`], `hint "${option.hint}"`);
    }
  }
  assert.ok(en["ed.Questions (FAQs)"]);
  for (const style of faq.FAQ_STYLES) assert.ok(productTypesEn[`faqStyle.${style}`], style);
  for (const key of ["title", "sub", "label", "store"]) assert.ok(productTypesEn[`faqStyle.${key}`], key);
});

test("both renderers draw questions with the shared, accessible FAQ list", () => {
  const list = read("src/components/storefront/boutique/faq/FaqList.tsx");
  assert.match(list, /aria-expanded=\{isOpen\}/);
  assert.match(list, /aria-controls=\{aid\}/);
  assert.match(list, /ArrowDown/);
  assert.match(list, /prefers-reduced-motion: reduce/);
  assert.match(read("src/components/storefront/boutique/pdp/PdpDetails.tsx"), /<FaqList/);
  assert.match(read("src/components/storefront/boutique/pdp/BoutiquePdp.tsx"), /settings\.faq\.placement !== "section"/);
  assert.match(read("src/components/storefront/boutique/BoutiqueStorefront.tsx"), /faqSectionStyle\(section, "boutique"\)/);
  const surface = read("src/components/storefront/TemplateStorefrontSurface.tsx");
  assert.match(surface, /readFaqStyle\(kindSection\.settings\?\.faqStyle\)/);
  assert.match(surface, /faqSection: storeFaqSection\(snapshot\)/);
  // The FAQ heading can be typed over on the builder canvas.
  const inline = read("src/components/storefront/boutique/InlineTextEditor.tsx");
  assert.match(inline, /"faqTitle"\] as const/);
  assert.match(inline, /dataset\.inlineKey/);
  assert.match(read("src/app/components/ProductForm.tsx"), /faqStyle: faqStyleChoice/);
});
