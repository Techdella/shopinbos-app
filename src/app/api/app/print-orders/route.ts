import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { createPrintOrder, PrintOrderError } from "@/lib/packaging/print-orders.server";
import { PrintOrderSchema } from "@shared/print-orders";
import { appCallbackUrl } from "@/lib/payments/app-return.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Order prints of a saved packaging design: GET lists the store's print orders; POST prices it on the server and
// starts the Paystack payment.
export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(await db.printOrder.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 50, omit: { design: true } }));
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = PrintOrderSchema.safeParse(body);
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the order details.");
  try {
    return ok(await createPrintOrder({ user: { id: user.id, email: user.email ?? null }, storeId: store.id, order: parsed.data, callbackUrl: appCallbackUrl(body?.app) }));
  } catch (error) {
    if (error instanceof PrintOrderError) return apiError("BAD_REQUEST", error.message);
    console.error("[print-orders] create failed", error);
    return apiError("BAD_GATEWAY", "Couldn't start the payment. Try again.", 502);
  }
});
