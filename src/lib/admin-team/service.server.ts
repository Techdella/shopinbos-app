import "server-only";

import { redirect } from "next/navigation";
import { isValidEmail } from "@shared/phone";
import { db } from "@/lib/db/client";
import { getPublicEnv } from "@/lib/env";
import { buildPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import { isEmailConfigured, sendEmail } from "@/lib/notifications/resend";
import { getCurrentAppUser, requireRole } from "@/lib/server-auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { AuthUser } from "@/lib/auth/types";
import { ADMIN_ROLES, ADMIN_ROLE_HELP, ADMIN_ROLE_LABEL, DISABLED_ADMIN_ROLE, adminHome, asAdminRole, canUseSection, type AdminRole, type AdminSection } from "./pure";

// Admin › Team: owners add people to the admin portal with a role, change it, and remove them.
// An invite makes the sign-in (Supabase, email already confirmed) and the admin account in one go, then emails
// them: they sign in at /admin/login with their email and a code. Removing someone keeps their account (and every
// ticket and note they wrote) but bans the sign-in and marks them disabled, which src/proxy.ts turns away.

export class TeamError extends Error {}

/** The signed-in admin's role, read fresh (null column, or a database without it yet: owner). */
export async function adminRoleOf(userId: string) {
  const row = await db.user.findUnique({ where: { id: userId }, select: { adminRole: true } }).catch(() => null);
  return asAdminRole(row?.adminRole);
}

/** For admin pages and actions: signed in as an admin whose role opens this section, else back to their home. */
export async function requireAdminSection(section: AdminSection): Promise<AuthUser & { adminRole: AdminRole }> {
  const user = await requireRole(["admin"], "/admin/login");
  const role = await adminRoleOf(user.id);
  if (role === DISABLED_ADMIN_ROLE) redirect("/admin/login?reason=removed");
  if (!canUseSection(role, section)) redirect(adminHome(role));
  return { ...user, adminRole: role };
}

/** For actions that answer with an error instead of redirecting: is the signed-in person an admin who can use this? */
export async function currentAdminCan(section: AdminSection) {
  const user = await getCurrentAppUser();
  if (user?.role !== "admin") return false;
  return canUseSection(await adminRoleOf(user.id), section);
}

export type TeamMember = { id: string; name: string; email: string | null; role: AdminRole | "disabled"; createdAt: Date; lastSignInAt: Date | null };

export async function listTeam(): Promise<TeamMember[]> {
  const rows = await db.user.findMany({ where: { role: "admin" }, select: { id: true, supabaseId: true, name: true, email: true, adminRole: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 200 });
  const supabase = await getSupabaseServiceClient().catch(() => null);
  return Promise.all(
    rows.map(async (row) => {
      const auth = supabase ? await supabase.auth.admin.getUserById(row.supabaseId).catch(() => null) : null;
      const signedIn = auth?.data?.user?.last_sign_in_at;
      return { id: row.id, name: row.name, email: row.email, role: asAdminRole(row.adminRole), createdAt: row.createdAt, lastSignInAt: signedIn ? new Date(signedIn) : null };
    }),
  );
}

function parseRole(value: string): AdminRole {
  if (!(ADMIN_ROLES as readonly string[]).includes(value)) throw new TeamError("Pick a role.");
  return value as AdminRole;
}

async function assertOwner(actorId: string) {
  if ((await adminRoleOf(actorId)) !== "owner") throw new TeamError("Only owners can change the team.");
}

async function ownersLeftWithout(userId: string) {
  const admins = await db.user.findMany({ where: { role: "admin", id: { not: userId } }, select: { adminRole: true } });
  return admins.filter((row) => asAdminRole(row.adminRole) === "owner").length;
}

/** The Supabase login for this email: a new one (email confirmed), or the one that already exists. */
async function signInFor(email: string, name: string) {
  const supabase = await getSupabaseServiceClient();
  const created = await supabase.auth.admin.createUser({ email, email_confirm: true, user_metadata: { role: "admin", name, fullName: name } });
  if (created.data.user) return created.data.user.id;
  // Already registered (an earlier invite, or a login with no account row): find it.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) {
      await supabase.auth.admin.updateUserById(found.id, { email_confirm: true, ban_duration: "none", user_metadata: { ...found.user_metadata, role: "admin" } });
      return found.id;
    }
    if (data.users.length < 1000) break;
  }
  throw new TeamError(created.error?.message ? `Couldn't create the sign-in: ${created.error.message}` : "Couldn't create the sign-in. Try again.");
}

export async function inviteTeamMember(actor: { id: string; name: string }, input: { name: string; email: string; role: string }) {
  await assertOwner(actor.id);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim().slice(0, 120);
  const role = parseRole(input.role);
  if (!name) throw new TeamError("Add their name.");
  if (!isValidEmail(email)) throw new TeamError("Enter a valid email.");

  const existing = await db.user.findUnique({ where: { email }, select: { id: true, role: true, adminRole: true, supabaseId: true } });
  if (existing && existing.role !== "admin") {
    throw new TeamError(`That email already has a ${existing.role === "logistics_partner" ? "delivery partner" : existing.role} account. Use another email (a work address) for the admin portal.`);
  }
  if (existing && asAdminRole(existing.adminRole) !== DISABLED_ADMIN_ROLE) throw new TeamError("They're already on the team. Change their role below.");

  if (existing) {
    // Someone removed earlier: put them back.
    const supabase = await getSupabaseServiceClient();
    await supabase.auth.admin.updateUserById(existing.supabaseId, { ban_duration: "none" });
    await db.user.update({ where: { id: existing.id }, data: { adminRole: role } });
  } else {
    const supabaseId = await signInFor(email, name);
    await db.user.upsert({
      where: { supabaseId },
      create: { supabaseId, email, name, role: "admin", adminRole: role },
      update: { role: "admin", adminRole: role, email },
    });
  }
  const emailed = await sendInvite({ email, name, role, invitedBy: actor.name });
  return { emailed };
}

async function sendInvite(input: { email: string; name: string; role: AdminRole; invitedBy: string }) {
  if (!isEmailConfigured()) return false;
  const app = getPublicEnv().appUrl.replace(/\/$/, "");
  const first = input.name.split(/\s+/)[0] || "there";
  const inviter = input.invitedBy.split(/\s+/)[0] || "The Shopinbos team";
  const login = `${app}/admin/login`;
  const { html: body } = buildPlatformEmail({
    kind: "transactional",
    eyebrow: `Shopinbos admin · ${ADMIN_ROLE_LABEL[input.role]}`,
    heading: `You're on the Shopinbos team, ${first}.`,
    preheader: `${inviter} added you to the Shopinbos admin portal.`,
    bodyHtml: [
      html.text(`${inviter} added you to the Shopinbos admin portal as ${ADMIN_ROLE_LABEL[input.role]}: ${ADMIN_ROLE_HELP[input.role]}`),
      html.text(`To sign in, open the admin portal, enter ${input.email} and tap "Email me a code instead". You can set a password afterwards from Forgot password.`),
    ].join(""),
    cta: { label: "Open the admin portal", url: login },
    reason: "a Shopinbos owner added you to the admin team",
    serviceNote: "If you weren't expecting this, ignore it: nobody can sign in without the code we send to this inbox.",
  });
  const sent = await sendEmail({ to: [input.email], subject: `${inviter} added you to the Shopinbos admin portal`, html: body }).catch(() => ({ success: false }));
  return sent.success;
}

export async function changeTeamRole(actor: { id: string }, userId: string, value: string) {
  await assertOwner(actor.id);
  const role = parseRole(value);
  const member = await db.user.findFirst({ where: { id: userId, role: "admin" }, select: { id: true, adminRole: true } });
  if (!member) throw new TeamError("Team member not found.");
  if (asAdminRole(member.adminRole) === DISABLED_ADMIN_ROLE) throw new TeamError("Add them back to the team first.");
  if (role !== "owner" && asAdminRole(member.adminRole) === "owner" && (await ownersLeftWithout(userId)) === 0) {
    throw new TeamError("Keep at least one owner. Make someone else an owner first.");
  }
  await db.user.update({ where: { id: userId }, data: { adminRole: role } });
}

export async function removeTeamMember(actor: { id: string }, userId: string) {
  await assertOwner(actor.id);
  if (userId === actor.id) throw new TeamError("You can't remove yourself. Ask another owner.");
  const member = await db.user.findFirst({ where: { id: userId, role: "admin" }, select: { id: true, supabaseId: true, adminRole: true } });
  if (!member) throw new TeamError("Team member not found.");
  if (asAdminRole(member.adminRole) === "owner" && (await ownersLeftWithout(userId)) === 0) throw new TeamError("Keep at least one owner.");
  const supabase = await getSupabaseServiceClient();
  await supabase.auth.admin.updateUserById(member.supabaseId, { ban_duration: "876000h" }).catch(() => null);
  await db.user.update({ where: { id: userId }, data: { adminRole: DISABLED_ADMIN_ROLE } });
  // Their open tickets go back to the queue.
  await db.supportTicket.updateMany({ where: { assigneeId: userId, status: { in: ["open", "pending"] } }, data: { assigneeId: null } }).catch(() => null);
}
