import { NextRequest, NextResponse, after } from "next/server";
import { provisionWallet } from "@/lib/wallet/balance.server";
import { db } from "@/lib/db/client";
import { verifyJWT } from "@/lib/auth/middleware";
import { alignRoleMetadata, ensureAppUserForSupabaseUser } from "@/lib/auth/app-user";
import { requestedSignupRole } from "@/lib/auth/role-rules";
import { attributeReferral, claimReferralFromCookie } from "@/lib/referrals/service.server";

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
    /** An invite code typed in, or carried by the phone app (the web uses the sib_ref cookie). */
    ref?: string;
    /** Only ask whether this login already has an account (and its role); nothing is made or changed. */
    peek?: boolean;
  };

  // The role saved on the login when it was made, else (Google sign-ups carry none) the one picked on the sign-up
  // page. It only matters for a brand-new account: an existing one keeps its role (src/lib/auth/role-rules.ts).
  const requestedRole = requestedSignupRole(claims.user_metadata?.rawRole, body.role, body.source === "signup");
  // Only a name someone typed (the form, or the login's metadata: the phone app saves it as full_name). Without one,
  // ensureAppUserForSupabaseUser makes a new account's name from the email, or the stand-in.
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = [body.fullName, meta.full_name, meta.fullName, meta.name].find((value): value is string => typeof value === "string" && value.trim() !== "")?.trim();

  const email = claims.email?.toLowerCase() ?? null;

  // Check by supabaseId first, then fall back to email (handles account recreation / ID mismatch)
  let existingUser = await db.user.findUnique({
    where: { supabaseId: claims.sub },
    select: { id: true, role: true },
  });
  if (!existingUser && email) {
    existingUser = await db.user.findUnique({ where: { email }, select: { id: true, role: true } }) ?? null;
  }
  // Google or Apple from the phone: is this a new person (ask what brings them, then set up) or a log in?
  if (body.peek) return NextResponse.json({ data: { exists: Boolean(existingUser), role: existingUser?.role ?? null } });

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

  // Fill in (or put back) the role on the login itself, so the phone app and API fallbacks read the same role.
  await alignRoleMetadata(claims.sub, claims.user_metadata?.rawRole, user.role);

  // Joined with an invite (Refer & earn): link it once, give the welcome gift and tell whoever invited them.
  if (typeof body.ref === "string" && body.ref) await attributeReferral(user.id, body.ref).catch(() => null);
  await claimReferralFromCookie(user.id);
  // Every business gets its wallet and own account number on sign-in, without holding up the sign-in.
  after(() => provisionWallet(user.id));

  return NextResponse.json({ data: { id: user.id, role: user.role } });
}
