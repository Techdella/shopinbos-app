import "server-only";

import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db/client";
import { queueLifecycle } from "@/lib/lifecycle/run.server";
import { slugify } from "@/lib/workspace";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

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

function resolveRole(existingRole: Role | undefined, requestedRole: Role, canUseAdminRole: boolean): Role {
  if (requestedRole === "admin" && !canUseAdminRole) {
    return existingRole ?? "seller";
  }

  if (!existingRole || existingRole === requestedRole) {
    return requestedRole;
  }

  if (existingRole === "admin") {
    return existingRole;
  }

  if (requestedRole === "supplier" || requestedRole === "logistics_partner") {
    return requestedRole;
  }

  return existingRole;
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

async function recentlyCreated(userId: string) {
  const row = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true } }).catch(() => null);
  return Boolean(row && Date.now() - row.createdAt.getTime() < 10 * 60_000);
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
  const canUseAdminRole = existingUser?.role === "admin" || (invited && (await supabaseEmailConfirmed(input.supabaseId, email!)));
  // Role metadata is editable by the signed-in user, so it only decides the role of a new account (or one created
  // moments ago, when sign-up raced the first sync). After that the stored role wins.
  const role = existingUser && !(await recentlyCreated(existingUser.id)) && !(requestedRole === "admin" && canUseAdminRole)
    ? existingUser.role
    : resolveRole(existingUser?.role, requestedRole, canUseAdminRole);

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

  // A brand-new account: send the welcome email for their role now rather than on the next hourly sweep.
  if (!existingUser) queueLifecycle(user.id);

  return user;
}
