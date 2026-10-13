"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, TextInput, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

export interface ShippingZoneFormValue {
  id: string;
  name: string;
  regions: string[];
  rates: Array<Record<string, unknown>>;
  sortOrder: number;
  active: boolean;
}

interface RateRow {
  key: string;
  name: string;
  min: string;
  max: string;
  price: string;
  // Fields this form doesn't edit (id, weights, estimatedDays, onboarding `source`), carried through on save.
  extra: Record<string, unknown>;
}

const card = "rounded-[22px] border border-app-line bg-white p-5";
const numeric = (value: string) => value.replace(/[^\d.]/g, "");

function currencySymbol(currency: string) {
  return currency === "GHS" ? "GH₵" : currency === "KES" ? "KSh" : currency === "NGN" ? "₦" : `${currency} `;
}

function toRow(rate: Record<string, unknown>, index: number): RateRow {
  const { name, label, minValue, maxValue, min, max, price, ...extra } = rate;
  const lower = minValue ?? min;
  const upper = maxValue ?? max;
  return {
    key: `rate-${index}`,
    name: typeof name === "string" ? name : typeof label === "string" ? label : "",
    min: lower != null && Number(lower) > 0 ? String(lower) : "",
    max: upper != null ? String(upper) : "",
    price: price != null ? String(price) : "",
    extra,
  };
}

const blankRow = (key: string): RateRow => ({ key, name: "", min: "", max: "", price: "", extra: {} });

export function ShippingZoneForm({ zone, currency }: { zone?: ShippingZoneFormValue; currency: string }) {
  const t = useT("shipping", "common");
  const router = useRouter();
  const symbol = currencySymbol(currency);
  const [name, setName] = useState(zone?.name ?? "");
  const [regions, setRegions] = useState<string[]>(zone?.regions ?? []);
  const [areaInput, setAreaInput] = useState("");
  const [rates, setRates] = useState<RateRow[]>(() => (zone?.rates.length ? zone.rates.map(toRow) : [blankRow("rate-0")]));
  const [sortOrder, setSortOrder] = useState(String(zone?.sortOrder ?? 0));
  const [active, setActive] = useState(zone?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addArea(raw = areaInput) {
    const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return;
    setRegions((current) => {
      const next = [...current];
      for (const part of parts) {
        if (!next.some((region) => region.toLowerCase() === part.toLowerCase())) next.push(part.slice(0, 80));
      }
      return next;
    });
    setAreaInput("");
  }

  function updateRate(key: string, patch: Partial<RateRow>) {
    setRates((current) => current.map((rate) => (rate.key === key ? { ...rate, ...patch } : rate)));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t("form.needName"));
    if (!rates.length) return setError(t("form.needFee"));
    const payloadRates = [];
    for (const [index, rate] of rates.entries()) {
      if (rate.price.trim() === "") return setError(t("form.needPrice", { n: index + 1 }));
      const price = Number(rate.price);
      const minValue = rate.min ? Number(rate.min) : 0;
      const maxValue = rate.max ? Number(rate.max) : undefined;
      if (![price, minValue, maxValue ?? 0].every(Number.isFinite)) return setError(t("form.badNumber", { n: index + 1 }));
      if (maxValue != null && maxValue < minValue) return setError(t("form.maxMin", { n: index + 1 }));
      payloadRates.push({
        minWeight: 0,
        ...rate.extra,
        name: rate.name.trim() || (rates.length === 1 ? "Standard delivery" : `Fee ${index + 1}`),
        minValue,
        ...(maxValue != null ? { maxValue } : {}),
        price,
      });
    }
    const pendingArea = areaInput.trim() ? areaInput.split(",").map((part) => part.trim()).filter(Boolean) : [];
    const allRegions = [...regions, ...pendingArea.filter((part) => !regions.some((region) => region.toLowerCase() === part.toLowerCase()))];

    setBusy(true);
    try {
      const response = await fetch(zone ? `/api/store/shipping-zones/${zone.id}` : "/api/store/shipping-zones", {
        method: zone ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          regions: allRegions,
          rates: payloadRates,
          sortOrder: Number.parseInt(sortOrder, 10) || 0,
          active,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? t("form.saveFailed"));
      router.push("/home/shipping");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("form.saveFailed"));
      setBusy(false);
    }
  }

  async function remove() {
    if (!zone) return;
    setError(null);
    setDeleting(true);
    try {
      const response = await fetch(`/api/store/shipping-zones/${zone.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? t("form.deleteFailed"));
      }
      router.push("/home/shipping");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("form.deleteFailed"));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <section className={card}>
        <h2 className="m-0 text-[17px] font-extrabold">{t("form.zone")}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_200px]">
          <div className="min-w-0">
            <FieldLabel htmlFor="zone-name">{t("form.zoneName")}</FieldLabel>
            <TextInput id="zone-name" required maxLength={120} placeholder={t("form.zoneNamePlaceholder")} value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="zone-order">{t("form.checkOrder")}</FieldLabel>
            <TextInput id="zone-order" inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value.replace(/[^\d-]/g, ""))} aria-describedby="zone-order-hint" />
          </div>
        </div>
        <p id="zone-order-hint" className="mb-0 mt-2 text-[13px] leading-5 text-app-ink-soft">
          {t("form.checkOrderHint")}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-[16px] bg-app-canvas px-4 py-3">
          <div className="min-w-0">
            <div className="text-[14.5px] font-bold">{t("form.useAtCheckout")}</div>
            <div className="text-[13px] text-app-ink-soft">{active ? t("form.onNote") : t("form.offNote")}</div>
          </div>
          <Toggle on={active} onChange={setActive} label={t("form.useAtCheckout")} />
        </div>
      </section>

      <section className={card}>
        <h2 className="m-0 text-[17px] font-extrabold">{t("form.areas")}</h2>
        <p className="mb-0 mt-1 text-[13.5px] leading-5 text-app-ink-soft">
          {t("form.areasHint")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="min-w-0 flex-1 basis-[220px]">
            <TextInput
              aria-label={t("form.addArea")}
              placeholder={t("form.addAreaPlaceholder")}
              value={areaInput}
              onChange={(event) => setAreaInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addArea();
                } else if (event.key === "Backspace" && !areaInput && regions.length) {
                  setRegions((current) => current.slice(0, -1));
                }
              }}
            />
          </div>
          <PillButton size="md" tone="white" onClick={() => addArea()} disabled={!areaInput.trim()}>
            <Icon name="plus" size={16} /> {t("form.add")}
          </PillButton>
        </div>
        {regions.length > 0 ? (
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0" aria-label={t("form.areasAria")}>
            {regions.map((region) => (
              <li key={region} className="inline-flex min-h-[40px] max-w-full items-center gap-1 rounded-full bg-app-canvas pl-4 pr-1 text-[14px] font-bold">
                <span className="min-w-0 truncate">{region}</span>
                <button
                  type="button"
                  aria-label={t("form.removeX", { name: region })}
                  onClick={() => setRegions((current) => current.filter((item) => item !== region))}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-black/[0.06]"
                >
                  <Icon name="x" size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-0 mt-3 text-[13.5px] font-bold text-app-ink-soft">{t("form.noAreas")}</p>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h2 className="m-0 text-[17px] font-extrabold">{t("form.fees")}</h2>
            <p className="mb-0 mt-1 text-[13.5px] leading-5 text-app-ink-soft">
              {t("form.feesHint")}
            </p>
          </div>
          <PillButton size="sm" tone="white" onClick={() => setRates((current) => [...current, blankRow(`rate-${Date.now()}`)])}>
            <Icon name="plus" size={14} /> {t("form.addFee")}
          </PillButton>
        </div>
        <ul className="m-0 mt-4 grid list-none gap-2 p-0">
          {rates.map((rate, index) => {
            const label = rate.name || t("rate.fee", { n: index + 1 });
            return (
              <li key={rate.key} className="grid grid-cols-2 items-end gap-3 rounded-[16px] bg-app-canvas p-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div className="col-span-2 min-w-0 lg:col-span-1">
                  <FieldLabel htmlFor={`${rate.key}-name`}>{t("form.label")}</FieldLabel>
                  <TextInput id={`${rate.key}-name`} maxLength={80} placeholder={index === 0 ? t("form.standard") : t("rate.fee", { n: index + 1 })} value={rate.name} onChange={(event) => updateRate(rate.key, { name: event.target.value })} />
                </div>
                <div className="min-w-0">
                  <FieldLabel htmlFor={`${rate.key}-min`}>{t("form.minOrder", { symbol: symbol.trim() })}</FieldLabel>
                  <TextInput id={`${rate.key}-min`} inputMode="decimal" placeholder="0" value={rate.min} onChange={(event) => updateRate(rate.key, { min: numeric(event.target.value) })} />
                </div>
                <div className="min-w-0">
                  <FieldLabel htmlFor={`${rate.key}-max`}>{t("form.maxOrder", { symbol: symbol.trim() })}</FieldLabel>
                  <TextInput id={`${rate.key}-max`} inputMode="decimal" placeholder={t("form.noLimit")} value={rate.max} onChange={(event) => updateRate(rate.key, { max: numeric(event.target.value) })} />
                </div>
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <FieldLabel htmlFor={`${rate.key}-price`}>{t("form.fee", { symbol: symbol.trim() })}</FieldLabel>
                  <TextInput id={`${rate.key}-price`} inputMode="decimal" required placeholder={t("form.feePlaceholder")} value={rate.price} onChange={(event) => updateRate(rate.key, { price: numeric(event.target.value) })} />
                </div>
                <button
                  type="button"
                  aria-label={t("form.removeX", { name: label })}
                  disabled={rates.length === 1}
                  onClick={() => setRates((current) => current.filter((item) => item.key !== rate.key))}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-app-danger disabled:cursor-not-allowed disabled:opacity-40 max-sm:col-span-2 sm:justify-self-end"
                >
                  <Icon name="trash" size={15} /> {t("remove")}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {error && <Notice>{error}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <PillButton type="submit" tone="accent" size="md" busy={busy} disabled={deleting}>
            {zone ? t("form.save") : t("form.create")}
          </PillButton>
          <PillButton tone="white" size="md" onClick={() => router.push("/home/shipping")} disabled={busy || deleting}>
            {t("cancel")}
          </PillButton>
        </div>
        {zone && (
          confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("form.confirmDelete")}>
              <span className="text-[14px] font-bold">{t("form.deleteQuestion", { name: zone.name })}</span>
              <PillButton size="sm" tone="ink" className="!bg-app-danger" busy={deleting} onClick={remove}>{t("form.yesDelete")}</PillButton>
              <PillButton size="sm" tone="white" disabled={deleting} onClick={() => setConfirmDelete(false)}>{t("form.keep")}</PillButton>
            </div>
          ) : (
            <PillButton size="sm" tone="white" className="text-app-danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={14} /> {t("form.delete")}
            </PillButton>
          )
        )}
      </div>
    </form>
  );
}
