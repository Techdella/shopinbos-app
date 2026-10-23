import "server-only";

import { db } from "@/lib/db/client";
import { phoneKey } from "@shared/phone";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

// One account per phone number, like email: before a number is linked to an account (sign-up, sign-in sync,
// profile), check nobody else has it. Numbers are compared by their last 10 digits (shared/phone.ts phoneKey).
// Accounts that already shared a number before this check keep it; only new links are refused.

export const PHONE_TAKEN = "This phone number is already used by another Shopinbos account. Sign in to that account, or use a different number.";

export class PhoneTakenError extends Error {
  constructor() {
    super(PHONE_TAKEN);
  }
}

/** The account (other than `exceptUserId`) that has this number, or null. */
export async function phoneOwner(phone: string | null | undefined, exceptUserId?: string | null) {
  const key = phoneKey(phone);
  if (!key) return null;
  const rows = await db.$queryRaw<Array<{ id: string; supabaseId: string; role: string }>>`
    SELECT "id", "supabaseId", "role"::text AS role FROM "User"
    WHERE "phone" IS NOT NULL AND right(regexp_replace("phone", '\\D', '', 'g'), 10) = ${key}
    LIMIT 5`;
  return rows.find((row) => row.id !== exceptUserId) ?? null;
}

/** Does this Supabase login sign in with this phone number (so a code to it is a sign-in, not a second account)? */
export async function signsInWithPhone(supabaseId: string, phone: string) {
  try {
    const admin = await getSupabaseServiceClient();
    const { data } = await admin.auth.admin.getUserById(supabaseId);
    return Boolean(data?.user?.phone && phoneKey(data.user.phone) === phoneKey(phone));
  } catch {
    return false;
  }
}
