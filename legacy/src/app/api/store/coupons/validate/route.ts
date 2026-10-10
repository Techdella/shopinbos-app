import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { parseBody } from "@/lib/api/validate";
import { CouponValidateSchema } from "@/lib/schemas";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(CouponValidateSchema, req);
  if ("error" in parsed) return parsed.error;

  const { code, storeId, subtotal } = parsed.data;

  const discount = await db.discount.findUnique({
    where: { storeId_code: { storeId, code: code.toUpperCase() } },
  });

  if (discount) {
    if (discount.status !== "active") {
      return NextResponse.json({ valid: false, error: "This discount is not active" });
    }
    if (discount.expiresAt && new Date() > discount.expiresAt) {
      return NextResponse.json({ valid: false, error: "This discount has expired" });
    }
    if (discount.maxUses && discount.maxUses > 0 && discount.usedCount >= discount.maxUses) {
      return NextResponse.json({ valid: false, error: "This discount has reached its usage limit" });
    }
    if (discount.minOrder && subtotal < discount.minOrder) {
      return NextResponse.json({ valid: false, error: `Minimum order of ${discount.minOrder} required` });
    }

    return NextResponse.json({
      valid: true,
      type: discount.type,
      value: discount.value,
      name: discount.name,
      code: discount.code,
      discountId: discount.id,
    });
  }

  const coupon = await db.coupon.findUnique({
    where: { code: code.toUpperCase() },
  });

  if (coupon) {
    if (coupon.storeId !== storeId) {
      return NextResponse.json({ valid: false, error: "Invalid coupon for this store" });
    }
    if (coupon.status !== "active") {
      return NextResponse.json({ valid: false, error: "This coupon is not active" });
    }
    if (coupon.expiresAt && new Date() > coupon.expiresAt) {
      return NextResponse.json({ valid: false, error: "This coupon has expired" });
    }
    if (coupon.maxUses && coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ valid: false, error: "This coupon has reached its usage limit" });
    }
    if (coupon.minOrder && subtotal < coupon.minOrder) {
      return NextResponse.json({ valid: false, error: `Minimum order of ${coupon.minOrder} required` });
    }

    return NextResponse.json({
      valid: true,
      type: coupon.type,
      value: coupon.value,
      name: coupon.code,
      code: coupon.code,
      couponId: coupon.id,
    });
  }

  return NextResponse.json({ valid: false, error: "Invalid code" });
}
