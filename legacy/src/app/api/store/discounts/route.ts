import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { parseBody } from "@/lib/api/validate";
import { DiscountCreateSchema, DiscountUpdateSchema } from "@/lib/schemas";

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return NextResponse.json({ data: [] });

  const discounts = await db.discount.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: discounts });
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return NextResponse.json({ error: "No store found" }, { status: 400 });

  const parsed = await parseBody(DiscountCreateSchema, req);
  if ("error" in parsed) return parsed.error;

  const d = parsed.data;
  const discount = await db.discount.create({
    data: {
      storeId: store.id,
      name: d.name || d.code,
      code: d.code,
      type: d.type,
      value: d.value,
      minOrder: d.minOrder ?? null,
      maxUses: d.maxUses ?? null,
      startsAt: d.startsAt ?? null,
      expiresAt: d.expiresAt ?? null,
      status: d.status,
    },
  });

  return NextResponse.json({ data: discount });
});

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return NextResponse.json({ error: "No store found" }, { status: 400 });

  const parsed = await parseBody(DiscountUpdateSchema, req);
  if ("error" in parsed) return parsed.error;

  const { id, ...fields } = parsed.data;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const discount = await db.discount.update({
    where: { id, storeId: store.id },
    data: fields,
  });

  return NextResponse.json({ data: discount });
});

export const DELETE = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return NextResponse.json({ error: "No store found" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.discount.delete({ where: { id, storeId: store.id } });
  return NextResponse.json({ success: true });
});
