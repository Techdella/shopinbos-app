import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import type { AuthUser } from "@/lib/auth/types";
import { DEFAULT_STORE_CONFIG, getOpenAIClient, type StoreConfig } from "@/lib/ai/client";
import { aiText, firstJsonObject, type ChatTurn } from "@/lib/ai/text";
import { generateImage } from "@/lib/ai/images";
import { meterAiCharged, refundAi } from "@/lib/ai/usage";
import { buildStoreJsonSystemPrompt, type BrandContext, type TemplateContext } from "@/lib/ai/rex/prompts";
import { hasInspiration, inspirationImages, type Inspiration } from "@/lib/ai/rex/inspiration";
import { isLibraryTheme } from "@/lib/store-templates/theme-library";
import { currencyFromPrice, parsePrice, validateStoreConfig } from "@/lib/ai/rex/store-config";
import {
  createBlankEditorSnapshot,
  createSnapshotFromTemplate,
  getCurrentTemplateMeta,
  getTemplateManifest,
  hydrateDraftFromStoreConfig,
  resolveDraftSnapshot,
  snapshotToStoreConfig,
  type StoreBrandSettingsLike,
  type StoreEditorSnapshot,
} from "@/lib/store-templates";
import { mergeBrandSettings, slugify } from "@/lib/workspace";

// Rex's one real "build my store" path. From a brief or conversation it designs a StoreConfig, writes the
// editor draft (same hydrate logic as PATCH /api/store/editor), seeds draft pages, adds clearly-labelled
// sample products when the seller has none, and optionally generates a hero and a product image.
// It never publishes: going live stays an explicit seller step (POST /api/store/editor/publish).

export class BuildStoreError extends Error {
  constructor(message: string, readonly code: string, readonly status = 500) {
    super(message);
  }
}

const LIVE_STATUSES = new Set(["active", "published"]);
export const HOME_PAGE_SLUG = "home";

const isHttpsUrl = (url: string | null | undefined): url is string => Boolean(url && /^https:\/\//.test(url));

export function isLiveStatus(status: string | null | undefined) {
  return LIVE_STATUSES.has(status ?? "");
}

export async function uniqueStoreSlug(baseName: string, userId: string, currentStoreId?: string) {
  const base = slugify(baseName) || `store-${userId.slice(0, 6)}`;
  const existing = await db.store.findUnique({ where: { slug: base }, select: { id: true } });
  if (!existing || existing.id === currentStoreId) return base;
  return `${base}-${userId.slice(0, 6)}`;
}

/** Home is stored as slug "home" (templates, /api/store/pages and the storefront all agree on it). */
export function pageSlugFor(page: { pageType: string; slug?: string | null }) {
  if (page.pageType === "home") return HOME_PAGE_SLUG;
  return page.slug?.trim() || page.pageType;
}

function normaliseHomeSlug(snapshot: StoreEditorSnapshot): StoreEditorSnapshot {
  return { ...snapshot, pages: snapshot.pages.map((page) => (page.pageType === "home" ? { ...page, slug: HOME_PAGE_SLUG } : page)) };
}

function withHeroImage(snapshot: StoreEditorSnapshot, imageUrl: string, storeName: string): StoreEditorSnapshot {
  let applied = false;
  return {
    ...snapshot,
    pages: snapshot.pages.map((page) => {
      if (page.pageType !== "home") return page;
      return {
        ...page,
        sections: page.sections.map((section) => {
          if (applied || section.kind !== "hero-split") return section;
          applied = true;
          const items = section.items?.length ? [...section.items] : [{ title: storeName, subtitle: "Hero image" }];
          items[0] = { ...items[0], imageUrl };
          return { ...section, items };
        }),
      };
    }),
  };
}

export interface WrittenDraft {
  store: { id: string; name: string; slug: string; status: string; live: boolean; currency: string };
  draft: StoreEditorSnapshot;
  pages: Array<{ id: string; slug: string; title: string; type: string }>;
  homePageId: string;
}

/**
 * Writes a StoreConfig as the store's editor draft and draft pages. A live store keeps its status, slug,
 * name and live look (theme tokens) until the seller publishes; a draft store takes the new name and slug.
 */
export async function writeStoreDraft(args: {
  user: AuthUser;
  config: StoreConfig;
  source: string;
  plan?: unknown;
  heroImageUrl?: string | null;
}): Promise<WrittenDraft> {
  const { user, config } = args;
  const existing = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, slug: true, status: true, brandSettings: true, currency: true },
  });
  const live = isLiveStatus(existing?.status);
  const brandSettings = ((existing?.brandSettings as Record<string, unknown> | null) ?? {}) as StoreBrandSettingsLike;
  const selected = getCurrentTemplateMeta(brandSettings);
  const manifest = selected ? getTemplateManifest(selected.templateId) : null;
  const fallback = manifest ? createSnapshotFromTemplate(manifest) : createBlankEditorSnapshot(config.name);

  const { slug: _slug, changed: _changed, logoUrl: _logo, ...editorSpec } = config;
  void _slug; void _changed; void _logo;
  const hydrated = hydrateDraftFromStoreConfig(brandSettings, editorSpec, fallback);
  let draft = normaliseHomeSlug(hydrated.updated);
  if (args.heroImageUrl) draft = withHeroImage(draft, args.heroImageUrl, config.name);

  const hydratedSettings = hydrated.brandSettings as Record<string, unknown>;
  const editorState = (hydratedSettings.editor && typeof hydratedSettings.editor === "object" ? hydratedSettings.editor : {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const nextSettings = mergeBrandSettings(
    {
      ...hydratedSettings,
      editor: { ...editorState, draft },
      // The storefront reads top-level theme tokens; a live store keeps its current look until publish.
      themeTokens: live ? (brandSettings as Record<string, unknown>).themeTokens : draft.themeTokens,
    },
    {
      onboardingMemory: { storeName: config.name, businessDescription: config.heroSubline, buildPath: "rex", updatedAt: now },
      setup: { storeBuilt: true },
      rexDraft: { generatedAt: now, source: args.source, plan: args.plan ?? null },
      ...(live
        ? {}
        : {
            tagline: config.tagline,
            palette: config.palette,
            fontStyle: config.fontStyle,
            heroHeadline: config.heroHeadline,
            heroSubline: config.heroSubline,
            heroCtaText: config.heroCtaText,
            navLinks: config.navLinks,
          }),
    },
  );

  let store: { id: string; name: string; slug: string; status: string; currency: string };
  if (existing && live) {
    store = await db.store.update({
      where: { id: existing.id },
      data: { brandSettings: nextSettings },
      select: { id: true, name: true, slug: true, status: true, currency: true },
    });
  } else if (existing) {
    const slug = existing.name.trim() === config.name.trim() ? existing.slug : await uniqueStoreSlug(config.name, user.id, existing.id);
    store = await db.store.update({
      where: { id: existing.id },
      data: { name: config.name, slug, description: config.heroSubline, onboardingState: "BUILDING_REX", brandSettings: nextSettings },
      select: { id: true, name: true, slug: true, status: true, currency: true },
    });
  } else {
    store = await db.store.create({
      data: {
        userId: user.id,
        name: config.name,
        slug: await uniqueStoreSlug(config.name, user.id),
        description: config.heroSubline,
        status: "draft",
        country: user.country ?? "Nigeria",
        city: user.city ?? "",
        currency: currencyFromPrice(config.products[0]?.price) ?? "NGN",
        onboardingState: "BUILDING_REX",
        brandSettings: nextSettings,
      },
      select: { id: true, name: true, slug: true, status: true, currency: true },
    });
  }

  // Draft page rows. Only the draft content changes: a page that is already live stays live.
  const pages: WrittenDraft["pages"] = [];
  let homePageId = "";
  for (const [order, page] of draft.pages.entries()) {
    const slug = pageSlugFor(page);
    const saved = await db.storePage.upsert({
      where: { storeId_slug: { storeId: store.id, slug } },
      update: { title: page.title, type: page.pageType, draftContent: page as unknown as Prisma.InputJsonValue, order },
      create: {
        storeId: store.id,
        title: page.title,
        slug,
        type: page.pageType,
        draftContent: page as unknown as Prisma.InputJsonValue,
        content: {},
        status: "draft",
        isPublished: false,
        order,
      },
      select: { id: true, slug: true, title: true, type: true },
    });
    pages.push(saved);
    if (saved.type === "home") homePageId = saved.id;
  }

  return { store: { ...store, live }, draft, pages, homePageId };
}

/** Up to six draft products from the plan, clearly marked as samples (name suffix, tag, description). */
export async function createSampleProducts(args: {
  storeId: string;
  userId: string;
  products: StoreConfig["products"];
  currency?: string | null;
}) {
  const created: Array<{ id: string; name: string; retailPrice: number; currency: string; imageUrl: string | null }> = [];
  // The builder's empty-state placeholders ("Product One", ₦0) are never turned into products.
  const placeholders = new Set(DEFAULT_STORE_CONFIG.products.map((product) => product.name.toLowerCase()));
  const real = args.products.filter((product) => product.name.trim() && !placeholders.has(product.name.trim().toLowerCase()));
  for (const product of real.slice(0, 6)) {
    const row = await db.storeProduct.create({
      data: {
        storeId: args.storeId,
        userId: args.userId,
        name: `${product.name} (sample)`.slice(0, 160),
        description: `${product.subtitle ? `${product.subtitle}. ` : ""}Sample product drafted by Rex: check the name, price, stock and photo before you publish it.`,
        images: isHttpsUrl(product.imageUrl) ? [product.imageUrl] : [],
        retailPrice: parsePrice(product.price) ?? 0,
        currency: currencyFromPrice(product.price) ?? args.currency ?? "NGN",
        status: "draft",
        tags: ["rex-sample"],
      },
      select: { id: true, name: true, retailPrice: true, currency: true, images: true },
    });
    created.push({ id: row.id, name: row.name, retailPrice: row.retailPrice, currency: row.currency, imageUrl: row.images[0] ?? null });
  }
  return created;
}

export interface BuildStoreInput {
  user: AuthUser;
  /** The conversation so far (oldest first, ending with the seller's turn), or a single brief. */
  messages?: ChatTurn[];
  brief?: string;
  /** A design already produced (e.g. by the streaming builder); skips the AI design step. */
  storeConfig?: unknown;
  brandContext?: BrandContext | null;
  templateContext?: TemplateContext | null;
  /** true: always add sample products. false: never. Unset: only when the store has no products. */
  sampleProducts?: boolean;
  /** Generate a hero banner and a product image (needs an OpenAI key). Default true. */
  generateImages?: boolean;
  source?: string;
  /** Stores, screenshots, a theme and a note the seller gave as inspiration (Rex Studio's build setup). */
  inspiration?: Inspiration | null;
  /**
   * Moves the draft onto a library theme before the design is written into it: the seller's pick, or the one Rex
   * chose from their inspiration. Passed in by the route so this module doesn't import the Studio's.
   */
  switchTheme?: (themeId: string) => Promise<boolean>;
}

export interface BuildStoreResult {
  store: WrittenDraft["store"];
  config: StoreConfig;
  provider: "anthropic" | "openai" | null;
  pages: WrittenDraft["pages"];
  homePageId: string;
  /** The editor draft as saved. */
  draft: StoreEditorSnapshot;
  previewUrl: string;
  products: Array<{ id: string; name: string; retailPrice: number; currency: string; imageUrl: string | null }>;
  images: { hero: string | null; product: string | null };
  notes: string[];
  /** The theme the build moved the draft onto, when it switched. */
  themeId: string | null;
}

async function currentConfigFor(userId: string): Promise<StoreConfig | null> {
  const store = await db.store.findUnique({ where: { userId }, select: { name: true, brandSettings: true } });
  if (!store) return null;
  const draft = resolveDraftSnapshot(((store.brandSettings as Record<string, unknown> | null) ?? {}) as StoreBrandSettingsLike, null);
  if (!draft) return null;
  const result = validateStoreConfig(snapshotToStoreConfig(draft, store.name));
  return result.ok ? result.config : null;
}

async function designStore(input: BuildStoreInput, currentStore: StoreConfig | null) {
  const messages = input.messages?.filter((turn) => turn.content.trim()).slice(-24) ?? [];
  if (!messages.length && !input.brief?.trim()) {
    throw new BuildStoreError("Tell Rex about the business first: what you sell and who it's for.", "BAD_REQUEST", 400);
  }
  const images = inspirationImages(input.inspiration);
  const ask = (withImages: boolean) => aiText({
    system: buildStoreJsonSystemPrompt({
      brandContext: input.brandContext,
      templateContext: input.templateContext,
      currentStore,
      inspiration: input.inspiration,
      // Rex picks a theme only from inspiration, and only when the seller didn't pick one.
      chooseTheme: hasInspiration(input.inspiration) && !input.inspiration?.themeId,
    }),
    ...(withImages && images.length ? { images } : {}),
    ...(messages.length
      ? { messages: input.brief?.trim() ? [...messages, { role: "user" as const, content: `Build brief: ${input.brief.trim()}` }] : messages }
      : { prompt: input.brief!.trim() }),
    maxTokens: 16000,
  });
  // A picture the AI can't open (a store's share picture behind a block) fails the whole call: try once without.
  const reply = (await ask(true)) ?? (images.length ? await ask(false) : null);
  if (!reply) {
    throw new BuildStoreError("Rex's AI isn't available right now (no working OpenAI or Anthropic key). Nothing was changed.", "AI_UNAVAILABLE", 503);
  }
  const raw = firstJsonObject(reply.text);
  if (!raw) throw new BuildStoreError("Rex's store design came back in a format that couldn't be read. Nothing was changed; try again.", "CONFIG_PARSE", 502);
  const validated = validateStoreConfig(raw, currentStore);
  if (!validated.ok) throw new BuildStoreError(`${validated.error} Nothing was changed; try again.`, "CONFIG_INVALID", 502);
  return {
    config: validated.config,
    provider: reply.provider,
    heroImagePrompt: typeof raw.heroImagePrompt === "string" ? raw.heroImagePrompt.slice(0, 600) : null,
    productImagePrompt: typeof raw.productImagePrompt === "string" ? raw.productImagePrompt.slice(0, 600) : null,
    storyImagePrompt: typeof raw.storyImagePrompt === "string" ? raw.storyImagePrompt.slice(0, 600) : null,
    themeId: typeof raw.themeId === "string" && isLibraryTheme(raw.themeId.trim()) ? raw.themeId.trim() : null,
  };
}

export async function buildStore(input: BuildStoreInput): Promise<BuildStoreResult> {
  const { user } = input;
  const notes: string[] = [];
  const currentStore = await currentConfigFor(user.id);

  let config: StoreConfig;
  let provider: BuildStoreResult["provider"] = null;
  let heroImagePrompt: string | null = null;
  let productImagePrompt: string | null = null;
  let storyImagePrompt: string | null = null;
  let chosenTheme: string | null = input.inspiration?.themeId && isLibraryTheme(input.inspiration.themeId) ? input.inspiration.themeId : null;
  if (input.storeConfig) {
    const validated = validateStoreConfig(input.storeConfig, currentStore);
    if (!validated.ok) throw new BuildStoreError(validated.error, "CONFIG_INVALID", 400);
    config = validated.config;
  } else {
    const designed = await designStore(input, currentStore);
    ({ config, provider, heroImagePrompt, productImagePrompt, storyImagePrompt } = designed);
    chosenTheme ??= designed.themeId;
  }
  let themeId: string | null = null;
  if (chosenTheme && input.switchTheme && (await input.switchTheme(chosenTheme))) themeId = chosenTheme;

  // Sample products: only for a store with no products, or when the seller asked for them.
  const existingStore = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  const productCount = existingStore
    ? await db.storeProduct.count({ where: { storeId: existingStore.id, status: { not: "archived" } } })
    : 0;
  const createSamples = input.sampleProducts === false ? false : input.sampleProducts === true || productCount === 0;
  if (!createSamples && productCount > 0) notes.push(`Kept your ${productCount} existing product${productCount === 1 ? "" : "s"}; no sample products added.`);

  // Images (hero banner + first product), only with an OpenAI key and within the image limit.
  const images: BuildStoreResult["images"] = { hero: null, product: null };
  if (input.generateImages !== false) {
    if (!getOpenAIClient()) {
      notes.push("Images were skipped: image generation needs an OpenAI key (OPENAI_API_KEY). The store uses colour blocks until you add photos.");
    } else {
      const firstProduct = config.products[0];
      const wantProduct = Boolean(
        firstProduct && !isHttpsUrl(firstProduct.imageUrl) && !DEFAULT_STORE_CONFIG.products.some((placeholder) => placeholder.name === firstProduct.name),
      );
      const jobs: Array<Promise<void>> = [];
      const stamp = Date.now();
      // A picture the image service fails to make is given back (allowance and any credits it took).
      const giveBack = (credits: number) => async (error: unknown) => {
        await refundAi(user.id, "image", 1, credits);
        throw error;
      };
      const heroMeter = await meterAiCharged(user.id, "image");
      if (!heroMeter.blocked) {
        jobs.push(
          generateImage({
            prompt: `${heroImagePrompt ?? `A bright, premium lifestyle photo for the online store "${config.name}": ${config.heroSubline}`}. Wide banner composition with calm space on one side. No text, words, letters or logos.`,
            size: "1536x1024",
            path: `generated/${user.id}/rex-hero-${stamp}`,
          }).then((url) => { images.hero = url; }, giveBack(heroMeter.credits)),
        );
      } else {
        notes.push("Hero image skipped: today's image limit is used up.");
      }
      if (wantProduct && firstProduct) {
        const productMeter = await meterAiCharged(user.id, "image");
        if (!productMeter.blocked) {
          jobs.push(
            generateImage({
              prompt: `${productImagePrompt ?? `Clean studio product photo of ${firstProduct.name} (${firstProduct.subtitle}) for an online store`}. Soft natural light, plain light background. No text or logos.`,
              size: "1024x1024",
              path: `generated/${user.id}/rex-product-${stamp}`,
            }).then((url) => { images.product = url; }, giveBack(productMeter.credits)),
          );
        } else {
          notes.push("Product image skipped: today's image limit is used up.");
        }
      }
      const results = await Promise.allSettled(jobs);
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[rex/build-store] image failed", result.reason);
          notes.push(`An image couldn't be generated (${result.reason instanceof Error ? result.reason.message : "image service error"}); the store uses colour blocks there.`);
        }
      }
      if (images.product && config.products[0]) {
        config = { ...config, products: config.products.map((product, index) => (index === 0 ? { ...product, imageUrl: images.product! } : product)) };
      }
    }
  }

  const written = await writeStoreDraft({
    user,
    config,
    source: input.source ?? "rex-build",
    heroImageUrl: images.hero,
    // The photo step of a full build (src/lib/ai/rex/full-build.server.ts) reads these.
    plan: { heroImagePrompt, productImagePrompt, storyImagePrompt },
  });
  if (written.store.live) notes.push("Your store is live, so these changes are saved as a draft. Shoppers see them only after you publish.");

  const products = createSamples ? await createSampleProducts({ storeId: written.store.id, userId: user.id, products: config.products, currency: written.store.currency }) : [];
  for (const product of products) {
    if (product.retailPrice === 0) notes.push(`"${product.name}" has no price yet; set one before publishing it.`);
  }

  return {
    store: written.store,
    config,
    provider,
    pages: written.pages,
    homePageId: written.homePageId,
    draft: written.draft,
    previewUrl: written.homePageId ? `/preview/store/${written.store.slug}/${written.homePageId}` : "/studio",
    products,
    images,
    notes,
    themeId,
  };
}
