import "server-only";
import { themeProblem } from "@/lib/plans/gates.server";
import type { CreditAction } from "@shared/ai-credits";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { meterAiCharged, refundAi, type AiKind } from "@/lib/ai/usage";
import { EDIT_PROMPTS, editImage, generateImage, ImageUnavailableError, isOwnImageUrl, loadReferences } from "@/lib/ai/images";
import { BrandBookError, draftBrandBook, saveBrandBook } from "@/lib/ai/brand-book.server";
import { bookToThemeTokens } from "@shared/brand-book";
import { PRINT_SPECS } from "@shared/print-labels";
import { PACK_FORMAT_INFO, PACK_STYLE_INFO, PRODUCT_TYPE_INFO, guessProductType, newDesign } from "@shared/packaging";
import { CREATIVE_CONCEPT_INFO, CREATIVE_PLACEMENT_INFO, creativePrompt } from "@shared/creatives";
import { normaliseEan13 } from "@shared/barcodes";
import { aiConfigured } from "@/lib/ai/client";
import { fallbackPackCopy, writePackCopy } from "@/lib/packaging/copy.server";
import { saveLabelDesign, savePackagingDesign } from "@/lib/packaging/designs.server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { readLogoDisplay } from "@shared/store-logo";
import { defaultMood, reelTemplate, type ReelTemplateId } from "@shared/video-style";
import { makeReelShot } from "@/lib/ai/reel-shots.server";
import { loadBrandContext } from "@/lib/ai/brand-context.server";
import { makeBrandImage } from "@/lib/ai/brand-image.server";
import { getOpenAIClient } from "@/lib/ai/client";
import { matchProducts } from "@/lib/ai/peggy/pure";
import { computeStoreHealth } from "@/lib/store-health";
import { getTemplateManifest, isBoutiqueTheme } from "@/lib/store-templates";
import { THEME_LIBRARY, tierIncludes } from "@/lib/store-templates/theme-library";
import { TIER_PLAN_LABEL } from "@/lib/theme-access";
import { loadSellerThemeAccess } from "@/lib/theme-access.server";
import { naira } from "@shared/onboarding";
import { MAX_PHOTOS, fallbackScript, normaliseScript, type VideoLanguage } from "@shared/video";
import { drawLogoOptions, LOGO_STYLES } from "@/lib/ai/rex/logo";
import { describeSegmentRules, imageSizeFor, pickSourcePhoto, rebuildInstruction, type RexToolInput, type RexToolName } from "@/lib/ai/rex/agent-pure";
import type { RexCard } from "@/lib/ai/rex/cards";
import { MarketingError, rexCreateAutomation, rexCreateCampaign, rexCreateSegment } from "@/lib/ai/rex/marketing.server";
import { applyStudioPlan, loadStudioStore, runStudioEdit, type StudioEditResult } from "@/lib/ai/rex/studio-edit.server";
import { parseRexStudioPlan } from "@/lib/ai/rex/studio-plan";
import { loadHealthFacts, studioDraft, themeNameFor } from "@/lib/ai/rex/studio.server";
import type { RexVersionSummary } from "@/lib/ai/rex/studio-versions";
import type { StoreEditorSnapshot } from "@/lib/store-templates";
import { draftItem, setupCollection } from "@/lib/cms/ai.server";
import { CmsError } from "@/lib/cms/server";
import { FIELD_TYPE_INFO, readFields } from "@/lib/cms/fields";
import { readBlocks, readPreheader } from "@/lib/marketing/blocks";
import { draftEmail, findTemplate, saveDraftTemplate } from "@/lib/marketing/template-ai.server";
import { matchStarter } from "@/lib/marketing/template-library";

// Rex's tools. Each is declared once in ./agent-pure (name, description, zod schema) and run here, always in
// the signed-in seller's own store (the store comes from the session, never from the model). Image tools only
// show results; saving them to a product or as the logo is the seller's tap (POST /api/ai/rex/actions).

export interface RexToolContext {
  userId: string;
  storeId: string;
  storeName: string;
  /** Photo URLs the seller attached in this conversation (the only outside photos Rex may edit). */
  attachments: string[];
  /** Photos attached to the newest message, handed to the store designer. */
  newPhotos: string[];
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** Filled by store tools so the reply carries the newest draft for the preview. */
  draft: StoreEditorSnapshot | null;
  versions: RexVersionSummary[] | null;
}

export interface RexToolOutput {
  /** What the model reads back. */
  content: string;
  card?: RexCard;
}

/** A problem the model should hear about (and can usually fix or explain), sent back as an error result. */
export class RexToolError extends Error {}
/** The credits are used up; the chat shows a "Buy credits" button with Rex's reply. */
export class RexCreditsError extends RexToolError {}

const money = (amount: number) => naira(Number(amount) || 0);

/** Takes the credits for a tool's work; returns a function that gives them back if the work then fails. */
async function meter(ctx: RexToolContext, kind: AiKind, units = 1, action?: CreditAction) {
  const metered = await meterAiCharged(ctx.userId, kind, units, action);
  if (metered.blocked) {
    const body = (await metered.blocked.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new (body?.error?.code === "AI_CREDITS_NEEDED" ? RexCreditsError : RexToolError)(`${body?.error?.message ?? "The seller is out of AI credits."} Tell the seller plainly; nothing was made.`);
  }
  return () => refundAi(ctx.userId, kind, units, metered.credits);
}

async function logActivity(ctx: RexToolContext, event: { type: string; title: string; description?: string; tool: RexToolName; link?: string; data?: Record<string, unknown> }) {
  await db.activityEvent
    .create({
      data: {
        storeId: ctx.storeId,
        userId: ctx.userId,
        type: event.type,
        title: event.title,
        description: event.description ?? null,
        metadata: { source: "rex", tool: event.tool, link: event.link ?? null, ...(event.data ?? {}) } as Prisma.InputJsonValue,
      },
    })
    .catch((error) => console.error("[rex] activity log failed", error));
}

const productSelect = { id: true, name: true, description: true, images: true, retailPrice: true, status: true, currency: true } as const;

async function findProduct(ctx: RexToolContext, query: string) {
  const products = await db.storeProduct.findMany({ where: { storeId: ctx.storeId, status: { not: "archived" } }, orderBy: { createdAt: "desc" }, take: 1000, select: productSelect });
  const matches = matchProducts(products, query);
  if (!matches.length) throw new RexToolError(`No product matches "${query}". Use list_products to find it.`);
  if (matches.length > 1) {
    throw new RexToolError(`"${query}" matches ${matches.length} products: ${matches.slice(0, 6).map((p) => `${p.name} (id ${p.id})`).join("; ")}. Ask the seller which one, or call again with the id.`);
  }
  return matches[0];
}

function imageFailure(error: unknown): never {
  if (error instanceof RexToolError) throw error;
  if (error instanceof ImageUnavailableError) throw new RexToolError(`${error.message} Picture tools are off on this account until the key is added.`);
  const message = error instanceof Error ? error.message : "The picture didn't come back.";
  console.error("[rex] image tool failed", error);
  throw new RexToolError(`${message}. Nothing was saved; the seller can try again.`);
}

// ─── Read and UI tools ──────────────────────────────────────────────────────────

async function storeHealth(ctx: RexToolContext): Promise<RexToolOutput> {
  const store = await loadStudioStore(ctx.userId);
  if (!store) throw new RexToolError("The store couldn't be loaded.");
  const { draft } = studioDraft(store);
  const health = computeStoreHealth(await loadHealthFacts(store, draft));
  const missing = health.missing.slice(0, 6).map((item) => ({ label: item.label, rexPrompt: item.rexPrompt ?? null, href: item.href ?? null }));
  return {
    content: JSON.stringify({ score: health.score, outOf: 100, missing: missing.map((item) => ({ ...item, rexCanDoIt: Boolean(item.rexPrompt) })) }),
    card: { type: "health", score: health.score, missing },
  };
}

async function listProducts(ctx: RexToolContext, input: RexToolInput<"list_products">): Promise<RexToolOutput> {
  let products = await db.storeProduct.findMany({ where: { storeId: ctx.storeId, status: { not: "archived" } }, orderBy: { createdAt: "desc" }, take: 1000, select: productSelect });
  if (input.query) products = matchProducts(products, input.query);
  return {
    content: JSON.stringify({
      count: products.length,
      products: products.slice(0, input.limit ?? 12).map((p) => ({
        id: p.id,
        name: p.name,
        price: money(p.retailPrice),
        status: p.status,
        photos: p.images.filter(Boolean),
        description: (p.description ?? "").slice(0, 200),
      })),
    }),
  };
}

async function listThemes(ctx: RexToolContext): Promise<RexToolOutput> {
  const store = await loadStudioStore(ctx.userId);
  const current = store ? studioDraft(store).draft.templateId : "";
  // Cards only for themes the seller can switch to; the rest are named so Rex can mention the upgrade.
  const { tier, owned } = await loadSellerThemeAccess(ctx.userId);
  const available = THEME_LIBRARY.filter((theme) => getTemplateManifest(theme.id));
  const locked = available.filter((theme) => theme.id !== current && !tierIncludes(tier, theme.tier) && !owned.includes(theme.id));
  const themes = available.filter((theme) => !locked.includes(theme)).map((theme) => ({
    id: theme.id,
    name: theme.name,
    blurb: theme.blurb,
    swatches: { bg: theme.preview.bg, ink: theme.preview.ink, accent: theme.preview.accent },
    dark: theme.preview.dark,
  }));
  return {
    content: [
      `Showing ${themes.length} themes as cards (current: ${themeNameFor(current)}). The seller can tap one to try it; it changes the draft only.`,
      locked.length ? `Not shown, because the seller's plan doesn't include them and they haven't bought them: ${locked.map((theme) => `${theme.name} (${theme.tier}, comes with ${TIER_PLAN_LABEL[theme.tier]})`).join(", ")}. Mention them only if the seller asks about more themes: they can preview any of them and buy one on its own in the theme gallery (Builder > Themes) without changing plan.` : "",
    ].filter(Boolean).join(" "),
    card: { type: "themes", current, themes },
  };
}

async function openPreview(_ctx: RexToolContext, input: RexToolInput<"open_preview">): Promise<RexToolOutput> {
  return { content: "The preview is open for the seller.", card: { type: "preview", page: input.page } };
}

// ─── Picture tools ──────────────────────────────────────────────────────────────

async function photoEdit(
  ctx: RexToolContext,
  tool: "edit_product_photo" | "remove_background" | "lifestyle_photo",
  input: { product: string | null; imageIndex: number | null; imageUrl: string | null },
  prompt: string,
  title: string,
  transparent = false,
): Promise<RexToolOutput> {
  const product = input.product ? await findProduct(ctx, input.product) : null;
  const source = pickSourcePhoto(input, product?.images ?? [], ctx.attachments);
  if (!source.ok) throw new RexToolError(source.error);
  if (!isOwnImageUrl(source.url)) throw new RexToolError("That photo isn't stored in the shop, so it can't be edited. Ask the seller to attach it with the photo button.");
  const giveBack = await meter(ctx, "image");
  let url: string;
  try {
    url = await editImage({ sourceUrl: source.url, prompt, transparent, path: `enhanced/${ctx.userId}/${Date.now()}` });
  } catch (error) {
    await giveBack();
    imageFailure(error);
  }
  return {
    content: `Made it: ${url}. The seller sees the before and after${product ? ` with buttons to save it to ${product.name}` : ""}. It is NOT saved anywhere yet.`,
    card: { type: "image", tool, title, before: source.url, after: url, product: product ? { id: product.id, name: product.name } : null, sourceIndex: product ? source.index : null },
  };
}

async function editProductPhoto(ctx: RexToolContext, input: RexToolInput<"edit_product_photo">): Promise<RexToolOutput> {
  const base = input.style === "white_background" ? EDIT_PROMPTS.white_background : EDIT_PROMPTS.enhance;
  const prompt = input.instructions ? `${base} Also: ${input.instructions}` : base;
  return photoEdit(ctx, "edit_product_photo", input, prompt, input.style === "white_background" ? "White studio background" : input.style === "custom" ? "Edited photo" : "Sharper, brighter photo");
}

async function removeBackground(ctx: RexToolContext, input: RexToolInput<"remove_background">): Promise<RexToolOutput> {
  return photoEdit(ctx, "remove_background", input, EDIT_PROMPTS.remove_background, "Background removed", true);
}

async function lifestylePhoto(ctx: RexToolContext, input: RexToolInput<"lifestyle_photo">): Promise<RexToolOutput> {
  const prompt = input.scene ? `${EDIT_PROMPTS.lifestyle} The scene: ${input.scene}` : EDIT_PROMPTS.lifestyle;
  return photoEdit(ctx, "lifestyle_photo", input, prompt, "Lifestyle photo");
}

async function generateProductImage(ctx: RexToolContext, input: RexToolInput<"generate_product_image">): Promise<RexToolOutput> {
  const product = input.product ? await findProduct(ctx, input.product) : null;
  const brand = await loadBrandContext(ctx.storeId);
  // References: what Rex picked (the seller's attachments, this shop's product photos or logo), else the product's main photo.
  let references: string[] = [];
  if (input.referenceImages?.length) {
    const shopPhotos = new Set((await db.storeProduct.findMany({ where: { storeId: ctx.storeId }, select: { images: true }, take: 1000 })).flatMap((p) => p.images));
    references = input.referenceImages.filter((url) => isOwnImageUrl(url) && (ctx.attachments.includes(url) || shopPhotos.has(url) || url === brand?.logoUrl));
    if (!references.length) throw new RexToolError("Those reference photos aren't in this conversation or this shop. Use photos the seller attached or product photos from list_products.");
  } else if (product?.images[0]) {
    references = [product.images[0]];
  }
  const giveBack = await meter(ctx, "image");
  const prompt = product ? `${input.prompt}\nThe product: ${product.name}.${product.description ? ` ${product.description.slice(0, 300)}` : ""}` : input.prompt;
  const mode = input.brand ?? "colours";
  let result: Awaited<ReturnType<typeof makeBrandImage>>;
  try {
    result = await makeBrandImage({ brand, prompt, size: imageSizeFor(input.shape), logo: mode === "logo", colours: mode !== "none", referenceUrls: references, path: `generated/${ctx.userId}/${Date.now()}` });
  } catch (error) {
    await giveBack();
    imageFailure(error);
  }
  const logoNote =
    result.logoProblem === "no_logo"
      ? " The shop has no logo in its brand kit yet, so the store name was lettered on instead; tell the seller and offer generate_logo or uploading one at /home/brand-kit."
      : result.logoProblem === "unreadable"
        ? " The logo file couldn't be used (it needs to be a PNG, JPG or WebP), so the store name was lettered on instead; tell the seller to upload a PNG logo at /home/brand-kit."
        : result.usedLogo
          ? " Their logo from the brand kit is on it."
          : "";
  const refNote = result.usedReferences ? ` Worked from ${result.usedReferences} of their photo${result.usedReferences === 1 ? "" : "s"}.` : "";
  return {
    content: `Made the image: ${result.url}.${logoNote}${refNote} ${product ? `The seller can save it to ${product.name} from the card.` : "The seller can download it or ask you to use it on the store."} Not saved to any product yet.`,
    card: {
      type: "image",
      tool: "generate_product_image",
      title: product ? `New picture for ${product.name}` : result.usedLogo ? "New branded picture" : "New picture",
      before: result.usedReferences ? references[0] ?? null : null,
      after: result.url,
      product: product ? { id: product.id, name: product.name } : null,
      sourceIndex: null,
    },
  };
}

async function generateLogo(ctx: RexToolContext, input: RexToolInput<"generate_logo">): Promise<RexToolOutput> {
  if (!getOpenAIClient()) throw new RexToolError("Logos need an OpenAI key (OPENAI_API_KEY) on this account. Point the seller to /studio/logo later.");
  const store = await db.store.findUnique({ where: { id: ctx.storeId }, select: { name: true, description: true } });
  await meter(ctx, "image", LOGO_STYLES.length);
  const { logos, failures } = await drawLogoOptions(
    { businessName: input.businessName?.trim() || store?.name || ctx.storeName, business: input.about?.trim() || store?.description || "retail business", paletteHint: input.paletteHint ?? undefined, userId: ctx.userId },
    (prompt, path) => generateImage({ prompt, size: "1024x1024", path }),
  );
  if (!logos.length) throw new RexToolError(`None of the logos came back (${failures.join("; ").slice(0, 200)}). Nothing changed.`);
  return {
    content: `Made ${logos.length} logo options (${logos.map((logo) => logo.label).join(", ")}). The seller taps one to use it as the store logo; nothing is changed until then.`,
    card: { type: "logos", options: logos.map(({ url, label, palette }) => ({ url, label, palette })) },
  };
}

const VIDEO_LANGUAGE_NOTE: Record<VideoLanguage, string> = {
  english: "Nigerian English, warm and direct.",
  pidgin: "Nigerian Pidgin, natural and playful, the way Lagos sellers talk on WhatsApp status.",
  yoruba: "Yorùbá with correct tone marks.",
  hausa: "Hausa with correct hooked letters (ɓ, ɗ, ƙ).",
};

async function makeProductVideo(ctx: RexToolContext, input: RexToolInput<"make_product_video">): Promise<RexToolOutput> {
  const product = await findProduct(ctx, input.product);
  const own = (input.photos ?? []).filter((url) => isOwnImageUrl(url));
  let photos = (own.length ? own : product.images.filter(Boolean)).slice(0, MAX_PHOTOS);
  if (!photos.length) throw new RexToolError(`${product.name} has no photos, and a reel is made from photos. Ask the seller to add some, or make one with generate_product_image and pass it in photos.`);
  const language = input.language ?? "pidgin";
  const template: ReelTemplateId = input.template ?? (input.shots === "cutout" ? "float" : input.shots === "brand" ? "words" : "pop");

  // Clean the photos up into reel shots first (each is a picture), keeping any that don't come back.
  let shotNote = "";
  if (input.shots && input.shots !== "original") {
    const look = input.shots;
    const brand = await loadBrandContext(ctx.storeId);
    const sources = photos.slice(0, 4).filter((url) => isOwnImageUrl(url));
    const made: string[] = [];
    for (const [n, source] of sources.entries()) {
      let giveBack: () => Promise<void>;
      try {
        giveBack = await meter(ctx, "image");
      } catch (error) {
        if (!made.length) throw error;
        shotNote = ` Stopped after ${made.length} shot(s): ${error instanceof Error ? error.message : "allowance used up"}`;
        break;
      }
      try {
        made.push(await makeReelShot({ userId: ctx.userId, source, look, product: product.name, brand, n }));
      } catch (error) {
        await giveBack();
        if (error instanceof ImageUnavailableError) throw new RexToolError(`${error.message} The reel can still use the photos as they are (shots: original).`);
        console.error("[rex] reel shot failed", error);
        made.push(source);
      }
    }
    if (made.length) photos = made;
    shotNote ||= ` Made ${made.length} ${look} shot(s) for it.`;
  }
  const price = money(product.retailPrice);
  await meter(ctx, "text");
  const fallback = fallbackScript(product.name, price, language, photos.length);
  // Same brief as the video studio's script writer (/api/ai/video-script). Video scripts are written by Claude.
  const raw = await aiText({
    fast: true,
    prefer: "anthropic",
    prompt: [
      `Write a ${photos.length}-shot vertical product reel for a small Nigerian online shop.`,
      `Product: ${product.name}, ${price}.${product.description ? ` Details: ${product.description.slice(0, 600)}` : ""}`,
      `Language: ${VIDEO_LANGUAGE_NOTE[language]}`,
      `Return JSON only: {"captions": [${photos.length} on-screen lines, max 6 words each, one per photo], "voiceover": "2-3 short sentences, under 40 words, ends by telling viewers to tap the link", "cta": "end card line, max 5 words"}.`,
      "No emojis, no hashtags, no prices other than the one given, no claims you can't know (materials, origin) unless in the details.",
    ].join("\n"),
  });
  const script = normaliseScript(firstJsonObject(raw?.text ?? null), fallback, photos.length);
  return {
    content: `Prepared a ${photos.length}-shot "${reelTemplate(template).name}" reel for ${product.name} in ${language}, ${input.voice ?? "female"} Nigerian voice, ${input.music ?? defaultMood(template)} music, in the store's brand colours and logo.${shotNote} Captions: ${script.captions.join(" / ")}. Voiceover: ${script.voiceover}. The seller taps "Open in video studio" to preview it, change the voice (theirs, ElevenLabs or none) or music, and record it in their browser; a finished video uses one of the day's free videos, then credits.${raw ? "" : " (The writer was offline, so this is the starter script.)"}`,
    card: { type: "video", product: { id: product.id, name: product.name, photos }, language, script, template, voice: input.voice ?? "female", music: input.music ?? defaultMood(template) },
  };
}

// ─── Store design tools (draft only) ────────────────────────────────────────────

function storeOutput(ctx: RexToolContext, result: StudioEditResult | null, page: string | null): RexToolOutput {
  if (!result) throw new RexToolError("The store designer didn't answer. Nothing was changed; the seller can try again.");
  if (!result.changes.length || !result.draft) return { content: `Nothing was changed. The designer said: ${result.reply}` };
  ctx.draft = result.draft;
  ctx.versions = result.versions ?? ctx.versions;
  return {
    content: `Changed the DRAFT (version ${result.version?.n ?? "?"}): ${result.changes.join("; ")}. Designer's note: ${result.reply}. The seller sees it in the preview; shoppers see nothing until they press Publish.`,
    card: { type: "store", changes: result.changes, version: result.version, undoTo: result.undoTo, page },
  };
}

async function studioStore(ctx: RexToolContext) {
  const store = await loadStudioStore(ctx.userId);
  if (!store) throw new RexToolError("The store couldn't be loaded.");
  return store;
}

async function editStoreSection(ctx: RexToolContext, input: RexToolInput<"edit_store_section">): Promise<RexToolOutput> {
  const store = await studioStore(ctx);
  await meter(ctx, "text");
  const message = input.page ? `${input.instruction} (on the ${input.page === "home" ? "homepage" : `${input.page} page`})` : input.instruction;
  const result = await runStudioEdit(store, { message, history: ctx.history.slice(-8), imageUrls: ctx.newPhotos, label: input.instruction });
  return storeOutput(ctx, result, input.page);
}

async function rebuildSection(ctx: RexToolContext, input: RexToolInput<"rebuild_section">): Promise<RexToolOutput> {
  const store = await studioStore(ctx);
  await meter(ctx, "text");
  const result = await runStudioEdit(store, { message: rebuildInstruction(input), history: ctx.history.slice(-8), imageUrls: ctx.newPhotos, label: `Rebuilt ${input.section} (${input.page})` });
  return storeOutput(ctx, result, input.page);
}

async function switchThemeTool(ctx: RexToolContext, input: RexToolInput<"switch_theme">): Promise<RexToolOutput> {
  const store = await studioStore(ctx);
  if (!getTemplateManifest(input.themeId)) throw new RexToolError(`The ${input.themeId} theme isn't available.`);
  const currentId = studioDraft(store).draft.templateId;
  if (currentId === input.themeId) return { content: `The draft already uses the ${themeNameFor(input.themeId)} theme; nothing changed.` };
  const planProblem = await themeProblem(ctx.userId, input.themeId, currentId);
  if (planProblem) throw new RexToolError(`${planProblem} Nothing changed. Tell the seller they can preview it and buy it on its own in the theme gallery (Builder > Themes), or upgrade in Settings > Billing.`);
  const plan = parseRexStudioPlan({ reply: "", theme: input.themeId });
  if (!plan) throw new RexToolError("Couldn't switch the theme.");
  const result = await applyStudioPlan(store, plan, `Switched to ${themeNameFor(input.themeId)}`);
  return storeOutput(ctx, result, "home");
}

const STYLE_WORDS: Record<string, Record<string, string>> = {
  fontPair: { theme: "the theme's own fonts", classic: "serif headings with sans text", modern: "modern grotesk headings", clean: "clean sans fonts", bold: "bold grotesk fonts" },
  buttonShape: { theme: "the theme's own buttons", square: "square buttons", rounded: "rounded buttons", pill: "pill buttons" },
  pageWidth: { narrow: "narrow pages", standard: "standard-width pages", wide: "wide pages" },
  productRatio: { theme: "the theme's own photo shape", portrait: "portrait product photos", square: "square product photos", landscape: "landscape product photos" },
  headingStyle: { serif: "serif headings", grotesk: "modern headings" },
  radius: { sharp: "sharp corners", rounded: "rounded corners", soft: "soft corners" },
};

/** "Switched to bold grotesk fonts and pill buttons": the change line the seller sees. */
function styleSummary(picked: Record<string, unknown>, layout: string | null) {
  const words = Object.entries(picked).map(([key, value]) => STYLE_WORDS[key]?.[String(value)]).filter(Boolean) as string[];
  if (layout) words.push(`the ${layout.replace(/-/g, " ")} layout`);
  const list = words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0] ?? "a new style";
  return `Switched to ${list}`.slice(0, 90);
}

async function setThemeStyle(ctx: RexToolContext, input: RexToolInput<"set_theme_style">): Promise<RexToolOutput> {
  const store = await studioStore(ctx);
  const draft = studioDraft(store).draft;
  const boutique = isBoutiqueTheme(draft.templateId);
  const tokens = boutique
    ? { fontPair: input.fontPair, buttonShape: input.buttonShape, pageWidth: input.pageWidth, productRatio: input.productRatio }
    : { headingStyle: input.headingStyle, radius: input.corners };
  const asked = Object.values(input).some((value) => value !== null);
  const picked = Object.fromEntries(Object.entries(tokens).filter(([, value]) => value !== null));
  const layout = boutique ? null : input.layout;
  if (!Object.keys(picked).length && !layout) {
    if (!asked) return { content: "Nothing to change: no style was given." };
    return {
      content: boutique
        ? `${themeNameFor(draft.templateId)} is a 2026 theme: it takes fontPair, buttonShape, pageWidth and productRatio, not heading style, corners or a store layout. Nothing changed.`
        : `${themeNameFor(draft.templateId)} is a classic theme: it takes headingStyle, corners and layout, not font pairing, button shape, page width or photo shape. Nothing changed.`,
    };
  }
  // The token change and the layout change each get their own line (the plan adds the layout's).
  const plan = parseRexStudioPlan({ reply: "The seller can fine-tune these in the builder's Theme settings.", tokens: picked, tokensSummary: styleSummary(picked, null), layout });
  if (!plan) throw new RexToolError("Couldn't change the style.");
  const result = await applyStudioPlan(store, plan, styleSummary(picked, layout));
  if (!result.changes.length) return { content: "The draft already has those choices; nothing changed." };
  return storeOutput(ctx, result, "home");
}

// ─── Words and marketing ─────────────────────────────────────────────────────────

async function writeProductCopy(ctx: RexToolContext, input: RexToolInput<"write_product_copy">): Promise<RexToolOutput> {
  const product = await findProduct(ctx, input.product);
  await meter(ctx, "text");
  const result = await aiText({
    fast: true,
    system: `You write product descriptions for ${ctx.storeName}, a small online shop in Nigeria. Warm, confident Nigerian English unless asked otherwise. No emojis. Never invent prices, discounts, materials, sizes or delivery times that you were not given.`,
    prompt: [
      `Product: ${product.name}, ${money(product.retailPrice)}.`,
      product.description ? `Current description: ${product.description.slice(0, 1500)}` : "There is no description yet.",
      input.brief ? `The seller wants: ${input.brief}` : "",
      "Write the new description: one opening sentence on the benefit, then 3-5 short lines of details (each starting with '- '), under 120 words. Return only the description.",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if (!result) throw new RexToolError("The writer didn't answer. Nothing changed; write a suggestion in your reply instead.");
  const after = result.text.trim().slice(0, 3000);
  return {
    content: `Wrote a new description for ${product.name}. It is shown next to the current one with an Apply button; the product is NOT changed until the seller taps Apply.\n${after}`,
    card: { type: "copy", product: { id: product.id, name: product.name }, before: product.description ?? "", after },
  };
}

async function createSegment(ctx: RexToolContext, input: RexToolInput<"create_segment">): Promise<RexToolOutput> {
  const segment = await rexCreateSegment(ctx.storeId, input);
  const rules = describeSegmentRules(segment.rules, money);
  const summary = `Created the segment "${segment.name}" (${rules}), ${segment.count} ${segment.count === 1 ? "person" : "people"} in it now.`;
  await logActivity(ctx, { type: "marketing", title: `Rex created segment ${segment.name}`, description: summary, tool: "create_segment", link: "/home/marketing/segments", data: { segmentId: segment.id } });
  return { content: summary, card: { type: "marketing", kind: "segment", id: segment.id, title: segment.name, summary: rules, href: "/home/marketing/segments", canActivate: false } };
}

async function createCampaign(ctx: RexToolContext, input: RexToolInput<"create_campaign">): Promise<RexToolOutput> {
  const campaign = await rexCreateCampaign(ctx.storeId, input);
  const audience = input.audience === "segment" ? `the "${input.segment}" segment` : input.audience.replace(/_/g, " ");
  const summary = `Saved the email campaign "${campaign.subject}" for ${audience} as a draft. Nothing was sent.`;
  const href = `/home/marketing/campaigns/${campaign.id}`;
  await logActivity(ctx, { type: "marketing", title: `Rex drafted a campaign: ${campaign.subject}`, description: summary, tool: "create_campaign", link: href, data: { campaignId: campaign.id } });
  return { content: summary, card: { type: "marketing", kind: "campaign", id: campaign.id, title: campaign.name, summary: `Draft for ${audience}. Subject: ${campaign.subject}`, href, canActivate: false } };
}

async function createAutomation(ctx: RexToolContext, input: RexToolInput<"create_automation">): Promise<RexToolOutput> {
  const rule = await rexCreateAutomation(ctx.storeId, input);
  const hours = Math.round(rule.waitMinutes / 60);
  const wait = rule.waitMinutes ? ` after ${rule.waitMinutes >= 60 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${rule.waitMinutes} minutes`}` : "";
  const summary = `Set up the automation "${rule.name}" (email: "${input.subject}"${wait}). It is switched OFF until the seller turns it on.`;
  await logActivity(ctx, { type: "marketing", title: `Rex set up automation ${rule.name}`, description: summary, tool: "create_automation", link: "/home/automations", data: { automationId: rule.id } });
  return { content: summary, card: { type: "marketing", kind: "automation", id: rule.id, title: rule.name, summary: `Email: ${input.subject}${wait}. Off until you turn it on.`, href: "/home/automations", canActivate: true } };
}

// ─── Content (CMS collections) ───────────────────────────────────────────────

async function cmsCreateCollection(ctx: RexToolContext, input: RexToolInput<"cms_create_collection">): Promise<RexToolOutput> {
  try {
    const collection = await setupCollection(ctx.storeId, input);
    const fields = readFields(collection.fields).map((field) => `${field.label} (${FIELD_TYPE_INFO[field.type].label.toLowerCase()})`);
    const href = `/home/cms/${collection.id}`;
    const summary = `Set up the "${collection.name}" collection with these fields: ${fields.join(", ")}. Shoppers will find it at /${collection.slug} once an item is published.`;
    await logActivity(ctx, { type: "content", title: `Rex set up the ${collection.name} collection`, description: summary, tool: "cms_create_collection", link: href, data: { collectionId: collection.id } });
    return { content: summary, card: { type: "marketing", kind: "content", id: collection.id, title: collection.name, summary: `${fields.length} fields. Add items or ask me to write the first one.`, href, canActivate: false } };
  } catch (error) {
    if (error instanceof CmsError) throw new RexToolError(error.message);
    throw error;
  }
}

async function cmsWriteItem(ctx: RexToolContext, input: RexToolInput<"cms_write_item">): Promise<RexToolOutput> {
  await meter(ctx, "text");
  try {
    const { collection, item } = await draftItem(ctx.storeId, ctx.storeName, input, "rex");
    const href = `/home/cms/${collection.id}/${item.id}`;
    const summary = `Wrote "${item.title}" in ${collection.name} and saved it as a draft. Nothing is published until the seller presses Publish.`;
    await logActivity(ctx, { type: "content", title: `Rex drafted ${item.title}`, description: summary, tool: "cms_write_item", link: href, data: { itemId: item.id } });
    return { content: `${summary}\nSummary: ${item.excerpt}`, card: { type: "marketing", kind: "content", id: item.id, title: item.title, summary: `Draft in ${collection.name}. ${item.excerpt}`.slice(0, 240), href, canActivate: false } };
  } catch (error) {
    if (error instanceof CmsError) throw new RexToolError(error.message);
    throw error;
  }
}

// ─── Email templates ─────────────────────────────────────────────────────────

async function draftEmailTemplate(ctx: RexToolContext, input: RexToolInput<"draft_email_template">): Promise<RexToolOutput> {
  await meter(ctx, "text");
  try {
    const draft = await draftEmail(ctx.storeId, input.brief);
    const template = await saveDraftTemplate(ctx.storeId, draft, input.name || draft.subject.replace(/{{\s*\w+\s*}}/g, "").trim().slice(0, 80) || "New email", matchStarter(input.brief)?.category ?? "marketing");
    const href = `/home/marketing/templates/${template.id}`;
    const summary = `Designed the email "${template.name}" and saved it as a draft template (subject: "${draft.subject}"). Nothing was sent.`;
    await logActivity(ctx, { type: "marketing", title: `Rex designed an email: ${template.name}`, description: summary, tool: "draft_email_template", link: href, data: { templateId: template.id } });
    return { content: `${summary} ${draft.note}`, card: { type: "marketing", kind: "template", id: template.id, title: template.name, summary: `Draft. Subject: ${draft.subject}`, href, canActivate: false } };
  } catch (error) {
    if (error instanceof MarketingError) throw new RexToolError(error.message);
    throw error;
  }
}

async function improveEmailCopy(ctx: RexToolContext, input: RexToolInput<"improve_email_copy">): Promise<RexToolOutput> {
  const original = await findTemplate(ctx.storeId, input.template);
  if (!original) throw new RexToolError(`No saved template called "${input.template}".`);
  const blocks = readBlocks(original.bodyHtml);
  if (!blocks?.length) throw new RexToolError("That template is hand-written HTML, so it can't be edited block by block. Suggest changes in your reply.");
  await meter(ctx, "text");
  try {
    const draft = await draftEmail(ctx.storeId, input.instruction, { subject: original.subject, preheader: readPreheader(original.bodyHtml), blocks });
    if (!draft.ai) throw new RexToolError("The writer is offline, so nothing changed. Suggest the edits in your reply.");
    const copy = await saveDraftTemplate(ctx.storeId, draft, `${original.name} (Rex's edit)`, original.category);
    const href = `/home/marketing/templates/${copy.id}`;
    const summary = `Saved my edit of "${original.name}" as a new draft "${copy.name}". The original is unchanged; nothing was sent.`;
    await logActivity(ctx, { type: "marketing", title: `Rex edited an email: ${original.name}`, description: summary, tool: "improve_email_copy", link: href, data: { templateId: copy.id } });
    return { content: `${summary} ${draft.note}`, card: { type: "marketing", kind: "template", id: copy.id, title: copy.name, summary: `Draft. Subject: ${draft.subject}`, href, canActivate: false } };
  } catch (error) {
    if (error instanceof MarketingError) throw new RexToolError(error.message);
    throw error;
  }
}

// ─── Brand: style book, icon and favicon, print studio ───────────────────────

async function createBrandBook(ctx: RexToolContext, input: RexToolInput<"create_brand_book">): Promise<RexToolOutput> {
  await meter(ctx, "text", 2);
  let book: Awaited<ReturnType<typeof saveBrandBook>>;
  try {
    book = await saveBrandBook(ctx.storeId, await draftBrandBook(ctx.storeId, input.direction));
  } catch (error) {
    if (error instanceof BrandBookError) throw new RexToolError(error.message);
    throw error;
  }
  let applied = "";
  if (input.applyColours) {
    const store = await studioStore(ctx);
    const plan = parseRexStudioPlan({ reply: "", tokens: bookToThemeTokens(book.colours, book.typography.style), tokensSummary: `Brand colours from the style book (${book.paletteName})` });
    const result = plan ? await applyStudioPlan(store, plan, `Brand colours: ${book.paletteName}`) : null;
    if (result?.draft) {
      ctx.draft = result.draft;
      ctx.versions = result.versions ?? ctx.versions;
      applied = ` Applied the colours to the store DRAFT (version ${result.version?.n ?? "?"}); shoppers see nothing until Publish.`;
    }
  }
  await logActivity(ctx, { type: "brand", title: `Rex wrote the brand style book (${book.paletteName})`, tool: "create_brand_book", link: "/home/brand-kit/book" });
  return {
    content: `Wrote the style book "${book.paletteName}": tagline "${book.tagline}", colours ${Object.values(book.colours).join(", ")}, fonts ${book.typography.headings} and ${book.typography.body}, voice: ${book.voice.traits.join(", ")}.${applied} It's at /home/brand-kit/book, ready to print.${applied ? "" : " The store's colours are unchanged; the seller can apply them from the book or ask you."}`,
    card: {
      type: "brand",
      kind: "book",
      title: `${book.paletteName} style book`,
      summary: `${book.tagline} · ${book.typography.headings} + ${book.typography.body} · ${book.voice.traits.join(", ")}`,
      href: "/home/brand-kit/book",
      swatches: [book.colours.primary, book.colours.secondary, book.colours.accent, book.colours.background, book.colours.text],
    },
  };
}

const ICON_PROMPTS = {
  icon: "Turn this logo into a square brand icon (like an app icon or profile picture): keep the brand's symbol or initial and its colours, centred with generous padding on a solid brand-coloured or white square background. Bold, simple, readable at 64 pixels. Keep any letters exactly as in the logo; no new words.",
  favicon: "Turn this logo into a favicon for browser tabs: the simplest recognisable mark from the logo (its symbol or first letter) in its strongest brand colour, very bold, high contrast, filling a square with a little padding. Must read clearly at 16 to 32 pixels. No small text, no thin lines.",
} as const;

async function makeBrandIcon(ctx: RexToolContext, input: RexToolInput<"make_brand_icon">): Promise<RexToolOutput> {
  const store = await db.store.findUnique({ where: { id: ctx.storeId }, select: { logoUrl: true } });
  if (!store?.logoUrl || !isOwnImageUrl(store.logoUrl)) throw new RexToolError("The store has no logo yet. Offer generate_logo or uploading one in Brand kit first.");
  const references = await loadReferences([store.logoUrl]);
  if (!references.length) throw new RexToolError("The logo file can't be read (it needs to be a PNG, JPG or WebP). Ask the seller to upload a PNG logo in Brand kit.");
  const giveBack = await meter(ctx, "image");
  let url: string;
  try {
    url = await generateImage({ prompt: ICON_PROMPTS[input.kind], size: "1024x1024", references, path: `logos/${ctx.userId}/${input.kind}-${Date.now()}` });
  } catch (error) {
    await giveBack();
    imageFailure(error);
  }
  const what = input.kind === "icon" ? "logo icon" : "favicon";
  return {
    content: `Made the ${what} from the logo: ${url}. The seller taps "Use as ${what}" on the card to keep it; nothing changed yet.`,
    card: { type: "brand", kind: input.kind, title: input.kind === "icon" ? "New logo icon" : "New favicon", summary: input.kind === "icon" ? "Square mark for app icons and profile pictures." : "Shows in browser tabs and bookmarks.", href: "/home/brand-kit", image: url },
  };
}

const LOGO_STYLE_WORDS = { logo_text: "the logo with the store name beside it", logo: "the full logo on its own", icon_text: "the logo icon with the store name", icon: "the logo icon on its own", text: "the store name only" } as const;

async function setLogoDisplay(ctx: RexToolContext, input: RexToolInput<"set_logo_display">): Promise<RexToolOutput> {
  const store = await db.store.findUnique({ where: { id: ctx.storeId }, select: { brandSettings: true, logoUrl: true } });
  if (!store) throw new RexToolError("The store couldn't be loaded.");
  const settings = store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? (store.brandSettings as Record<string, unknown>) : {};
  const current = readLogoDisplay(settings);
  const next = { style: input.style ?? current.style, size: input.size ?? current.size };
  await db.store.update({ where: { id: ctx.storeId }, data: { brandSettings: { ...settings, logoDisplay: next } as Prisma.InputJsonValue } });
  const noLogo = next.style !== "text" && !store.logoUrl ? " The store has no logo yet, so the name shows until one is added (offer generate_logo)." : "";
  return {
    content: `The store header now shows ${LOGO_STYLE_WORDS[next.style]}, ${next.size} size, live on the store already (no publish needed). The seller can change it any time in Brand kit.${noLogo}`,
    card: { type: "brand", kind: "display", title: "Logo on your store", summary: `${LOGO_STYLE_WORDS[next.style][0].toUpperCase()}${LOGO_STYLE_WORDS[next.style].slice(1)}, ${next.size}.`, href: "/home/brand-kit", image: store.logoUrl ?? null },
  };
}

async function makePrintLabels(ctx: RexToolContext, input: RexToolInput<"make_print_labels">): Promise<RexToolOutput> {
  const ids: string[] = [];
  const names: string[] = [];
  for (const query of input.products ?? []) {
    const product = await findProduct(ctx, query);
    if (!ids.includes(product.id)) {
      ids.push(product.id);
      names.push(product.name);
    }
  }
  if (PRINT_SPECS[input.kind].perProduct && !ids.length) throw new RexToolError(`${input.kind} labels are for products: say which products (use list_products).`);
  const params = new URLSearchParams({ kind: input.kind });
  if (ids.length) params.set("products", ids.join(","));
  if (input.headline) params.set("headline", input.headline);
  if (input.note) params.set("note", input.note);
  if (input.qr) params.set("qr", input.qr);
  if (input.copies) params.set("copies", String(input.copies));
  const href = `/home/labels/studio?${params.toString()}`;
  const label = { tag: "Hang tags", price: "Price & barcode labels", qr: "QR code stickers", package: "Package labels", thanks: "Thank-you cards" }[input.kind];
  const count = Math.max(1, ids.length) * (input.copies ?? 1);
  // Saved to Labels and print so it's there later, not only in this chat.
  try {
    await saveLabelDesign({ storeId: ctx.storeId, userId: ctx.userId, title: `${label}${names.length ? ` · ${names.slice(0, 2).join(", ")}` : ""}`, kind: input.kind, href, productId: ids[0] ?? null, source: "rex" });
  } catch (error) {
    console.error("[rex] couldn't save the label setup", error);
  }
  return {
    content: `Set up ${count} ${label.toLowerCase()} ${names.length ? `for ${names.join(", ")}` : "for the store"} in the Print studio, in the store's brand, with real barcodes and QR codes. The seller opens the card to check them, then prints (A4 or a label printer), downloads a 300 dpi file, or emails it to a print shop. Saved on Labels and print (/home/labels).`,
    card: { type: "brand", kind: "print", title: label, summary: `${count} label${count === 1 ? "" : "s"}${names.length ? ` · ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}` : ""}${input.headline ? ` · "${input.headline}"` : ""}`, href },
  };
}

// ─── Packaging and marketing creatives ───────────────────────────────────────

async function designPackaging(ctx: RexToolContext, input: RexToolInput<"design_packaging">): Promise<RexToolOutput> {
  const product = input.product ? await findProduct(ctx, input.product) : null;
  const name = (input.name ?? product?.name ?? "").trim();
  if (!name) throw new RexToolError("Say which product the packaging is for (use list_products), or give its name.");
  const store = await db.store.findUnique({ where: { id: ctx.storeId }, select: { name: true, slug: true, customDomain: true, logoUrl: true } });
  const extra = product ? await db.storeProduct.findUnique({ where: { id: product.id }, select: { barcode: true } }) : null;
  const productType = input.productType ?? guessProductType(`${name} ${product?.description?.slice(0, 200) ?? ""}`);
  const website = store ? buildStorefrontUrl(store) : "";
  const design = newDesign({
    productType,
    format: input.format ?? undefined,
    style: input.style ?? undefined,
    brand: ctx.storeName,
    name: name.replace(/\s*[-–(].*$/, "").split(/\s+/).slice(0, 4).join(" "),
    productId: product?.id ?? null,
    image: product?.images[0] ?? null,
    logoUrl: store?.logoUrl ?? null,
    website: website.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    barcode: extra?.barcode && normaliseEan13(extra.barcode) ? extra.barcode : "",
    qrUrl: website,
  });
  const request = { storeName: ctx.storeName, productType, name, description: product?.description ?? null, price: product ? naira(Number(product.retailPrice) || 0) : null, brief: input.brief ?? null };
  let words = fallbackPackCopy(request);
  if (aiConfigured()) {
    await meter(ctx, "text");
    words = (await writePackCopy(request)) ?? words;
  }
  design.content = { ...design.content, ...words, brand: ctx.storeName };
  const title = `${name} · ${PACK_FORMAT_INFO[design.format].name}`;
  const row = await savePackagingDesign({ storeId: ctx.storeId, userId: ctx.userId, title, design, source: "rex" });
  const href = `/home/labels/packaging?design=${row.id}&from=rex`;
  const typeInfo = PRODUCT_TYPE_INFO[productType];
  return {
    content: `Designed ${PACK_FORMAT_INFO[design.format].name.toLowerCase()} packaging for ${name} in the "${PACK_STYLE_INFO[design.style].name}" template (${design.size.w} × ${design.size.h}${design.size.d ? ` × ${design.size.d}` : ""} mm), saved on Labels and print. Peggy wrote the words: "${design.content.name}"${design.content.tagline ? `, "${design.content.tagline}"` : ""}, with ${typeInfo.fields.filter((field) => field !== "nutrition").join(", ")} on the back.${typeInfo.regLabel ? ` Tell the seller to add their ${typeInfo.regLabel} and check the ingredients are true before printing.` : ""}${design.content.barcode ? "" : " No retail barcode yet (supermarkets need an EAN-13 from GS1 Nigeria)."} They open the card to change anything and download the print-ready PDF for their printer.`,
    card: { type: "brand", kind: "packaging", title, summary: `${PACK_STYLE_INFO[design.style].name} · ${design.content.tagline || design.content.variant || typeInfo.name}`, href, image: product?.images[0] ?? null },
  };
}

async function makeCreative(ctx: RexToolContext, input: RexToolInput<"make_creative">): Promise<RexToolOutput> {
  const products: Awaited<ReturnType<typeof findProduct>>[] = [];
  for (const query of input.products ?? []) {
    const found = await findProduct(ctx, query);
    if (!products.some((item) => item.id === found.id)) products.push(found);
  }
  const brand = await loadBrandContext(ctx.storeId);
  const references = [...products.map((product) => product.images[0]).filter((url): url is string => Boolean(url)), ...ctx.attachments.filter(isOwnImageUrl)].slice(0, 4);
  const giveBack = await meter(ctx, "image");
  const place = CREATIVE_PLACEMENT_INFO[input.placement];
  const prompt = creativePrompt({ placement: input.placement, concept: input.concept, headline: input.headline, subline: input.subline, cta: input.cta, products: products.map((product) => product.name), extra: input.extra, brandName: ctx.storeName });
  const mode = input.brand ?? "colours";
  let result: Awaited<ReturnType<typeof makeBrandImage>>;
  try {
    result = await makeBrandImage({ brand, prompt, size: imageSizeFor(place.shape), logo: mode === "logo", colours: mode !== "none", referenceUrls: references, path: `generated/${ctx.userId}/${Date.now()}` });
  } catch (error) {
    await giveBack();
    imageFailure(error);
  }
  const title = `${CREATIVE_CONCEPT_INFO[input.concept].name} · ${place.name}`;
  return {
    content: `Made the ${place.name.toLowerCase()} image (${CREATIVE_CONCEPT_INFO[input.concept].name.toLowerCase()}, ${place.ratio}): ${result.url}.${input.headline ? ` Lettered "${input.headline}" on it; ask the seller to check the spelling.` : ""} It's saved in their media library; they can download it or use it in an ad, a campaign, an email or on the store.`,
    card: { type: "image", tool: "generate_product_image", title, before: null, after: result.url, product: products[0] ? { id: products[0].id, name: products[0].name } : null, sourceIndex: null },
  };
}

type Runner<N extends RexToolName> = (ctx: RexToolContext, input: RexToolInput<N>) => Promise<RexToolOutput>;

export const REX_TOOL_RUNNERS: { [N in RexToolName]: Runner<N> } = {
  store_health: storeHealth,
  list_products: listProducts,
  list_themes: listThemes,
  open_preview: openPreview,
  edit_product_photo: editProductPhoto,
  remove_background: removeBackground,
  lifestyle_photo: lifestylePhoto,
  generate_product_image: generateProductImage,
  generate_logo: generateLogo,
  make_product_video: makeProductVideo,
  edit_store_section: editStoreSection,
  rebuild_section: rebuildSection,
  switch_theme: switchThemeTool,
  set_theme_style: setThemeStyle,
  write_product_copy: writeProductCopy,
  create_segment: createSegment,
  create_campaign: createCampaign,
  create_automation: createAutomation,
  cms_create_collection: cmsCreateCollection,
  cms_write_item: cmsWriteItem,
  draft_email_template: draftEmailTemplate,
  improve_email_copy: improveEmailCopy,
  create_brand_book: createBrandBook,
  make_brand_icon: makeBrandIcon,
  set_logo_display: setLogoDisplay,
  make_print_labels: makePrintLabels,
  design_packaging: designPackaging,
  make_creative: makeCreative,
};

export { MarketingError };
