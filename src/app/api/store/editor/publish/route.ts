import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { publishStoreDraft, StorePublishError } from "@/lib/store-publishing";
import { storeLaunchPrices } from "@/lib/store-launch-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withSeller(async (_req: NextRequest, { user }) => {
  try {
    const store = await db.store.findUnique({
      where: { userId: user.id },
      select: { status: true, brandSettings: true },
    });
    const settings = store?.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings)
      ? store.brandSettings as Record<string, unknown>
      : {};
    const launchBilling = settings.launchBilling && typeof settings.launchBilling === "object" && !Array.isArray(settings.launchBilling)
      ? settings.launchBilling as Record<string, unknown>
      : null;
    const hasLaunchAccess = store?.status === "active"
      || store?.status === "published"
      || launchBilling?.status === "paid"
      || launchBilling?.status === "deposit_paid";

    if (!hasLaunchAccess) {
      const prices = await storeLaunchPrices();
      return NextResponse.json(
        {
          error: {
            code: "STORE_LAUNCH_PAYMENT_REQUIRED",
            message: "Choose a billing option before taking your store live.",
          },
          billing: { total: prices.totalNgn, deposit: prices.depositNgn },
        },
        { status: 402 },
      );
    }
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
