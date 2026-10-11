import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { connectGoogle, GoogleReviewsError, readGoogleState } from "@/lib/reviews/google";

export const dynamic = "force-dynamic";

// GET: Google sends the seller back here after sign-in. The state must be one we signed for this seller's store.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const back = new URL("/home/reviews/sources", req.url);
  const params = req.nextUrl.searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  const stateStore = readGoogleState(params.get("state") ?? "");
  if (!store || !stateStore || stateStore !== store.id) {
    back.searchParams.set("google", "invalid_state");
    return NextResponse.redirect(back);
  }
  if (params.get("error") || !params.get("code")) {
    back.searchParams.set("google", "cancelled");
    return NextResponse.redirect(back);
  }
  try {
    await connectGoogle(store.id, params.get("code")!);
    back.searchParams.set("google", "connected");
  } catch (error) {
    console.error("[reviews] google connect failed", error);
    back.searchParams.set("google", "failed");
    if (error instanceof GoogleReviewsError) back.searchParams.set("reason", error.message.slice(0, 160));
  }
  return NextResponse.redirect(back);
});
