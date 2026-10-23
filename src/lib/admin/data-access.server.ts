import "server-only";

import { db } from "@/lib/db/client";
import { revealStillValid } from "@shared/privacy";

// The admin data access log (AdminDataAccess, NDPA 2023 accountability): who looked at a person's contact details or
// changed their account, why and when. Written before anything is shown or changed; read on that person's admin page.

export async function logDataAccess(input: { adminId: string; subjectUserId: string; action: string; reason: string; note?: string | null }) {
  return db.adminDataAccess.create({
    data: { adminId: input.adminId, subjectUserId: input.subjectUserId, action: input.action, reason: input.reason, note: input.note?.trim().slice(0, 500) || null },
  });
}

/** The reveal in the page address, when it's this admin's, for this person and recent enough. */
export async function activeReveal(revealId: string | undefined, adminId: string, subjectUserId: string) {
  if (!revealId) return null;
  const row = await db.adminDataAccess.findUnique({ where: { id: revealId } }).catch(() => null);
  return revealStillValid(row, adminId, subjectUserId) ? row : null;
}

/** Latest entries about one person, with the team member's name. */
export async function accessLogFor(subjectUserId: string, take = 20) {
  const rows = await db.adminDataAccess.findMany({ where: { subjectUserId }, orderBy: { createdAt: "desc" }, take }).catch(() => []);
  const admins = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.adminId))] } }, select: { id: true, name: true } });
  const names = new Map(admins.map((admin) => [admin.id, admin.name]));
  return rows.map((row) => ({ ...row, adminName: names.get(row.adminId) ?? "A removed team member" }));
}
