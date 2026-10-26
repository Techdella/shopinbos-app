import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// GET /verify: the verification page for whoever is signed in (the "verify your account" emails and WhatsApp don't
// know the portal). Signed out: sign in first, then back here.
const PAGE: Record<string, string> = { supplier: "/supplier/verification", logistics_partner: "/logistics/verification" };

export async function GET(req: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/verify")}`, req.url));
  return NextResponse.redirect(new URL(PAGE[user.role] ?? "/", req.url));
}
