"use client";

import { useActionState, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/app-ui";
import { NATIONWIDE, NG_REGIONS, NG_STATES, RATE_SERVICES, SIZE_BANDS, type RateRow } from "@shared/delivery-market";
import { lgasOf } from "@shared/ng-lgas";
import { useT } from "@/components/i18n/I18nProvider";
import { sizeLabel } from "@/components/delivery-market/words";

// The structured rate card editor (logistics marketplace, shared/delivery-market.ts validateRateCard): one row per
// route, service and size, with a price and a timeframe. Used for the public card (/logistics/rates) and for private
// rates sent to one business (/logistics/connections). The rows travel as JSON in a hidden input; the server checks
// them and sends back the first problem ("Row 3: ..."), which is shown here with that row marked, rows kept.

export type RateFormState = { error: string | null };

type RateAction = (state: RateFormState, formData: FormData) => Promise<RateFormState>;

interface EditRow {
  key: string;
  from: string;
  to: string;
  service: string;
  sizeBand: string;
  price: string;
  minDays: string;
  maxDays: string;
}

/** "Lagos: Eti-Osa" for every LGA, offered after the states so a partner can price one LGA (free text still works). */
const LGA_PLACES = NG_STATES.flatMap((state) => lgasOf(state).map((lga) => `${state}: ${lga}`));

const SERVICE_WORDS: Record<string, string> = { doorstep: "Doorstep", pickup_point: "Pickup point", same_day: "Same-day" };

function toEdit(row: Partial<RateRow>, key: string): EditRow {
  return {
    key,
    from: row.from ?? "",
    to: row.to ?? "",
    service: row.service ?? "doorstep",
    sizeBand: row.sizeBand ?? "small",
    price: row.price ? String(row.price) : "",
    minDays: row.minDays !== undefined ? String(row.minDays) : "1",
    maxDays: row.maxDays !== undefined ? String(row.maxDays) : "2",
  };
}

const cell = "h-11 w-full min-w-0 rounded-[12px] border border-app-line bg-white px-3 text-[15px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";
const label = "mb-1 block text-[13px] font-bold text-app-ink-soft lg:sr-only";

export function RateCardEditor({
  action,
  initialRows,
  failedAttemptFee = 0,
  returnFee = 0,
  notes = "",
  ownerUserId,
  defaultFrom = "",
  submitLabel,
}: {
  action: RateAction;
  initialRows: Array<Partial<RateRow>>;
  failedAttemptFee?: number;
  returnFee?: number;
  notes?: string | null;
  /** Private rates: the business they're for. */
  ownerUserId?: string;
  /** Where new rows start from (e.g. the partner's state). */
  defaultFrom?: string;
  submitLabel?: string;
}) {
  const t = useT("logistics", "delivery");
  const id = useId();
  const [state, formAction, pending] = useActionState(action, { error: null });
  // Row keys are stable and the same on the server and in the browser (they're part of the inputs' ids).
  const nextKey = useRef(initialRows.length + 1);
  const [rows, setRows] = useState<EditRow[]>(() => (initialRows.length ? initialRows.map((row, index) => toEdit(row, `k${index}`)) : [toEdit({ from: defaultFrom }, "k0")]));
  const [failed, setFailed] = useState(failedAttemptFee ? String(failedAttemptFee) : "");
  const [returned, setReturned] = useState(returnFee ? String(returnFee) : "");
  const [note, setNote] = useState(notes ?? "");
  const badRow = state.error ? Number(/^Row (\d+):/.exec(state.error)?.[1] ?? 0) : 0;

  const update = (key: string, patch: Partial<EditRow>) => setRows((list) => list.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const remove = (key: string) => setRows((list) => (list.length > 1 ? list.filter((row) => row.key !== key) : list));
  const add = () =>
    setRows((list) => {
      const last = list[list.length - 1];
      const key = `k${nextKey.current++}`;
      return [...list, toEdit({ from: last?.from || defaultFrom, service: (last?.service as RateRow["service"]) ?? "doorstep", sizeBand: (last?.sizeBand as RateRow["sizeBand"]) ?? "small" }, key)];
    });

  const payload = JSON.stringify(
    rows.map((row, index) => ({
      id: `r${index + 1}`,
      from: row.from.trim(),
      to: row.to.trim(),
      service: row.service,
      sizeBand: row.sizeBand,
      price: row.price.replace(/[₦,\s]/g, ""),
      minDays: row.service === "same_day" ? 0 : Number(row.minDays || 0),
      maxDays: row.service === "same_day" ? 0 : Number(row.maxDays || row.minDays || 0),
    })),
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="rows" value={payload} />
      {ownerUserId && <input type="hidden" name="ownerUserId" value={ownerUserId} />}
      <datalist id={`${id}-places`}>
        <option value={NATIONWIDE} />
        {Object.keys(NG_REGIONS).map((region) => <option key={region} value={region} />)}
        {NG_STATES.map((name) => <option key={name} value={name} />)}
        {LGA_PLACES.map((place) => <option key={place} value={place} />)}
      </datalist>

      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_44px] gap-2 px-1 text-[13px] font-bold text-app-ink-soft lg:grid">
        <span>{t("market.editor.from")}</span>
        <span>{t("market.editor.to")}</span>
        <span>{t("market.editor.service")}</span>
        <span>{t("market.editor.size")}</span>
        <span>{t("market.editor.price")}</span>
        <span>{t("market.editor.minDays")}</span>
        <span>{t("market.editor.maxDays")}</span>
        <span className="sr-only">{t("market.editor.remove")}</span>
      </div>

      <ol className="m-0 grid list-none gap-3 p-0 lg:gap-2">
        {rows.map((row, index) => {
          const n = index + 1;
          const sameDay = row.service === "same_day";
          const rid = `${id}-${row.key}`;
          return (
            <li
              key={row.key}
              className={[
                "grid grid-cols-2 gap-2 rounded-[16px] border p-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_44px] lg:items-center lg:rounded-none lg:border-0 lg:p-1",
                badRow === n ? "border-app-danger bg-app-danger-tint lg:rounded-[12px]" : "border-app-line",
              ].join(" ")}
            >
              <div className="col-span-2 flex items-center justify-between lg:hidden">
                <span className="text-[14px] font-extrabold">{t("market.editor.rateN", { n })}</span>
              </div>
              <div className="min-w-0">
                <label htmlFor={`${rid}-from`} className={label}>{t("market.editor.from")}</label>
                <input id={`${rid}-from`} list={`${id}-places`} value={row.from} onChange={(event) => update(row.key, { from: event.target.value })} placeholder="Lagos" aria-label={t("market.editor.rowFrom", { n })} className={cell} />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${rid}-to`} className={label}>{t("market.editor.to")}</label>
                <input id={`${rid}-to`} list={`${id}-places`} value={row.to} onChange={(event) => update(row.key, { to: event.target.value })} placeholder="Lagos: Ikeja" aria-label={t("market.editor.rowTo", { n })} className={cell} />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${rid}-service`} className={label}>{t("market.editor.service")}</label>
                <select id={`${rid}-service`} value={row.service} onChange={(event) => update(row.key, { service: event.target.value })} aria-label={t("market.editor.rowService", { n })} className={cell}>
                  {RATE_SERVICES.map((service) => <option key={service} value={service}>{t.dynamic(`market.editor.service.${service}`, SERVICE_WORDS[service] ?? service)}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor={`${rid}-size`} className={label}>{t("market.editor.size")}</label>
                <select id={`${rid}-size`} value={row.sizeBand} onChange={(event) => update(row.key, { sizeBand: event.target.value })} aria-label={t("market.editor.rowSize", { n })} className={cell}>
                  {SIZE_BANDS.map((band) => <option key={band} value={band}>{sizeLabel(t, band)}</option>)}
                </select>
              </div>
              <div className="col-span-2 min-w-0 lg:col-span-1">
                <label htmlFor={`${rid}-price`} className={label}>{t("market.editor.price")}</label>
                <input id={`${rid}-price`} value={row.price} onChange={(event) => update(row.key, { price: event.target.value })} inputMode="decimal" placeholder="2500" aria-label={t("market.editor.rowPrice", { n })} className={cell} />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${rid}-min`} className={label}>{t("market.editor.minDays")}</label>
                <input id={`${rid}-min`} value={sameDay ? "0" : row.minDays} disabled={sameDay} onChange={(event) => update(row.key, { minDays: event.target.value.replace(/\D/g, "") })} inputMode="numeric" aria-label={t("market.editor.rowMin", { n })} className={cell} />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${rid}-max`} className={label}>{t("market.editor.maxDays")}</label>
                <input id={`${rid}-max`} value={sameDay ? "0" : row.maxDays} disabled={sameDay} onChange={(event) => update(row.key, { maxDays: event.target.value.replace(/\D/g, "") })} inputMode="numeric" aria-label={t("market.editor.rowMax", { n })} className={cell} />
              </div>
              <div className="col-span-2 flex justify-end lg:col-span-1">
                <button
                  type="button"
                  onClick={() => remove(row.key)}
                  disabled={rows.length === 1}
                  aria-label={t("market.editor.removeRow", { n })}
                  className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full px-3 text-[14px] font-bold text-app-ink-soft transition hover:bg-app-canvas hover:text-app-danger disabled:opacity-40"
                >
                  <Icon name="x" size={16} />
                  <span className="lg:sr-only">{t("market.editor.remove")}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <div>
        <button type="button" onClick={add} className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[15px] font-bold text-app-ink transition hover:border-app-line-strong">
          <Icon name="plus" size={16} /> {t("market.editor.add")}
        </button>
      </div>

      <div className="grid gap-3 border-t border-app-line pt-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${id}-failed`} className="mb-1.5 block text-[15px] font-bold">{t("market.editor.failedFee")}</label>
          <input id={`${id}-failed`} name="failedAttemptFee" value={failed} onChange={(event) => setFailed(event.target.value)} inputMode="decimal" placeholder="0" className={cell} />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-return`} className="mb-1.5 block text-[15px] font-bold">{t("market.editor.returnFee")}</label>
          <input id={`${id}-return`} name="returnFee" value={returned} onChange={(event) => setReturned(event.target.value)} inputMode="decimal" placeholder="0" className={cell} />
        </div>
        <div className="min-w-0 sm:col-span-2">
          <label htmlFor={`${id}-notes`} className="mb-1.5 block text-[15px] font-bold">{t("market.editor.notes")}</label>
          <textarea id={`${id}-notes`} name="notes" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} placeholder={t("market.editor.notesPlaceholder")} className="w-full min-w-0 rounded-[14px] border border-app-line bg-white px-3.5 py-2.5 text-[15px] leading-[1.5] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink" />
        </div>
      </div>

      {state.error && <Notice tone="error">{state.error}</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-full bg-app-ink px-5 text-[15px] font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-55"
        >
          {pending ? t("market.editor.saving") : submitLabel ?? t("market.editor.save")}
        </button>
        <span className="text-[14px] text-app-ink-soft">{t("market.editor.rateCount", { count: rows.length })}</span>
      </div>
    </form>
  );
}
