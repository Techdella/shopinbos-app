// Creative images Rex makes for marketing (Rex Studio "Make image" creative templates, and Rex's make_creative tool):
// where the picture goes (social post, story, ad, store banner, email header, popup, campaign poster) and the
// concept, modelled on the kind of posters that stop the scroll: a giant bold headline with the products, a
// product line-up, a witty visual metaphor, a person with the products, a floating hero pack and so on.
// Pure: builds the image prompt; unit-tested in tests/packaging.test.mjs.

export const CREATIVE_PLACEMENTS = ["social_post", "story", "feed_ad", "store_banner", "email_header", "popup", "campaign_poster"] as const;
export type CreativePlacement = (typeof CREATIVE_PLACEMENTS)[number];

export const CREATIVE_CONCEPTS = ["bold_headline", "product_lineup", "witty_metaphor", "model_with_products", "floating_hero", "dark_premium", "ingredient_splash", "flat_lay", "minimal_studio"] as const;
export type CreativeConcept = (typeof CREATIVE_CONCEPTS)[number];

export const CREATIVE_PLACEMENT_INFO: Record<CreativePlacement, { name: string; shape: "square" | "portrait" | "landscape"; ratio: string; note: string }> = {
  social_post: { name: "Social post", shape: "square", ratio: "1:1", note: "an Instagram and Facebook feed post" },
  story: { name: "Story / reel cover", shape: "portrait", ratio: "9:16", note: "a full-screen Instagram, WhatsApp or TikTok story; keep words away from the top and bottom 12%" },
  feed_ad: { name: "Feed ad", shape: "portrait", ratio: "4:5", note: "a Facebook and Instagram feed ad; one clear message, little text" },
  store_banner: { name: "Store banner", shape: "landscape", ratio: "16:9", note: "a wide homepage hero banner; keep the left or right third calm for website text" },
  email_header: { name: "Email header", shape: "landscape", ratio: "3:2", note: "the top picture of a marketing email" },
  popup: { name: "Popup", shape: "square", ratio: "1:1", note: "a website popup picture for an offer" },
  campaign_poster: { name: "Campaign poster", shape: "portrait", ratio: "4:5", note: "a seasonal campaign poster (Detty December, Sallah, Valentine's, payday)" },
};

export const CREATIVE_CONCEPT_INFO: Record<CreativeConcept, { name: string; hint: string; direction: string }> = {
  bold_headline: {
    name: "Giant headline",
    hint: "A huge chunky headline with the products held up around it.",
    direction: "A bold poster: a solid saturated background (one strong colour), a giant chunky condensed headline at the top filling most of the width, the products held up by hands from the edges of the frame or arranged around the words, playful hand-drawn doodles. Strong two-colour contrast.",
  },
  product_lineup: {
    name: "Product line-up",
    hint: "The whole range in a row, with a headline above.",
    direction: "A product range advert: the products (or several flavours/variants) standing in a neat diagonal line-up on a two-tone background split into a deep colour above and a bright colour below, a big bold two-line headline in the top left, a short benefit line near the bottom, a few loose pieces of the product floating.",
  },
  witty_metaphor: {
    name: "Witty idea",
    hint: "A clever visual twist, like food in a ring box: 'Will you…'",
    direction: "A witty conceptual advert: one clever visual metaphor at the centre (for example the product presented like an engagement ring in a velvet box held by a hand, or as a trophy), a plain rich textured background, a short teasing line above and its punchline below in a friendly rounded bold font. Simple, centred, lots of empty space.",
  },
  model_with_products: {
    name: "Person + products",
    hint: "A Nigerian model reacting, products held up around them.",
    direction: "A fun lifestyle advert: a stylish young Nigerian person with an expressive face (thinking, delighted or surprised) against a bright solid-colour studio wall, the products held up into the frame by hands from the sides, a big bold headline across the top.",
  },
  floating_hero: {
    name: "Floating hero",
    hint: "The pack floating and tilted on a soft colour, with a soft shadow.",
    direction: "A clean hero shot: the product pack floating at a slight tilt in the centre, a soft drop shadow on the floor below, a smooth plain pastel background in a colour that suits the pack, crisp studio light. Premium and simple.",
  },
  dark_premium: {
    name: "Dark premium",
    hint: "Moody dark backdrop, rich light on the product, gold or lime accents.",
    direction: "A premium dark advert: a textured near-black background, dramatic side light on the product, a few loose ingredients or leaves around it, one bright accent colour in the headline, elegant and expensive.",
  },
  ingredient_splash: {
    name: "Ingredient splash",
    hint: "The product with its ingredients flying around it.",
    direction: "An energetic advert: the product at the centre with its ingredients (fruit, nuts, leaves, drops, powder) flying and splashing around it frozen in motion, a vivid solid background, fresh and appetising.",
  },
  flat_lay: {
    name: "Flat lay",
    hint: "Top-down styled arrangement with props.",
    direction: "A styled top-down flat lay: the products arranged neatly on a textured surface with matching props (Ankara fabric, leaves, wooden bowls, accessories), natural daylight, space at one side for words.",
  },
  minimal_studio: {
    name: "Minimal studio",
    hint: "One product, calm colour, lots of space.",
    direction: "A calm minimal advert: one product on a simple plinth or surface, a soft single-colour background, gentle shadows, lots of empty space, one short line of elegant text.",
  },
};

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=360&h=360&q=75`;

/** A real photo that shows each concept's look on the template cards (free Unsplash photos, credited). */
export const CREATIVE_CONCEPT_PHOTO: Record<CreativeConcept, { url: string; credit: string }> = {
  bold_headline: { url: unsplash("1568640347023-a616a30bc3bd"), credit: "okeykat" },
  product_lineup: { url: unsplash("1643122966676-29e8597257f7"), credit: "pmv chamara" },
  witty_metaphor: { url: unsplash("1630209712184-00101e51f374"), credit: "mansi Chaudhary" },
  model_with_products: { url: unsplash("1738895006808-2993b28442e4"), credit: "Didi Paul" },
  floating_hero: { url: unsplash("1623143445418-40c192fa3d11"), credit: "Birgith Roosipuu" },
  dark_premium: { url: unsplash("1509912760195-4f6cfd8cce2c"), credit: "Jenn Kosar" },
  ingredient_splash: { url: unsplash("1707129785947-ddc627a8bab9"), credit: "Madara" },
  flat_lay: { url: unsplash("1777655789747-9644d9596287"), credit: "Vagaro" },
  minimal_studio: { url: unsplash("1671575192248-5d8e42f18a9c"), credit: "Giorgio Trovato" },
};

export function isCreativePlacement(value: unknown): value is CreativePlacement {
  return typeof value === "string" && (CREATIVE_PLACEMENTS as readonly string[]).includes(value);
}

export function isCreativeConcept(value: unknown): value is CreativeConcept {
  return typeof value === "string" && (CREATIVE_CONCEPTS as readonly string[]).includes(value);
}

const clean = (text: string | null | undefined, max: number) => (text ?? "").replace(/["“”]/g, "'").replace(/\s+/g, " ").trim().slice(0, max);

/** The image-model prompt for a creative: concept direction, placement, exact words to letter, products, extras. */
export function creativePrompt(input: { placement: CreativePlacement; concept: CreativeConcept; headline?: string | null; subline?: string | null; cta?: string | null; products?: string[]; extra?: string | null; brandName?: string | null }) {
  const place = CREATIVE_PLACEMENT_INFO[input.placement];
  const concept = CREATIVE_CONCEPT_INFO[input.concept];
  const headline = clean(input.headline, 60);
  const subline = clean(input.subline, 90);
  const cta = clean(input.cta, 24);
  const products = (input.products ?? []).map((name) => clean(name, 60)).filter(Boolean).slice(0, 4);
  const words = [
    headline ? `the headline "${headline}"` : "",
    subline ? `a smaller line "${subline}"` : "",
    cta ? `a button-style call to action "${cta}"` : "",
  ].filter(Boolean);
  return [
    `Design ${place.note} (${place.ratio}) for ${input.brandName ? clean(input.brandName, 60) : "a Nigerian online shop"}.`,
    concept.direction,
    products.length ? `Products to feature: ${products.join(", ")}. Show them faithfully, matching the reference photos.` : "",
    words.length ? `Letter exactly these words, spelled correctly, large and legible: ${words.join("; ")}. No other text.` : "No text at all.",
    input.extra ? `Also: ${clean(input.extra, 400)}` : "",
    "Professional advertising quality, sharp focus, no watermarks.",
  ]
    .filter(Boolean)
    .join("\n");
}
