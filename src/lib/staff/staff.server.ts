import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { sendEmail } from "@/lib/notifications/resend";
import { buildPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import { extraStaffSeats } from "@/lib/plans/extras.server";
import { planKeyFor, sellerLimits } from "@shared/plans";
import type { AuthUser } from "@/lib/auth/types";

export { OWNER_ONLY_API, OWNER_ONLY_PAGES, OWNER_ONLY_TABS, actingUser, isOwnerOnlyPath } from "./acting.server";

// Seller staff (Settings › Team). A staff member signs in with their own account; while their invite is active the
// app treats them as the store owner (same store, same credits), marked with `staff` so owner-only places (billing,
// payouts and bank, the team, closing the account) can turn them away. Seats: the plan's staff count (the owner
// is one of them) plus extra seats bought for this month (shared/plan-extras.ts).

export class StaffError extends Error {}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://app.shopinbos.com").replace(/\/$/, "");

export async function staffSeats(ownerId: string) {
  const [owner, extra, used] = await Promise.all([
    db.user.findUnique({ where: { id: ownerId }, select: { aiCredits: true } }),
    extraStaffSeats(ownerId),
    db.storeStaff.count({ where: { ownerId, status: { in: ["invited", "active"] } } }).catch(() => 0),
  ]);
  const included = sellerLimits(planKeyFor("seller", owner?.aiCredits)).staff;
  // The owner takes one of the plan's seats.
  return { included, extra, total: included + extra, used: used + 1 };
}

export async function listStaff(ownerId: string) {
  return db.storeStaff.findMany({ where: { ownerId, status: { in: ["invited", "active"] } }, orderBy: { invitedAt: "asc" } }).catch(() => []);
}

export async function inviteStaff(owner: AuthUser, input: { name: string; email: string }) {
  if (owner.staff) throw new StaffError("Only the store owner can add people.");
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim().slice(0, 80) || email.split("@")[0];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new StaffError("Enter a valid email address.");
  if (email === owner.email?.toLowerCase()) throw new StaffError("That's your own email.");
  const store = await db.store.findUnique({ where: { userId: owner.id }, select: { id: true, name: true } });
  if (!store) throw new StaffError("Set up your store first.");
  const existing = await db.storeStaff.findUnique({ where: { storeId_email: { storeId: store.id, email } } });
  if (existing && existing.status !== "removed") throw new StaffError("That person is already on your team.");
  const seats = await staffSeats(owner.id);
  if (seats.used >= seats.total) {
    throw new StaffError(`Your plan includes ${seats.total} staff seat${seats.total === 1 ? "" : "s"} (you're one of them). Upgrade your plan or add a seat for this month.`);
  }
  const token = crypto.randomBytes(24).toString("base64url");
  const row = existing
    ? await db.storeStaff.update({ where: { id: existing.id }, data: { name, status: "invited", token, memberUserId: null, invitedAt: new Date(), acceptedAt: null } })
    : await db.storeStaff.create({ data: { storeId: store.id, ownerId: owner.id, email, name, token } });
  const link = `${APP_URL}/team/join?token=${encodeURIComponent(token)}`;
  // A service message to someone who may not have an account yet: the shell's footer (who sent it, why, contact),
  // no unsubscribe since it's a one-off invite they act on.
  const { html: body } = buildPlatformEmail({
    kind: "transactional",
    eyebrow: "Shopinbos team invite",
    heading: `Hi ${name}, join ${store.name} on Shopinbos`,
    preheader: `${owner.name} added you to the team for ${store.name}.`,
    bodyHtml: [
      html.text(`${owner.name} added you to the team for ${store.name} on Shopinbos.`),
      html.text(`Sign in or create an account with this email address (${email}) to join.`),
    ].join(""),
    cta: { label: "Join the team", url: link },
    reason: `${owner.name} added this email address to their store's team`,
    serviceNote: "If you weren't expecting this, you can ignore it: nobody joins the team without opening this link.",
  });
  const sent = await sendEmail({
    to: [email],
    subject: `${owner.name} added you to ${store.name} on Shopinbos`,
    html: body,
    text: `${owner.name} added you to the team for ${store.name} on Shopinbos. Join: ${link}`,
  }).catch(() => ({ success: false }));
  return { staff: row, link, emailed: sent.success };
}

export async function removeStaff(owner: AuthUser, staffId: string) {
  if (owner.staff) throw new StaffError("Only the store owner can remove people.");
  const moved = await db.storeStaff.updateMany({ where: { id: staffId, ownerId: owner.id }, data: { status: "removed", token: crypto.randomBytes(24).toString("base64url") } });
  if (!moved.count) throw new StaffError("That person isn't on your team.");
}

/** Joins with an invite link. The account's email must match the invite, and it can't own a store of its own. */
export async function acceptStaffInvite(member: { id: string; email: string | null; role: string }, token: string) {
  const invite = await db.storeStaff.findUnique({ where: { token } });
  if (!invite || invite.status === "removed") throw new StaffError("This invite link has expired. Ask the store owner for a new one.");
  if (invite.memberUserId && invite.memberUserId !== member.id) throw new StaffError("Someone has already used this invite.");
  if (member.email?.toLowerCase() !== invite.email) throw new StaffError(`This invite is for ${invite.email}. Sign in with that email to join.`);
  if (member.role !== "seller") throw new StaffError("Join with a seller account. Supplier and delivery partner accounts can't join a store team.");
  if (member.id === invite.ownerId) throw new StaffError("That's your own store.");
  const ownStore = await db.store.findUnique({ where: { userId: member.id }, select: { id: true } });
  if (ownStore) throw new StaffError("This account has its own store. Join with a different email address, or ask the owner to invite another one.");
  const seats = await staffSeats(invite.ownerId);
  if (invite.status !== "active" && seats.used > seats.total) throw new StaffError("The store has no free staff seats right now. Ask the owner to add one.");
  await db.$transaction([
    db.storeStaff.updateMany({ where: { memberUserId: member.id, status: "active", id: { not: invite.id } }, data: { status: "removed" } }),
    db.storeStaff.update({ where: { id: invite.id }, data: { memberUserId: member.id, status: "active", acceptedAt: new Date() } }),
  ]);
  return invite;
}

/** Leaving a team (the staff member's own choice). */
export async function leaveTeam(memberUserId: string) {
  await db.storeStaff.updateMany({ where: { memberUserId, status: "active" }, data: { status: "removed" } });
}
