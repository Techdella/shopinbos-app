import "server-only";
import { db } from "@/lib/db/client";
import type { AuthUser } from "@/lib/auth/types";

// Who a signed-in seller acts as (src/lib/staff/staff.server.ts): kept light, since every page and API route
// resolves it.

/** Pages and API routes only the owner may open (prefixes). */
export const OWNER_ONLY_PAGES = ["/home/wallet", "/home/payouts", "/home/payments/bank", "/home/credits/buy"];
export const OWNER_ONLY_API = ["/api/app/payout-bank", "/api/app/payouts", "/api/app/credits/checkout", "/api/app/extras", "/api/app/account", "/api/app/staff", "/api/domains/purchase"];
/** Settings tabs only the owner sees. */
export const OWNER_ONLY_TABS = ["Billing", "Team", "Security"];

export function isOwnerOnlyPath(pathname: string, list: readonly string[]) {
  return list.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * The account to act as: the store owner when `user` is an active staff member of a seller's store, else `user`
 * itself. `select` is the caller's user fields, so the owner comes back in the same shape.
 */
export async function actingUser<T extends AuthUser>(user: T, load: (id: string) => Promise<T | null>): Promise<T> {
  if (user.role !== "seller") return user;
  const membership = await db.storeStaff.findFirst({ where: { memberUserId: user.id, status: "active" }, select: { id: true, ownerId: true } }).catch(() => null);
  if (!membership || membership.ownerId === user.id) return user;
  const owner = await load(membership.ownerId).catch(() => null);
  if (!owner || owner.role !== "seller") return user;
  return { ...owner, staff: { id: membership.id, userId: user.id, name: user.name, email: user.email } };
}
