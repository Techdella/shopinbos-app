"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { Toggle } from "@/components/app-ui";
import { PAY_SMALL_WEEKS, REFUND_PRESET, planProblem, splitIntoParts } from "@shared/instalments";
import { GROUP_DEFAULT_HOURS, GROUP_WINDOW_HOURS } from "@shared/group-buy";
import { AJO_MAX_SIZE, AJO_MIN_SIZE, DEFAULT_AJO_RULES, ajoWeeklyKobo } from "@shared/ajo";
import { lagosDay, addDays } from "@shared/instalments";
import { Box, Button, Message, act, call, inputClass, useFormat } from "./seller-ui";

// "Other ways to buy" on the seller's product page (pilots pay_small_small, group_buy, ajo; the page renders this only
// while one of them is on for the shop). Pay small small: on/off, the lengths allowed (4/6/8 weeks), price lock and the
// refund rule. Buy with friends: group price, size and how long it stays open. Ajo: start a group for this product.
// Everything needs the seller's Shopinbos Wallet (active Paystack subaccount): each payment is split straight to it.

type View = {
  features: { paySmall: boolean; groupBuy: boolean; ajo: boolean };
  walletReady: boolean;
  sellable: boolean;
  dropship: boolean;
  published: boolean;
  price: number;
  variants: Array<{ id: string; name: string; price: number }>;
  option: { paySmallOn: boolean; paySmallWeeks: number[]; priceLock: boolean; refundRule: string; groupBuyOn: boolean; groupPrice: number | null; groupSize: number | null; groupHours: number | null };
};

type Note = { tone: "error" | "success"; text: string } | null;

export function ProductPayOptionsCard({ productId }: { productId: string }) {
  const t = useT("together");
  const { money } = useFormat();
  const [view, setView] = useState<View | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  // Pay small small
  const [weeks, setWeeks] = useState<number[]>([...PAY_SMALL_WEEKS]);
  const [priceLock, setPriceLock] = useState(true);
  const [refundRule, setRefundRule] = useState(REFUND_PRESET);
  // Group buy
  const [groupPrice, setGroupPrice] = useState("");
  const [groupSize, setGroupSize] = useState("5");
  const [groupHours, setGroupHours] = useState(GROUP_DEFAULT_HOURS);
  // Ajo
  const [ajoSize, setAjoSize] = useState("6");
  const [ajoDeposit, setAjoDeposit] = useState("0");
  const [ajoStart, setAjoStart] = useState(() => addDays(lagosDay(new Date()), 7));
  const [ajoRules, setAjoRules] = useState(DEFAULT_AJO_RULES);
  const [ajoVariant, setAjoVariant] = useState("");
  const [ajoNote, setAjoNote] = useState<Note>(null);
  const [ajoCreated, setAjoCreated] = useState<string | null>(null);

  function apply(loaded: View) {
    setView(loaded);
    setWeeks(loaded.option.paySmallWeeks);
    setPriceLock(loaded.option.priceLock);
    setRefundRule(loaded.option.refundRule);
    setGroupPrice(loaded.option.groupPrice !== null ? String(loaded.option.groupPrice) : "");
    setGroupSize(String(loaded.option.groupSize ?? 5));
    setGroupHours(loaded.option.groupHours ?? GROUP_DEFAULT_HOURS);
    setAjoVariant((current) => current || loaded.variants[0]?.id || "");
  }

  useEffect(() => {
    let live = true;
    call<View>(`/api/app/pay-options/products/${encodeURIComponent(productId)}`)
      .then((loaded) => live && apply(loaded))
      .catch((error: Error) => live && setLoadError(error.message || t("loadFailed")));
    return () => {
      live = false;
    };
  }, [productId, t]);

  async function save(change: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    try {
      apply(await call<View>(`/api/app/pay-options/products/${encodeURIComponent(productId)}`, { method: "PUT", json: change }));
      setNote({ tone: "success", text: t("saved") });
    } catch (error) {
      setNote({ tone: "error", text: (error as Error).message || t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function createAjo() {
    setBusy(true);
    setAjoNote(null);
    try {
      const created = await act<{ ok: true; id: string }>({ action: "ajo.create", productId, ...(ajoVariant ? { variantId: ajoVariant } : {}), size: Number(ajoSize), deposit: Number(ajoDeposit) || 0, rules: ajoRules, startDay: ajoStart });
      setAjoCreated(created.id);
      setAjoNote({ tone: "success", text: t("ajo.created") });
    } catch (error) {
      setAjoNote({ tone: "error", text: (error as Error).message || t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  if (loadError && !view) return null;
  if (!view) return null;
  const { features, option } = view;
  const blocked = !view.walletReady ? t("walletNeeded") : view.dropship ? t("dropship") : !view.published ? t("unpublished") : null;
  const priceKobo = Math.round(view.price * 100);
  const ajoPrice = view.variants.find((variant) => variant.id === ajoVariant)?.price ?? view.price;

  return (
    <Box className="mt-5 grid gap-5">
      <div>
        <h2 className="m-0 text-[17px] font-extrabold">{t("card.title")}</h2>
        <p className="mb-0 mt-1 text-[14px] leading-[1.55] text-app-ink-soft">{t("card.sub")}</p>
      </div>
      {blocked ? (
        <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px]">
          {blocked} {!view.walletReady ? <Link href="/home/wallet" className="font-extrabold text-app-accent-ink">{t("walletLink")}</Link> : null}
        </p>
      ) : null}

      {features.paySmall ? (
        <div className="grid gap-3 border-t border-app-line pt-4">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="m-0 text-[15.5px] font-extrabold">{t("small.title")}</h3>
              <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">{t("small.sub")}</p>
            </div>
            <Toggle on={option.paySmallOn} label={t("small.title")} onChange={(on) => void save({ paySmallOn: on })} />
          </div>
          <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
            <legend className="mb-1.5 text-[13.5px] font-bold">{t("small.weeks")}</legend>
            {PAY_SMALL_WEEKS.map((count) => (
              <label key={count} className={`inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border px-4 text-[14px] ${weeks.includes(count) ? "border-app-ink font-bold" : "border-app-line"}`}>
                <input type="checkbox" className="sr-only" checked={weeks.includes(count)} onChange={(event) => setWeeks((current) => (event.target.checked ? [...current, count].sort((a, b) => a - b) : current.filter((entry) => entry !== count)))} />
                {t("small.weeksOption", { count })}
              </label>
            ))}
          </fieldset>
          {weeks.filter((count) => !planProblem(priceKobo, count)).slice(0, 1).map((count) => (
            <p key={count} className="m-0 text-[13.5px] font-semibold">{t("small.example", { price: money(view.price), weeks: count, weekly: money(splitIntoParts(priceKobo, count)![0]! / 100) })}</p>
          ))}
          <label className="flex items-center gap-3 text-[14px]">
            <input type="checkbox" checked={priceLock} onChange={(event) => setPriceLock(event.target.checked)} className="h-5 w-5" />
            {t("small.priceLock")}
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">{t("small.refund")}</span>
            <textarea value={refundRule} onChange={(event) => setRefundRule(event.target.value)} rows={2} maxLength={500} className={`${inputClass} py-2.5`} />
          </label>
          <button type="button" onClick={() => setRefundRule(REFUND_PRESET)} className="justify-self-start text-[13.5px] font-bold text-app-accent-ink underline-offset-2 hover:underline">{t("small.refundPreset")}</button>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy} onClick={() => void save({ paySmallWeeks: weeks, priceLock, refundRule })}>{t("save")}</Button>
            <Link href="/home/pay-small" className="text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">{t("small.seePlans")}</Link>
          </div>
        </div>
      ) : null}

      {features.groupBuy ? (
        <div className="grid gap-3 border-t border-app-line pt-4">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="m-0 text-[15.5px] font-extrabold">{t("group.title")}</h3>
              <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">{t("group.sub")}</p>
            </div>
            <Toggle on={option.groupBuyOn} label={t("group.title")} onChange={(on) => void save({ groupBuyOn: on, groupPrice: Number(groupPrice) || null, groupSize: Number(groupSize) || null, groupHours })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5">
              <span className="text-[13.5px] font-bold">{t("group.price")}</span>
              <input type="number" inputMode="numeric" min={1} value={groupPrice} onChange={(event) => setGroupPrice(event.target.value)} className={inputClass} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13.5px] font-bold">{t("group.size")}</span>
              <input type="number" inputMode="numeric" min={2} max={20} value={groupSize} onChange={(event) => setGroupSize(event.target.value)} className={inputClass} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13.5px] font-bold">{t("group.hours")}</span>
              <select value={groupHours} onChange={(event) => setGroupHours(Number(event.target.value))} className={inputClass}>
                {GROUP_WINDOW_HOURS.map((hours) => <option key={hours} value={hours}>{t("group.hoursOption", { count: hours })}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy} onClick={() => void save({ groupPrice: Number(groupPrice) || null, groupSize: Number(groupSize) || null, groupHours })}>{t("save")}</Button>
            <Link href="/home/group-buys" className="text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">{t("group.see")}</Link>
          </div>
        </div>
      ) : null}

      <Message message={note} />

      {features.ajo ? (
        <div className="grid gap-3 border-t border-app-line pt-4">
          <div>
            <h3 className="m-0 text-[15.5px] font-extrabold">{t("ajo.title")}</h3>
            <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">{t("ajo.sub")}</p>
          </div>
          {view.variants.length ? (
            <select value={ajoVariant} onChange={(event) => setAjoVariant(event.target.value)} className={inputClass}>
              {view.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · {money(variant.price)}</option>)}
            </select>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5">
              <span className="text-[13.5px] font-bold">{t("ajo.size")}</span>
              <input type="number" inputMode="numeric" min={AJO_MIN_SIZE} max={AJO_MAX_SIZE} value={ajoSize} onChange={(event) => setAjoSize(event.target.value)} className={inputClass} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13.5px] font-bold">{t("ajo.deposit")}</span>
              <input type="number" inputMode="numeric" min={0} value={ajoDeposit} onChange={(event) => setAjoDeposit(event.target.value)} className={inputClass} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13.5px] font-bold">{t("ajo.start")}</span>
              <input type="date" value={ajoStart} onChange={(event) => setAjoStart(event.target.value)} className={inputClass} />
            </label>
          </div>
          {Number(ajoSize) >= AJO_MIN_SIZE ? <p className="m-0 text-[13.5px] font-semibold">{t("ajo.weekly", { amount: money(ajoWeeklyKobo(Math.round(ajoPrice * 100), Number(ajoSize)) / 100) })}</p> : null}
          <label className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">{t("ajo.rules")}</span>
            <textarea value={ajoRules} onChange={(event) => setAjoRules(event.target.value)} rows={6} maxLength={2000} className={`${inputClass} py-2.5`} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy || Boolean(blocked)} onClick={() => void createAjo()}>{t("ajo.create")}</Button>
            {ajoCreated ? <Link href={`/home/ajo/${ajoCreated}`} className="text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">{t("ajo.see")}</Link> : <Link href="/home/ajo" className="text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">{t("ajo.see")}</Link>}
          </div>
          <Message message={ajoNote} />
        </div>
      ) : null}
    </Box>
  );
}
