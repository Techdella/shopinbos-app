"use client";

import { useMemo, useState } from "react";
import { cx } from "@/components/app-ui/cx";
import { Toggle } from "@/components/app-ui";
import { naira } from "@shared/onboarding";
import { LABEL_FORMATS, type LabelFormat } from "@/lib/labels";

interface PickerOrder {
  id: string;
  orderNumber: string;
  buyer: string;
  summary: string;
  image: string | null;
  stage: string;
  items: number;
  hasAddress: boolean;
  collect: number;
  createdAt: string;
}

export function LabelPicker({ orders, preselected }: { orders: PickerOrder[]; preselected: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (preselected.length) return new Set(preselected);
    // By default: paid orders that still need sending (not unpaid ones, which may never be paid).
    return new Set(orders.filter((order) => order.collect === 0 && order.stage !== "Delivered").map((order) => order.id));
  });
  const [format, setFormat] = useState<LabelFormat>("label");
  const [slips, setSlips] = useState(true);

  const href = useMemo(() => {
    const params = new URLSearchParams({ orders: [...selected].join(","), format, slips: slips ? "1" : "0" });
    return `/home/labels/print?${params.toString()}`;
  }, [selected, format, slips]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOn = orders.length > 0 && orders.every((order) => selected.has(order.id));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-[22px] border border-app-line bg-white">
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <h2 className="m-0 text-[17px] font-extrabold">Orders to send</h2>
          {orders.length > 0 && (
            <button type="button" className="text-[14px] font-extrabold text-app-accent-ink" onClick={() => setSelected(allOn ? new Set() : new Set(orders.map((order) => order.id)))}>
              {allOn ? "Clear all" : "Select all"}
            </button>
          )}
        </div>
        {orders.length ? (
          <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
            {orders.map((order) => {
              const on = selected.has(order.id);
              return (
                <li key={order.id}>
                  <label className={cx("grid cursor-pointer grid-cols-[24px_40px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3", on && "bg-app-canvas")}>
                    <input type="checkbox" checked={on} onChange={() => toggle(order.id)} className="h-5 w-5 accent-[#16141F]" aria-label={`Label for ${order.buyer}, ${order.orderNumber}`} />
                    {order.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={order.image} alt="" className="h-10 w-10 rounded-[10px] object-cover" />
                    ) : (
                      <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-app-canvas text-[13px] font-extrabold">{order.buyer.charAt(0).toUpperCase()}</span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-extrabold">{order.buyer}</span>
                      <span className="block truncate text-[12.5px] text-app-ink-soft">
                        {order.orderNumber} · {order.summary}
                        {!order.hasAddress && " · no address (pickup)"}
                      </span>
                    </span>
                    <span className="text-right text-[12.5px]">
                      <span className="block font-bold">{order.stage}</span>
                      {order.collect > 0 && <span className="block text-[#8A5A00]">Collect {naira(order.collect)}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="border-t border-app-line px-5 py-10 text-center text-[14px] text-app-ink-soft">
            No orders waiting to be sent. Paid orders show up here, ready to print.
          </div>
        )}
      </section>

      <aside className="grid content-start gap-4">
        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[17px] font-extrabold">Print on</h2>
          <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Paper">
            {LABEL_FORMATS.map((option) => (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={format === option.key}
                onClick={() => setFormat(option.key)}
                className={cx("rounded-[16px] border-2 p-3 text-left", format === option.key ? "border-app-ink" : "border-app-line")}
              >
                <span className="block text-[14px] font-extrabold">{option.label}</span>
                <span className="block text-[12.5px] text-app-ink-soft">{option.hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[14px] font-bold">Packing slip for each order</span>
            <Toggle on={slips} onChange={setSlips} label="Packing slip for each order" />
          </div>
        </section>
        <a
          href={selected.size ? href : undefined}
          aria-disabled={!selected.size}
          className={cx("inline-flex min-h-[52px] items-center justify-center rounded-full px-5 text-[15px] font-extrabold no-underline", selected.size ? "bg-app-ink text-white hover:bg-black" : "pointer-events-none bg-app-line text-app-ink-soft")}
        >
          {selected.size ? `Print ${selected.size} label${selected.size === 1 ? "" : "s"}` : "Choose orders to print"}
        </a>
        <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">
          Each label has a QR code that opens the order&apos;s tracking page, so riders and customers can check it.
        </p>
      </aside>
    </div>
  );
}
