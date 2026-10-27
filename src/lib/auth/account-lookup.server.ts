import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import type { AuthRole } from "@/lib/brand";

// Does this email or phone already have a Shopinbos account? Asked before any code is sent, so sign up can say
// "this number is already used, log in" and log in can say "no account yet, sign up first" straight away.
// The answer is only given after the otpSend / login rate limits, so it can't be used to sweep through numbers.
//
// A login counts once it was confirmed (a code was entered, or Google) or the app made a User row for it. A sign-up
// that stopped before the code was entered is not an account yet: signing up again just sends a new code.

const ROLES = new Set<AuthRole>(["seller", "supplier", "logistics_partner", "admin"]);

export function noAccountMessage(phone: boolean) {
  return phone
    ? "There's no Shopinbos account with this phone number yet. You need to sign up first."
    : "There's no Shopinbos account with this email yet. You need to sign up first.";
}

export function accountExistsMessage(phone: boolean) {
  return phone
    ? "This phone number is already used by a Shopinbos account. Log in instead, you don't need to sign up again."
    : "This email is already used by a Shopinbos account. Log in instead, you don't need to sign up again.";
}

/** When the database can't say: nobody goes on to a code or password that might not work. */
export const ACCOUNT_CHECK_UNAVAILABLE = "We couldn't check your account just now. Check your connection and try again.";

export type ExistingAccount = { role: AuthRole | null };

function asRole(value: unknown): AuthRole | null {
  return typeof value === "string" && ROLES.has(value as AuthRole) ? (value as AuthRole) : null;
}

/** The account this email or phone signs in to; null when there is none; undefined when the database can't say. */
export async function accountFor(identifier: { email: string } | { phone: string }): Promise<ExistingAccount | null | undefined> {
  const email = "email" in identifier ? identifier.email.trim().toLowerCase() : null;
  // Supabase stores phones without the "+": +2348031234567 → 2348031234567.
  const digits = "phone" in identifier ? identifier.phone.replace(/\D/g, "") : null;
  if (!email && !digits) return null;

  const match = email ? Prisma.sql`lower(u."email") = ${email}` : Prisma.sql`u."phone" = ${digits}`;
  const confirmed = email ? Prisma.sql`u."email_confirmed_at"` : Prisma.sql`u."phone_confirmed_at"`;
  const rows = await db.$queryRaw<Array<{ supabaseId: string; appRole: string | null; metaRole: string | null }>>`
    SELECT u."id"::text AS "supabaseId", a."role"::text AS "appRole", u."raw_user_meta_data"->>'role' AS "metaRole"
    FROM auth.users u
    LEFT JOIN "User" a ON a."supabaseId" = u."id"::text
    WHERE ${match}
      AND (a."id" IS NOT NULL OR ${confirmed} IS NOT NULL)
      AND u."deleted_at" IS NULL
    LIMIT 1`.catch(() => null);
  if (rows?.length) return { role: asRole(rows[0].appRole) ?? asRole(rows[0].metaRole) };

  // auth.users unreadable (another database role): fall back to the app's own accounts.
  if (rows === null) {
    const user = await db.user
      .findFirst({ where: email ? { email: { equals: email, mode: "insensitive" } } : { phone: `+${digits}` }, select: { role: true } })
      .catch(() => undefined);
    if (user === undefined) return undefined;
    if (user) return { role: asRole(user.role) };
  }
  return null;
}

/**
 * The account whose profile has this email, whatever it logs in with; null when none; undefined when the database
 * can't say. An email belongs to one account (User.email is unique), so sign up refuses one that's taken.
 */
export async function profileEmailOwner(email: string): Promise<ExistingAccount | null | undefined> {
  const user = await db.user
    .findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" } }, select: { role: true } })
    .catch(() => undefined);
  if (user === undefined) return undefined;
  return user ? { role: asRole(user.role) } : null;
}
