import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// GET /refer(?for=supplier): Refer & earn for whoever is signed in (links in emails, WhatsApp and notifications don't
// know the portal). Signed out: sign in first, then back here.
const PAGE: Record<string, string> = { seller: "/home/refer", supplier: "/supplier/refer", logistics_partner: "/logistics/refer" };

export async function GET(req: NextRequest) {
  const user = await getCurrentAppUser();
  const forRole = req.nextUrl.searchParams.get("for");
  const query = forRole ? `?for=${encodeURIComponent(forRole)}` : "";
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/refer${query}`)}`, req.url));
  const page = PAGE[user.role];
  return NextResponse.redirect(new URL(page ? `${page}${query}` : "/", req.url));
}
