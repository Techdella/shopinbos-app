"use client";

import { useId, useState } from "react";
import { DELIVERY_ZONES, SIZE_CLASS_LABELS, ZONE_DAYS, ZONE_LABELS, type RateSource, type ZoneRates } from "@shared/dropship-rules";
import { SIZE_BANDS } from "@shared/delivery-market";
import { friendlyError } from "@/lib/errors/report-client";
import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "./supplier-kit";

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

  const [size, setSize] = useState<(typeof SIZE_BANDS)[number]>("small");
  const group = useId();
  const zoneHint: Partial<Record<(typeof DELIVERY_ZONES)[number], string>> = { same_city: initial.originArea ?? undefined, same_state: initial.originState ?? undefined };

  const option = (value: RateSource, title: string, sub: string) => (
    <label className="flex min-h-[64px] cursor-pointer items-center gap-3 rounded-[18px] border-2 border-app-line bg-white px-4 py-3 transition hover:border-app-line-strong has-[:checked]:border-app-accent has-[:checked]:bg-app-peach has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-app-ink has-[:focus-visible]:ring-offset-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-[1.4] text-[#5E5A6C]">{sub}</span>
      </span>
      <input type="radio" name={`rateSource${group}`} value={value} checked={source === value} onChange={() => setSource(value)} className="peer sr-only" />
      <span aria-hidden className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 border-app-locked peer-checked:border-app-accent peer-checked:[&>i]:block">
        <i className="hidden h-2.5 w-2.5 rounded-full bg-app-accent" />
      </span>
    </label>
  );

  const shown = source === "own" ? grid : gridOf(initial.defaults, initial.defaults);

  return (
    <div className="grid gap-3">
      <p role="note" className="m-0 flex items-center gap-2.5 rounded-[16px] bg-app-success-tint px-4 py-3 text-[14px] leading-[1.4] text-app-ink">
        <Icon name="check" size={18} strokeWidth={2.4} className="shrink-0 text-app-success" />
        <span>You never pay for delivery. The customer or the seller pays it at checkout.</span>
      </p>
      <fieldset className="m-0 grid gap-2 border-0 p-0 sm:grid-cols-2">
        <legend className="sr-only">Where your delivery prices come from</legend>
        {option("partners", "Use Shopinbos partner rates", "Prices from verified riders on each route. Nothing to type.")}
        {option("own", "Set my own rates", "If you already use a courier or park waybill you trust.")}
      </fieldset>

      <section aria-labelledby="rate-card-title" className="rounded-[20px] bg-white px-4 py-3 sm:px-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3 py-1">
          <div className="min-w-0">
            <h3 id="rate-card-title" className="m-0 font-app-display text-[17px] font-extrabold">{source === "own" ? "Your rates" : "Partner rates"}</h3>
            <p className="m-0 text-[12.5px] text-app-ink-soft">{from ? `Ships from ${from}. ` : ""}{source === "own" ? "In naira, per parcel. Empty: you don't deliver that size there." : "Starting prices. Riders on each route may charge less."}</p>
          </div>
          <div role="tablist" aria-label="Parcel size" className="flex gap-1 rounded-full bg-app-canvas p-[3px]">
            {SIZE_BANDS.map((band) => (
              <button
                key={band}
                type="button"
                role="tab"
                aria-selected={size === band}
                title={SIZE_CLASS_LABELS[band]}
                onClick={() => setSize(band)}
                className={`h-[30px] rounded-full px-3 text-[12px] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent ${size === band ? "bg-app-ink text-white" : "text-app-gray-ink hover:text-app-ink"}`}
              >
                {SHORT_SIZE[band]}
              </button>
            ))}
          </div>
        </div>
        <ul className="m-0 list-none p-0" aria-label={`${SIZE_CLASS_LABELS[size]}: price per zone`}>
          {DELIVERY_ZONES.map((zone) => (
            <li key={zone} className="flex items-center gap-3 border-b border-app-line-soft py-[11px] last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-extrabold">{ZONE_LABELS[zone]}</span>
                <span className="block text-[12px] text-app-ink-soft">{[zoneHint[zone], `${ZONE_DAYS[zone][0]}–${ZONE_DAYS[zone][1]} days`].filter(Boolean).join(" · ")}</span>
              </span>
              {source === "own" ? (
                <span className="flex h-11 w-[150px] shrink-0 items-center gap-1 rounded-[14px] border-2 border-app-line px-3 focus-within:border-app-ink">
                  <span aria-hidden className="font-app-display text-[18px] font-extrabold">₦</span>
                  <input
                    aria-label={`${ZONE_LABELS[zone]}, ${SIZE_CLASS_LABELS[size]}`}
                    className="min-w-0 flex-1 bg-transparent text-right font-app-display text-[18px] font-extrabold outline-none placeholder:text-app-ink-faint [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    placeholder="—"
                    value={grid[zone][size]}
                    onChange={(event) => setGrid({ ...grid, [zone]: { ...grid[zone], [size]: event.target.value } })}
                  />
                </span>
              ) : (
                <span className="shrink-0 font-app-display text-[18px] font-extrabold">{shown[zone][size] ? `₦${Number(shown[zone][size]).toLocaleString("en-NG")}` : "—"}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`m-0 rounded-[14px] px-4 py-3 text-[14px] font-bold ${message.tone === "error" ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>
          {message.text}
        </p>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={() => void save()} disabled={busy} className={buttonClass.orange}>
          {busy ? "Saving…" : "Save delivery prices"}
        </button>
      </div>
    </div>
  );
}
