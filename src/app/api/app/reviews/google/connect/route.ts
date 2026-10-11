import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { googleAuthUrl, googleConfigured, googleState } from "@/lib/reviews/google";

export const dynamic = "force-dynamic";

// GET: starts Google Business Profile sign-in for the seller's store.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const back = new URL("/home/reviews/sources", req.url);
  if (!googleConfigured()) {
    back.searchParams.set("google", "not_configured");
    return NextResponse.redirect(back);
  }
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return NextResponse.redirect(new URL("/home", req.url));
  return NextResponse.redirect(googleAuthUrl(googleState(store.id)));
});
