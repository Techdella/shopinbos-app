import { withAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { loadBrandContext } from "@/lib/ai/brand-context.server";
import type { BrandContext } from "@shared/brand-context";
import { VIDEO_ROLES, videoOwnerId, type VideoRole } from "@shared/video-owner";

// Who owns a Rex video (shared/video-owner.ts has the rule). VideoProject.storeId holds the OWNER id: Store.id for a
// seller, LogisticsPartner.id for a delivery partner. There is no foreign key on storeId, so no migration was needed;
// every read and write of VideoProject in the video routes goes through videoOwnerFor() so both kinds line up.

type Who = { id: string; role: string; name?: string | null };

export interface VideoOwner {
  role: VideoRole;
  /** What VideoProject.storeId holds for this person. */
  id: string;
  /** Shown on the reel's end card and used for Rex's words. */
  name: string;
  logoUrl: string | null;
  /** Store owners only: the store row the brand comes from. */
  storeId: string | null;
  /** Partners only. */
  partner: { displayName: string; description: string | null; city: string | null; country: string | null } | null;
}

/** Route wrapper for the video studio's endpoints: sellers and delivery partners (Create with Rex gates the same). */
export const withVideoMaker = (handler: Parameters<typeof withAuth>[0]) => withAuth(handler, [...VIDEO_ROLES]);

/** The signed-in person's video owner, or null when they have no shop / partner profile yet. */
export async function videoOwnerFor(user: Who): Promise<VideoOwner | null> {
  if (user.role === "logistics_partner") {
    const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true, displayName: true, companyName: true, logoUrl: true, description: true, city: true, country: true } });
    const id = videoOwnerId(user.role, { partnerId: partner?.id });
    if (!partner || !id) return null;
    const name = partner.displayName || partner.companyName || user.name || "";
    return { role: "logistics_partner", id, name, logoUrl: partner.logoUrl, storeId: null, partner: { displayName: name, description: partner.description, city: partner.city, country: partner.country } };
  }
  if (user.role !== "seller") return null;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, logoUrl: true } });
  const id = videoOwnerId(user.role, { storeId: store?.id });
  if (!store || !id) return null;
  return { role: "seller", id, name: store.name, logoUrl: store.logoUrl, storeId: store.id, partner: null };
}

/** The "set up first" message when videoOwnerFor() finds nothing. */
export function noVideoOwnerMessage(role: string) {
  return role === "logistics_partner" ? "Set up your delivery profile first." : "Set up your store first.";
}

/**
 * The brand Rex's shots use. A store's comes from its look and onboarding; a partner's from LogisticsPartner
 * (display name and logo; partners have no theme colours, so the shots use the default palette).
 */
export async function videoBrandContext(owner: VideoOwner): Promise<BrandContext | null> {
  if (owner.storeId) return loadBrandContext(owner.storeId).catch(() => null);
  if (!owner.partner) return null;
  return {
    storeName: owner.name,
    business: owner.partner.description?.trim().slice(0, 300) || "A delivery business",
    category: "Delivery and logistics",
    location: [owner.partner.city, owner.partner.country].filter(Boolean).join(", ") || null,
    logoUrl: owner.logoUrl,
    colours: null,
    paletteName: null,
    headingStyle: null,
    audience: "Online shops and businesses that send parcels",
    vibe: null,
    categories: [],
    products: [],
    productCount: 0,
  };
}
