import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { parseBody } from "@/lib/api/validate";
import { CouponCreateSchema } from "@/lib/schemas";

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return NextResponse.json({ data: [] });

  const coupons = await db.coupon.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: coupons });
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return NextResponse.json({ error: "No store found" }, { status: 400 });

  const parsed = await parseBody(CouponCreateSchema, req);
  if ("error" in parsed) return parsed.error;

  const body = parsed.data;

  if (body.action === "generate") {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    const coupon = await db.coupon.create({
      data: {
        storeId: store.id,
        code,
        type: body.type,
        value: body.value,
        minOrder: body.minOrder ?? null,
        maxUses: body.maxUses,
        expiresAt: body.expiresAt ?? null,
      },
    });

    return NextResponse.json({ data: coupon });
  }

  const coupon = await db.coupon.create({
    data: {
      storeId: store.id,
      code: (body.code ?? "").toUpperCase().replace(/\s+/g, ""),
      type: body.type,
      value: body.value,
      minOrder: body.minOrder ?? null,
      maxUses: body.maxUses,
      expiresAt: body.expiresAt ?? null,
    },
  });

  return NextResponse.json({ data: coupon });
});
