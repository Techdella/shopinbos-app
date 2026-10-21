import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { LABEL_READY_STATUSES, addressLines, amountToCollect, itemCount, parseOrderIds } from "@/lib/labels";
import { orderRow } from "@/lib/dashboard/compute";
import { LabelPicker } from "./LabelPicker";
import { DesignsHub, type HubDesign } from "./DesignsHub";
import { listDesigns } from "@/lib/packaging/designs.server";
import { isMissingTable } from "@/lib/rate-limit-core";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("packaging");
  return { title: t("hub.title") };
}

export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ orders?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("orders");
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

  const tp = await getT("packaging");
  let designs: HubDesign[] = [];
  let migrationNeeded = false;
  if (store) {
    try {
      designs = await listDesigns(store.id);
    } catch (error) {
      if (!isMissingTable(error)) throw error;
      migrationNeeded = true;
    }
  }
  const shipping = (
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
          stageText: t.dynamic(`stage.${row.stage.label}`, row.stage.label),
          items: itemCount(order.items),
          hasAddress: addressLines(order.deliveryAddress).length > 0,
          collect: amountToCollect({ status: order.status, total: Number(order.total) }),
          createdAt: order.createdAt.toISOString(),
        };
      })}
    />
  );

  return (
    <SellerPage user={user} store={storeSummary(store)} title={tp("hub.title")} sub={tp("hub.sub")}>
      <div className="grid gap-8">
        <PageTip>{tipT("labels")}</PageTip>
        {/* Coming from Orders with labels picked: the shipping labels come first. */}
        {preselected.length ? null : <DesignsHub designs={designs} migrationNeeded={migrationNeeded} />}
        <section id="shipping" className="grid gap-3">
          <div>
            <h2 className="m-0 text-[18px] font-extrabold">{t("lab.title")}</h2>
            <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">{t("lab.sub")}</p>
          </div>
          {shipping}
        </section>
        {preselected.length ? <DesignsHub designs={designs} migrationNeeded={migrationNeeded} /> : null}
      </div>
    </SellerPage>
  );
}
