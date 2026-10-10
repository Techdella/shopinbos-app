import "server-only";

import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db/client";
import { slugify } from "@/lib/workspace";

type AppUserInput = {
  supabaseId: string;
  email: string;
  role?: Role | string | null;
  fullName?: string | null;
  businessName?: string | null;
  phone?: string | null;
};

const roles = new Set<Role>(["seller", "supplier", "logistics_partner", "admin"]);

function normalizeRole(role: AppUserInput["role"]): Role {
  return roles.has(role as Role) ? (role as Role) : "seller";
}

function displayNameFromEmail(email: string) {
  return email.split("@")[0]?.replace(/[._-]/g, " ") || "Shopinbos User";
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

export function appUserInputFromSupabaseUser(user: SupabaseUser): AppUserInput {
  const metadata = user.user_metadata ?? {};
  return {
    supabaseId: user.id,
    email: user.email ?? "",
    role: metadata.role as Role | undefined,
    fullName: (metadata.fullName as string | undefined) ?? (metadata.full_name as string | undefined) ?? (metadata.name as string | undefined),
    businessName: (metadata.businessName as string | undefined) ?? (metadata.business_name as string | undefined),
    phone: metadata.phone as string | undefined,
  };
}

export async function ensureAppUserForSupabaseUser(input: AppUserInput) {
  const email = input.email.toLowerCase();
  const fullName = input.fullName || displayNameFromEmail(email);

  // First check by supabaseId, then fall back to email (handles supabaseId mismatches
  // that occur when an account is recreated or provisioned externally with a different ID)
  let existingUser = await db.user.findUnique({
    where: { supabaseId: input.supabaseId },
    select: { id: true, role: true },
  });

  if (!existingUser) {
    const byEmail = await db.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });
    if (byEmail) {
      // Fix the stale supabaseId so future lookups hit the fast path
      await db.user.update({ where: { id: byEmail.id }, data: { supabaseId: input.supabaseId } });
      existingUser = byEmail;
    }
  }

  const requestedRole = normalizeRole(input.role);
  const canUseAdminRole = existingUser?.role === "admin" || adminInviteEmails().includes(email);
  const role = resolveRole(existingUser?.role, requestedRole, canUseAdminRole);

  const user = await db.user.upsert({
    where: { supabaseId: input.supabaseId },
    create: {
      supabaseId: input.supabaseId,
      email,
      name: fullName,
      phone: input.phone || undefined,
      role,
    },
    update: {
      email,
      name: fullName,
      phone: input.phone || undefined,
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
      update: {
        name: storeName,
      },
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
      update: {
        businessName,
        displayName: businessName,
      },
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
      update: {
        companyName,
        displayName: companyName,
      },
    });
  }

  return user;
}
