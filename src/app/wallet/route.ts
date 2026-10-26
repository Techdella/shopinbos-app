import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// GET /wallet: the Shopinbos Wallet for whoever is signed in (the "wallet is ready" email and WhatsApp don't know the
// portal). Signed out: sign in first, then back here.
const PAGE: Record<string, string> = { seller: "/home/wallet", supplier: "/supplier/wallet", logistics_partner: "/logistics/wallet" };

export async function GET(req: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/wallet")}`, req.url));
  return NextResponse.redirect(new URL(PAGE[user.role] ?? "/", req.url));
}
