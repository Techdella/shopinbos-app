import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl, buildPlatformStoreBase } from "@/lib/domains/storefront";
import { notify } from "@/lib/notifications/notify.server";
import { trackServerEvent } from "@/lib/platform-analytics/track.server";
import { publishStoreDraft } from "@/lib/store-publishing";
import { editorCatalog, rendererOf } from "@/lib/store-editor/mobile.server";
import { replaceSetupDeliveryAreas, setPaymentMethods, SetupError } from "@/lib/setup/server";
import { saveSellerBusinessAddress } from "@/lib/seller-settings.server";
import { readBusinessAddress } from "@/lib/email/shell";
import { DEMO_PHOTOS, unsplashUrl } from "@/lib/store-templates/demo-photos";
import { themeLibraryEntry } from "@/lib/store-templates/theme-library";
import {
  createSnapshotFromTemplate,
  getCurrentTemplateMeta,
  getTemplateManifest,
  resolveDraftSnapshot,
  updateDraftFromSnapshot,
  type StoreBrandSettingsLike,
  type StoreEditorSnapshot,
} from "@/lib/store-templates";
import { tFor } from "@shared/i18n/catalog";
import { isLocale, type Locale } from "@shared/i18n";
import { parsePreferences } from "@shared/preferences";
import { realName } from "@shared/person-name";
import { draftVersion, newSectionId, type EdSection, type EdSnapshot } from "@shared/store-editor";
import {
  applyRexBuild,
  cleanEventProps,
  cleanFirstName,
  dueOnboardingNudge,
  goLiveBlockers,
  groupProducts,
  mergeRexBuild,
  pricesToCheck,
  readRexBuild,
  shopReadyChecklist,
  stepsLeft,
  type DeliveryAreaChoice,
  type LibraryCategory,
  type LibraryPhoto,
  type OnboardingEvent,
  type RexBuildMemory,
  type ShopReadyFacts,
} from "@shared/seller-onboarding";

// Seller onboarding on the phone, "Rex builds your shop" (shared/seller-onboarding.ts has the rules; the routes are
// src/app/api/mobile/onboarding/**). The seller's answers live in Store.brandSettings.onboardingMemory.rexBuild, so
// the app reopens where they left off. Rex builds into the store editor's DRAFT (the same draft the phone's store
// editor and the web builder edit: brandSettings.editor.draft) and going live publishes it with the same
// publishStoreDraft as the editor's Publish. No new table.

export class RexBuildError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** brandSettings with the onboarding memory's rexBuild part replaced. */
function withFlow(brandSettings: unknown, flow: RexBuildMemory): Record<string, unknown> {
  const settings = record(brandSettings);
  const memory = record(settings.onboardingMemory);
  return { ...settings, onboardingMemory: { ...memory, version: 1, rexBuild: flow } };
}

function isLive(store: { status: string; onboardingState: string | null; brandSettings: unknown }) {
  // Same rule as the onboarding status: Store.status defaults to "active", so it alone doesn't mean launched.
  return store.onboardingState === "LIVE" || (store.status === "active" && Boolean(record(record(store.brandSettings).editor).published));
}

// ─── Loading and saving the seller's answers ─────────────────────────────────

export async function loadRexBuild(userId: string) {
  const [user, store] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, phone: true } }),
    db.store.findUnique({
      where: { userId },
      select: { id: true, name: true, slug: true, status: true, onboardingState: true, customDomain: true, logoUrl: true, city: true, brandSettings: true, firstDashboardVisitComplete: true },
    }),
  ]);
  if (!store) return { store: null, owner: { firstName: cleanFirstName(realName(user?.name ?? "")), phone: user?.phone ?? "" }, flow: {} as RexBuildMemory };

  const [products, collections, liveChat] = await Promise.all([
    db.storeProduct.findMany({
      where: { storeId: store.id, status: { not: "archived" } },
      orderBy: { createdAt: "asc" },
      take: 60,
      select: { id: true, name: true, retailPrice: true, images: true, supplierProductId: true },
    }),
    db.collection.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" }, take: 30, select: { id: true, name: true, products: { select: { productId: true } } } }).catch(() => []),
    db.liveChatConfig.findUnique({ where: { storeId: store.id }, select: { whatsappNumber: true } }).catch(() => null),
  ]);

  const flow = readRexBuild(store.brandSettings);
  const address = readBusinessAddress(store.brandSettings);
  const template = getCurrentTemplateMeta(record(store.brandSettings) as StoreBrandSettingsLike);
  const productRows = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.retailPrice > 0 ? product.retailPrice : null,
    image: product.images[0] ?? null,
    supplier: Boolean(product.supplierProductId),
  }));
  const url = buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain });
  return {
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      url,
      host: buildPlatformStoreBase(store.slug).replace(/^https?:\/\//, ""),
      live: isLive(store),
      logoUrl: store.logoUrl,
      city: store.city ?? "",
      state: address.state,
      finished: store.firstDashboardVisitComplete,
      /** The look the draft is on (null before one is picked). */
      themeId: template?.templateId ?? null,
    },
    owner: { firstName: flow.firstName || cleanFirstName(realName(user?.name ?? "")), phone: user?.phone ?? "" },
    flow,
    products: productRows,
    collections: collections.map((collection) => ({ id: collection.id, name: collection.name, productIds: collection.products.map((entry) => entry.productId) })),
    /** Rex's first sort of the products (D1b), and the ones whose price looks off. */
    suggestedGroups: groupProducts(productRows, "More products"),
    priceChecks: pricesToCheck(productRows),
    contact: {
      whatsapp: flow.contact?.whatsapp || liveChat?.whatsappNumber || address.phone || user?.phone || "",
      pickup: flow.contact?.pickup ?? address.line1 ?? "",
    },
  };
}

export type RexBuildState = Awaited<ReturnType<typeof loadRexBuild>>;

/** Saves a step's answers on top of what's saved; the time of the last activity goes with it (for the nudge). */
export async function saveRexBuild(userId: string, patch: Partial<RexBuildMemory>) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, brandSettings: true } });
  if (!store) throw new RexBuildError("Set up your shop first.", "NOT_FOUND", 404);
  const now = new Date();
  const current = readRexBuild(store.brandSettings);
  const flow = mergeRexBuild(current, { ...patch, lastActivityAt: now.toISOString(), startedAt: current.startedAt ?? patch.startedAt ?? now.toISOString() }, now);
  await db.store.update({ where: { id: store.id }, data: { brandSettings: asJson(withFlow(store.brandSettings, flow)) } });
  return flow;
}

/** B2: what Rex calls the seller. Saved as the account's name too when the account has none yet. */
export async function saveFirstName(userId: string, firstName: string) {
  const name = cleanFirstName(firstName);
  if (!name) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (user && !realName(user.name ?? "").trim()) await db.user.update({ where: { id: userId }, data: { name } });
  return name;
}

// ─── D1b: categories ─────────────────────────────────────────────────────────

function collectionSlug(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "category";
}

/** Saves the categories the seller confirmed: each becomes a collection (made or reused by name) with its products. */
export async function saveCategories(userId: string, groups: Array<{ name: string; productIds: string[] }>) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  if (!store) throw new RexBuildError("Set up your shop first.", "NOT_FOUND", 404);
  const owned = new Set((await db.storeProduct.findMany({ where: { storeId: store.id }, select: { id: true } })).map((row) => row.id));
  const saved: Array<{ id: string; name: string; productIds: string[] }> = [];
  for (const [index, group] of groups.entries()) {
    const name = group.name.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!name) continue;
    const slug = collectionSlug(name);
    const collection = await db.collection.upsert({
      where: { storeId_slug: { storeId: store.id, slug } },
      create: { storeId: store.id, name, slug, type: "manual", sortOrder: index },
      update: { name, sortOrder: index },
      select: { id: true, name: true },
    });
    const productIds = [...new Set(group.productIds)].filter((id) => owned.has(id));
    for (const [order, productId] of productIds.entries()) {
      await db.collectionProduct.upsert({
        where: { collectionId_productId: { collectionId: collection.id, productId } },
        create: { collectionId: collection.id, productId, sortOrder: order },
        update: { sortOrder: order },
      });
    }
    saved.push({ id: collection.id, name: collection.name, productIds });
  }
  await saveRexBuild(userId, { categoriesConfirmed: true });
  return saved;
}

// ─── D4c: contact and delivery ───────────────────────────────────────────────

/**
 * Saves the contact page's facts where the shop already keeps them: the WhatsApp number (the business address's phone
 * and the WhatsApp chat button's number), the delivery areas (the same delivery areas as Start here), the pickup
 * address (delivery settings) and pay on delivery (the payment choices; a plan without it answers `podProblem`).
 */
export async function saveContact(userId: string, contact: { whatsapp: string; areas: DeliveryAreaChoice[]; pickup?: string; pod: boolean }) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  if (!store) throw new RexBuildError("Set up your shop first.", "NOT_FOUND", 404);
  const whatsapp = contact.whatsapp.trim().slice(0, 40);
  await saveSellerBusinessAddress(userId, { phone: whatsapp });
  await db.liveChatConfig
    .upsert({ where: { storeId: store.id }, create: { storeId: store.id, whatsappNumber: whatsapp }, update: { whatsappNumber: whatsapp } })
    .catch(() => null);
  if (contact.areas.length) {
    await replaceSetupDeliveryAreas(store.id, contact.areas.map((area) => ({ name: area.state, fee: area.fee, regions: [area.state] })));
  }
  const pickup = (contact.pickup ?? "").trim().slice(0, 200);
  await db.deliverySettings
    .upsert({ where: { userId }, create: { userId, selfPickup: Boolean(pickup), pickupAddress: pickup || null }, update: { selfPickup: Boolean(pickup), pickupAddress: pickup || null } })
    .catch(() => null);
  let podProblem: string | null = null;
  try {
    await setPaymentMethods(store.id, { cod: contact.pod });
  } catch (error) {
    if (error instanceof SetupError) podProblem = error.message;
    else throw error;
  }
  await saveRexBuild(userId, { contact: { whatsapp, areas: contact.areas, pickup, pod: contact.pod && !podProblem } });
  return { podProblem };
}

// ─── D4a: Rex's photo library ────────────────────────────────────────────────

/**
 * Rex's photo library: the hand-picked Unsplash photos the theme previews use (src/lib/store-templates/demo-photos.ts;
 * Unsplash's licence allows this and asks they load from images.unsplash.com), grouped as hair and beauty, people
 * and backgrounds, plus the seller's own product photos. TODO(licence): confirm before launch that sellers may use
 * these in their own shops (spec §8, "Rex's photo library").
 */
export function rexLibrary(productImages: string[] = []): LibraryPhoto[] {
  const photos: LibraryPhoto[] = [];
  for (const [themeId, set] of Object.entries(DEMO_PHOTOS)) {
    const beauty = (themeLibraryEntry(themeId)?.categories ?? []).includes("beauty");
    photos.push({ id: `${themeId}-hero`, url: unsplashUrl(set.hero, 1600, 1000), thumb: unsplashUrl(set.hero, 400, 500), category: beauty ? "beauty" : "backgrounds", licence: "unsplash" });
    photos.push({ id: `${themeId}-story`, url: unsplashUrl(set.story, 1000, 1250), thumb: unsplashUrl(set.story, 400, 500), category: beauty ? "beauty" : "people", licence: "unsplash" });
  }
  for (const [index, url] of productImages.slice(0, 24).entries()) photos.push({ id: `mine-${index}`, url, thumb: url, category: "mine", licence: "own" });
  return photos;
}

/** The library for a seller: their shop's own category first (hair and beauty for a beauty shop). */
export function libraryFor(categories: string[] | undefined, productImages: string[]) {
  const all = rexLibrary(productImages);
  const lead: LibraryCategory = (categories ?? []).includes("hair_beauty") ? "beauty" : "people";
  return [...all.filter((photo) => photo.category === lead), ...all.filter((photo) => photo.category !== lead)];
}

// ─── E1: building the draft ──────────────────────────────────────────────────

function settingsOf(brandSettings: unknown) {
  return record(brandSettings) as StoreBrandSettingsLike;
}

/**
 * Rex's guided build (E1): the seller's answers applied to the store editor's draft (shared/seller-onboarding.ts
 * applyRexBuild), saved as the draft with a new version stamp. Nothing goes live here. When the seller left the
 * building screen, Peggy pushes "Your shop is ready".
 */
export async function buildShopDraft(userId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, name: true, brandSettings: true } });
  if (!store) throw new RexBuildError("Set up your shop first.", "NOT_FOUND", 404);
  const settings = settingsOf(store.brandSettings);
  const template = getCurrentTemplateMeta(settings);
  const manifest = template ? getTemplateManifest(template.templateId) : null;
  const draft = resolveDraftSnapshot(settings, manifest ? createSnapshotFromTemplate(manifest) : null);
  if (!draft) throw new RexBuildError("Pick a style first.", "NO_LOOK", 409);

  const flow = readRexBuild(store.brandSettings);
  const renderer = rendererOf(draft);
  const built = applyRexBuild(draft as unknown as EdSnapshot, {
    flow,
    storeName: store.name,
    renderer,
    catalog: editorCatalog(renderer) as unknown as Record<string, EdSection>,
    newId: (kind) => newSectionId(kind),
  });
  const stamp = new Date(Math.max(Date.now(), (Date.parse(draftVersion(draft as unknown as EdSnapshot)) || 0) + 1)).toISOString();
  const next = { ...(built.snapshot as unknown as StoreEditorSnapshot), updatedAt: stamp };

  // Read again just before writing: the phone may have saved "tell me when it's ready" meanwhile.
  const fresh = await db.store.findUnique({ where: { id: store.id }, select: { brandSettings: true } });
  const freshFlow = readRexBuild(fresh?.brandSettings ?? store.brandSettings);
  const doneFlow = mergeRexBuild(freshFlow, { builtAt: new Date().toISOString(), builtPages: built.pages, screen: freshFlow.screen === "building" ? "review" : freshFlow.screen });
  const saved = withFlow(updateDraftFromSnapshot(settingsOf(fresh?.brandSettings ?? store.brandSettings), next), doneFlow);
  await db.store.update({ where: { id: store.id }, data: { brandSettings: asJson(saved) } });

  if (freshFlow.notifyWhenBuilt) {
    const t = tFor(await userLocale(userId), "m_rexBuild");
    await notify({
      userId,
      category: "account",
      priority: "success",
      title: t("review.title"),
      description: t("review.sub"),
      appRoute: "/onboarding/review",
      link: "/home",
      dedupeKey: `shop-built:${store.id}:${stamp}`,
      pushPlatforms: ["app"],
    }).catch((error) => console.error("[rex-build] ready push failed", error));
  }
  return { version: stamp, pages: built.pages, done: built.done };
}

// ─── E2 / E3: go live ────────────────────────────────────────────────────────

async function liveFacts(userId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, name: true, slug: true, customDomain: true, createdAt: true, brandSettings: true } });
  if (!store) throw new RexBuildError("Set up your shop first.", "NOT_FOUND", 404);
  const [pricedProducts, products, liveChat, user] = await Promise.all([
    db.storeProduct.count({ where: { storeId: store.id, status: { not: "archived" }, retailPrice: { gt: 0 } } }),
    db.storeProduct.count({ where: { storeId: store.id, status: { not: "archived" } } }),
    db.liveChatConfig.findUnique({ where: { storeId: store.id }, select: { whatsappNumber: true } }).catch(() => null),
    db.user.findUnique({ where: { id: userId }, select: { phone: true } }),
  ]);
  const flow = readRexBuild(store.brandSettings);
  const whatsapp = flow.contact?.whatsapp || liveChat?.whatsappNumber || readBusinessAddress(store.brandSettings).phone || user?.phone || "";
  return { store, flow, products, blockers: goLiveBlockers({ pricedProducts, name: store.name, slug: store.slug, whatsapp }) };
}

export async function goLiveBlockersFor(userId: string) {
  return (await liveFacts(userId)).blockers;
}

/**
 * "I love it, go live": the friendly blockers first (a priced product, a name and link, a WhatsApp number), then the
 * draft is published through the same publishStoreDraft as the store editor's Publish (the shop becomes live).
 */
export async function goLive(userId: string) {
  const facts = await liveFacts(userId);
  if (facts.blockers.length) return { live: false as const, blockers: facts.blockers };
  await publishStoreDraft({ userId });
  const liveAt = new Date();
  const flow = await saveRexBuild(userId, { liveAt: liveAt.toISOString(), screen: "live" });
  const started = Date.parse(flow.startedAt ?? facts.store.createdAt.toISOString());
  await trackOnboarding(userId, "shop_went_live", { secondsFromStart: Math.round((liveAt.getTime() - started) / 1000), productCount: facts.products, mode: flow.mode ?? "start" });
  return { live: true as const, url: buildStorefrontUrl(facts.store), pages: flow.builtPages ?? null };
}

// ─── F: Home "Get your shop ready" ───────────────────────────────────────────

export async function shopReadyFor(userId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, customDomain: true, brandSettings: true } });
  if (!store) return null;
  const settings = record(store.brandSettings);
  const bank = record(settings.payoutBank);
  const methods = record(record(settings.paymentConfig).methods);
  const [products, partners, delivery, wallet, socials, posts, statusPosts] = await Promise.all([
    db.storeProduct.count({ where: { storeId: store.id, status: { not: "archived" } } }),
    db.deliveryConnection.count({ where: { ownerUserId: userId, status: "active" } }).catch(() => 0),
    db.deliverySettings.findUnique({ where: { userId }, select: { selfDelivery: true } }).catch(() => null),
    db.wallet.findUnique({ where: { userId }, select: { subaccountStatus: true } }).catch(() => null),
    db.inboxChannel.count({ where: { storeId: store.id, channel: { in: ["whatsapp", "messenger", "instagram"] }, status: "connected" } }).catch(() => 0),
    db.socialPost.count({ where: { storeId: store.id } }).catch(() => 0),
    db.statusPost.count({ where: { authorId: userId } }).catch(() => 0),
  ]);
  const onlineOrders = await db.retailOrder.count({ where: { storeId: store.id, channel: "online_store" } }).catch(() => 0);
  const facts: ShopReadyFacts = {
    payoutBank: Boolean(bank.paystackRecipientCode || bank.accountNumberMask) || ["active", "review"].includes(wallet?.subaccountStatus ?? ""),
    deliveryPartners: partners,
    deliversSelf: Boolean(delivery?.selfDelivery),
    podOn: methods.cod === true,
    shared: Boolean(record(record(settings.setup).start).sharedAt) || onlineOrders > 0,
    posts: posts + statusPosts,
    products,
    socialsConnected: socials,
    customDomain: Boolean(store.customDomain),
  };
  return { facts, ...shopReadyChecklist(facts) };
}

// ─── Analytics (spec §7) ─────────────────────────────────────────────────────

/** One onboarding event to the analytics tools, as the seller (never throws). */
export async function trackOnboarding(userId: string, event: OnboardingEvent, props: unknown = {}) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { supabaseId: true } }).catch(() => null);
  await trackServerEvent({ event, distinctId: user?.supabaseId ?? userId, properties: { ...cleanEventProps(props), app: "mobile" } }).catch(() => undefined);
}

// ─── Re-engagement: Peggy's nudge after 24 hours (two at most) ───────────────

async function userLocale(userId: string): Promise<Locale> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { preferences: true } }).catch(() => null);
  const language = parsePreferences(user?.preferences).language;
  return language && isLocale(language) ? language : "en";
}

/**
 * Hourly (with the lifecycle cron): sellers who started Rex's build, aren't live and haven't been back for a day get
 * Peggy's nudge on WhatsApp (and push): "Your shop is 3 steps away. Tap to finish." Two at most, a day apart. The
 * first one also records onboarding_abandoned with the step they stopped on.
 */
export async function sendOnboardingNudges(now = new Date()) {
  const since = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
  const stores = await db.store.findMany({
    where: { createdAt: { gte: since }, NOT: { onboardingState: "LIVE" } },
    select: { id: true, userId: true, status: true, onboardingState: true, brandSettings: true },
    take: 500,
  });
  let sent = 0;
  for (const store of stores) {
    const flow = readRexBuild(store.brandSettings);
    if (!dueOnboardingNudge(flow, isLive(store), now.getTime())) continue;
    const t = tFor(await userLocale(store.userId), "m_rexBuild");
    const count = stepsLeft(flow.screen);
    try {
      await notify({
        userId: store.userId,
        category: "account",
        priority: "info",
        title: t("nudge.title", { count }),
        description: t("nudge.body"),
        appRoute: "/onboarding",
        link: "/home",
        whatsapp: true,
        dedupeKey: `onboarding-nudge:${store.id}:${(flow.nudges ?? []).length}`,
      });
    } catch (error) {
      console.error("[rex-build] nudge failed", error instanceof Error ? error.message : "unknown");
      continue;
    }
    const nudges = [...(flow.nudges ?? []), now.toISOString()];
    // Only the nudge list changes: the last activity stays as it was.
    await db.store.update({ where: { id: store.id }, data: { brandSettings: asJson(withFlow(store.brandSettings, { ...flow, nudges })) } });
    if (nudges.length === 1) await trackOnboarding(store.userId, "onboarding_abandoned", { lastStep: flow.screen ?? "intro" });
    sent += 1;
  }
  return { checked: stores.length, sent };
}
