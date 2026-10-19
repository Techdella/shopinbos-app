import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db/client";
import { parseDiscountConfig } from "@/lib/discounts";
import { applyCampaignToBrandSettings, lookIsEmpty, readSectionOverrides, readThemeOverride, type CampaignLook } from "./merge";
import {
  badgeText,
  badgesForProduct,
  countdownTargetMs,
  resolveCampaignSlots,
  type AnnouncementSettings,
  type BadgeSettings,
  type CountdownSettings,
} from "./blocks";
import { PREVIEW_COOKIE, previewParamsFromPath, readPreviewAt, verifyPreviewToken } from "./preview-token";
import { previewSecret, rowHasOverrides } from "./server";

// What the storefront shows of seasonal campaigns: the live ones (or, with a valid signed preview link, the one being
// previewed), resolved once per request (React cache). A store with no campaign costs one small indexed query and
// renders exactly as before. Drafts and scheduled campaigns never reach shoppers without a valid preview token.

export interface CampaignBadgeView {
  campaignId: string;
  blockId: string;
  text: string;
  background: string;
  textColor: string;
  position: BadgeSettings["position"];
}

export interface StorefrontCampaignInfo {
  id: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  timezone: string;
  /** The linked discount's code (empty for automatic discounts or none). */
  discountCode: string;
  countdown: { blockId: string | null; settings: CountdownSettings; target: number | null };
}

/** Plain JSON for the storefront's campaign layer (CampaignLayer). */
export interface StorefrontCampaignView {
  campaigns: StorefrontCampaignInfo[];
  /** The campaign whose look shows (its timers drive the campaign sections). */
  themeCampaignId: string | null;
  announcement: { campaignId: string; blockId: string; settings: AnnouncementSettings; colors: { background: string; text: string } } | null;
  /** Badges per product id (at most two each, by priority). */
  badges: Record<string, CampaignBadgeView[]>;
  preview: { campaignId: string; name: string; at: number | null } | null;
  /** The server clock when the page was made (ms). */
  serverNow: number;
}

export interface StorefrontCampaignState {
  view: StorefrontCampaignView;
  look: CampaignLook | null;
  logoUrl: string | null;
}

const LIVE_INCLUDE = {
  blocks: { where: { enabled: true }, orderBy: { sortOrder: "asc" as const }, select: { id: true, type: true, enabled: true, settings: true } },
  discount: { select: { code: true, config: true, status: true } },
};

/** The bar's own colours, else its campaign's banner colours, else dark. */
function announcementColors(settings: AnnouncementSettings, themeOverride: unknown) {
  const tokens = readThemeOverride(themeOverride).tokens;
  return { background: settings.background || tokens.heroBg || "#111111", text: settings.textColor || tokens.heroText || "#FFFFFF" };
}

async function previewRequest(storeId: string) {
  let path: string | null = null;
  let cookieValue: string | null = null;
  try {
    path = (await headers()).get("x-shopinbos-path");
  } catch {
    return null;
  }
  try {
    cookieValue = (await cookies()).get(PREVIEW_COOKIE)?.value ?? null;
  } catch {
    cookieValue = null;
  }
  const fromLink = previewParamsFromPath(path);
  // The cookie holds "<token>|<preview at>" so the preview carries on while the previewer clicks around.
  const [cookieToken, cookieAt] = (cookieValue ?? "").split("|");
  const token = fromLink?.token ?? cookieToken ?? "";
  const payload = token ? verifyPreviewToken(token, previewSecret(), { campaignId: fromLink?.campaignId ?? null }) : null;
  if (!payload || payload.s !== storeId) return null;
  return { campaignId: payload.c, at: readPreviewAt(fromLink ? fromLink.at : cookieAt) };
}

/** Live (or previewed) campaigns for a store, resolved once per request. Null when nothing applies. */
export const loadStorefrontCampaigns = cache(async (storeId: string): Promise<StorefrontCampaignState | null> => {
  try {
    const serverNow = Date.now();
    const preview = await previewRequest(storeId);
    const now = new Date(preview?.at ?? serverNow);
    const rows = preview
      ? await db.storeCampaign.findMany({ where: { id: preview.campaignId, storeId }, include: LIVE_INCLUDE })
      : await db.storeCampaign.findMany({
          where: { storeId, archivedAt: null, pausedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
          include: LIVE_INCLUDE,
          take: 10,
        });
    if (!rows.length) return null;

    const campaigns = rows.map((row) => ({ ...row, hasOverrides: rowHasOverrides(row), blocks: row.blocks.map((block) => ({ ...block, enabled: true })) }));
    const slots = resolveCampaignSlots(campaigns);
    const theme = slots.theme;
    const themeOverride = theme ? readThemeOverride(theme.themeOverride) : { tokens: {} };
    const look: CampaignLook = {
      theme: themeOverride,
      sections: theme ? readSectionOverrides(theme.sectionOverrides) : [],
      hideStoreAnnouncement: Boolean(slots.announcement),
    };

    const badges: Record<string, CampaignBadgeView[]> = {};
    if (slots.badges.length) {
      const collectionIds = [...new Set(slots.badges.filter((badge) => badge.settings.appliesTo === "collection" && badge.settings.collectionId).map((badge) => badge.settings.collectionId))];
      const [products, links] = await Promise.all([
        db.storeProduct.findMany({ where: { storeId, status: "published" }, select: { id: true, retailPrice: true, compareAtPrice: true, tags: true }, take: 2000 }),
        collectionIds.length
          ? db.collectionProduct.findMany({ where: { collectionId: { in: collectionIds }, collection: { storeId } }, select: { collectionId: true, productId: true } })
          : Promise.resolve([] as Array<{ collectionId: string; productId: string }>),
      ]);
      const members = new Map<string, Set<string>>();
      for (const link of links) {
        if (!members.has(link.collectionId)) members.set(link.collectionId, new Set());
        members.get(link.collectionId)!.add(link.productId);
      }
      for (const product of products) {
        const shown = badgesForProduct(slots.badges, product, (badge) => members.get(badge.settings.collectionId) ?? null);
        if (!shown.length) continue;
        badges[product.id] = shown.map((badge) => ({
          campaignId: badge.campaign.id,
          blockId: badge.blockId,
          text: badgeText(badge.settings, product),
          background: badge.settings.background,
          textColor: badge.settings.textColor,
          position: badge.settings.position,
        }));
      }
    }

    const view: StorefrontCampaignView = {
      campaigns: campaigns.map((row) => {
        const countdown = slots.countdowns.get(row.id)!;
        const discountCode = row.discount && !parseDiscountConfig(row.discount.config).automatic ? row.discount.code : "";
        return {
          id: row.id,
          name: row.name,
          startsAt: row.startsAt?.toISOString() ?? null,
          endsAt: row.endsAt?.toISOString() ?? null,
          priority: row.priority,
          timezone: row.timezone,
          discountCode,
          countdown: { blockId: countdown.blockId, settings: countdown.settings, target: countdownTargetMs(countdown.settings, row) },
        };
      }),
      themeCampaignId: theme?.id ?? null,
      announcement: slots.announcement ? { campaignId: slots.announcement.campaign.id, blockId: slots.announcement.blockId, settings: slots.announcement.settings, colors: announcementColors(slots.announcement.settings, slots.announcement.campaign.themeOverride) } : null,
      badges,
      preview: preview ? { campaignId: preview.campaignId, name: rows[0]!.name, at: preview.at } : null,
      serverNow,
    };
    return { view, look: lookIsEmpty(look) ? null : look, logoUrl: themeOverride.logoUrl ?? null };
  } catch (error) {
    // Never let campaigns break a store (for example before the tables exist).
    console.error("[campaigns] storefront load failed", error);
    return null;
  }
});

/**
 * A store payload with the live campaign's look: merged brand settings (published snapshot and theme colours) and
 * the campaign logo. Stores whose pages were published without a builder snapshot get `campaignLook` so the client
 * can merge the snapshot it builds. Returns the same object when no campaign applies.
 */
export async function withCampaignLook<T extends { id: string; brandSettings: unknown; logoUrl?: string | null }>(store: T): Promise<T & { campaignLook?: CampaignLook }> {
  const state = await loadStorefrontCampaigns(store.id);
  if (!state?.look && !state?.logoUrl) return store;
  const settings = (store.brandSettings && typeof store.brandSettings === "object" ? store.brandSettings : {}) as Record<string, unknown>;
  const merged = state.look ? applyCampaignToBrandSettings(settings, state.look) : settings;
  const editor = settings.editor as Record<string, unknown> | undefined;
  const hasPublished = Boolean(editor && typeof editor === "object" && editor.published);
  return {
    ...store,
    brandSettings: merged,
    ...(state.logoUrl ? { logoUrl: state.logoUrl } : {}),
    ...(state.look && !hasPublished ? { campaignLook: state.look } : {}),
  };
}
