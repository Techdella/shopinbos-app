import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { verifyJWT } from "@/lib/auth/middleware";
import { ensureAppUserForSupabaseUser } from "@/lib/auth/app-user";

function adminInviteEmails() {
  return (process.env.SHOPINBOS_ADMIN_INVITE_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

const roleProvisioningDefaults = {
  supplier: {
    verificationStatus: "unverified",
    onboardingState: { source: "signup", completed: false },
  },
  logistics_partner: {
    verificationStatus: "unverified",
    onboardingState: { source: "signup", completed: false },
  },
} as const;

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: { message: "Missing bearer token" } }, { status: 401 });
  }

  const claims = await verifyJWT(token);
  if (!claims) {
    return NextResponse.json({ error: { message: "Invalid session token" } }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    role?: "seller" | "supplier" | "logistics_partner" | "admin";
    fullName?: string;
    businessName?: string;
    phone?: string;
    source?: "signup";
  };

  const requestedRole = claims.user_metadata?.role ?? (body.source === "signup" ? body.role : undefined) ?? "seller";
  const fullName =
    body.fullName ||
    claims.user_metadata?.name ||
    claims.email?.split("@")[0]?.replace(/[._-]/g, " ") ||
    "Shopinbos User";

  const email = claims.email?.toLowerCase() ?? null;

  // Check by supabaseId first, then fall back to email (handles account recreation / ID mismatch)
  let existingUser = await db.user.findUnique({
    where: { supabaseId: claims.sub },
    select: { id: true, role: true },
  });
  if (!existingUser && email) {
    existingUser = await db.user.findUnique({ where: { email }, select: { id: true, role: true } }) ?? null;
  }

  const requestedAdmin = requestedRole === "admin";
  const isAdminInvite = email ? adminInviteEmails().includes(email) : false;
  const canUseAdminRole = existingUser?.role === "admin" || isAdminInvite;

  if (requestedAdmin && !canUseAdminRole) {
    return NextResponse.json(
      { error: { message: "Admin access is invite-only. Ask an existing admin to approve this account." } },
      { status: 403 },
    );
  }

  // Admin invite emails always get admin role (even if JWT metadata says "seller")
  const effectiveRequestedRole = isAdminInvite ? "admin" : requestedRole;
  const role = existingUser?.role === "admin" ? "admin" : (existingUser?.role ?? effectiveRequestedRole);

  void roleProvisioningDefaults;
  const user = await ensureAppUserForSupabaseUser({
    supabaseId: claims.sub,
    email: claims.email,
    role,
    fullName,
    businessName: body.businessName,
    // A verified phone from the session wins over whatever the form sent.
    phone: claims.phone ?? body.phone,
  });

  return NextResponse.json({ data: { id: user.id, role: user.role } });
}
