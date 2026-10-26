import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";

export const dynamic = "force-dynamic";

// GET /o/:orderId: a shop order's page on its store (the WhatsApp order summary's button needs one fixed link base).
// The order page itself decides what the shopper sees.
export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = /^[a-z0-9]{10,40}$/i.test(orderId)
    ? await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, store: { select: { slug: true, customDomain: true } } } }).catch(() => null)
    : null;
  if (!order) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.redirect(buildStorefrontUrl(order.store, `/order/${order.id}`));
}
