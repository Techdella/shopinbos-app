import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { publishStoreDraft, StorePublishError } from "@/lib/store-publishing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publishing is free: there is no launch fee, whatever plan the seller is on.
export const POST = withSeller(async (_req: NextRequest, { user }) => {
  try {
    const result = await publishStoreDraft({ userId: user.id });
    return NextResponse.json({ data: result.envelope });
  } catch (error) {
    if (error instanceof StorePublishError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message, blockers: error.blockers } },
        { status: error.status },
      );
    }
    throw error;
  }
});
