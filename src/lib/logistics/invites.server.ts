import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { appOrigin } from "@/lib/ads";
import { createNotification } from "@/lib/notifications/create";

// A seller invites the delivery company they already use. The company opens the invite link, signs up (or logs in)
// as a delivery partner and accepts. It's then linked to the seller as "Your delivery company" (listed first for them)
// and becomes their preferred partner if they had none. Shopinbos still checks a new company before it can take
// bookings, like any partner.

export class InviteError extends Error {}

/** Invites a seller can have waiting at once. */
export const PENDING_INVITE_LIMIT = 20;

export const inviteUrl = (code: string) => `${appOrigin()}/invite/delivery/${code}`;

export async function createSellerInvite(sellerId: string, input: { companyName: string; contact?: string | null }) {
  const companyName = input.companyName.trim().slice(0, 120);
  if (companyName.length < 2) throw new InviteError("Add the delivery company's name.");
  const pending = await db.sellerLogisticsInvite.count({ where: { sellerId, status: "pending" } });
  if (pending >= PENDING_INVITE_LIMIT) throw new InviteError(`You have ${pending} invites waiting. Cancel some first.`);
  const store = await db.store.findUnique({ where: { userId: sellerId }, select: { name: true } });
  const invite = await db.sellerLogisticsInvite.create({
    data: { sellerId, code: randomBytes(12).toString("base64url"), companyName, contact: input.contact?.trim().slice(0, 120) || null },
  });
  const url = inviteUrl(invite.code);
  const message = `Hi ${companyName}, ${store?.name ?? "we"} would like to book our deliveries with you on Shopinbos. Join here, it's free: ${url}`;
  const phone = (input.contact ?? "").replace(/[^\d+]/g, "");
  const whatsapp = /^\+?\d{10,15}$/.test(phone) ? phone.replace(/^\+/, "").replace(/^0/, "234") : null;
  return { invite, url, message, whatsapp };
}

/** The seller's invites, newest first, with the company each was accepted by. */
export async function sellerInvites(sellerId: string) {
  const invites = await db.sellerLogisticsInvite.findMany({
    where: { sellerId, status: { in: ["pending", "accepted"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const partnerIds = invites.map((i) => i.logisticsPartnerId).filter((id): id is string => Boolean(id));
  const partners = partnerIds.length
    ? await db.logisticsPartner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, displayName: true, verificationStatus: true, status: true } })
    : [];
  return invites.map((invite) => ({ ...invite, url: inviteUrl(invite.code), partner: partners.find((p) => p.id === invite.logisticsPartnerId) ?? null }));
}

/** The partners a seller invited and who accepted: listed first for them as "Your delivery company". */
export async function linkedPartnerIds(sellerId: string) {
  const rows = await db.sellerLogisticsInvite.findMany({ where: { sellerId, status: "accepted", logisticsPartnerId: { not: null } }, select: { logisticsPartnerId: true } });
  return [...new Set(rows.map((r) => r.logisticsPartnerId!))];
}

export async function cancelSellerInvite(sellerId: string, inviteId: string) {
  const done = await db.sellerLogisticsInvite.updateMany({ where: { id: inviteId, sellerId, status: "pending" }, data: { status: "cancelled" } });
  if (done.count !== 1) throw new InviteError("That invite was already accepted or cancelled. Refresh the page.");
}

/** What the invite page shows: who invited whom. Null for an unknown or cancelled link. */
export async function inviteByCode(code: string) {
  if (!/^[A-Za-z0-9_-]{16}$/.test(code)) return null;
  const invite = await db.sellerLogisticsInvite.findUnique({ where: { code } });
  if (!invite || invite.status === "cancelled") return null;
  const store = await db.store.findUnique({ where: { userId: invite.sellerId }, select: { name: true, logoUrl: true, city: true } });
  return { invite, storeName: store?.name ?? "A Shopinbos store", storeLogo: store?.logoUrl ?? null, storeCity: store?.city ?? null };
}

/**
 * The signed-in delivery partner accepts an invite: linked to the seller, and made their preferred partner when
 * they had none. Accepting twice is fine; an invite another company accepted can't be taken.
 */
export async function acceptSellerInvite(code: string, partnerUserId: string) {
  const found = await inviteByCode(code);
  if (!found) throw new InviteError("This invite link isn't valid any more. Ask the store for a new one.");
  const partner = await db.logisticsPartner.findFirst({ where: { userId: partnerUserId, carrier: null, ownerId: null }, select: { id: true, displayName: true } });
  if (!partner) throw new InviteError("Sign in with your delivery company account to accept.");
  const { invite } = found;
  if (invite.status === "accepted") {
    if (invite.logisticsPartnerId === partner.id) return { partner, sellerId: invite.sellerId, already: true };
    throw new InviteError("Another delivery company already accepted this invite.");
  }
  const claimed = await db.sellerLogisticsInvite.updateMany({ where: { id: invite.id, status: "pending" }, data: { status: "accepted", logisticsPartnerId: partner.id, acceptedAt: new Date() } });
  if (claimed.count !== 1) throw new InviteError("This invite was just used. Refresh the page.");

  // Their preferred partner, unless they already picked one.
  const store = await db.store.findUnique({ where: { userId: invite.sellerId }, select: { id: true, brandSettings: true } });
  const settings = (store?.brandSettings && typeof store.brandSettings === "object" ? store.brandSettings : {}) as Record<string, unknown>;
  const logistics = (settings.logistics && typeof settings.logistics === "object" ? settings.logistics : {}) as Record<string, unknown>;
  if (store && !logistics.preferredPartnerId) {
    await db.store.update({ where: { id: store.id }, data: { brandSettings: { ...settings, logistics: { ...logistics, preferredPartnerId: partner.id } } as Prisma.InputJsonValue } });
  }
  await createNotification({
    userId: invite.sellerId,
    type: "logistics",
    priority: "success",
    title: `${partner.displayName} accepted your invite`,
    description: "They're now your delivery company on Shopinbos. You can book them once Shopinbos has checked their details.",
    link: "/home/logistics#invite",
    metadata: { logisticsPartnerId: partner.id, inviteId: invite.id },
  }).catch(() => null);
  return { partner, sellerId: invite.sellerId, already: false };
}
