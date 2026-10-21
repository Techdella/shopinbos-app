import "server-only";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { planKeyFor, supplierLimits } from "@shared/plans";

// Sellers following suppliers (SupplierFollow), and Supplier Pro's updates to them (SupplierBroadcast): each
// follower gets a bell notification (and push/email the way they chose) linking to the supplier's page.

export class FollowError extends Error {}

/** Updates a supplier may send in 7 days. */
export const BROADCASTS_PER_WEEK = 3;

export async function isFollowing(supplierId: string, userId: string) {
  return Boolean(await db.supplierFollow.findUnique({ where: { supplierId_userId: { supplierId, userId } } }).catch(() => null));
}

export async function setFollowing(supplierId: string, userId: string, follow: boolean) {
  if (follow) {
    await db.supplierFollow.upsert({ where: { supplierId_userId: { supplierId, userId } }, create: { supplierId, userId }, update: {} });
  } else {
    await db.supplierFollow.deleteMany({ where: { supplierId, userId } });
  }
}

export async function followerCount(supplierId: string) {
  return db.supplierFollow.count({ where: { supplierId } }).catch(() => 0);
}

export async function broadcastsLeft(supplierId: string) {
  const sent = await db.supplierBroadcast.count({ where: { supplierId, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } });
  return Math.max(0, BROADCASTS_PER_WEEK - sent);
}

export async function sendSupplierBroadcast(supplierUserId: string, input: { title: string; body: string }) {
  const [user, supplier] = await Promise.all([
    db.user.findUnique({ where: { id: supplierUserId }, select: { role: true, aiCredits: true } }),
    db.supplier.findUnique({ where: { userId: supplierUserId }, select: { id: true, slug: true, displayName: true } }),
  ]);
  if (!supplier || user?.role !== "supplier") throw new FollowError("Supplier profile not found.");
  if (!supplierLimits(planKeyFor("supplier", user.aiCredits)).broadcast) throw new FollowError("Updates to followers come with the Supplier Pro plan.");
  const title = input.title.trim().slice(0, 100);
  const body = input.body.trim().slice(0, 1000);
  if (title.length < 3 || body.length < 10) throw new FollowError("Add a title and a message of at least 10 characters.");
  if ((await broadcastsLeft(supplier.id)) <= 0) throw new FollowError(`You can send ${BROADCASTS_PER_WEEK} updates a week. Try again in a few days.`);
  const followers = await db.supplierFollow.findMany({ where: { supplierId: supplier.id }, select: { userId: true }, take: 10_000 });
  const broadcast = await db.supplierBroadcast.create({ data: { supplierId: supplier.id, title, body, recipients: followers.length } });
  for (const follower of followers) {
    await createNotification({
      userId: follower.userId,
      type: "suppliers",
      priority: "info",
      title: `${supplier.displayName}: ${title}`,
      description: body,
      link: `/suppliers/${supplier.slug}`,
      actionLabel: "See supplier",
      actionUrl: `/suppliers/${supplier.slug}`,
      dedupeKey: `supplier-broadcast:${broadcast.id}:${follower.userId}`,
    }).catch(() => null);
  }
  return broadcast;
}
