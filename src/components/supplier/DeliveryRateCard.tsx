"use client";

import { useState } from "react";
import { DELIVERY_ZONES, SIZE_CLASS_LABELS, ZONE_DAYS, ZONE_LABELS, type RateSource, type ZoneRates } from "@shared/dropship-rules";
import { SIZE_BANDS } from "@shared/delivery-market";
import { friendlyError } from "@/lib/errors/report-client";
import { fieldClass } from "./supplier-kit";

// The supplier's delivery prices on /supplier/delivery (Supplier & Dropship Rules): "Use Shopinbos partner rates"
// (the default: the connected partners below price each route) or "Set my own rates", one price per zone and
// parcel size for their own courier or park waybill. Saved through PUT /api/supplier/delivery-rates.

export interface DeliveryRatesInitial {
  rateSource: RateSource;
  zoneRates: ZoneRates;
  originState: string | null;
  originArea: string | null;
  defaults: ZoneRates;
}

type Grid = Record<string, Record<string, string>>;

const SHORT_SIZE: Record<string, string> = { small: "Small", medium: "Medium", bulky: "Large" };

function gridOf(rates: ZoneRates, defaults: ZoneRates): Grid {
  const empty = DELIVERY_ZONES.every((zone) => !Object.keys(rates[zone] ?? {}).length);
  const source = empty ? defaults : rates;
  return Object.fromEntries(DELIVERY_ZONES.map((zone) => [zone, Object.fromEntries(SIZE_BANDS.map((band) => [band, source[zone]?.[band] ? String(source[zone][band]) : ""]))]));
}

export function DeliveryRateCard({ initial }: { initial: DeliveryRatesInitial }) {
  const [source, setSource] = useState<RateSource>(initial.rateSource);
  const [grid, setGrid] = useState<Grid>(() => gridOf(initial.zoneRates, initial.defaults));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const from = [initial.originArea, initial.originState].filter(Boolean).join(", ");

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const zoneRates = Object.fromEntries(DELIVERY_ZONES.map((zone) => [zone, Object.fromEntries(SIZE_BANDS.flatMap((band) => (grid[zone][band].trim() ? [[band, Number(grid[zone][band].replace(/,/g, ""))]] : [])))]));
      const response = await fetch("/api/supplier/delivery-rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(source === "own" ? { rateSource: "own", zoneRates } : { rateSource: "partners" }),
      });
      const json = (await response.json().catch(() => null)) as { data?: DeliveryRatesInitial; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? "Couldn't save your delivery prices. Try again.");
      setSource(json.data.rateSource);
      if (json.data.rateSource === "own") setGrid(gridOf(json.data.zoneRates, json.data.defaults));
      setMessage({ tone: "ok", text: json.data.rateSource === "own" ? "Saved. Checkout uses your own rates, and your courier delivers." : "Saved. Checkout uses your delivery partners' rates." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? friendlyError(error) : "Couldn't save your delivery prices. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const option = (value: RateSource, title: string, sub: string) => (
    <label className={`flex min-h-[64px] cursor-pointer items-start gap-3 rounded-[16px] border px-4 py-3 ${source === value ? "border-app-ink bg-white" : "border-app-line"}`}>
      <input type="radio" name="rateSource" value={value} checked={source === value} onChange={() => setSource(value)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#16141F]" />
      <span className="min-w-0">
        <span className="block text-[14.5px] font-bold">{title}</span>
        <span className="block text-[12.5px] text-app-ink-soft">{sub}</span>
      </span>
    </label>
  );

  return (
    <div className="grid gap-4">
      <div role="note" className="rounded-[16px] bg-app-success-tint px-4 py-3 text-[14px] font-bold text-app-success">
        You never pay for delivery. The customer or the seller pays it at checkout.
      </div>
      {from && <p className="m-0 text-[13.5px] text-app-ink-soft">Ships from {from}. Checkout works out each customer&apos;s zone from here.</p>}
      <fieldset className="m-0 grid gap-2 border-0 p-0 sm:grid-cols-2">
        <legend className="sr-only">Where your delivery prices come from</legend>
        {option("partners", "Use Shopinbos partner rates", "Verified delivery partners who cover each route set the price. Nothing to type.")}
        {option("own", "Set my own rates", "One price per zone and parcel size, for a courier or park waybill you trust.")}
      </fieldset>

      {source === "own" && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-y-2 text-[14px]">
            <caption className="sr-only">Your delivery price per zone and parcel size</caption>
            <thead>
              <tr className="text-left text-[12.5px] text-app-ink-soft">
                <th scope="col" className="pr-3 font-bold">Zone (from you)</th>
                {SIZE_BANDS.map((band) => (
                  <th key={band} scope="col" className="px-1 font-bold" title={SIZE_CLASS_LABELS[band]}>{SHORT_SIZE[band]}</th>
                ))}
                <th scope="col" className="pl-2 font-bold">Arrives in</th>
              </tr>
            </thead>
            <tbody>
              {DELIVERY_ZONES.map((zone) => (
                <tr key={zone}>
                  <th scope="row" className="pr-3 text-left font-bold">{ZONE_LABELS[zone]}</th>
                  {SIZE_BANDS.map((band) => (
                    <td key={band} className="px-1">
                      <input
                        aria-label={`${ZONE_LABELS[zone]}, ${SIZE_CLASS_LABELS[band]}`}
                        className={`${fieldClass} min-h-[44px] px-3`}
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        placeholder="—"
                        value={grid[zone][band]}
                        onChange={(event) => setGrid({ ...grid, [zone]: { ...grid[zone], [band]: event.target.value } })}
                      />
                    </td>
                  ))}
                  <td className="pl-2 text-[13px] text-app-ink-soft">{ZONE_DAYS[zone][0]}–{ZONE_DAYS[zone][1]} days</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 text-[12.5px] text-app-ink-soft">In naira, per parcel. Leave a box empty if you don&apos;t deliver that size there. Small fits in a nylon, medium is a shoe box, large is a Ghana Must Go, carton or bale.</p>
        </div>
      )}

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`m-0 rounded-[14px] px-4 py-3 text-[14px] font-bold ${message.tone === "error" ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>
          {message.text}
        </p>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white disabled:opacity-60">
          {busy ? "Saving…" : "Save delivery prices"}
        </button>
      </div>
    </div>
  );
}
