import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { parseLabelFormat, parseOrderIds } from "@/lib/labels";
import { loadLabels } from "@/lib/labels.server";
import { naira } from "@shared/onboarding";
import { PrintButton } from "./PrintButton";
import { getT } from "@/lib/i18n/server";

// Print view for /home/labels: no app shell, sized for a 4×6 label printer or A4 (4 labels a page).

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("orders");
  return { title: t("lab.printTitle") };
}

interface Item {
  name?: string;
  quantity?: number;
  price?: number;
}

export default async function PrintLabelsPage({ searchParams }: { searchParams: Promise<{ orders?: string; format?: string; slips?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("orders");
  const params = await searchParams;
  const format = parseLabelFormat(params.format);
  const withSlips = params.slips !== "0";
  const ids = parseOrderIds(params.orders);

  // The same labels the phone app previews and prints (src/lib/labels.server.ts).
  const { store, storePhone, labels } = await loadLabels({ userId: user.id, userPhone: user.phone ?? null, orderIds: ids });

  const pageSize = format === "a4" ? "A4" : "4in 6in";

  return (
    <div className="labels-print min-h-dvh bg-app-canvas font-app text-app-ink print:bg-white">
      <style>{`
        @page { size: ${pageSize}; margin: ${format === "a4" ? "8mm" : "0"}; }
        @media print { .no-print { display: none !important; } body { background: #fff; } }
        /* Browsers drop background colours when printing; labels only use black text and borders. */
        .ship-label { width: 4in; height: 6in; box-sizing: border-box; break-inside: avoid; display: flex; flex-direction: column; color: #111; }
        .ship-label .ship-to { flex: 1; }
        .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0; width: 194mm; }
        .sheet .ship-label { width: 97mm; height: 138mm; border: 1px dashed #9a97a6; }
        .sheet .ship-label:nth-child(4n + 1):not(:first-child) { break-before: page; }
        .one .ship-label + .ship-label { break-before: page; }
        .slip { width: ${format === "a4" ? "194mm" : "4in"}; break-before: page; box-sizing: border-box; }
        .qr svg { width: 100%; height: 100%; }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-app-line bg-white px-5 py-3">
        <Link href="/home/labels" className="text-[14px] font-extrabold text-app-ink no-underline">{t("lab.back")}</Link>
        <span className="text-[14px] text-app-ink-soft">{t("lab.count", { count: labels.length })} · {format === "a4" ? t("lab.a4") : "4 × 6 in"}</span>
        <PrintButton disabled={!labels.length} label={t("lab.printButton")} />
      </div>

      {!labels.length ? (
        <p className="p-10 text-center text-[15px] text-app-ink-soft">{t("lab.nothingToPrint")}</p>
      ) : (
        <div className="mx-auto w-fit p-6 print:p-0">
          <div className={format === "a4" ? "sheet bg-white" : "one grid gap-6 print:gap-0"}>
            {labels.map(({ order, qr, lines, collect, count }) => (
              <article key={order.id} className="ship-label bg-white p-[0.22in]">
                <header className="flex items-center gap-2 border-b-2 border-black pb-2">
                  {store?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={store.logoUrl} alt="" className="h-9 w-9 rounded-[6px] object-contain" />
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-[6px] border-2 border-black text-[16px] font-extrabold">{store?.name.charAt(0)}</span>
                  )}
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-[15px] font-extrabold">{store?.name}</div>
                    {storePhone && <div className="text-[11px]">From · {storePhone}</div>}
                  </div>
                </header>

                <section className="ship-to py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em]">Deliver to</div>
                  <div className="mt-1 text-[22px] font-extrabold leading-tight">{order.buyerName}</div>
                  {order.buyerPhone && <div className="mt-0.5 text-[16px] font-bold">{order.buyerPhone}</div>}
                  <div className="mt-2 text-[15px] leading-snug">
                    {lines.length ? lines.map((line) => <div key={line}>{line}</div>) : <div className="italic">Customer pickup</div>}
                  </div>
                </section>

                {collect > 0 ? (
                  <div className="mb-2 rounded-[6px] border-2 border-black p-2 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em]">Pay on delivery · collect</div>
                    <div className="text-[24px] font-extrabold">{naira(collect)}</div>
                  </div>
                ) : (
                  <div className="mb-2 rounded-[6px] border-2 border-black p-1.5 text-center text-[13px] font-extrabold uppercase tracking-[0.18em]">Paid · do not collect</div>
                )}

                <footer className="flex items-end justify-between gap-3 border-t-2 border-black pt-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[13px] font-bold">{order.orderNumber}</div>
                    <div className="text-[11px]">{count} item{count === 1 ? "" : "s"} · {order.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</div>
                  </div>
                  <div className="qr h-[0.95in] w-[0.95in] shrink-0" aria-label="QR code to track this order" dangerouslySetInnerHTML={{ __html: qr }} />
                </footer>
              </article>
            ))}
          </div>

          {withSlips &&
            labels.map(({ order }) => {
              const items = (Array.isArray(order.items) ? order.items : []) as Item[];
              return (
                <article key={`slip-${order.id}`} className="slip mt-6 bg-white p-6 text-[#111] print:mt-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[18px] font-extrabold">{store?.name}</div>
                      <div className="text-[12px]">Packing slip · {order.orderNumber}</div>
                    </div>
                    <div className="text-right text-[12px]">
                      <div className="font-bold">{order.buyerName}</div>
                      <div>{order.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</div>
                    </div>
                  </div>
                  <table className="mt-4 w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b-2 border-black text-left">
                        <th className="py-1.5">Item</th>
                        <th className="py-1.5 text-center">Qty</th>
                        <th className="py-1.5 text-center">Packed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={index} className="border-b border-[#ddd]">
                          <td className="py-2">{item.name ?? "Item"}</td>
                          <td className="py-2 text-center font-bold">{item.quantity ?? 1}</td>
                          <td className="py-2 text-center"><span className="inline-block h-4 w-4 border-2 border-black" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {order.notes && <p className="mt-3 text-[13px]"><strong>Note:</strong> {order.notes}</p>}
                  <p className="mt-6 text-[14px]">Thank you for shopping with {store?.name}! Questions about your order? {storePhone ? `Message us on ${storePhone}.` : "Reply to our WhatsApp."}</p>
                </article>
              );
            })}
        </div>
      )}
    </div>
  );
}
