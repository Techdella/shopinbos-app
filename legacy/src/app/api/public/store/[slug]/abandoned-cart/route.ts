import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { created, apiError } from "@/lib/api/response";
import { sendEmail } from "@/lib/notifications/resend";
import { triggerAutomations } from "@/lib/automations/engine";
import { seedDefaultAbandonedCartAutomation } from "@/lib/automations/defaults";
import { upsertStoreVisitor } from "@/lib/storefront/visitor-data";

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const CartSchema = z.object({
  visitorKey: z.string().min(8),
  email: z.string().email(),
  name: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    name: z.string(),
    price: z.number(),
    quantity: z.number().int().positive(),
    image: z.string().optional(),
  })).min(1),
  subtotal: z.number().nonnegative(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, status: true, currency: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const body = await req.json().catch(() => null);
  const parsed = CartSchema.safeParse(body);
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid cart"), CORS);

  const input = parsed.data;
  const visitorId = await upsertStoreVisitor({ storeId: store.id, visitorKey: input.visitorKey, email: input.email, name: input.name });
  await seedDefaultAbandonedCartAutomation(store);
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `
      INSERT INTO "AbandonedCartEvent" (id, "storeId", "visitorId", email, name, items, subtotal, currency)
      VALUES (gen_random_uuid()::text, $1, $2, $3, NULLIF($4, ''), $5::jsonb, $6, $7)
      RETURNING id
    `,
    store.id,
    visitorId,
    input.email,
    input.name ?? "",
    JSON.stringify(input.items),
    input.subtotal,
    store.currency,
  );

  await Promise.allSettled([
    triggerAutomations("abandoned_checkout", {
      storeId: store.id,
      storeName: store.name,
      buyerEmail: input.email,
      buyerName: input.name,
      orderTotal: input.subtotal,
      currency: store.currency,
      cartItems: input.items,
    }),
    sendEmail({
      to: [input.email],
      subject: `You left something at ${store.name}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 10px">Still thinking it over?</h2>
          <p style="color:#555;line-height:1.6">Your cart at <strong>${store.name}</strong> is saved.</p>
          <p style="font-weight:700">Subtotal: ${store.currency} ${input.subtotal.toLocaleString()}</p>
          <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/s/${store.slug}/checkout" style="display:inline-block;margin-top:12px;background:#111;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">Return to checkout</a>
        </div>
      `,
    }),
  ]);

  return withCors(req, created({ id: rows[0]?.id ?? null }), CORS);
}
