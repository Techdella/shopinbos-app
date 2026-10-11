import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { parseBody } from "@/lib/api/validate";
import { CouponValidateSchema } from "@/lib/schemas";
import { redemptionError } from "@/lib/discounts";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(CouponValidateSchema, req);
  if ("error" in parsed) return parsed.error;

  const { code, storeId, subtotal } = parsed.data;

  const discount = await db.discount.findUnique({
    where: { storeId_code: { storeId, code: code.toUpperCase() } },
  });

  if (discount) {
    const error = redemptionError(discount, subtotal);
    if (error) return NextResponse.json({ valid: false, error });

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
    const error = redemptionError(coupon, subtotal);
    if (error) return NextResponse.json({ valid: false, error });

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
