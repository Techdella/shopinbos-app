import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { connectSearchConsole, readSearchConsoleState } from "@/lib/search-console/google.server";

export const dynamic = "force-dynamic";

// GET: Google sends the seller back here after sign-in. The state must be one we signed for this seller's store.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const back = new URL("/home/connections", req.url);
  back.hash = "search-console";
  const params = req.nextUrl.searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  const stateStore = readSearchConsoleState(params.get("state") ?? "");
  if (!store || !stateStore || stateStore !== store.id) {
    back.searchParams.set("google", "invalid_state");
    return NextResponse.redirect(back);
  }
  if (params.get("error") || !params.get("code")) {
    back.searchParams.set("google", "cancelled");
    return NextResponse.redirect(back);
  }
  try {
    await connectSearchConsole(store.id, params.get("code")!);
    back.searchParams.set("google", "signed_in");
  } catch (error) {
    console.error("[search-console] connect failed", error);
    back.searchParams.set("google", "failed");
  }
  return NextResponse.redirect(back);
});
