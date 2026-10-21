// Rex's agent, pure parts: the chat request body, one zod schema per tool (adapted to Claude and OpenAI by
// providerSchema, shared with Peggy), and the small decisions behind the tools (which photo to edit, where a
// saved photo goes, segment rules, automation config). No server imports, so they are unit-tested in
// tests/behaviour.test.mjs.

import { z } from "zod";
import { providerSchema } from "../peggy/pure.ts";
import { FIELD_TYPES, TEMPLATE_IDS } from "../../cms/fields.ts";
import { PRINT_KINDS, QR_TARGETS } from "../../../../shared/print-labels.ts";
import { PACK_FORMATS, PACK_STYLES, PRODUCT_TYPES } from "../../../../shared/packaging.ts";
import { CREATIVE_CONCEPTS, CREATIVE_PLACEMENTS } from "../../../../shared/creatives.ts";
import { LOGO_SIZES, LOGO_STYLES } from "../../../../shared/store-logo.ts";
import { MUSIC_MOODS, REEL_TEMPLATE_IDS, VOICE_GENDERS } from "../../../../shared/video-style.ts";

export { providerSchema };

// ─── Request body ─────────────────────────────────────────────────────────────

export const REX_MAX_TURNS = 20;
export const REX_MAX_CHARS = 4000;
export const REX_MAX_PHOTOS = 6;

const HTTPS_URL = /^https:\/\/\S+$/;

const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(REX_MAX_CHARS * 2, "That conversation turn is too long"),
});

const BodySchema = z.object({
  messages: z.array(TurnSchema).min(1).max(60),
  /** Photos the seller attached to their newest message (uploaded to the shop's storage first). */
  imageUrls: z.array(z.string().trim().max(2000).regex(HTTPS_URL, "Photos must be uploaded first")).max(REX_MAX_PHOTOS, `Up to ${REX_MAX_PHOTOS} photos per message`).optional(),
});

export interface RexTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * The conversation to send to Rex: the last REX_MAX_TURNS non-empty turns, starting with the seller and ending
 * with the seller's newest message, which is capped at REX_MAX_CHARS. Attached photo URLs come back separately.
 */
export function parseRexBody(body: unknown): { ok: true; turns: RexTurn[]; imageUrls: string[] } | { ok: false; error: string } {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Tell Rex what you need." };
  let turns = parsed.data.messages.map((turn) => ({ role: turn.role, content: turn.content.trim() })).filter((turn) => turn.content);
  turns = turns.slice(-REX_MAX_TURNS);
  while (turns.length && turns[0].role !== "user") turns = turns.slice(1);
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") return { ok: false, error: "Tell Rex what you need." };
  if (last.content.length > REX_MAX_CHARS) return { ok: false, error: `Keep your message under ${REX_MAX_CHARS} characters` };
  // Merge back-to-back turns from the same side (e.g. after a failed reply) so providers accept the history.
  const merged: RexTurn[] = [];
  for (const turn of turns) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === turn.role) previous.content = `${previous.content}\n\n${turn.content}`;
    else merged.push({ ...turn });
  }
  return { ok: true, turns: merged, imageUrls: parsed.data.imageUrls ?? [] };
}

// ─── Tool inputs ──────────────────────────────────────────────────────────────

const product = (what: string) => z.string().trim().min(1).max(160).describe(`${what}: a product id from list_products, or its name`);
const optionalProduct = (what: string) => product(what).nullable();
const photoUrl = z.string().trim().max(2000).regex(HTTPS_URL, "Use a photo the seller attached or one of the product's photos").nullable();
const photoIndex = z.number().int().min(0).max(19).nullable().describe("Which of the product's photos (0 = main photo); null for the main photo");

/** Where the photo to edit comes from: a photo the seller attached, or one of a product's photos. */
const photoSource = {
  product: optionalProduct("The product whose photo to edit (null when editing an attached photo that isn't a product's yet)"),
  imageIndex: photoIndex,
  imageUrl: photoUrl.describe("An attached photo URL to edit; null to use the product's photo"),
};

function needsPhoto(value: { product: string | null; imageUrl: string | null }, ctx: z.RefinementCtx) {
  if (!value.product && !value.imageUrl) ctx.addIssue({ code: "custom", message: "Say which product's photo to edit, or use a photo the seller attached" });
}

export const REX_SECTION_PAGES = ["home", "products", "product", "categories", "about", "contact", "faq", "blog"] as const;
// Keep in step with BOUTIQUE_THEME_IDS (src/lib/store-templates/boutique-themes.ts); a test checks they match.
export const REX_THEME_IDS = ["breeze", "noir", "plain", "adire", "pantry", "ile", "plug", "stride", "ewa", "suku", "asoebi", "agbada", "ileke", "ounje", "chinchin", "oja", "omo", "iwe", "owambe", "danfo", "turare", "oko", "aaro", "highlife", "oba", "gbedu", "omalicha", "zuma", "oku", "ihe", "kasuwa", "nkata", "uwa", "sarauniya", "zinariya", "irawo", "asa", "mmiri", "uzo", "rawa", "fitila", "oso", "shakara", "aga", "itura", "gele", "imani", "itanna", "littafi", "itan", "awo", "kyau", "keke", "ahia", "ado", "wuta", "ike", "ewu", "erin", "apere", "bata", "ogba", "eso", "osan", "ijokoo", "ite", "kujera", "tufafi", "rewa", "igbese", "ola", "okunrin", "salubata"] as const;
export const REX_VIDEO_LANGUAGES = ["english", "pidgin", "yoruba", "hausa"] as const;
export const REX_AUTOMATION_KINDS = ["welcome", "abandoned_checkout", "post_purchase", "review_request", "win_back", "birthday", "order_shipped", "order_delivered"] as const;
export const REX_CAMPAIGN_AUDIENCES = ["all", "subscribers", "repeat_buyers", "top_spenders", "segment"] as const;

export const REX_TOOL_SPECS = {
  store_health: {
    kind: "read",
    description: "The store's health score out of 100 from real facts (products, photos, delivery, payments, pages, reviews) and the biggest gaps to fix first.",
    schema: z.object({}).strict(),
  },
  list_products: {
    kind: "read",
    description: "The seller's products with ids, prices, how many photos each has and a short description. Use it to find the product a seller means before editing its photos or copy.",
    schema: z
      .object({
        query: z.string().trim().max(120).nullable().describe("Words from the product name, or null for the newest products"),
        limit: z.number().int().min(1).max(30).nullable().describe("How many (1-30); null for 12"),
      })
      .strict(),
  },
  list_themes: {
    kind: "read",
    description: "The store themes the seller can switch to, shown to them as preview cards they can tap. Use when they ask what themes or looks there are.",
    schema: z.object({}).strict(),
  },
  open_preview: {
    kind: "ui",
    description: "Open the live preview of the store's draft beside the chat (full screen on phones), on a page. Use when the seller asks to see their store.",
    schema: z.object({ page: z.enum(["home", "product", "collections", "about", "faq"]).nullable().describe("Which page to show; null for the homepage") }).strict(),
  },
  edit_product_photo: {
    kind: "image",
    description: "Edit a product photo: improve lighting and sharpness, put it on a clean white studio background, or follow a custom instruction (e.g. 'make the colours warmer'). The product itself is kept exactly the same. The result is shown with a Save to product button; it is NOT saved until the seller taps it.",
    schema: z
      .object({
        ...photoSource,
        style: z.enum(["enhance", "white_background", "custom"]),
        instructions: z.string().trim().max(600).nullable().describe("Extra instructions; required for custom"),
      })
      .strict()
      .superRefine((value, ctx) => {
        needsPhoto(value, ctx);
        if (value.style === "custom" && !value.instructions) ctx.addIssue({ code: "custom", message: "Say what to change for a custom edit", path: ["instructions"] });
      }),
  },
  remove_background: {
    kind: "image",
    description: "Remove a product photo's background (transparent cut-out). Shown with a Save to product button; not saved until the seller taps it.",
    schema: z.object(photoSource).strict().superRefine(needsPhoto),
  },
  lifestyle_photo: {
    kind: "image",
    description: "Put the product into a styled lifestyle scene (e.g. on a dressing table in a bright Lagos flat). Shown with a Save to product button; not saved until the seller taps it.",
    schema: z
      .object({ ...photoSource, scene: z.string().trim().max(400).nullable().describe("The scene to place it in, or null to choose one that suits the product") })
      .strict()
      .superRefine(needsPhoto),
  },
  generate_product_image: {
    kind: "image",
    description:
      "Generate a new image from a description: a product shot, a banner or a social post picture, in the seller's brand. Optionally for a product (then it can be saved to that product, and its main photo is used as a reference). Set brand to \"logo\" when the seller wants their logo on it (\"with my logo\", \"branded\"): their real logo from the brand kit is copied onto the label or packaging.",
    schema: z
      .object({
        prompt: z.string().trim().min(8).max(1500).describe("A full visual description of the image"),
        product: optionalProduct("The product it is for, or null"),
        shape: z.enum(["square", "landscape", "portrait"]).nullable().describe("square for products, landscape for banners, portrait for stories; null for square"),
        brand: z
          .enum(["logo", "colours", "none"])
          .nullable()
          .describe("logo = their logo on it plus brand colours; colours = brand colours and feel only; none = no branding. null = colours"),
        referenceImages: z
          .array(z.string().trim().max(2000))
          .max(4)
          .nullable()
          .describe("Photo URLs to work from: photos or video stills the seller attached, or product photos from list_products. null to use the product's main photo (if any)"),
      })
      .strict(),
  },
  generate_logo: {
    kind: "image",
    description: "Design three logo options (minimal, bold, illustrative) for the store. The seller taps one to use it as their logo.",
    schema: z
      .object({
        businessName: z.string().trim().max(80).nullable().describe("The name on the logo; null for the store's name"),
        about: z.string().trim().max(300).nullable().describe("What the business sells and its feel; null to use the store description"),
        paletteHint: z.string().trim().max(200).nullable().describe("Colours to use, e.g. 'deep green and gold'; null to choose"),
      })
      .strict(),
  },
  make_product_video: {
    kind: "write",
    description:
      "Prepare a short vertical product reel (Instagram, TikTok, WhatsApp status) in the store's brand colours and logo: picks the product's photos (or pictures you just made or the seller attached), can first clean them up into reel shots (cut out, studio backdrop or branded ad shot; each costs a picture), picks a template, a Nigerian-accent female or male voice and background music, and writes the captions, voiceover and end card. The seller opens it in the video studio, previews it and records it in their browser.",
    schema: z
      .object({
        product: product("The product to make a reel for"),
        language: z.enum(REX_VIDEO_LANGUAGES).nullable().describe("Language for the captions and voiceover; null for Pidgin"),
        template: z.enum(REEL_TEMPLATE_IDS).nullable().describe("float = product floating on a soft brand backdrop (premium), bold = giant word behind the product (food, fashion), pop = brand-colour cards with round wipes (fun), words = fast word punches between photos (sales, launches), grid = collage of photos (a range), classic = full-screen slideshow; null for Rex's pick"),
        shots: z.enum(["original", "cutout", "studio", "brand"]).nullable().describe("original = use the photos as they are; cutout = remove backgrounds (best for float, bold, pop); studio = clean studio backdrop in the brand colour; brand = branded ad shots with the logo; null for original"),
        photos: z.array(z.string().trim().max(2000).regex(HTTPS_URL)).max(6).nullable().describe("Pictures to use instead of the product's own photos: ones you just made in this chat or the seller attached; null for the product's photos"),
        voice: z.enum(VOICE_GENDERS).nullable().describe("female or male voice (both Nigerian accent); null for female"),
        music: z.enum(MUSIC_MOODS.map((mood) => mood.id) as [string, ...string[]]).nullable().describe("afrobeats, amapiano, upbeat, chill or luxury background music; null to match the template"),
      })
      .strict(),
  },
  edit_store_section: {
    kind: "store",
    description:
      "Change the store's DRAFT design: rewrite or restyle a section, add, hide or remove a section, add a page, change colours and fonts, or write search titles. Pass the seller's request as a clear instruction. Saved as a new draft version with undo; shoppers see nothing until Publish.",
    schema: z
      .object({
        instruction: z.string().trim().min(3).max(1500).describe("What to change, in plain words, e.g. 'Rewrite the homepage banner in Pidgin, warmer'"),
        page: z.enum(REX_SECTION_PAGES).nullable().describe("The page it is on; null when it is store-wide or unclear"),
      })
      .strict(),
  },
  rebuild_section: {
    kind: "store",
    description: "Rebuild one section or a whole page of the DRAFT from scratch (new words, new layout) instead of a light edit. Saved as a new draft version with undo.",
    schema: z
      .object({
        page: z.enum(REX_SECTION_PAGES),
        section: z.string().trim().min(2).max(80).describe("Which section, e.g. 'banner', 'our story', 'questions', or 'whole page'"),
        direction: z.string().trim().max(800).nullable().describe("What the new version should feel like or say; null to decide"),
      })
      .strict(),
  },
  switch_theme: {
    kind: "store",
    description: "Switch the DRAFT to another theme, keeping the seller's words, pages and products. Saved as a new draft version with undo.",
    schema: z.object({ themeId: z.enum(REX_THEME_IDS) }).strict(),
  },
  write_product_copy: {
    kind: "write",
    description:
      "Write a new product description for one product and show it to the seller next to the current one with an Apply button. Nothing on the product changes until the seller taps Apply.",
    schema: z
      .object({
        product: product("The product to write for"),
        brief: z.string().trim().max(600).nullable().describe("Tone, language or points to include; null to decide"),
      })
      .strict(),
  },
  create_segment: {
    kind: "write",
    description: "Create a customer segment (a saved group) from simple rules: at least N orders, at least an amount spent, or a tag.",
    schema: z
      .object({
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(300).nullable(),
        minOrders: z.number().int().min(1).max(1000).nullable().describe("At least this many paid orders, or null"),
        minSpent: z.number().min(1).max(1_000_000_000).nullable().describe("At least this much spent in naira, or null"),
        tag: z.string().trim().max(40).nullable().describe("Subscribers with this tag, or null"),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.minOrders === null && value.minSpent === null && !value.tag) ctx.addIssue({ code: "custom", message: "Give at least one rule: minOrders, minSpent or tag" });
      }),
  },
  create_campaign: {
    kind: "write",
    description: "Write an email campaign and save it as a DRAFT for the seller to review and send from Campaigns. Never sends.",
    schema: z
      .object({
        name: z.string().trim().min(2).max(120).describe("Internal name, e.g. 'Payday sale, October'"),
        subject: z.string().trim().min(2).max(150),
        message: z.string().trim().min(20).max(4000).describe("The full email in plain text, paragraphs separated by blank lines"),
        audience: z.enum(REX_CAMPAIGN_AUDIENCES).describe("all = subscribers + past buyers; repeat_buyers = 2+ orders; top_spenders = ₦50,000+; segment = a named segment"),
        segment: z.string().trim().max(80).nullable().describe("The segment name when audience is segment, else null"),
        type: z.enum(["promotion", "sale", "product_launch", "newsletter", "announcement"]).nullable(),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.audience === "segment" && !value.segment) ctx.addIssue({ code: "custom", message: "Name the segment to send to", path: ["segment"] });
      }),
  },
  create_automation: {
    kind: "write",
    description:
      "Set up an automation (welcome email, abandoned checkout reminder, thank-you after purchase, review request, win-back, birthday, shipped or delivered update). It is saved switched OFF; the seller turns it on from the card or the Automations page.",
    schema: z
      .object({
        kind: z.enum(REX_AUTOMATION_KINDS),
        name: z.string().trim().max(80).nullable().describe("A name, or null for a standard one"),
        subject: z.string().trim().min(2).max(150),
        message: z.string().trim().min(20).max(3000).describe("The email in plain text. You may use {{buyerName}}, {{storeName}} and {{orderNumber}}"),
        delayHours: z.number().min(0).max(24 * 60).nullable().describe("Hours to wait after the trigger; null for the usual wait"),
      })
      .strict(),
  },
  cms_create_collection: {
    kind: "write",
    description:
      "Set up a content collection in the store (like Wix CMS): a Blog, Size guide, Recipe book, Course (lessons), FAQ, Lookbook, Team, Events, or a blank one, from a template plus any extra fields the seller wants. Shoppers see it at /<slug> once it has published items.",
    schema: z
      .object({
        description: z.string().trim().min(3).max(500).describe("What the collection is for, in the seller's words"),
        name: z.string().trim().max(80).nullable().describe("Its name, e.g. 'Spice recipes'; null for the template's name"),
        template: z.enum(TEMPLATE_IDS).nullable().describe("blog, size_guide, recipe, course, faq, lookbook, team, events or blank; null to pick from the description"),
        extraFields: z
          .array(
            z
              .object({
                label: z.string().trim().min(1).max(60),
                type: z.enum(FIELD_TYPES).describe("richText, text, number, stats, image, gallery, video, file, date, boolean, choice, tags, link, products, items, callout, table, form or price"),
                options: z.array(z.string().trim().min(1).max(60)).max(30).nullable().describe("Options for a choice field, else null"),
              })
              .strict(),
          )
          .max(12)
          .nullable()
          .describe("Fields to add on top of the template, or null"),
      })
      .strict(),
  },
  draft_email_template: {
    kind: "write",
    description:
      "Design an email (photo, headline, text, the shop's real products and prices, a discount code box, a button) and save it as a new DRAFT template in Marketing > Email templates, where the seller edits it in the visual builder. Never sends.",
    schema: z
      .object({
        brief: z.string().trim().min(3).max(1000).describe("What the email is for: occasion, offer, code, products, tone"),
        name: z.string().trim().max(120).nullable().describe("Template name, or null to choose one"),
      })
      .strict(),
  },
  improve_email_copy: {
    kind: "write",
    description: "Rewrite one of the seller's saved email templates as asked and save it as a new draft copy (the original stays as it was). Never sends.",
    schema: z
      .object({
        template: z.string().trim().min(1).max(160).describe("The saved template's name"),
        instruction: z.string().trim().min(3).max(1000).describe("What to change"),
      })
      .strict(),
  },
  cms_write_item: {
    kind: "write",
    description:
      "Write a new item in one of the store's content collections (a blog post, a size guide with its chart, a recipe, a lesson, an FAQ answer) and save it as a DRAFT with search details, for the seller to review and publish in Content. Never publishes.",
    schema: z
      .object({
        collection: z.string().trim().min(1).max(80).describe("The collection's name, e.g. Blog"),
        brief: z.string().trim().min(3).max(1500).describe("What to write and anything to include"),
        title: z.string().trim().max(200).nullable().describe("A title, or null to choose one"),
      })
      .strict(),
  },
  create_brand_book: {
    kind: "write",
    description:
      "Write the store's brand style book: brand colours (taken from the logo when there is one), fonts, voice, words to use and avoid, logo rules, photo style, do's and don'ts. Saved in Brand kit > Style book, printable. With applyColours true it also puts the colours on the store DRAFT (a version with undo).",
    schema: z
      .object({
        direction: z.string().trim().max(400).nullable().describe("What the seller wants, e.g. 'more premium, earthy colours'; null for Rex's call"),
        applyColours: z.boolean().nullable().describe("true only when the seller asked to change the store's colours too; null/false to just write the book"),
      })
      .strict(),
  },
  make_brand_icon: {
    kind: "image",
    description: "Make the store's logo icon (square mark for app icons and profile pictures) or favicon (browser tab icon) from its logo. Shown with buttons to use it; nothing changes until the seller taps.",
    schema: z.object({ kind: z.enum(["icon", "favicon"]).describe("icon for the square logo icon, favicon for the browser tab icon") }).strict(),
  },
  set_logo_display: {
    kind: "write",
    description:
      "Change how the brand shows in the store header, live at once: logo_text (logo with the store name beside it), logo (the full logo alone, best when the logo already has the name in it), icon_text (square logo icon with the name), icon (icon alone) or text (name only); and the size. Use when the seller says the logo is too small or big, or wants only the logo, icon or name.",
    schema: z
      .object({
        style: z.enum(LOGO_STYLES).nullable().describe("How the brand shows; null to keep the current style"),
        size: z.enum(LOGO_SIZES).nullable().describe("small, medium or large; null to keep the current size"),
      })
      .strict(),
  },
  make_print_labels: {
    kind: "read",
    description:
      "Set up printable labels in the Print studio, in the store's brand: hang tags, price/barcode labels, QR code stickers, package (box) labels or thank-you cards. Real barcodes and QR codes; the seller prints on A4 or a label printer, downloads, or emails them to a print shop. For order shipping labels, point to /home/labels.",
    schema: z
      .object({
        kind: z.enum(PRINT_KINDS).describe("tag = hang tag, price = price and barcode label, qr = QR sticker, package = box/package label, thanks = thank-you card"),
        products: z.array(product("A product")).max(30).nullable().describe("The products to make labels for; null for none (store-wide QR stickers or thank-you cards)"),
        headline: z.string().trim().max(60).nullable().describe("Short top line, e.g. 'Handmade in Lagos'; null for the default"),
        note: z.string().trim().max(160).nullable().describe("Small print: ingredients, care, weight, a thank-you line; null for none"),
        qr: z.enum(QR_TARGETS).nullable().describe("Where the QR code goes: product page, store, WhatsApp chat, reviews page or custom; null for product"),
        copies: z.number().int().min(1).max(100).nullable().describe("Copies of each; null for 1"),
      })
      .strict(),
  },
  design_packaging: {
    kind: "write",
    description:
      "Design print-ready packaging for a product in the Packaging designer and save it to Labels and print: stand-up pouch, tuck-end box, jar wrap label, bottle labels, round sticker, sachet, tube, wrap sleeve or shopping bag, in one of 12 templates. Peggy writes the words (name, tagline, badges, description and the back of the pack for the product type: ingredients, how to use, storage, caution, care). It carries the store's logo, a barcode and a QR code; the seller downloads a print-ready PDF (bleed, cut lines, spec sheet) for their printer. Works for food, drinks, beauty, hair, supplements, fashion, home, baby, pet, cleaning and electronics.",
    schema: z
      .object({
        product: optionalProduct("The product the pack is for (null when it isn't in the store yet; then give name)"),
        name: z.string().trim().max(80).nullable().describe("Product name for the pack when it isn't a store product; null to use the product's name"),
        productType: z.enum(PRODUCT_TYPES).nullable().describe("What kind of product; null to guess from the product"),
        format: z.enum(PACK_FORMATS).nullable().describe("The pack; null to pick the usual one for the product type"),
        style: z.enum(PACK_STYLES).nullable().describe("midnight (dark premium snack), range (one bold colour per flavour), pop (loud duotone), split (two-tone wave with badges), kraft (natural, stamp), minimal (calm white), botanical (deep colour, arch photo), ankara (African pattern bands), badge (retro emblem), clinical (supplements, skincare), playful (kids, pets), luxe (black and gold); null to pick for the product type"),
        brief: z.string().trim().max(400).nullable().describe("What the seller wants on it or how it should feel; null for none"),
      })
      .strict(),
  },
  make_creative: {
    kind: "image",
    description:
      "Make an eye-catching marketing image (with the headline lettered on it) for social media, a story, a Facebook/Instagram ad, the store banner, an email header, a website popup or a campaign poster. Concepts: bold_headline (giant chunky words, products held up around), product_lineup (the range in a row on two-tone colour), witty_metaphor (a clever visual twist with a teasing line), model_with_products (a Nigerian model reacting, products held up), floating_hero, dark_premium, ingredient_splash, flat_lay, minimal_studio. Uses the products' photos as references and the brand colours (and logo when asked).",
    schema: z
      .object({
        placement: z.enum(CREATIVE_PLACEMENTS).describe("Where it will be used"),
        concept: z.enum(CREATIVE_CONCEPTS).describe("The creative idea"),
        products: z.array(product("A product")).max(4).nullable().describe("Products to feature; null for none"),
        headline: z.string().trim().max(60).nullable().describe("The big words, short and punchy (e.g. 'Tough choice.'); null for no text"),
        subline: z.string().trim().max(90).nullable().describe("A smaller line; null for none"),
        cta: z.string().trim().max(24).nullable().describe("Call to action like 'Shop now'; null for none"),
        brand: z.enum(["logo", "colours", "none"]).nullable().describe("logo = their logo on it plus brand colours; colours = brand colours only; none. null = colours"),
        extra: z.string().trim().max(400).nullable().describe("Anything else about the picture; null for none"),
      })
      .strict(),
  },
} as const;

export type RexToolName = keyof typeof REX_TOOL_SPECS;
export const REX_TOOL_NAMES = Object.keys(REX_TOOL_SPECS) as RexToolName[];
export type RexToolInput<N extends RexToolName> = z.infer<(typeof REX_TOOL_SPECS)[N]["schema"]>;
export type RexToolKind = (typeof REX_TOOL_SPECS)[RexToolName]["kind"];

/** Tools that change the store or create something; once one runs, a turn is never re-run on another provider. */
export const isRexWriteTool = (name: string) => name in REX_TOOL_SPECS && ["write", "store"].includes(REX_TOOL_SPECS[name as RexToolName].kind);

/** Validates a model's tool arguments (an object, or a JSON string from OpenAI). */
export function parseRexToolInput<N extends RexToolName>(name: N, raw: unknown): { ok: true; input: RexToolInput<N> } | { ok: false; error: string } {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      return { ok: false, error: "The tool arguments were not valid JSON." };
    }
  }
  const result = (REX_TOOL_SPECS[name].schema as z.ZodType).safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
    return { ok: false, error: `Invalid input. ${where}${issue?.message ?? "Check the arguments."}` };
  }
  return { ok: true, input: result.data as RexToolInput<N> };
}

// ─── Tool logic ───────────────────────────────────────────────────────────────

/**
 * The photo to edit: an attached URL wins (it must be one the seller attached this conversation or one of
 * the product's photos, never an arbitrary link), else the product's photo at `index` (main photo by default).
 */
export function pickSourcePhoto(input: { imageUrl: string | null; imageIndex: number | null }, productImages: string[], allowed: string[]): { ok: true; url: string; index: number | null } | { ok: false; error: string } {
  const images = productImages.filter(Boolean);
  if (input.imageUrl) {
    const at = images.indexOf(input.imageUrl);
    if (at !== -1) return { ok: true, url: input.imageUrl, index: at };
    if (allowed.includes(input.imageUrl)) return { ok: true, url: input.imageUrl, index: null };
    return { ok: false, error: "That photo isn't one the seller attached or one of the product's photos. Ask them to attach it." };
  }
  if (!images.length) return { ok: false, error: "That product has no photos yet. Ask the seller to attach one, or use generate_product_image." };
  const index = input.imageIndex ?? 0;
  if (index >= images.length) return { ok: false, error: `That product has ${images.length} photo${images.length === 1 ? "" : "s"} (0 to ${images.length - 1}).` };
  return { ok: true, url: images[index], index };
}

export type PhotoSaveMode = "add" | "main" | "replace";

/** A product's photo list after saving a new photo: added at the end, made the main photo, or replacing one. */
export function productImagesAfterSave(images: string[], url: string, mode: PhotoSaveMode, replaceIndex: number | null = null): string[] {
  const list = images.filter((image) => image && image !== url);
  if (mode === "main") return [url, ...list].slice(0, 20);
  if (mode === "replace" && replaceIndex !== null && replaceIndex >= 0 && replaceIndex < images.length) {
    const next = [...images];
    next[replaceIndex] = url;
    return next.filter((image, index) => image && next.indexOf(image) === index).slice(0, 20);
  }
  return [...list, url].slice(0, 20);
}

/** What edit_store_section asks the store designer, for a rebuild. */
export function rebuildInstruction(input: { page: string; section: string; direction: string | null }) {
  const whole = /^(the\s+)?(whole|entire|full)\s+page$/i.test(input.section.trim());
  const target = whole ? `the whole ${input.page === "home" ? "homepage" : `${input.page} page`}` : `the "${input.section}" section on the ${input.page === "home" ? "homepage" : `${input.page} page`}`;
  return [
    `Rebuild ${target} from scratch: write all-new words and choose the best section layout for it, rather than a light edit.`,
    input.direction ? `Direction from the seller: ${input.direction}` : "Make it clearer and more persuasive for this store's customers.",
    whole ? "Keep the header and footer, and keep sections that show the store's own products and reviews." : "Leave every other section as it is.",
  ].join(" ");
}

/**
 * Segment rules in the marketing suite's shape ({ match, conditions: [{ field, op, value }] }, see
 * src/lib/marketing/segment-rules.ts), which also reads the older { minOrders, minSpent } form.
 */
export function segmentRules(input: { minOrders: number | null; minSpent: number | null; tag: string | null }) {
  const conditions: Array<{ field: "orders" | "spent" | "tag"; op: "gte" | "has"; value: number | string }> = [];
  if (input.minOrders !== null) conditions.push({ field: "orders", op: "gte", value: input.minOrders });
  if (input.minSpent !== null) conditions.push({ field: "spent", op: "gte", value: input.minSpent });
  if (input.tag?.trim()) conditions.push({ field: "tag", op: "has", value: input.tag.trim().toLowerCase() });
  return { match: "all" as const, conditions };
}

export function describeSegmentRules(rules: ReturnType<typeof segmentRules>, money: (n: number) => string) {
  return rules.conditions
    .map((condition) =>
      condition.field === "orders" ? `${condition.value}+ orders` : condition.field === "spent" ? `spent ${money(Number(condition.value))}+` : `tagged "${condition.value}"`,
    )
    .join(", ");
}

/** Campaign recipient filters the existing sender understands (src/lib/campaigns/send.ts). */
export function campaignRecipientFilter(audience: (typeof REX_CAMPAIGN_AUDIENCES)[number]) {
  switch (audience) {
    case "subscribers":
      return { mode: "subscribers" } as const;
    case "repeat_buyers":
      return { mode: "min_orders", value: 2 } as const;
    case "top_spenders":
      return { mode: "min_spend", value: 50_000 } as const;
    default:
      return { mode: "all" } as const;
  }
}

/** Each automation kind: the AutomationRule trigger it runs on, a standard name and the usual wait. */
export const AUTOMATION_PRESETS: Record<(typeof REX_AUTOMATION_KINDS)[number], { trigger: string; name: string; delayHours: number }> = {
  welcome: { trigger: "welcome_email", name: "Welcome new subscribers", delayHours: 0 },
  abandoned_checkout: { trigger: "abandoned_checkout", name: "Abandoned checkout reminder", delayHours: 1 },
  post_purchase: { trigger: "post_purchase", name: "Thank you after purchase", delayHours: 24 },
  review_request: { trigger: "review_request", name: "Ask for a review", delayHours: 72 },
  win_back: { trigger: "win_back", name: "Win back quiet customers", delayHours: 0 },
  birthday: { trigger: "birthday", name: "Birthday treat", delayHours: 0 },
  order_shipped: { trigger: "order_shipped", name: "Your order is on its way", delayHours: 0 },
  order_delivered: { trigger: "order_delivered", name: "Your order has arrived", delayHours: 0 },
};

/** Plain text (blank-line paragraphs) to the simple HTML the campaign and automation senders use. */
export function textToEmailHtml(text: string) {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return text
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escape(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/**
 * A Rex-made automation as the marketing suite's flow (src/lib/marketing/flows.ts): wait, then send the email.
 * It always starts switched off.
 */
export function automationRuleData(input: RexToolInput<"create_automation">) {
  const preset = AUTOMATION_PRESETS[input.kind];
  const waitMinutes = Math.round((input.delayHours ?? preset.delayHours) * 60);
  const subject = input.subject.trim();
  const bodyHtml = textToEmailHtml(input.message);
  return {
    name: (input.name?.trim() || preset.name).slice(0, 80),
    trigger: preset.trigger,
    actionType: "send_email" as const,
    actionConfig: {
      steps: [...(waitMinutes > 0 ? [{ type: "wait", minutes: waitMinutes }] : []), { type: "send_email", subject, bodyHtml }],
      settings: input.kind === "win_back" ? { days: 60 } : {},
    },
    waitMinutes,
    active: false,
  };
}

/** Image sizes the image model takes, from the tool's plain-word shape. */
export function imageSizeFor(shape: "square" | "landscape" | "portrait" | null) {
  return shape === "landscape" ? "1536x1024" : shape === "portrait" ? "1024x1536" : "1024x1024";
}

// ─── The seller's taps on Rex's cards ───────────────────────────────────────────

const id = z.string().trim().min(1).max(64);
const ownPhoto = z.string().trim().max(2000).regex(HTTPS_URL, "That isn't a saved picture");

/** POST /api/ai/rex/actions: what a card button asks for. These are the confirmations Rex never does himself. */
export const RexActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_product_image"), productId: id, imageUrl: ownPhoto, mode: z.enum(["add", "main", "replace"]), replaceIndex: z.number().int().min(0).max(19).nullable().default(null) }).strict(),
  z.object({ action: z.literal("set_logo"), imageUrl: ownPhoto }).strict(),
  z.object({ action: z.literal("apply_product_copy"), productId: id, description: z.string().trim().min(10, "The description is too short").max(3000, "Keep the description under 3,000 characters") }).strict(),
  z.object({ action: z.literal("activate_automation"), id }).strict(),
  z.object({ action: z.literal("set_brand_asset"), kind: z.enum(["icon", "favicon"]), url: ownPhoto }).strict(),
  z.object({ action: z.literal("save_to_media"), url: ownPhoto, kind: z.enum(["image", "video"]).default("image"), name: z.string().trim().max(120).nullable().default(null) }).strict(),
]);

export type RexAction = z.infer<typeof RexActionSchema>;

export function parseRexAction(body: unknown): { ok: true; action: RexAction } | { ok: false; error: string } {
  const parsed = RexActionSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That action isn't recognised." };
  if (parsed.data.action === "save_product_image" && parsed.data.mode === "replace" && parsed.data.replaceIndex === null) {
    return { ok: false, error: "Say which photo to replace." };
  }
  return { ok: true, action: parsed.data };
}
