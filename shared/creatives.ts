// Creative images Rex makes for marketing (Rex Studio "Make image" creative templates, and Rex's make_creative tool):
// where the picture goes (social post, story, ad, store banner, email header, popup, campaign poster) and the
// concept, modelled on the kind of posters that stop the scroll: a giant bold headline with the products, a
// product line-up, a witty visual metaphor, a person with the products, a floating hero pack and so on.
// Pure: builds the image prompt; unit-tested in tests/packaging.test.mjs.

export const CREATIVE_PLACEMENTS = ["social_post", "story", "feed_ad", "store_banner", "email_header", "popup", "campaign_poster"] as const;
export type CreativePlacement = (typeof CREATIVE_PLACEMENTS)[number];

export const CREATIVE_CONCEPTS = ["bold_headline", "product_lineup", "witty_metaphor", "model_with_products", "floating_hero", "dark_premium", "ingredient_splash", "flat_lay", "minimal_studio", "mascot_pack", "mood_grid", "ingredient_fusion", "flavour_family", "render_3d"] as const;
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
  mascot_pack: {
    name: "Mascot pack",
    hint: "The pack becomes a cartoon character with big eyes and a window mouth.",
    direction: "A playful packaging advert: the product's pack redesigned as a friendly cartoon character (huge round white eyes, thick eyebrows, a die-cut window mouth showing the real product inside), two packs in different bright colours standing side by side on a clean light grey studio floor with soft shadows, photoreal packaging render.",
  },
  mood_grid: {
    name: "Mood grid",
    hint: "A 2×2 grid: one pack per tile, each a different colour and mood.",
    direction: "A 2 × 2 grid of four square tiles, each tile a different pastel colour (yellow, blue, pink, green) with a matching pack: the same brand pack shown as four expressive cartoon characters (happy, sad, angry, greedy) with a round window showing the product, a tiny mood label in the corner of each tile. Photoreal, glossy, collectable.",
  },
  ingredient_fusion: {
    name: "Ingredient fusion",
    hint: "Half product, half hero ingredient, fused into one striking shape.",
    direction: "A striking split-colour poster: on one side a deep colour, on the other a lighter tint; a single perfect sphere that is half the product and half its hero ingredient fused seamlessly down the middle (like half ice cream scoop, half blueberry, with two fresh leaves), the product's pack floating beside it with its lid lifted, an elegant thin sans-serif name with a flowing script word beneath.",
  },
  flavour_family: {
    name: "Flavour family",
    hint: "The whole range in candy colours, piled up together.",
    direction: "A joyful range shot: seven or eight packs of the product in different candy colours (lime, tangerine, berry, grape, coral) piled and tumbling together in a playful heap, each with the same friendly design and its flavour name, on a warm peach background with soft sculptural pastel 3D shapes behind, bright soft light.",
  },
  render_3d: {
    name: "3D render",
    hint: "Glossy 3D scene with pastel shapes, plinths and soft light.",
    direction: "A premium 3D-rendered product scene: the product on a smooth pastel plinth among soft sculptural shapes (spheres, arches, wavy ribbons) in two or three harmonious pastel colours, glossy and matte materials, soft global illumination and gentle shadows, like a high-end brand's Instagram launch post.",
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
  mascot_pack: { url: unsplash("1633533446213-a438ff5f0629"), credit: "MK +2" },
  mood_grid: { url: unsplash("1580314552228-5a7ce023fc9e"), credit: "PULSÍTOS.com" },
  ingredient_fusion: { url: unsplash("1629385744299-74b9cf013f52"), credit: "Courtney Cook" },
  flavour_family: { url: unsplash("1693480879928-7c7fb5f68204"), credit: "pouchdirect" },
  render_3d: { url: unsplash("1718419466963-5a74903d0ae8"), credit: "Zulian Firmansyah" },
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
