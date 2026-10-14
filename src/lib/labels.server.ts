import "server-only";
import QRCode from "qrcode";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { addressLines, amountToCollect, itemCount } from "@/lib/labels";

// The seller's shipping labels for some orders: the web print page (/home/labels/print), the phone app's label
// preview (GET /api/app/labels) and its print link (GET /api/app/labels/print) all read them here.

export async function loadLabels(input: { userId: string; userPhone?: string | null; orderIds: string[] }) {
  const store = await db.store.findUnique({
    where: { userId: input.userId },
    select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true, liveChatConfig: { select: { whatsappNumber: true, contactPhone: true } } },
  });
  const orders = store && input.orderIds.length
    ? await db.retailOrder.findMany({ where: { storeId: store.id, id: { in: input.orderIds } }, orderBy: { createdAt: "asc" } })
    : [];
  let userPhone = input.userPhone;
  if (userPhone === undefined && store && !store.liveChatConfig?.whatsappNumber && !store.liveChatConfig?.contactPhone) {
    userPhone = (await db.user.findUnique({ where: { id: input.userId }, select: { phone: true } }))?.phone ?? null;
  }
  const storePhone = store?.liveChatConfig?.whatsappNumber || store?.liveChatConfig?.contactPhone || userPhone || null;

  const labels = await Promise.all(
    orders.map(async (order) => {
      const trackUrl = buildStorefrontUrl(store!, `/order/${order.id}`);
      return {
        order,
        trackUrl,
        qr: await QRCode.toString(trackUrl, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
        lines: addressLines(order.deliveryAddress),
        collect: amountToCollect({ status: order.status, total: Number(order.total) }),
        count: itemCount(order.items),
      };
    }),
  );

  return { store, storePhone, labels };
}

export type LoadedLabels = Awaited<ReturnType<typeof loadLabels>>;
