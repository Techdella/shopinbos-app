import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import {
  mergeOnboardingMemory,
  parseOnboardingMemory,
  type StoreOnboardingMemory,
} from "@/lib/onboarding-memory";

export type ChannelKey =
  | "instagram"
  | "tiktok"
  | "whatsapp"
  | "facebook"
  | "google"
  | "shopify"
  | "website";

export interface SetupProgress {
  skipped?: boolean;
  storeBuilt?: boolean;
  productAdded?: boolean;
  channelsConnected?: boolean;
  profileCompleted?: boolean;
  marketplaceReviewed?: boolean;
}

export interface StoreBrandSettings {
  /** A paid seller turned off the "Built with Shopinbos" badge (src/lib/store-badges.ts; free stores always show it). */
  hideShopinbosBadge?: boolean;
  connectedChannels?: ChannelKey[];
  setup?: SetupProgress;
  onboardingMemory?: StoreOnboardingMemory;
  chipTone?: string;
  mascot?: "rex" | "peggy";
  template?: {
    templateId: string;
    templateName: string;
    sourcePack: string;
    sourceType: string;
    category: string;
    previewImage?: string;
    demoContentMode: string;
    layoutFamily: string;
  };
  themeTokens?: {
    heroBg: string;
    heroText: string;
    accent: string;
    ctaBg: string;
    ctaText: string;
    paperBg: string;
    cardBg: string;
    ink: string;
    muted: string;
    border: string;
    headingStyle: "serif" | "grotesk";
    radius: "soft" | "rounded" | "sharp";
  };
  layoutVariant?: string;
  editor?: {
    template?: StoreBrandSettings["template"];
    draft?: unknown;
    published?: unknown;
  };
  notifications?: {
    provider: "africastalking" | "sendchamp";
    senderName?: string;
    smsRoute?: "dnd" | "non_dnd" | "international";
    enabledChannels: ("sms" | "voice" | "whatsapp")[];
    events: {
      orderPlaced?: boolean;
      orderShipped?: boolean;
      orderDelivered?: boolean;
      paymentConfirmed?: boolean;
      otpVerification?: boolean;
    };
  };
  [key: string]: unknown;
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function parseBrandSettings(value: unknown): StoreBrandSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const connectedChannels = Array.isArray(record.connectedChannels)
    ? record.connectedChannels.filter((item): item is ChannelKey => typeof item === "string") as ChannelKey[]
    : [];

  const setupValue = record.setup;
  const setup =
    setupValue && typeof setupValue === "object" && !Array.isArray(setupValue)
      ? (setupValue as SetupProgress)
      : {};

  return {
    ...record,
    connectedChannels,
    setup,
    chipTone: typeof record.chipTone === "string" ? record.chipTone : undefined,
    mascot: record.mascot === "peggy" ? "peggy" : record.mascot === "rex" ? "rex" : undefined,
    onboardingMemory: parseOnboardingMemory(record.onboardingMemory),
    template:
      record.template && typeof record.template === "object" && !Array.isArray(record.template)
        ? (record.template as StoreBrandSettings["template"])
        : undefined,
    themeTokens:
      record.themeTokens && typeof record.themeTokens === "object" && !Array.isArray(record.themeTokens)
        ? (record.themeTokens as StoreBrandSettings["themeTokens"])
        : undefined,
    layoutVariant: typeof record.layoutVariant === "string" ? record.layoutVariant : undefined,
    editor:
      record.editor && typeof record.editor === "object" && !Array.isArray(record.editor)
        ? (record.editor as StoreBrandSettings["editor"])
        : undefined,
  };
}

export function toBrandSettingsInput(settings: StoreBrandSettings): Prisma.InputJsonValue {
  return settings as unknown as Prisma.InputJsonValue;
}

type StoreBrandSettingsPatch = Partial<Omit<StoreBrandSettings, "onboardingMemory">> & {
  onboardingMemory?: Partial<StoreOnboardingMemory>;
};

export function mergeBrandSettings(current: unknown, patch: StoreBrandSettingsPatch) {
  const parsed = parseBrandSettings(current);
  const patchSetup =
    patch.setup && typeof patch.setup === "object" && !Array.isArray(patch.setup)
      ? patch.setup
      : {};
  const patchChannels = Array.isArray(patch.connectedChannels) ? patch.connectedChannels : undefined;

  return toBrandSettingsInput({
    ...parsed,
    ...patch,
    setup: {
      ...parsed.setup,
      ...patchSetup,
    },
    onboardingMemory:
      patch.onboardingMemory !== undefined
        ? mergeOnboardingMemory(parsed.onboardingMemory, patch.onboardingMemory)
        : parsed.onboardingMemory,
    connectedChannels: patchChannels ?? parsed.connectedChannels ?? [],
  });
}

class QueryLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  async run<T>(query: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.active += 1;

    try {
      return await query();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }
}

function getWorkspaceQueryConcurrency() {
  const configured = Number(process.env.WORKSPACE_QUERY_CONCURRENCY);

  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }

  return 4;
}

const globalForWorkspaceQueries = globalThis as unknown as {
  workspaceQueryLimiter: QueryLimiter | undefined;
};

const workspaceQueryLimiter =
  globalForWorkspaceQueries.workspaceQueryLimiter ??
  new QueryLimiter(getWorkspaceQueryConcurrency());

globalForWorkspaceQueries.workspaceQueryLimiter = workspaceQueryLimiter;

export async function safeQuery<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await workspaceQueryLimiter.run(query);
  } catch (error) {
    console.warn("Workspace query failed", error);
    return fallback;
  }
}

export const socialChannels: Array<{
  key: ChannelKey;
  label: string;
  icon: "instagram" | "tiktok" | "whatsapp" | "facebook" | "search" | "shop" | "store";
  color: string;
  help: string;
}> = [
  { key: "instagram", label: "Instagram Shop", icon: "instagram", color: "#E4405F", help: "Tag products in posts and reels." },
  { key: "tiktok", label: "TikTok Shop", icon: "tiktok", color: "#111111", help: "Push short-form product discovery." },
  { key: "whatsapp", label: "WhatsApp", icon: "whatsapp", color: "#25D366", help: "Reply faster and share store links." },
  { key: "facebook", label: "Facebook", icon: "facebook", color: "#1877F2", help: "Reach repeat buyers in groups and pages." },
  { key: "google", label: "Google Shop", icon: "search", color: "#4285F4", help: "Capture high-intent product searches." },
  { key: "shopify", label: "Shopify Import", icon: "shop", color: "#95BF47", help: "Mirror catalog data from a Shopify store." },
  { key: "website", label: "Shopinbos Storefront", icon: "store", color: "#0E2A38", help: "Sell directly from your store link." },
];

export async function getSellerWorkspace(userId: string) {
  // Not safeQuery: a failing query here (e.g. a column the database doesn't have yet) must show the error page.
  // Turned into null, it looked like "no store" and bounced the seller through /onboarding back to /home.
  const user = await workspaceQueryLimiter.run(() =>
    db.user.findUnique({
      where: { id: userId },
      include: {
        store: true,
      },
    }),
  );

  if (!user) {
    return null;
  }

  const store = user.store;
  const settings = parseBrandSettings(store?.brandSettings);

  const [storeProducts, trendingProducts, wholesaleOrders, deliveryBookings, deliveryQuotes, suppliers, logisticsPartners] =
    await Promise.all([
      safeQuery(
        () =>
          db.storeProduct.findMany({
            where: store ? { storeId: store.id } : { storeId: "__missing__" },
            include: {
              supplierProduct: {
                include: {
                  supplier: true,
                  category: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 8,
          }),
        [],
      ),
      safeQuery(
        () =>
          db.supplierProduct.findMany({
            where: {
              status: "published",
              supplier: {
                status: "active",
                verificationStatus: "verified",
              },
            },
            include: {
              supplier: true,
              category: true,
            },
            orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
            take: 8,
          }),
        [],
      ),
      safeQuery(
        () =>
          db.wholesaleOrder.findMany({
            where: { sellerId: user.id },
            include: {
              supplier: true,
              supplierProduct: true,
            },
            orderBy: { createdAt: "desc" },
            take: 6,
          }),
        [],
      ),
      safeQuery(
        () =>
          db.deliveryBooking.findMany({
            where: { sellerId: user.id },
            include: {
              logisticsPartner: true,
            },
            orderBy: { createdAt: "desc" },
            take: 6,
          }),
        [],
      ),
      safeQuery(
        () =>
          db.deliveryQuoteRequest.findMany({
            where: { sellerId: user.id },
            include: {
              logisticsPartner: true,
            },
            orderBy: { createdAt: "desc" },
            take: 6,
          }),
        [],
      ),
      safeQuery(
        () =>
          db.supplier.findMany({
            where: {
              status: "active",
              verificationStatus: "verified",
            },
            orderBy: [{ trustScore: "desc" }, { rating: "desc" }],
            take: 6,
          }),
        [],
      ),
      safeQuery(
        () =>
          db.logisticsPartner.findMany({
            where: {
              status: "active",
              verificationStatus: "verified",
              carrier: null,
            },
            orderBy: [{ reliabilityScore: "desc" }, { rating: "desc" }],
            take: 6,
          }),
        [],
      ),
    ]);

  const setup = settings.setup ?? {};
  const completedSetup =
    Boolean(store) &&
    (setup.skipped ||
      (setup.storeBuilt &&
        setup.productAdded &&
        setup.channelsConnected &&
        setup.profileCompleted &&
        setup.marketplaceReviewed));

  return {
    user,
    store,
    settings,
    storeProducts,
    trendingProducts,
    wholesaleOrders,
    deliveryBookings,
    deliveryQuotes,
    suppliers,
    logisticsPartners,
    completedSetup,
  };
}

export async function getSupplierWorkspace(userId: string) {
  const user = await safeQuery(
    () =>
      db.user.findUnique({
        where: { id: userId },
        include: { supplier: true },
      }),
    null,
  );

  if (!user || !user.supplier) {
    return null;
  }

  const supplier = user.supplier;
  const activeOrderStatuses = ["pending", "confirmed", "processing", "shipped"] as const;

  const [
    products,
    quoteRequests,
    wholesaleOrders,
    productCount,
    publishedProductCount,
    pendingProductCount,
    draftProductCount,
    pendingQuoteCount,
    activeOrderCount,
    revenue,
  ] = await Promise.all([
    safeQuery(
      () =>
        db.supplierProduct.findMany({
          where: { supplierId: supplier.id },
          include: {
            category: true,
            _count: { select: { storeProducts: true, quoteRequests: true, wholesales: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 24,
        }),
      [],
    ),
    safeQuery(
      () =>
        db.supplierQuoteRequest.findMany({
          where: { supplierId: supplier.id },
          include: {
            seller: { select: { id: true, name: true, email: true, city: true, country: true } },
            supplierProduct: { select: { id: true, name: true, slug: true, images: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 24,
        }),
      [],
    ),
    safeQuery(
      () =>
        db.wholesaleOrder.findMany({
          where: { supplierId: supplier.id },
          include: {
            seller: { select: { id: true, name: true, email: true, city: true, country: true } },
            supplierProduct: { select: { id: true, name: true, images: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 24,
        }),
      [],
    ),
    safeQuery(() => db.supplierProduct.count({ where: { supplierId: supplier.id } }), 0),
    safeQuery(() => db.supplierProduct.count({ where: { supplierId: supplier.id, status: "published" } }), 0),
    safeQuery(() => db.supplierProduct.count({ where: { supplierId: supplier.id, status: "pending_review" } }), 0),
    safeQuery(() => db.supplierProduct.count({ where: { supplierId: supplier.id, status: "draft" } }), 0),
    safeQuery(() => db.supplierQuoteRequest.count({ where: { supplierId: supplier.id, status: "pending" } }), 0),
    safeQuery(
      () => db.wholesaleOrder.count({ where: { supplierId: supplier.id, status: { in: [...activeOrderStatuses] } } }),
      0,
    ),
    safeQuery(
      () =>
        db.wholesaleOrder.aggregate({
          where: { supplierId: supplier.id },
          _sum: { totalPrice: true },
        }),
      { _sum: { totalPrice: 0 } },
    ),
  ]);

  return {
    user,
    supplier,
    products,
    quoteRequests,
    wholesaleOrders,
    metrics: {
      productCount,
      publishedProductCount,
      pendingProductCount,
      draftProductCount,
      pendingQuoteCount,
      activeOrderCount,
      revenue: revenue._sum.totalPrice ?? 0,
    },
  };
}

export async function getLogisticsWorkspace(userId: string) {
  const user = await safeQuery(
    () =>
      db.user.findUnique({
        where: { id: userId },
        include: { logisticsPartner: true },
      }),
    null,
  );

  if (!user || !user.logisticsPartner) {
    return null;
  }

  const partner = user.logisticsPartner;
  const activeBookingStatuses = ["pending", "confirmed", "picked_up", "in_transit"] as const;

  const [quoteRequests, bookings, pendingQuoteCount, activeBookingCount, deliveredBookingCount, revenue] =
    await Promise.all([
      safeQuery(
        () =>
          db.deliveryQuoteRequest.findMany({
            where: { logisticsPartnerId: partner.id },
            include: { seller: { select: { id: true, name: true, email: true, city: true, country: true } } },
            orderBy: { createdAt: "desc" },
            take: 24,
          }),
        [],
      ),
      safeQuery(
        () =>
          db.deliveryBooking.findMany({
            where: { logisticsPartnerId: partner.id },
            include: { seller: { select: { id: true, name: true, email: true, city: true, country: true } } },
            orderBy: { createdAt: "desc" },
            take: 24,
          }),
        [],
      ),
      safeQuery(() => db.deliveryQuoteRequest.count({ where: { logisticsPartnerId: partner.id, status: "pending" } }), 0),
      safeQuery(
        () => db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id, status: { in: [...activeBookingStatuses] } } }),
        0,
      ),
      safeQuery(() => db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id, status: "delivered" } }), 0),
      safeQuery(
        () =>
          db.deliveryBooking.aggregate({
            where: { logisticsPartnerId: partner.id },
            _sum: { deliveryFee: true },
          }),
        { _sum: { deliveryFee: 0 } },
      ),
    ]);

  return {
    user,
    partner,
    quoteRequests,
    bookings,
    metrics: {
      pendingQuoteCount,
      activeBookingCount,
      deliveredBookingCount,
      revenue: revenue._sum.deliveryFee ?? 0,
    },
  };
}

export async function getAdminWorkspace() {
  const [
    userCount,
    supplierCount,
    logisticsPartnerCount,
    productCount,
    pendingSupplierCount,
    pendingLogisticsCount,
    pendingProductCount,
    retailOrderCount,
    wholesaleOrderCount,
    users,
    suppliers,
    logisticsPartners,
    supplierProducts,
    retailOrders,
    wholesaleOrders,
  ] = await Promise.all([
    safeQuery(() => db.user.count(), 0),
    safeQuery(() => db.supplier.count(), 0),
    safeQuery(() => db.logisticsPartner.count(), 0),
    safeQuery(() => db.supplierProduct.count(), 0),
    safeQuery(() => db.supplier.count({ where: { verificationStatus: "pending" } }), 0),
    safeQuery(() => db.logisticsPartner.count({ where: { verificationStatus: "pending" } }), 0),
    safeQuery(() => db.supplierProduct.count({ where: { status: "pending_review" } }), 0),
    safeQuery(() => db.retailOrder.count(), 0),
    safeQuery(() => db.wholesaleOrder.count(), 0),
    safeQuery(
      () =>
        db.user.findMany({
          orderBy: { createdAt: "desc" },
          take: 30,
          include: {
            store: { select: { id: true, name: true, slug: true, status: true } },
            supplier: { select: { id: true, displayName: true, slug: true, verificationStatus: true, status: true } },
            logisticsPartner: { select: { id: true, displayName: true, slug: true, verificationStatus: true, status: true } },
          },
        }),
      [],
    ),
    safeQuery(
      () =>
        db.supplier.findMany({
          orderBy: [{ verificationStatus: "asc" }, { updatedAt: "desc" }],
          take: 30,
          include: { _count: { select: { products: true, quoteRequests: true, wholesaleOrders: true } } },
        }),
      [],
    ),
    safeQuery(
      () =>
        db.logisticsPartner.findMany({
          orderBy: [{ verificationStatus: "asc" }, { updatedAt: "desc" }],
          take: 30,
          include: { _count: { select: { quoteRequests: true, bookings: true } } },
        }),
      [],
    ),
    safeQuery(
      () =>
        db.supplierProduct.findMany({
          orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
          take: 40,
          include: {
            supplier: { select: { id: true, displayName: true, slug: true, verificationStatus: true, status: true } },
            category: true,
          },
        }),
      [],
    ),
    safeQuery(
      () =>
        db.retailOrder.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { store: { select: { id: true, name: true, slug: true } } },
        }),
      [],
    ),
    safeQuery(
      () =>
        db.wholesaleOrder.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            seller: { select: { id: true, name: true, email: true } },
            supplier: { select: { id: true, displayName: true, slug: true } },
            supplierProduct: { select: { id: true, name: true } },
          },
        }),
      [],
    ),
  ]);

  return {
    metrics: {
      userCount,
      supplierCount,
      logisticsPartnerCount,
      productCount,
      pendingSupplierCount,
      pendingLogisticsCount,
      pendingProductCount,
      retailOrderCount,
      wholesaleOrderCount,
    },
    users,
    suppliers,
    logisticsPartners,
    supplierProducts,
    retailOrders,
    wholesaleOrders,
  };
}
