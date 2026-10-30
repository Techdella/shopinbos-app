import "server-only";

import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import type { AuthUser } from "@/lib/auth/types";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { e164FromSupabase } from "@/lib/auth/app-user";
import { PHONE_TAKEN, phoneOwner } from "@/lib/auth/phone-owner.server";
import { getAuthRouteClient } from "@/lib/auth/session.server";
import { deliverCode } from "@/lib/auth/otp-delivery.server";
import { checkPhoneChallenge, createPhoneChallenge, generatePhoneCode, phoneVerifySecret, readPhoneChallenge } from "@/lib/commerce/phone-verify";
import { saveDeliverySettings } from "@/lib/delivery-market/manage.server";
import { deliverySettingsFor } from "@/lib/delivery-market/market.server";
import { readBusinessAddress } from "@/lib/email/shell";
import { saveFlowAnswers } from "@/lib/logistics/partner-kyc.server";
import { appUrl } from "@/lib/marketing/brand";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { saveSellerBusinessAddress, saveStoreDetails } from "@/lib/seller-settings.server";
import { e164 } from "@/lib/sms/pure";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { canonicalState } from "@shared/delivery-market";
import { readFlowAnswers } from "@shared/partner-tiers";
import {
  EMAIL_CHANGE_LIMIT,
  PHONE_CODE_LIMIT,
  accountPhoneCodeMessage,
  accountPhoneScope,
  businessForm,
  sameEmail,
  samePhone,
  type DetailsRole,
  type MyDetails,
} from "@shared/my-details";
import type { DetailsPatch } from "@/lib/my-details-rules";

// "My details" for every role (shared/my-details.ts): the person's own name, email and phone, and their shop's,
// supplier business's or delivery company's name, phone, address, city and state. Used by /api/app/me/details,
// /api/app/me/email and /api/app/me/phone (web pages and the phone app call the same routes).
//
// Email and phone are how people sign in (Supabase Auth), so neither is written straight in:
//   email → Supabase's change-email links (sent to the new address, and the current one too: secure email change
//           is on). Once confirmed, the account's email follows here (and on the next sign-in, sync-user).
//   phone → a 6-digit code to the new number (WhatsApp first when set up, else SMS), then the login's phone and the
//           account's are changed together.
// Neither may take an email or phone another account already uses (the same rule as sign-up).
// The business's own contact phone is separate and saved directly.

export class DetailsError extends Error {
  constructor(message: string, readonly code = "BAD_REQUEST", readonly status = 400) {
    super(message);
  }
}

export const EMAIL_TAKEN = "This email is already used by another Shopinbos account. Use a different email.";

/** The person themself: a seller's staff member is signed in as the owner's store, but these are their own details. */
async function personOf(user: AuthUser) {
  if (!user.staff) return { id: user.id, supabaseId: user.supabaseId };
  const row = await db.user.findUnique({ where: { id: user.staff.userId }, select: { id: true, supabaseId: true } });
  if (!row) throw new DetailsError("We couldn't find your account. Log in again.", "UNAUTHORIZED", 401);
  return row;
}

async function loginOf(supabaseId: string) {
  try {
    const admin = await getSupabaseServiceClient();
    const { data } = await admin.auth.admin.getUserById(supabaseId);
    return data?.user ?? null;
  } catch {
    return null;
  }
}

/** Another login (not this one) signs in with this email or phone. null when auth.users can't be read: Supabase refuses a duplicate itself. */
async function loginTakenByOther(target: { email: string } | { phone: string }, supabaseId: string) {
  const match = "email" in target ? Prisma.sql`lower("email") = ${target.email.toLowerCase()}` : Prisma.sql`"phone" = ${target.phone.replace(/\D/g, "")}`;
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS id FROM auth.users WHERE ${match} AND "id"::text <> ${supabaseId} AND "deleted_at" IS NULL LIMIT 1`.catch(() => null);
  return rows ? rows.length > 0 : null;
}

// ─── Read ────────────────────────────────────────────────────────────────────

async function businessOf(user: AuthUser): Promise<MyDetails["business"]> {
  if (user.role === "seller") {
    const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, city: true, logoUrl: true, brandSettings: true } });
    if (!store) return null;
    const address = readBusinessAddress(store.brandSettings);
    return { ...businessForm({ name: store.name, phone: address.phone, address: address.line1, city: store.city || address.city, state: address.state }), logoUrl: store.logoUrl ?? null };
  }
  if (user.role === "supplier") {
    const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { displayName: true, businessName: true, whatsappNumber: true, address: true, city: true, logoUrl: true } });
    if (!supplier) return null;
    const settings = await deliverySettingsFor(user.id).catch(() => null);
    return {
      ...businessForm({ name: supplier.displayName || supplier.businessName, phone: supplier.whatsappNumber, address: supplier.address, city: supplier.city, state: settings?.originState }),
      logoUrl: supplier.logoUrl ?? null,
    };
  }
  if (user.role === "logistics_partner") {
    const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { displayName: true, companyName: true, contactPhone: true, whatsappNumber: true, address: true, city: true, logoUrl: true, onboardingState: true } });
    if (!partner) return null;
    return {
      ...businessForm({ name: partner.displayName || partner.companyName, phone: partner.contactPhone || partner.whatsappNumber, address: partner.address, city: partner.city, state: readFlowAnswers(partner.onboardingState).homeState }),
      logoUrl: partner.logoUrl ?? null,
    };
  }
  return null;
}

/** Everything the details screens show. A confirmed email change is copied onto the account here too. */
export async function myDetails(user: AuthUser): Promise<MyDetails> {
  const person = await personOf(user);
  const [row, login, business] = await Promise.all([
    db.user.findUnique({ where: { id: person.id }, select: { name: true, email: true, phone: true, avatarUrl: true } }),
    loginOf(person.supabaseId),
    businessOf(user),
  ]);
  let email = row?.email ?? null;
  // The person opened the link: Supabase has the new email, so the account takes it (unless another account has it).
  if (login?.email && login.email_confirmed_at && !sameEmail(login.email, email)) {
    const next = login.email.toLowerCase();
    const other = await db.user.findFirst({ where: { email: { equals: next, mode: "insensitive" }, NOT: { id: person.id } }, select: { id: true } });
    if (!other) {
      await db.user.update({ where: { id: person.id }, data: { email: next } });
      email = next;
    }
  }
  const loginPhone = e164FromSupabase(login?.phone);
  const pending = (login as { new_email?: string | null } | null)?.new_email ?? null;
  return {
    role: user.role as DetailsRole,
    me: {
      name: row?.name ?? "",
      email,
      phone: loginPhone ?? row?.phone ?? null,
      avatarUrl: row?.avatarUrl ?? null,
      pendingEmail: pending && !sameEmail(pending, email) ? pending.toLowerCase() : null,
    },
    business,
    canEditBusiness: !user.staff && business !== null,
  };
}

// ─── Name and business ───────────────────────────────────────────────────────

/** A state that the delivery market knows ("lagos", "Lagos State" → "Lagos"); "" clears it. */
function stateFor(value: string | undefined) {
  if (value === undefined) return undefined;
  if (!value.trim()) return null;
  const state = canonicalState(value);
  if (!state) throw new DetailsError("Pick a Nigerian state, for example Lagos or FCT.");
  return state;
}

/** Saves the name and the business fields that came; a field left out keeps its saved value. */
export async function saveMyDetails(user: AuthUser, patch: DetailsPatch) {
  const person = await personOf(user);
  const biz = patch.business ?? {};
  if (Object.keys(biz).length) {
    if (user.staff) throw new DetailsError("Only the store owner can change the shop's details.", "FORBIDDEN", 403);
    await saveBusiness(user, biz);
  }
  if (patch.name !== undefined) await db.user.update({ where: { id: person.id }, data: { name: patch.name } });
}

async function saveBusiness(user: AuthUser, biz: NonNullable<DetailsPatch["business"]>) {
  if (user.role === "seller") {
    // Checked first so nothing is half saved.
    if (!(await db.store.findUnique({ where: { userId: user.id }, select: { id: true } }))) throw new DetailsError("Create your shop first.", "NOT_FOUND", 404);
    if (biz.name !== undefined || biz.city !== undefined) await saveStoreDetails(user.id, { name: biz.name, city: biz.city });
    const address: Record<string, string> = {};
    if (biz.phone !== undefined) address.phone = biz.phone;
    if (biz.address !== undefined) address.line1 = biz.address;
    if (biz.city !== undefined) address.city = biz.city;
    if (biz.state !== undefined) address.state = biz.state;
    if (Object.keys(address).length) await saveSellerBusinessAddress(user.id, address);
    return;
  }
  if (user.role === "supplier") {
    const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!supplier) throw new DetailsError("Finish setting up your business first.", "NOT_FOUND", 404);
    const state = stateFor(biz.state);
    if (state !== undefined) {
      // Where parcels leave from (the Delivery hub's "Where I ship from" state).
      const saved = await saveDeliverySettings(user.id, { originState: state });
      if (!saved.ok) throw new DetailsError(saved.error);
    }
    const updated = await db.supplier.update({
      where: { id: supplier.id },
      data: {
        ...(biz.name ? { displayName: biz.name } : {}),
        ...(biz.phone !== undefined ? { whatsappNumber: biz.phone || null } : {}),
        ...(biz.address !== undefined ? { address: biz.address || null } : {}),
        ...(biz.city ? { city: biz.city } : {}),
      },
      select: { slug: true },
    });
    invalidatePublicMarketplaceCache({ supplierSlug: updated.slug });
    return;
  }
  if (user.role === "logistics_partner") {
    const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!partner) throw new DetailsError("Finish setting up your company first.", "NOT_FOUND", 404);
    const state = stateFor(biz.state);
    // The name sellers see, like the set-up's name screen (both names together).
    const updated = await db.logisticsPartner.update({
      where: { id: partner.id },
      data: {
        ...(biz.name ? { companyName: biz.name, displayName: biz.name } : {}),
        ...(biz.phone !== undefined ? { contactPhone: biz.phone || null } : {}),
        ...(biz.address !== undefined ? { address: biz.address || null } : {}),
        ...(biz.city ? { city: biz.city } : {}),
      },
      select: { slug: true },
    });
    // The state they're based in (set-up's "Which state?" answer).
    if (state) await saveFlowAnswers(partner.id, { homeState: state });
    invalidatePublicMarketplaceCache({ logisticsSlug: updated.slug });
    return;
  }
  throw new DetailsError("There's no business on this account.", "NOT_FOUND", 404);
}

// ─── Email ───────────────────────────────────────────────────────────────────

/** The signed-in person's access token: the phone app's bearer token, else the web's session cookie. */
async function accessTokenOf(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const client = await getAuthRouteClient();
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Asks Supabase to change the sign-in email: it sends a confirmation link to the new address (and one to the
 * current address, when there is one). Nothing changes until the links are opened. Returns whether the current
 * address gets a link too.
 */
export async function requestEmailChange(user: AuthUser, req: NextRequest, email: string) {
  const person = await personOf(user);
  const row = await db.user.findUnique({ where: { id: person.id }, select: { email: true } });
  if (sameEmail(row?.email, email)) throw new DetailsError("That's already your email.");
  const limit = await checkRateLimitShared(rateLimitKey("my-details:email", person.id), { ...EMAIL_CHANGE_LIMIT, failClosed: true });
  if (!limit.allowed) throw new DetailsError("You've asked for a few links already. Wait an hour, or open the last link we sent.", "RATE_LIMITED", 429);
  // One account per email: the profile of another account, or another login.
  const profile = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, NOT: { id: person.id } }, select: { id: true } });
  if (profile || (await loginTakenByOther({ email }, person.supabaseId))) throw new DetailsError(EMAIL_TAKEN, "EMAIL_TAKEN", 409);

  const token = await accessTokenOf(req);
  if (!token) throw new DetailsError("Log in again, then change your email.", "UNAUTHORIZED", 401);
  const redirect = `${appUrl()}/auth/email-changed`;
  let response: Response;
  try {
    // The same call as supabase.auth.updateUser({ email }), made with the person's own session.
    response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user?redirect_to=${encodeURIComponent(redirect)}`, {
      method: "PUT",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw new DetailsError("We couldn't reach the sign-in service. Check your connection and try again.", "UNAVAILABLE", 503);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error_code?: string; code?: string; msg?: string; message?: string } | null;
    const said = `${body?.error_code ?? body?.code ?? ""} ${body?.msg ?? body?.message ?? ""}`;
    if (/email_exists|already been registered|already registered/i.test(said)) throw new DetailsError(EMAIL_TAKEN, "EMAIL_TAKEN", 409);
    if (response.status === 429 || /rate limit/i.test(said)) throw new DetailsError("Please wait a minute before asking for another link.", "RATE_LIMITED", 429);
    console.error("[my-details] email change refused", response.status, said);
    throw new DetailsError("We couldn't send the confirmation link just now. Try again in a few minutes.", "UNAVAILABLE", 503);
  }
  return { pendingEmail: email, currentToo: Boolean(row?.email) };
}

// ─── Phone ───────────────────────────────────────────────────────────────────

async function phoneProblem(person: { id: string; supabaseId: string }, phone: string) {
  if ((await phoneOwner(phone, person.id)) || (await loginTakenByOther({ phone }, person.supabaseId))) throw new DetailsError(PHONE_TAKEN, "PHONE_TAKEN", 409);
}

function cleanPhone(value: string) {
  const phone = e164(value);
  if (!phone) throw new DetailsError("Enter your phone number, for example 0803 123 4567.");
  return phone;
}

function codeSecret() {
  const secret = phoneVerifySecret();
  if (!secret) throw new DetailsError("We can't send codes right now. Try again later.", "UNAVAILABLE", 503);
  return secret;
}

/** Sends a 6-digit code to the new number and returns the signed challenge the code is checked against. */
export async function sendPhoneCode(user: AuthUser, input: { phone: string; via?: "whatsapp" | "sms" }) {
  const person = await personOf(user);
  const phone = cleanPhone(input.phone);
  const login = await loginOf(person.supabaseId);
  const current = e164FromSupabase(login?.phone) ?? (await db.user.findUnique({ where: { id: person.id }, select: { phone: true } }))?.phone;
  // Already the sign-in phone: nothing to confirm.
  if (login?.phone && samePhone(current, phone)) throw new DetailsError("That's already your phone number.");
  await phoneProblem(person, phone);
  const secret = codeSecret();
  const limit = await checkRateLimitShared(rateLimitKey("my-details:phone-code", person.id), { ...PHONE_CODE_LIMIT, failClosed: true });
  if (!limit.allowed) throw new DetailsError("Too many codes. Wait 10 minutes and try again.", "RATE_LIMITED", 429);
  const code = generatePhoneCode();
  const sent = await deliverCode({ phone, otp: code, message: accountPhoneCodeMessage(code), via: input.via });
  if (!sent.ok) {
    console.error("[my-details] phone code not sent", sent.error);
    throw new DetailsError("We couldn't send the code just now. Check the number and try again.", "UNAVAILABLE", 503);
  }
  const { challenge } = createPhoneChallenge({ phone, storeId: accountPhoneScope(person.id), code }, secret);
  return { phone, challenge, channel: sent.channel };
}

/** Checks the code, then makes the number the account's sign-in phone (Supabase) and its phone here. */
export async function confirmPhoneCode(user: AuthUser, input: { phone: string; challenge: string; code: string }) {
  const person = await personOf(user);
  const phone = cleanPhone(input.phone);
  const secret = codeSecret();
  const scope = accountPhoneScope(person.id);
  const read = readPhoneChallenge(input.challenge, { phone, storeId: scope }, secret);
  if (!read) throw new DetailsError("That code has expired. Send a new code.");
  const tries = await checkRateLimitShared(rateLimitKey("my-details:phone-verify", read.nonce), { maxRequests: 5, windowMs: 10 * 60_000, failClosed: true, sliding: false });
  if (!tries.allowed) throw new DetailsError("Too many wrong codes. Send a new code and try again.", "RATE_LIMITED", 429);
  const check = checkPhoneChallenge({ challenge: input.challenge, phone, storeId: scope, code: input.code }, secret);
  if (!check.ok) throw new DetailsError(check.reason === "invalid" ? "That code has expired. Send a new code." : "That code isn't right. Check it and try again.", "INVALID_CODE");
  // Someone else may have taken it while the code was on its way.
  await phoneProblem(person, phone);
  const admin = await getSupabaseServiceClient();
  const { error } = await admin.auth.admin.updateUserById(person.supabaseId, { phone, phone_confirm: true });
  if (error) {
    if (/phone_exists|already (been )?registered/i.test(`${error.code ?? ""} ${error.message}`)) throw new DetailsError(PHONE_TAKEN, "PHONE_TAKEN", 409);
    console.error("[my-details] phone change refused", error.message);
    throw new DetailsError("We couldn't change your phone number just now. Try again in a few minutes.", "UNAVAILABLE", 503);
  }
  await db.user.update({ where: { id: person.id }, data: { phone } });
  return { phone };
}
