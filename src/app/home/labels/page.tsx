import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { LABEL_READY_STATUSES, addressLines, amountToCollect, itemCount, parseOrderIds } from "@/lib/labels";
import { orderRow } from "@/lib/dashboard/compute";
import { LabelPicker } from "./LabelPicker";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Labels and print" };

export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ orders?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const { orders: requested } = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const preselected = parseOrderIds(requested);

  const orders = store
    ? await db.retailOrder.findMany({
        where: {
          storeId: store.id,
          OR: [{ status: { in: [...LABEL_READY_STATUSES] } }, ...(preselected.length ? [{ id: { in: preselected } }] : [])],
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : [];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Labels and print"
      sub="Shipping labels with your logo, the customer's address and a QR code to track the order, plus packing slips to put in the parcel."
    >
      <LabelPicker
        preselected={preselected}
        orders={orders.map((order) => {
          const row = orderRow({ ...order, total: Number(order.total) });
          return {
            id: order.id,
            orderNumber: order.orderNumber,
            buyer: order.buyerName,
            summary: row.summary,
            image: row.image,
            stage: row.stage.label,
            items: itemCount(order.items),
            hasAddress: addressLines(order.deliveryAddress).length > 0,
            collect: amountToCollect({ status: order.status, total: Number(order.total) }),
            createdAt: order.createdAt.toISOString(),
          };
        })}
      />
    </SellerPage>
  );
}
