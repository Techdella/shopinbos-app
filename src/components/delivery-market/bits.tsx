import type { ReactNode } from "react";
import { Notice } from "@/components/app-ui";
import { Pill } from "@/components/app-kit";
import { field } from "@/components/seller-core";
import { LgaAreaInput } from "./LgaAreaInput";
import {
  NG_STATES,
  SERVICE_LABELS,
  SIZE_BANDS,
  SIZE_BAND_LABELS,
  timeframeWords,
  type PartnerService,
  type RateRow,
} from "@shared/delivery-market";

// Small server-safe pieces shared by the seller (/home/logistics/*) and supplier (/supplier/delivery) pages of the
// logistics marketplace.

export const naira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

export const serviceWord = (service: string) => SERVICE_LABELS[service as PartnerService] ?? service.replace(/_/g, " ");

export const sizeWord = (band: string) => SIZE_BAND_LABELS[band as keyof typeof SIZE_BAND_LABELS] ?? band;

/** "Lagos, Ogun, South-West and 4 more". */
export function areasSummary(areas: readonly string[], max = 4) {
  if (!areas.length) return "No areas listed yet";
  if (areas.length <= max) return areas.join(", ");
  return `${areas.slice(0, max).join(", ")} and ${areas.length - max} more`;
}

/** ?saved=… / ?error=… from our server actions. */
export function FlashNotice({ saved, error }: { saved?: string; error?: string }) {
  if (!saved && !error) return null;
  return (
    <div className="mb-4">
      <Notice tone={error ? "error" : "success"}>{error ?? saved}</Notice>
    </div>
  );
}

export function VerifiedPill({ status }: { status: string }) {
  return status === "verified" ? <Pill tone="success">Verified</Pill> : null;
}

export function Rating({ rating, count }: { rating: number; count: number }) {
  if (!count) return <span className="text-app-ink-soft">No reviews yet</span>;
  return (
    <span>
      <span className="font-bold">★ {rating.toFixed(1)}</span>
      <span className="text-app-ink-soft"> ({count} review{count === 1 ? "" : "s"})</span>
    </span>
  );
}

/** A rate card's rows: from, to, service, size, price, timeframe. */
export function RateTable({ rows }: { rows: readonly RateRow[] }) {
  if (!rows.length) return <p className="m-0 text-[14px] text-app-ink-soft">No rates yet.</p>;
  return (
    <div className="overflow-x-auto rounded-[14px] border border-app-line">
      <table className="w-full min-w-[560px] border-collapse text-left text-[13.5px]">
        <thead className="bg-app-canvas text-[12.5px] text-app-ink-soft">
          <tr>
            <th className="px-3 py-2 font-bold">From</th>
            <th className="px-3 py-2 font-bold">To</th>
            <th className="px-3 py-2 font-bold">Service</th>
            <th className="px-3 py-2 font-bold">Size</th>
            <th className="px-3 py-2 text-right font-bold">Price</th>
            <th className="px-3 py-2 font-bold">Timeframe</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-app-line">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-3 py-2">{row.from}</td>
              <td className="px-3 py-2">{row.to}</td>
              <td className="px-3 py-2">{serviceWord(row.service)}</td>
              <td className="px-3 py-2">{sizeWord(row.sizeBand)}</td>
              <td className="px-3 py-2 text-right font-extrabold">{naira(row.price)}</td>
              <td className="px-3 py-2">{timeframeWords(row.minDays, row.maxDays)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Failed-attempt fee, return fee and the partner's notes under a rate card. */
export function CardExtras({ card }: { card: { failedAttemptFee: number; returnFee: number; notes: string | null } }) {
  return (
    <div className="mt-3 grid gap-1 text-[13.5px]">
      <div><span className="text-app-ink-soft">Failed delivery re-attempt: </span><span className="font-bold">{card.failedAttemptFee > 0 ? naira(card.failedAttemptFee) : "No fee"}</span></div>
      <div><span className="text-app-ink-soft">Return to sender: </span><span className="font-bold">{card.returnFee > 0 ? naira(card.returnFee) : "No fee"}</span></div>
      {card.notes && <p className="m-0 mt-1 whitespace-pre-line text-app-ink-soft">{card.notes}</p>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={field.label}>{label}</span>
      {children}
      {hint && <span className={`${field.hint} block`}>{hint}</span>}
    </label>
  );
}

export function StateSelect({ name, defaultValue, placeholder = "Pick a state" }: { name: string; defaultValue?: string | null; placeholder?: string }) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className={field.select}>
      <option value="">{placeholder}</option>
      {NG_STATES.map((state) => (
        <option key={state} value={state}>{state === "FCT" ? "FCT (Abuja)" : state}</option>
      ))}
    </select>
  );
}

export function SizeBandSelect({ name = "defaultSizeBand", defaultValue }: { name?: string; defaultValue: string }) {
  return (
    <select name={name} defaultValue={defaultValue} className={field.select}>
      {SIZE_BANDS.map((band) => (
        <option key={band} value={band}>{SIZE_BAND_LABELS[band]}</option>
      ))}
    </select>
  );
}

/** "Where parcels leave from": state, area and address (sellers and suppliers). */
export function OriginFields({ settings }: { settings: { originState: string | null; originArea: string | null; originAddress: string | null } }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="State">
        <StateSelect name="originState" defaultValue={settings.originState} />
      </Field>
      <Field label="Area or LGA" hint="For example Ikeja, Yaba or Wuse. Pick from the list or type your own.">
        <LgaAreaInput name="originArea" stateName="originState" initialState={settings.originState} defaultValue={settings.originArea ?? ""} className={field.input} maxLength={80} placeholder="Ikeja" />
      </Field>
      <div className="md:col-span-2">
        <Field label="Pickup address" hint="Where riders collect your parcels.">
          <input name="originAddress" defaultValue={settings.originAddress ?? ""} className={field.input} maxLength={200} placeholder="12 Allen Avenue, Ikeja" />
        </Field>
      </div>
    </div>
  );
}
