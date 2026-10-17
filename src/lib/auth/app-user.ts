import "server-only";

import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db/client";
import { slugify } from "@/lib/workspace";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { decideAccountRole, metadataNeedsAlign } from "@/lib/auth/role-rules";

type AppUserInput = {
  supabaseId: string;
  email: string | null;
  role?: Role | string | null;
  fullName?: string | null;
  businessName?: string | null;
  phone?: string | null;
};

const roles = new Set<Role>(["seller", "supplier", "logistics_partner", "admin"]);

function normalizeRole(role: AppUserInput["role"]): Role {
  return roles.has(role as Role) ? (role as Role) : "seller";
}

function displayNameFromEmail(email: string | null) {
  return email?.split("@")[0]?.replace(/[._-]/g, " ") || "Shopinbos User";
}

/** Supabase stores phones without the plus sign ("2348031234567"). */
export function e164FromSupabase(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? `+${digits}` : null;
}

function adminInviteEmails() {
  return (process.env.SHOPINBOS_ADMIN_INVITE_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function supabaseEmailConfirmed(supabaseId: string, email: string) {
  try {
    const admin = await getSupabaseServiceClient();
    const { data } = await admin.auth.admin.getUserById(supabaseId);
    const user = data?.user;
    return Boolean(user && user.email?.toLowerCase() === email && user.email_confirmed_at);
  } catch {
    return false;
  }
}

export function appUserInputFromSupabaseUser(user: SupabaseUser): AppUserInput {
  const metadata = user.user_metadata ?? {};
  return {
    supabaseId: user.id,
    email: user.email || null,
    role: metadata.role as Role | undefined,
    fullName: (metadata.fullName as string | undefined) ?? (metadata.full_name as string | undefined) ?? (metadata.name as string | undefined),
    businessName: (metadata.businessName as string | undefined) ?? (metadata.business_name as string | undefined),
    phone: e164FromSupabase(user.phone) ?? (metadata.phone as string | undefined),
  };
}

export async function ensureAppUserForSupabaseUser(input: AppUserInput) {
  const email = input.email?.trim().toLowerCase() || null;
  const fullName = input.fullName || displayNameFromEmail(email);

  // First check by supabaseId, then fall back to email (handles supabaseId mismatches
  // that occur when an account is recreated or provisioned externally with a different ID)
  let existingUser = await db.user.findUnique({
    where: { supabaseId: input.supabaseId },
    select: { id: true, role: true },
  });

  if (!existingUser && email) {
    const byEmail = await db.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });
    // Re-link only when Supabase says this login owns the address (confirmed email); otherwise anyone could sign
    // up with someone else's email and take over their account.
    if (byEmail && (await supabaseEmailConfirmed(input.supabaseId, email))) {
      // Fix the stale supabaseId so future lookups hit the fast path
      await db.user.update({ where: { id: byEmail.id }, data: { supabaseId: input.supabaseId } });
      existingUser = byEmail;
    }
  }

  const requestedRole = normalizeRole(input.role);
  const invited = email ? adminInviteEmails().includes(email) : false;
  const canUseAdminRole = existingUser?.role === "admin" || (requestedRole === "admin" && invited && (await supabaseEmailConfirmed(input.supabaseId, email!)));
  // One account is one role (src/lib/auth/role-rules.ts). The requested role (sign-up page, Google's ?role=, or
  // metadata, which people can edit) only decides the role of a brand-new account. An existing seller who signs up
  // on the supplier page stays a seller and keeps their shop; only an approved admin invite can become admin.
  const role = decideAccountRole({ existingRole: existingUser?.role, requestedRole, canUseAdminRole });

  const phone = input.phone?.trim() || undefined;

  const user = await db.user.upsert({
    where: { supabaseId: input.supabaseId },
    create: {
      supabaseId: input.supabaseId,
      email,
      name: fullName,
      phone,
      role,
    },
    update: {
      // Never clear a stored email when signing in with a phone number.
      ...(email ? { email } : {}),
      ...(input.fullName ? { name: fullName } : {}),
      phone,
      role,
    },
  });

  // A brand-new account: leads with the same email or phone become "signed up", and analytics hears about it.
  if (!existingUser) {
    const { onAccountCreated } = await import("@/lib/lead-growth/service.server");
    await onAccountCreated({ id: user.id, supabaseId: user.supabaseId, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt }).catch(() => undefined);
  }

  if (role === "seller") {
    const storeName = input.businessName || `${fullName}'s Store`;
    await db.store.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        name: storeName,
        slug: `${slugify(storeName)}-${user.id.slice(0, 6)}`,
        country: "Nigeria",
        city: "Lagos",
        onboardingState: "NEW",
        firstDashboardVisitComplete: false,
      },
      // Only rename when the person typed a business name; a plain sign-in must not reset it.
      update: input.businessName ? { name: storeName } : {},
    });
  }

  if (role === "supplier") {
    const businessName = input.businessName || `${fullName} Supplies`;
    await db.supplier.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        businessName,
        displayName: businessName,
        slug: `${slugify(businessName)}-${user.id.slice(0, 6)}`,
        businessType: "wholesaler",
        country: "Nigeria",
        city: "Lagos",
        categories: [],
        verificationStatus: "unverified",
        onboardingState: { source: "signup", completed: false },
      },
      update: input.businessName ? { businessName, displayName: businessName } : {},
    });
  }

  if (role === "logistics_partner") {
    const companyName = input.businessName || `${fullName} Logistics`;
    await db.logisticsPartner.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        companyName,
        displayName: companyName,
        slug: `${slugify(companyName)}-${user.id.slice(0, 6)}`,
        country: "Nigeria",
        city: "Lagos",
        coverageZones: [],
        vehicleTypes: ["bike"],
        deliveryTypes: ["same_day"],
        verificationStatus: "unverified",
        onboardingState: { source: "signup", completed: false },
      },
      update: input.businessName ? { companyName, displayName: companyName } : {},
    });
  }

  return user;
}

/**
 * Keeps the login's `user_metadata.role` in line with the stored role: fills it in when missing (Google sign-ups)
 * and puts it back when it disagrees, so nothing downstream (the phone app, API fallbacks) reads a stale role.
 * Never throws; the stored role is what counts either way.
 */
export async function alignRoleMetadata(supabaseId: string, metadataRole: unknown, role: Role) {
  if (!metadataNeedsAlign(role, metadataRole)) return;
  try {
    const admin = await getSupabaseServiceClient();
    await admin.auth.admin.updateUserById(supabaseId, { user_metadata: { role } });
  } catch {
    // Best effort.
  }
}
