import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { overPublicLimit } from "@/lib/rate-limit";

// "Track an order" on the storefront: a shopper proves the order is theirs with the order number plus the
// email or phone they ordered with, and gets back only the id of the existing order page.

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

const LookupSchema = z.object({
  orderNumber: z.string().trim().min(4).max(40),
  contact: z.string().trim().min(4).max(120),
});

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

function phoneTail(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : "";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (overPublicLimit(req.headers, "orderLookup")) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429), CORS);
  const { slug } = await params;
  const parsed = LookupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Enter your order number and the email or phone you ordered with."), CORS);

  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const orderNumber = parsed.data.orderNumber.replace(/^#/, "").toUpperCase();
  const order = await db.retailOrder.findFirst({
    where: { storeId: store.id, orderNumber },
    select: { id: true, buyerEmail: true, buyerPhone: true },
  });

  const contact = parsed.data.contact;
  const matches = Boolean(
    order &&
      ((contact.includes("@") && order.buyerEmail.trim().toLowerCase() === contact.toLowerCase()) ||
        (!contact.includes("@") && phoneTail(contact) !== "" && phoneTail(contact) === phoneTail(order.buyerPhone))),
  );

  // Same answer whether the number or the contact was wrong, so order numbers can't be probed.
  if (!order || !matches) {
    return withCors(req, apiError("NOT_FOUND", "We couldn't find an order with those details. Check the number on your confirmation message.", 404), CORS);
  }

  return withCors(req, ok({ orderId: order.id }), CORS);
}
