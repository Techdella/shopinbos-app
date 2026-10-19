import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { searchConsoleAuthUrl, searchConsoleConfigured, searchConsoleState } from "@/lib/search-console/google.server";

import { platformConfigured } from "@/lib/sales-channels/pure";

export const dynamic = "force-dynamic";

// GET: starts "Connect with Google" (Search Console, read only) for the seller's store.
// With "Connect Google" set up, this goes to the one Google sign-in, which connects every Google feature at once.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  if (platformConfigured("google")) return NextResponse.redirect(new URL(`/api/app/sales-channels/google/connect?next=${encodeURIComponent("/home/connections")}`, req.url));
  const back = new URL("/home/connections", req.url);
  back.hash = "search-console";
  if (!searchConsoleConfigured()) {
    back.searchParams.set("google", "not_configured");
    return NextResponse.redirect(back);
  }
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return NextResponse.redirect(new URL("/home", req.url));
  return NextResponse.redirect(searchConsoleAuthUrl(searchConsoleState(store.id)));
});
