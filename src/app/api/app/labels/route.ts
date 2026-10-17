import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { parseOrderIds } from "@/lib/labels";
import { loadLabels } from "@/lib/labels.server";
import { LABEL_TOKEN_TTL_MS, signLabelToken } from "@/lib/labels-token";

export const dynamic = "force-dynamic";

// Shipping labels for the phone app (apps/mobile/src/app/order/label.tsx). Auth: Bearer (or the web session),
// role seller. GET ?orders=<id>[,<id>…] → the labels to preview (the same data as the web's /home/labels/print)
// and a short-lived `printToken` for GET /api/app/labels/print?token=…, which the in-app browser opens to print.

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const orderIds = parseOrderIds(req.nextUrl.searchParams.get("orders"));
  if (!orderIds.length) return apiError("BAD_REQUEST", "Say which order to print a label for.");

  const { store, storePhone, labels } = await loadLabels({ userId: user.id, orderIds });
  if (!store || !labels.length) return apiError("NOT_FOUND", "That order couldn't be found.", 404);

  let printToken: string | null = null;
  try {
    printToken = signLabelToken({ userId: user.id, orderIds: labels.map(({ order }) => order.id) });
  } catch {
    // No signing secret on this server: the app still shows the label and can share it as text.
  }

  return ok({
    shop: { name: store.name, phone: storePhone, logoUrl: store.logoUrl },
    labels: labels.map(({ order, trackUrl, lines, collect, count }) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      buyerName: order.buyerName,
      buyerPhone: order.buyerPhone,
      addressLines: lines,
      collect,
      itemCount: count,
      createdAt: order.createdAt.toISOString(),
      trackUrl,
    })),
    printToken,
    expiresInSeconds: LABEL_TOKEN_TTL_MS / 1000,
  });
});
