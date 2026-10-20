import type { ReactNode } from "react";
import { Notice } from "@/components/app-ui";
import { Pill } from "@/components/app-kit";
import { field } from "@/components/seller-core";
import { LgaAreaInput } from "./LgaAreaInput";
import { getT } from "@/lib/i18n/server";
import { NG_STATES, SIZE_BANDS, type RateRow } from "@shared/delivery-market";
import { savedText, serviceLabel, sizeLabel, timeframeLabel, type DeliveryWords } from "./words";

// Small server-safe pieces shared by the seller (/home/logistics/*) and supplier (/supplier/delivery) pages of the
// logistics marketplace. Words: the "delivery" catalog (shared/i18n/messages/delivery), rule words via ./words.ts.

export const naira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

export const serviceWord = (service: string, t?: DeliveryWords) => (t ? serviceLabel(t, service) : serviceLabel(ENGLISH, service));

export const sizeWord = (band: string, t?: DeliveryWords) => (t ? sizeLabel(t, band) : sizeLabel(ENGLISH, band));

/** No translation: the English fallback of every rule word. */
const ENGLISH: DeliveryWords = { locale: "en", dynamic: (key, fallback) => fallback ?? key };

/** "Lagos, Ogun, South-West and 4 more". */
export function areasSummary(areas: readonly string[], max = 4, t?: DeliveryWords) {
  const words = t ?? ENGLISH;
  if (!areas.length) return words.dynamic("areas.none", "No areas listed yet");
  if (areas.length <= max) return areas.join(", ");
  return words.dynamic("areas.more", `${areas.slice(0, max).join(", ")} and ${areas.length - max} more`, { areas: areas.slice(0, max).join(", "), count: areas.length - max });
}

/** ?saved=… / ?error=… from our server actions. */
export async function FlashNotice({ saved, error }: { saved?: string; error?: string }) {
  if (!saved && !error) return null;
  const t = await getT("delivery");
  return (
    <div className="mb-4">
      <Notice tone={error ? "error" : "success"}>{error ?? savedText(t, saved ?? "")}</Notice>
    </div>
  );
}

export async function VerifiedPill({ status }: { status: string }) {
  if (status !== "verified") return null;
  const t = await getT("delivery");
  return <Pill tone="success">{t("verified")}</Pill>;
}

export async function Rating({ rating, count }: { rating: number; count: number }) {
  const t = await getT("delivery");
  if (!count) return <span className="text-app-ink-soft">{t("noReviews")}</span>;
  return (
    <span>
      <span className="font-bold">★ {rating.toFixed(1)}</span>
      <span className="text-app-ink-soft"> ({t("reviewCount", { count })})</span>
    </span>
  );
}

/** A rate card's rows: from, to, service, size, price, timeframe. */
export async function RateTable({ rows }: { rows: readonly RateRow[] }) {
  const t = await getT("delivery");
  if (!rows.length) return <p className="m-0 text-[14px] text-app-ink-soft">{t("rates.none")}</p>;
  return (
    <div className="overflow-x-auto rounded-[14px] border border-app-line">
      <table className="w-full min-w-[560px] border-collapse text-left text-[13.5px]">
        <thead className="bg-app-canvas text-[12.5px] text-app-ink-soft">
          <tr>
            <th className="px-3 py-2 font-bold">{t("rates.from")}</th>
            <th className="px-3 py-2 font-bold">{t("rates.to")}</th>
            <th className="px-3 py-2 font-bold">{t("rates.service")}</th>
            <th className="px-3 py-2 font-bold">{t("rates.size")}</th>
            <th className="px-3 py-2 text-right font-bold">{t("rates.price")}</th>
            <th className="px-3 py-2 font-bold">{t("rates.timeframe")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-app-line">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-3 py-2">{row.from}</td>
              <td className="px-3 py-2">{row.to}</td>
              <td className="px-3 py-2">{serviceLabel(t, row.service)}</td>
              <td className="px-3 py-2">{sizeLabel(t, row.sizeBand)}</td>
              <td className="px-3 py-2 text-right font-extrabold">{naira(row.price)}</td>
              <td className="px-3 py-2">{timeframeLabel(t, row.minDays, row.maxDays)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Failed-attempt fee, return fee and the partner's notes under a rate card. */
export async function CardExtras({ card }: { card: { failedAttemptFee: number; returnFee: number; notes: string | null } }) {
  const t = await getT("delivery");
  return (
    <div className="mt-3 grid gap-1 text-[13.5px]">
      <div><span className="text-app-ink-soft">{t("rates.reattemptFee")} </span><span className="font-bold">{card.failedAttemptFee > 0 ? naira(card.failedAttemptFee) : t("rates.noFee")}</span></div>
      <div><span className="text-app-ink-soft">{t("rates.returnFee")} </span><span className="font-bold">{card.returnFee > 0 ? naira(card.returnFee) : t("rates.noFee")}</span></div>
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

export async function StateSelect({ name, defaultValue, placeholder }: { name: string; defaultValue?: string | null; placeholder?: string }) {
  const t = await getT("delivery");
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className={field.select}>
      <option value="">{placeholder ?? t("pickState")}</option>
      {NG_STATES.map((state) => (
        <option key={state} value={state}>{state === "FCT" ? t("fctAbuja") : state}</option>
      ))}
    </select>
  );
}

export async function SizeBandSelect({ name = "defaultSizeBand", defaultValue }: { name?: string; defaultValue: string }) {
  const t = await getT("delivery");
  return (
    <select name={name} defaultValue={defaultValue} className={field.select}>
      {SIZE_BANDS.map((band) => (
        <option key={band} value={band}>{sizeLabel(t, band)}</option>
      ))}
    </select>
  );
}

/** "Where parcels leave from": state, area and address (sellers and suppliers). */
export async function OriginFields({ settings }: { settings: { originState: string | null; originArea: string | null; originAddress: string | null } }) {
  const t = await getT("delivery");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={t("origin.state")}>
        <StateSelect name="originState" defaultValue={settings.originState} />
      </Field>
      <Field label={t("origin.area")} hint={t("origin.areaHint")}>
        <LgaAreaInput name="originArea" stateName="originState" initialState={settings.originState} defaultValue={settings.originArea ?? ""} className={field.input} maxLength={80} placeholder="Ikeja" />
      </Field>
      <div className="md:col-span-2">
        <Field label={t("origin.address")} hint={t("origin.addressHint")}>
          <input name="originAddress" defaultValue={settings.originAddress ?? ""} className={field.input} maxLength={200} placeholder="12 Allen Avenue, Ikeja" />
        </Field>
      </div>
    </div>
  );
}
