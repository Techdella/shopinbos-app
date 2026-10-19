import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { googleAuthUrl, googleConfigured, googleState } from "@/lib/reviews/google";

import { platformConfigured } from "@/lib/sales-channels/pure";

export const dynamic = "force-dynamic";

// GET: starts Google Business Profile sign-in for the seller's store.
// With "Connect Google" set up, this goes to the one Google sign-in, which connects every Google feature at once.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  if (platformConfigured("google")) return NextResponse.redirect(new URL(`/api/app/sales-channels/google/connect?next=${encodeURIComponent("/home/reviews/sources")}`, req.url));
  const back = new URL("/home/reviews/sources", req.url);
  if (!googleConfigured()) {
    back.searchParams.set("google", "not_configured");
    return NextResponse.redirect(back);
  }
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return NextResponse.redirect(new URL("/home", req.url));
  return NextResponse.redirect(googleAuthUrl(googleState(store.id)));
});
