// Premium AI packaging (Packaging designer "Premium AI packaging", and Rex's make_packaging_mockup tool): a
// photoreal render of a finished pack, the kind design studios post on Behance and Pinterest, drawn by the
// OpenAI image model from the seller's product photo and logo. The concepts are modelled on the patterns that
// stand out on shelves and feeds: a mascot face with a die-cut window mouth, one mood per flavour, the hero
// ingredient fused with the product, a flavour family in candy colours and so on. Unlike the template designs
// (shared/packaging.ts) these are concept mockups for pitching, posting and briefing a printer, not dielines.
// Pure: builds the image prompt; unit-tested in tests/packaging.test.mjs.

export const PACK_CONCEPTS = ["mascot", "mood_range", "window", "ingredient_fusion", "flavour_family", "bold_type", "illustrated", "ankara", "luxe", "retro_badge"] as const;
export type PackConcept = (typeof PACK_CONCEPTS)[number];

export const PACK_SHAPES = ["pouch", "chip_bag", "box", "carton", "spout_pouch", "tub", "jar", "bottle", "can", "tube", "sachet", "bag"] as const;
export type PackShape = (typeof PACK_SHAPES)[number];

export const PACK_SCENES = ["studio", "colour_split", "grid", "floating", "lifestyle"] as const;
export type PackScene = (typeof PACK_SCENES)[number];

/** Most flavours or variants drawn in one picture. */
export const MAX_PACK_VARIANTS = 4;

export const PACK_CONCEPT_INFO: Record<PackConcept, { name: string; hint: string; direction: string; shapes: PackShape[] }> = {
  mascot: {
    name: "Mascot face",
    hint: "Big cartoon eyes and a die-cut window mouth that shows the product inside.",
    direction:
      "Character packaging: the whole front of the pack is a friendly cartoon face in flat bold vector style, two huge round white eyes with black pupils and thick eyebrows, and the mouth is a die-cut transparent window (with a couple of cartoon teeth along its top edge) through which the real product inside is clearly visible. Solid saturated pack colour, chunky rounded black brand lettering below the window, small print at the bottom. Playful, witty, instantly memorable.",
    shapes: ["carton", "chip_bag", "box", "spout_pouch", "pouch"],
  },
  mood_range: {
    name: "Mood range",
    hint: "One character per flavour, each with its own emotion and colour: happy, sad, angry, greedy.",
    direction:
      "A character range where every flavour has its own mood: each pack is a different bright colour with a big expressive cartoon face (thick black outlines, huge white eyes) showing a different emotion such as happy, sad, angry or greedy, and a round transparent window in the lower half showing the real product. The brand name in huge chunky black capitals across the top of every pack. Consistent layout, only the colour, face and flavour change.",
    shapes: ["chip_bag", "pouch", "spout_pouch", "sachet"],
  },
  window: {
    name: "Window showcase",
    hint: "A clean die-cut window in a smart shape so the real product sells itself.",
    direction:
      "Premium window packaging: a clean matte pack with a precisely die-cut window in a meaningful shape (a leaf, a drop, a circle, the outline of the product) showing the real product inside, refined typography, generous margins, one accent colour, a small badge for the key benefit. Modern and confident, like a design-award-winning shelf pack.",
    shapes: ["box", "pouch", "carton", "bag", "tub"],
  },
  ingredient_fusion: {
    name: "Ingredient fusion",
    hint: "Half product, half hero ingredient, fused into one striking image on the pack.",
    direction:
      "Ingredient-fusion packaging: the hero image on the pack is one perfect sphere or shape that is half the product and half its key ingredient or flavour seamlessly fused down the middle (for example half scoop of ice cream, half blueberry, with two fresh leaves), photographic and appetising. A soft neutral pack (warm grey or white) with a bold colour lid or band per flavour, an elegant thin sans-serif flavour name with a flowing script word beneath it, and a small round badge with a key number (calories, strength, size).",
    shapes: ["tub", "jar", "can", "bottle", "carton", "box"],
  },
  flavour_family: {
    name: "Flavour family",
    hint: "The same design in a set of candy colours, one per flavour, shown together.",
    direction:
      "A flavour-family system: identical layout across the range, each variant in its own juicy candy colour (lime, tangerine, berry, grape, mango), a big friendly logo, the flavour name large in a rounded bold font, small icons for the claims, and a matching coloured cap or tear notch. Fun, cohesive and collectable, shot together as a set.",
    shapes: ["spout_pouch", "pouch", "can", "bottle", "sachet", "chip_bag"],
  },
  bold_type: {
    name: "Giant type",
    hint: "The product name in massive chunky letters wrapping the pack.",
    direction:
      "Typographic packaging: the product name set in massive chunky condensed capitals that fill the front of the pack and run off its edges, two strong contrasting colours, a small product photo or cut-out tucked between the letters, minimal extra text. Loud, graphic and modern, readable from across the market.",
    shapes: ["chip_bag", "pouch", "box", "can", "carton", "bag"],
  },
  illustrated: {
    name: "Illustrated",
    hint: "Hand-drawn illustration wrapping the pack, storybook style.",
    direction:
      "Illustrated packaging: a rich hand-drawn illustration wraps the whole pack (the ingredients, the place it comes from, little characters), gouache or risograph texture, a warm limited palette, the brand in a hand-lettered wordmark inside a simple banner. Charming, crafted and giftable.",
    shapes: ["box", "tub", "jar", "pouch", "bag", "tube"],
  },
  ankara: {
    name: "Ankara pattern",
    hint: "Bold African wax-print pattern with a clean label panel.",
    direction:
      "African-pattern packaging: a bold Ankara wax-print style geometric pattern in rich saturated colours covers the pack, with a clean solid colour label panel in the centre carrying the brand and product name in a confident modern font. Proudly Nigerian, premium and vibrant.",
    shapes: ["box", "pouch", "bag", "jar", "bottle", "tube"],
  },
  luxe: {
    name: "Luxe",
    hint: "Matte black or deep colour, gold foil, embossing. Expensive.",
    direction:
      "Luxury packaging: matte deep colour (black, emerald or oxblood) with gold foil lettering and a fine foil line border, a blind-embossed monogram, a thin elegant serif wordmark, very little text, soft-touch finish catching the light. Quiet, expensive, gift-worthy.",
    shapes: ["box", "jar", "bottle", "tube", "bag", "can"],
  },
  retro_badge: {
    name: "Retro badge",
    hint: "Vintage emblem, sunburst and warm faded colours.",
    direction:
      "Retro packaging: a vintage circular emblem in the centre with the brand on a curved ribbon, a sunburst or stripes behind, warm slightly faded colours (cream, tomato red, mustard, teal), chunky 1970s display lettering, a little established-in line. Nostalgic and trustworthy.",
    shapes: ["can", "jar", "box", "tub", "bag", "chip_bag"],
  },
};

export const PACK_SHAPE_INFO: Record<PackShape, { name: string; describe: string }> = {
  pouch: { name: "Stand-up pouch", describe: "a matte stand-up doypack pouch with a zip and tear notch" },
  chip_bag: { name: "Snack bag", describe: "a glossy pillow-shaped snack bag with crimped serrated seals at the top and bottom" },
  box: { name: "Box", describe: "a crisp printed folding carton box (tuck-end)" },
  carton: { name: "Gable carton", describe: "a gable-top paperboard carton like a milk carton, with a folded peaked top" },
  spout_pouch: { name: "Spout pouch", describe: "a squeezable spout pouch with a chunky coloured screw cap on top" },
  tub: { name: "Tub", describe: "a round paper tub with a matching lid (like a pint of ice cream)" },
  jar: { name: "Jar", describe: "a glass jar with a wrap-around label and a metal or coloured lid" },
  bottle: { name: "Bottle", describe: "a bottle with a wrap-around label and a cap" },
  can: { name: "Can", describe: "an aluminium drinks can with the design printed all around" },
  tube: { name: "Tube", describe: "a soft squeeze tube with a flip cap, standing on its cap" },
  sachet: { name: "Sachet", describe: "a flat sachet with crimped edges and a tear notch" },
  bag: { name: "Shopping bag", describe: "a premium paper shopping bag with rope handles" },
};

export const PACK_SCENE_INFO: Record<PackScene, { name: string; describe: string; shape: "portrait" | "landscape" | "square" }> = {
  studio: { name: "Studio", describe: "Photographed on a seamless light grey studio backdrop with soft even light and gentle contact shadows, like a professional packaging mockup.", shape: "portrait" },
  colour_split: { name: "Colour split poster", describe: "Laid out as a branded poster: a split background with a deep brand-colour half and a lighter tint half, the pack floating with its lid lifted on one side, the flavour name large in the other, plus the full range standing below.", shape: "portrait" },
  grid: { name: "Four-up grid", describe: "Laid out as a 2 × 2 grid of four square tiles, each tile a different pastel background matching its pack, one variant per tile, with a tiny label in the top-left corner of each tile.", shape: "portrait" },
  floating: { name: "Floating", describe: "The packs floating and gently tilted in mid-air on a smooth backdrop in a colour that suits them, with loose pieces of the product floating around and soft shadows below.", shape: "portrait" },
  lifestyle: { name: "Lifestyle", describe: "Photographed in a bright, styled real-life setting that suits the product (a sunny kitchen counter, a bathroom shelf, a market stall in Lagos), shallow depth of field.", shape: "landscape" },
};

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=360&h=360&q=75`;

/** A real photo that hints at each concept on its card (free Unsplash photos, credited). */
export const PACK_CONCEPT_PHOTO: Record<PackConcept, { url: string; credit: string }> = {
  mascot: { url: unsplash("1633533446213-a438ff5f0629"), credit: "MK +2" },
  mood_range: { url: unsplash("1580314552228-5a7ce023fc9e"), credit: "PULSÍTOS.com" },
  window: { url: unsplash("1633533447057-56ccf997f4fe"), credit: "MK +2" },
  ingredient_fusion: { url: unsplash("1629385744299-74b9cf013f52"), credit: "Courtney Cook" },
  flavour_family: { url: unsplash("1693480879928-7c7fb5f68204"), credit: "pouchdirect" },
  bold_type: { url: unsplash("1568640347023-a616a30bc3bd"), credit: "okeykat" },
  illustrated: { url: unsplash("1777655789747-9644d9596287"), credit: "Vagaro" },
  ankara: { url: unsplash("1643122966676-29e8597257f7"), credit: "pmv chamara" },
  luxe: { url: unsplash("1509912760195-4f6cfd8cce2c"), credit: "Jenn Kosar" },
  retro_badge: { url: unsplash("1567206563064-6f60f40a2b57"), credit: "Lama Roscu" },
};

export function isPackConcept(value: unknown): value is PackConcept {
  return typeof value === "string" && (PACK_CONCEPTS as readonly string[]).includes(value);
}

export function isPackShape(value: unknown): value is PackShape {
  return typeof value === "string" && (PACK_SHAPES as readonly string[]).includes(value);
}

export function isPackScene(value: unknown): value is PackScene {
  return typeof value === "string" && (PACK_SCENES as readonly string[]).includes(value);
}

/** The concept's usual pack shape. */
export function defaultPackShape(concept: PackConcept): PackShape {
  return PACK_CONCEPT_INFO[concept].shapes[0];
}

const MOODS = ["happy and grinning", "sad with a single tear", "angry with gritted teeth", "greedy with a sly grin"];

const clean = (text: string | null | undefined, max: number) => (text ?? "").replace(/["“”]/g, "'").replace(/\s+/g, " ").trim().slice(0, max);

/** Flavours or variants to draw: cleaned, de-duplicated and capped. */
export function packVariants(variants: (string | null | undefined)[] | null | undefined) {
  return Array.from(new Set((variants ?? []).map((value) => clean(value, 40)).filter(Boolean))).slice(0, MAX_PACK_VARIANTS);
}

/** Image size for the render: grids and posters are tall, a lifestyle shot or a row of three or four is wide. */
export function packConceptShape(scene: PackScene, variantCount: number): "portrait" | "landscape" | "square" {
  if (scene === "grid" || scene === "colour_split") return "portrait";
  if (scene === "lifestyle" || variantCount >= 3) return "landscape";
  return PACK_SCENE_INFO[scene].shape;
}

export interface PackConceptInput {
  concept: PackConcept;
  shape?: PackShape | null;
  scene?: PackScene | null;
  brandName?: string | null;
  productName: string;
  /** e.g. "food", "skincare": what the product is, to keep claims sensible. */
  productKind?: string | null;
  variants?: (string | null | undefined)[] | null;
  tagline?: string | null;
  /** Brand colour (#RRGGBB) to lead with; null leaves colour to the concept. */
  accent?: string | null;
  extra?: string | null;
  hasProductPhoto?: boolean;
  hasLogo?: boolean;
}

/** The image-model prompt for a premium packaging render: concept, pack shape, scene, exact words, variants. */
export function packConceptPrompt(input: PackConceptInput) {
  const concept = PACK_CONCEPT_INFO[input.concept];
  const shape = PACK_SHAPE_INFO[input.shape ?? defaultPackShape(input.concept)];
  const variants = packVariants(input.variants);
  const scene = input.scene ?? (input.concept === "mood_range" ? "grid" : input.concept === "ingredient_fusion" ? "colour_split" : "studio");
  const brand = clean(input.brandName, 40);
  const product = clean(input.productName, 60) || "the product";
  const tagline = clean(input.tagline, 60);
  const count = input.concept === "mood_range" ? Math.max(variants.length, scene === "grid" ? 4 : 3) : Math.max(1, variants.length);
  const range =
    input.concept === "mood_range"
      ? `Show ${count} packs, one per mood (${MOODS.slice(0, count).join("; ")})${variants.length ? `, for the flavours ${variants.map((name) => `"${name}"`).join(", ")} in that order` : ""}.`
      : variants.length > 1
        ? `Show the range of ${variants.length} packs together, one per flavour or variant: ${variants.map((name) => `"${name}"`).join(", ")}, each in its own colour, the same design system on every pack.`
        : variants.length === 1
          ? `One pack, the "${variants[0]}" variant.`
          : "One hero pack, plus a second pack behind it at an angle to show the side.";
  const words = [brand ? `the brand "${brand}"` : "", `the product name "${product}"`, tagline ? `the line "${tagline}"` : "", variants.length ? "each flavour name exactly as given" : ""].filter(Boolean);
  return [
    `Create a photorealistic, premium packaging design mockup for ${brand ? `${brand}, ` : ""}a Nigerian brand: ${product}${input.productKind ? ` (${clean(input.productKind, 40)})` : ""}.`,
    `Pack: ${shape.describe}. ${concept.direction}`,
    range,
    PACK_SCENE_INFO[scene].describe,
    input.accent && /^#[0-9a-f]{6}$/i.test(input.accent) ? `Lead with the brand colour ${input.accent.toUpperCase()} and colours that work with it.` : "",
    input.hasProductPhoto ? "The product inside or pictured on the pack must match the reference photo faithfully (same food, colour and texture)." : "",
    input.hasLogo ? "Reproduce the brand's logo from the reference image exactly on every pack; do not redraw or invent a logo." : "",
    `Letter exactly these words, spelled correctly and crisply printed on the packs: ${words.join("; ")}. Any other small print must be short, real words or simple lines, never gibberish.`,
    input.extra ? `Also: ${clean(input.extra, 400)}` : "",
    "Award-winning packaging design, realistic printing, material and finish (matte, gloss, foil, paperboard), accurate perspective, crisp studio lighting, ultra sharp, no watermarks, no mockup-site branding.",
  ]
    .filter(Boolean)
    .join("\n");
}
