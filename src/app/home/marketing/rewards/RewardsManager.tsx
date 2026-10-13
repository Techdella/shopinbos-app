"use client";

import { lazy, Suspense, useId, useMemo, useState } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Pill, StatGrid, StatTile } from "@/components/app-kit";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Field, inputClass, selectClass } from "@/components/growth/kit";
import { naira } from "@shared/onboarding";
import {
  MAX_SLICES,
  MAX_TIERS,
  MIN_SLICES,
  configProblems,
  pointsForSpend,
  pointsValue,
  sliceLabel,
  sliceOdds,
  type ContactChoice,
  type GameSectionKind,
  type GameSlice,
  type GameTrigger,
  type GamificationConfig,
  type PopupGameSettings,
  type ProgressTier,
  type SliceKind,
  type TierRewardKind,
} from "@/lib/gamification/logic";
import type { GameStats } from "@/lib/gamification/stats.server";
import type { GameColors } from "@/components/storefront/gamification/client";
import { RewardProgress } from "@/components/storefront/gamification/RewardProgress";
import { Wheel } from "@/components/storefront/gamification/Wheel";
import { api, errorText } from "../_kit/client";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate, formatNumber } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

type Key = MessageKey<"marketing">;

const GameDialog = lazy(() => import("@/components/storefront/gamification/GameDialog"));

interface Product {
  id: string;
  name: string;
  retailPrice: number;
}

const SLICE_KINDS: Array<{ value: SliceKind; label: Key }> = [
  { value: "percent", label: "forms.percentOff" },
  { value: "amount", label: "forms.nairaOff" },
  { value: "free_delivery", label: "rewards.freeDelivery" },
  { value: "free_gift", label: "rewards.freeGift" },
  { value: "try_again", label: "rewards.tryAgain" },
];
const TIER_KINDS: Array<{ value: TierRewardKind; label: Key }> = [
  { value: "free_gift", label: "rewards.freeGift" },
  { value: "percent", label: "forms.percentOff" },
  { value: "amount", label: "forms.nairaOff" },
];
const TRIGGERS: Array<{ value: GameTrigger; label: Key }> = [
  { value: "entry", label: "rewards.trigger.entry" },
  { value: "delay", label: "forms.afterSeconds" },
  { value: "scroll", label: "rewards.trigger.scroll" },
  { value: "exit", label: "rewards.trigger.exit" },
];
const CONTACTS: Array<{ value: ContactChoice; label: Key }> = [
  { value: "either", label: "rewards.contact.either" },
  { value: "email", label: "channel.email" },
  { value: "whatsapp", label: "forms.whatsappNumber" },
];

const newId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;

export function RewardsManager({ initial, stats, products, currency, storeSlug, freeDeliveryOver, placed, colors }: {
  initial: GamificationConfig;
  stats: GameStats;
  products: Product[];
  currency: string;
  storeSlug: string;
  freeDeliveryOver: number | null;
  placed: GameSectionKind[];
  colors: GameColors;
}) {
  const router = useRouter();
  const t = useT("marketing", "common");
  const locale = useLocale();
  const n = (value: number) => formatNumber(value, locale);
  const [config, setConfig] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tryGame, setTryGame] = useState<"wheel" | "scratch" | "post_purchase" | null>(null);
  const dirty = JSON.stringify(config) !== saved;
  const problems = configProblems(config);
  const giftNames = useMemo(() => Object.fromEntries(products.map((product) => [product.id, product.name])), [products]);

  function patch<K extends keyof GamificationConfig>(key: K, value: Partial<GamificationConfig[K]>) {
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], ...value } }));
    setNotice("");
  }

  async function save() {
    setError("");
    if (problems.length) return setError(problems[0]!);
    setBusy(true);
    try {
      const data = await api<{ config: GamificationConfig }>("/api/app/gamification", "PUT", { config });
      setConfig(data.config);
      setSaved(JSON.stringify(data.config));
      setNotice(t("rewards.saved"));
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const plays = stats.plays.wheel + stats.plays.scratch + stats.plays.post_purchase;
  const builderHint = (kind: GameSectionKind) =>
    placed.includes(kind) ? <Pill tone="success" dot>{t("rewards.onStore")}</Pill> : <Pill tone="warning">{t("rewards.notPlaced")}</Pill>;

  return (
    <div className="grid gap-5 pb-24">
      <StatGrid className="xl:grid-cols-4">
        <StatTile tone="card" label={t("rewards.stat.plays")} value={n(plays)} hint={stats.tablesReady ? t("rewards.stat.playsHint", { wheel: stats.plays.wheel, scratch: stats.plays.scratch, after: stats.plays.post_purchase }) : t("rewards.stat.countedLater")} />
        <StatTile tone="card" label={t("rewards.stat.codes")} value={`${n(stats.codesIssued)} / ${n(stats.codesRedeemed)}`} hint={stats.codesIssued ? t("rewards.stat.usedPct", { pct: Math.round((stats.codesRedeemed / stats.codesIssued) * 100) }) : t("rewards.stat.noneWon")} />
        <StatTile tone="card" label={t("rewards.stat.sales")} value={naira(stats.revenue)} hint={t("rewards.stat.salesHint", { given: naira(stats.discountGiven), tiers: naira(stats.tierRevenue) })} />
        <StatTile tone="card" label={t("rewards.stat.points")} value={`${n(stats.points.issued)} / ${n(stats.points.redeemed)}`} hint={t("rewards.stat.members", { count: stats.points.members })} />
      </StatGrid>
      {!stats.tablesReady ? (
        <Notice tone="info">{t("rewards.needsUpdate")}</Notice>
      ) : null}

      {/* ─── Games ─── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 gap-5">
          <GameCard
            title={t("rewards.wheel")}
            sub={t("rewards.wheelSub")}
            settings={config.wheel}
            onChange={(value) => patch("wheel", value)}
            placedPill={builderHint("spin-wheel")}
            onTry={() => setTryGame("wheel")}
          />
          <GameCard
            title={t("rewards.scratch")}
            sub={t("rewards.scratchSub")}
            settings={config.scratch}
            onChange={(value) => patch("scratch", value)}
            placedPill={builderHint("scratch-card")}
            onTry={() => setTryGame("scratch")}
          />
          <PrizesCard config={config} setConfig={setConfig} products={products} currency={currency} />
        </div>
        <aside className="grid content-start gap-4 xl:sticky xl:top-6">
          <Card className="p-5">
            <CardHead title={t("rewards.livePreview")} sub={t("rewards.livePreviewSub")} />
            <div className="mt-4 rounded-[18px] p-4" style={{ background: colors.paper }}>
              <Wheel slices={config.prizes.slices.map((slice) => ({ id: slice.id, label: slice.kind === "free_gift" && slice.productId && !slice.label ? `Free ${giftNames[slice.productId] ?? "gift"}` : sliceLabel(slice) }))} colors={colors} size={240} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <PillButton size="sm" tone="ink" onClick={() => setTryGame("wheel")}><Icon name="play" size={13} /> {t("rewards.tryWheel")}</PillButton>
              <PillButton size="sm" tone="white" onClick={() => setTryGame("scratch")}>{t("rewards.tryScratch")}</PillButton>
            </div>
            <p className="mb-0 mt-3 text-[12.5px] leading-5 text-app-ink-soft">
              {t("rewards.previewNoCodes")} <a href="/builder/editor" className="font-bold underline">{t("rewards.storeBuilderLower")}</a>{t("rewards.previewHowTo")}
            </p>
          </Card>
        </aside>
      </div>

      {/* ─── Reward progress ─── */}
      <ProgressCard config={config} patch={patch} products={products} currency={currency} freeDeliveryOver={freeDeliveryOver} colors={colors} giftNames={giftNames} placedPill={builderHint("reward-progress")} />

      {/* ─── Loyalty ─── */}
      <LoyaltyCard config={config} patch={patch} currency={currency} placedPill={builderHint("loyalty-banner")} />

      {/* ─── Post-purchase ─── */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <CardHead title={t("rewards.postTitle")} sub={t("rewards.postSub")} />
          </div>
          <Toggle on={config.postPurchase.enabled} onChange={(enabled) => patch("postPurchase", { enabled })} label={t("rewards.postToggle")} />
        </div>
        {config.postPurchase.enabled ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label={t("rewards.heading")} htmlFor="pp-headline">
              <input id="pp-headline" className={inputClass} value={config.postPurchase.headline} maxLength={80} onChange={(event) => patch("postPurchase", { headline: event.target.value })} />
            </Field>
            <PillButton size="md" tone="white" onClick={() => setTryGame("post_purchase")}>{t("rewards.tryIt")}</PillButton>
          </div>
        ) : null}
      </Card>

      {/* ─── Save bar ─── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-app-line bg-white/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-3">
          <p className="m-0 min-w-0 flex-1 text-[13.5px] text-app-ink-soft" role="status" aria-live="polite">
            {error ? <span className="font-bold text-app-danger">{error}</span> : notice || (dirty ? (problems[0] ?? t("rewards.unsaved")) : t("rewards.allSaved"))}
          </p>
          {dirty ? <PillButton size="md" tone="white" onClick={() => { setConfig(JSON.parse(saved)); setError(""); }}>{t("rewards.undoChanges")}</PillButton> : null}
          <PillButton size="md" tone="ink" busy={busy} disabled={!dirty || busy} onClick={() => void save()}>{t("save")}</PillButton>
        </div>
      </div>

      {tryGame ? (
        <Suspense fallback={null}>
          <GameDialog game={tryGame} storeSlug={storeSlug} currency={currency} config={{ ...config, wheel: { ...config.wheel, enabled: true }, scratch: { ...config.scratch, enabled: true } }} colors={colors} demo giftNames={giftNames} onClose={() => setTryGame(null)} />
        </Suspense>
      ) : null}
    </div>
  );
}

function GameCard({ title, sub, settings, onChange, placedPill, onTry }: { title: string; sub: string; settings: PopupGameSettings; onChange: (value: Partial<PopupGameSettings>) => void; placedPill: React.ReactNode; onTry: () => void }) {
  const t = useT("marketing", "common");
  const id = useId();
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <CardHead title={<span className="inline-flex flex-wrap items-center gap-2">{title} {settings.enabled ? placedPill : null}</span>} sub={sub} />
        </div>
        <Toggle on={settings.enabled} onChange={(enabled) => onChange({ enabled })} label={title} />
      </div>
      {settings.enabled ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t("rewards.heading")} htmlFor={`${id}-h`} className="sm:col-span-2">
            <input id={`${id}-h`} className={inputClass} value={settings.headline} maxLength={80} onChange={(event) => onChange({ headline: event.target.value })} />
          </Field>
          <Field label={t("rewards.text")} htmlFor={`${id}-b`} className="sm:col-span-2">
            <input id={`${id}-b`} className={inputClass} value={settings.body} maxLength={240} onChange={(event) => onChange({ body: event.target.value })} />
          </Field>
          <Field label={t("rewards.popupOpens")} htmlFor={`${id}-t`} hint={t("rewards.popupOpensHint")}>
            <select id={`${id}-t`} className={selectClass} value={settings.trigger} onChange={(event) => onChange({ trigger: event.target.value as GameTrigger })}>
              {TRIGGERS.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
            </select>
          </Field>
          {settings.trigger === "delay" ? (
            <Field label={t("rewards.seconds")} htmlFor={`${id}-d`}>
              <input id={`${id}-d`} type="number" min={1} max={120} className={inputClass} value={settings.delaySeconds} onChange={(event) => onChange({ delaySeconds: Number(event.target.value) || 1 })} />
            </Field>
          ) : settings.trigger === "scroll" ? (
            <Field label={t("rewards.percentOfPage")} htmlFor={`${id}-s`}>
              <input id={`${id}-s`} type="number" min={5} max={100} className={inputClass} value={settings.scrollPercent} onChange={(event) => onChange({ scrollPercent: Number(event.target.value) || 50 })} />
            </Field>
          ) : <div />}
          <Field label={t("rewards.askFor")} htmlFor={`${id}-c`}>
            <select id={`${id}-c`} className={selectClass} value={settings.collect} onChange={(event) => onChange({ collect: event.target.value as ContactChoice })}>
              {CONTACTS.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
            </select>
          </Field>
          <Field label={t("rewards.onePlay")} htmlFor={`${id}-f`} hint={t("rewards.onePlayHint")}>
            <input id={`${id}-f`} type="number" min={1} max={365} className={inputClass} value={settings.frequencyDays} onChange={(event) => onChange({ frequencyDays: Number(event.target.value) || 1 })} />
          </Field>
          <div className="sm:col-span-2">
            <PillButton size="sm" tone="white" onClick={onTry}><Icon name="play" size={13} /> {t("rewards.tryIt")}</PillButton>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function PrizesCard({ config, setConfig, products, currency }: { config: GamificationConfig; setConfig: React.Dispatch<React.SetStateAction<GamificationConfig>>; products: Product[]; currency: string }) {
  const t = useT("marketing");
  const slices = config.prizes.slices;
  const odds = sliceOdds(slices);
  const setSlices = (next: GameSlice[]) => setConfig((prev) => ({ ...prev, prizes: { ...prev.prizes, slices: next } }));
  const update = (index: number, value: Partial<GameSlice>) => setSlices(slices.map((slice, i) => (i === index ? { ...slice, ...value } : slice)));
  const winChance = odds.reduce((sum, odd, index) => sum + (slices[index]!.kind !== "try_again" ? odd : 0), 0);
  return (
    <Card className="p-5">
      <CardHead title={t("rewards.prizes")} sub={t("rewards.prizesSub", { min: MIN_SLICES, max: MAX_SLICES, win: winChance })} />
      <div className="mt-4 grid gap-2">
        <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_88px_56px_40px] gap-2 px-1 text-[12px] font-bold text-app-ink-soft md:grid">
          <span>{t("rewards.col.prize")}</span><span>{t("rewards.col.amount")}</span><span>{t("rewards.col.label")}</span><span>{t("rewards.col.chance")}</span><span /><span />
        </div>
        {slices.map((slice, index) => (
          <div key={slice.id} className="grid grid-cols-2 gap-2 rounded-[16px] border border-app-line p-2.5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_88px_56px_40px] md:items-center md:border-0 md:p-1">
            <select aria-label={t("rewards.slicePrize", { n: index + 1 })} className={selectClass} value={slice.kind} onChange={(event) => update(index, { kind: event.target.value as SliceKind, value: event.target.value === "percent" ? 10 : event.target.value === "amount" ? 1000 : 0, productId: null })}>
              {SLICE_KINDS.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
            </select>
            {slice.kind === "percent" || slice.kind === "amount" ? (
              <input aria-label={slice.kind === "percent" ? t("rewards.slicePercent", { n: index + 1 }) : t("rewards.sliceNaira", { n: index + 1 })} type="number" min={1} max={slice.kind === "percent" ? 90 : undefined} className={inputClass} value={slice.value} onChange={(event) => update(index, { value: Number(event.target.value) || 0 })} />
            ) : slice.kind === "free_gift" ? (
              <select aria-label={t("rewards.sliceGift", { n: index + 1 })} className={selectClass} value={slice.productId ?? ""} onChange={(event) => update(index, { productId: event.target.value || null })}>
                <option value="">{t("rewards.pickProduct")}</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({naira(product.retailPrice)})</option>)}
              </select>
            ) : <span className="hidden md:block" />}
            <input aria-label={t("rewards.sliceLabel", { n: index + 1 })} className={inputClass} maxLength={28} placeholder={sliceLabel({ ...slice, label: "" })} value={slice.label} onChange={(event) => update(index, { label: event.target.value })} />
            <input aria-label={t("rewards.sliceWeight", { n: index + 1 })} type="number" min={0} max={1000} className={inputClass} value={slice.weight} onChange={(event) => update(index, { weight: Math.max(0, Number(event.target.value) || 0) })} />
            <span className="self-center text-[13px] font-bold tabular-nums text-app-ink-soft" aria-label={t("rewards.chancePct", { pct: odds[index] })}>{odds[index]}%</span>
            <button type="button" aria-label={t("rewards.removeSlice", { n: index + 1 })} disabled={slices.length <= MIN_SLICES} onClick={() => setSlices(slices.filter((_, i) => i !== index))} className="grid h-10 w-10 place-items-center justify-self-end rounded-full text-app-ink-soft hover:bg-app-canvas disabled:opacity-30">
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <PillButton size="sm" tone="white" disabled={slices.length >= MAX_SLICES} onClick={() => setSlices([...slices, { id: newId("s"), kind: "percent", value: 5, productId: null, label: "", weight: 10 }])}>
          <Icon name="plus" size={13} /> {t("rewards.addSlice")}
        </PillButton>
        <span className="text-[12.5px] text-app-ink-soft">{t("rewards.chanceHelp")}</span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={t("rewards.codesLast")} htmlFor="prize-days" hint={t("rewards.codesLastHint")}>
          <input id="prize-days" type="number" min={1} max={90} className={inputClass} value={config.prizes.codeDays} onChange={(event) => setConfig((prev) => ({ ...prev, prizes: { ...prev.prizes, codeDays: Number(event.target.value) || 1 } }))} />
        </Field>
        <Field label={t("rewards.minOrder", { currency })} htmlFor="prize-min" hint={t("rewards.minOrderHint")}>
          <input id="prize-min" type="number" min={0} className={inputClass} value={config.prizes.minOrder} onChange={(event) => setConfig((prev) => ({ ...prev, prizes: { ...prev.prizes, minOrder: Math.max(0, Number(event.target.value) || 0) } }))} />
        </Field>
      </div>
    </Card>
  );
}

function ProgressCard({ config, patch, products, currency, freeDeliveryOver, colors, giftNames, placedPill }: {
  config: GamificationConfig;
  patch: <K extends keyof GamificationConfig>(key: K, value: Partial<GamificationConfig[K]>) => void;
  products: Product[];
  currency: string;
  freeDeliveryOver: number | null;
  colors: GameColors;
  giftNames: Record<string, string>;
  placedPill: React.ReactNode;
}) {
  const t = useT("marketing");
  const tiers = config.progress.tiers;
  const setTiers = (next: ProgressTier[]) => patch("progress", { tiers: next });
  const update = (index: number, value: Partial<ProgressTier>) => setTiers(tiers.map((tier, i) => (i === index ? { ...tier, ...value } : tier)));
  const top = Math.max(freeDeliveryOver ?? 0, ...tiers.map((tier) => tier.threshold), 10000);
  const [sample, setSample] = useState(Math.round(top * 0.55));
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <CardHead title={<span className="inline-flex flex-wrap items-center gap-2">{t("rewards.progress")} {config.progress.enabled ? <Pill tone="success" dot>{t("rewards.inBag")}</Pill> : null}</span>} sub={t("rewards.progressSub")} />
        </div>
        <Toggle on={config.progress.enabled} onChange={(enabled) => patch("progress", { enabled })} label={t("rewards.progress")} />
      </div>
      {config.progress.enabled ? (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="grid content-start gap-3">
            <label className="flex items-center gap-3 text-[14px] font-medium">
              <input type="checkbox" className="h-[18px] w-[18px] accent-[#16141F]" checked={config.progress.freeDelivery} onChange={(event) => patch("progress", { freeDelivery: event.target.checked })} />
              {t("rewards.includeFree")} {freeDeliveryOver ? t("rewards.includeFreeFrom", { amount: naira(freeDeliveryOver) }) : t("rewards.includeFreeSet")}
            </label>
            {tiers.map((tier, index) => (
              <div key={tier.id} className="grid grid-cols-2 gap-2 rounded-[16px] border border-app-line p-3 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_40px] sm:items-end">
                <Field label={t("rewards.at")} htmlFor={`tier-${tier.id}-at`}>
                  <input id={`tier-${tier.id}-at`} type="number" min={1} className={inputClass} value={tier.threshold} onChange={(event) => update(index, { threshold: Math.max(1, Number(event.target.value) || 1) })} />
                </Field>
                <Field label={t("rewards.reward")} htmlFor={`tier-${tier.id}-kind`}>
                  <select id={`tier-${tier.id}-kind`} className={selectClass} value={tier.kind} onChange={(event) => update(index, { kind: event.target.value as TierRewardKind, value: event.target.value === "percent" ? 5 : event.target.value === "amount" ? 1000 : 0, productId: null })}>
                    {TIER_KINDS.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
                  </select>
                </Field>
                {tier.kind === "free_gift" ? (
                  <Field label={t("rewards.gift")} htmlFor={`tier-${tier.id}-gift`}>
                    <select id={`tier-${tier.id}-gift`} className={selectClass} value={tier.productId ?? ""} onChange={(event) => update(index, { productId: event.target.value || null })}>
                      <option value="">{t("rewards.pickProduct")}</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                  </Field>
                ) : (
                  <Field label={tier.kind === "percent" ? t("rewards.percentOff") : t("rewards.nairaOffLabel")} htmlFor={`tier-${tier.id}-value`}>
                    <input id={`tier-${tier.id}-value`} type="number" min={1} className={inputClass} value={tier.value} onChange={(event) => update(index, { value: Number(event.target.value) || 0 })} />
                  </Field>
                )}
                <button type="button" aria-label={t("rewards.removeTier", { amount: naira(tier.threshold) })} onClick={() => setTiers(tiers.filter((_, i) => i !== index))} className="grid h-12 w-10 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas">
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <PillButton size="sm" tone="white" disabled={tiers.length >= MAX_TIERS} onClick={() => setTiers([...tiers, { id: newId("t"), threshold: Math.round((top * 1.5) / 1000) * 1000, kind: "free_gift", value: 0, productId: null, label: "" }])}>
                <Icon name="plus" size={13} /> {t("rewards.addReward")}
              </PillButton>
              <span className="text-[12.5px] text-app-ink-soft">{t("rewards.tiersHelp")}</span>
            </div>
          </div>
          <div className="grid content-start gap-3 rounded-[18px] p-4" style={{ background: colors.paper, color: colors.ink }}>
            <p className="m-0 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: colors.muted }}>{t("editor.preview")}</p>
            <RewardProgress subtotal={sample} freeDeliveryOver={config.progress.freeDelivery ? freeDeliveryOver : null} tiers={tiers} giftNames={giftNames} currency={currency} colors={{ ...colors, card: colors.paper }} />
            <label className="grid gap-1 text-[12.5px]" style={{ color: colors.muted }}>
              {t("rewards.sampleBag", { amount: naira(sample) })}
              <input type="range" min={0} max={Math.round(top * 1.2)} step={500} value={sample} onChange={(event) => setSample(Number(event.target.value))} />
            </label>
            <p className="m-0 text-[12px]" style={{ color: colors.muted }}>{t("rewards.alsoSection")} {placedPill}</p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function LoyaltyCard({ config, patch, currency, placedPill }: { config: GamificationConfig; patch: <K extends keyof GamificationConfig>(key: K, value: Partial<GamificationConfig[K]>) => void; currency: string; placedPill: React.ReactNode }) {
  const t = useT("marketing");
  const locale = useLocale();
  const l = config.loyalty;
  const set = (value: Partial<typeof l>) => patch("loyalty", value);
  const field = (key: keyof typeof l, label: string, hint?: string, step = 1) => (
    <Field label={label} htmlFor={`loy-${key}`} hint={hint}>
      <input id={`loy-${key}`} type="number" min={0} step={step} className={inputClass} value={l[key] as number} onChange={(event) => set({ [key]: Number(event.target.value) || 0 } as Partial<typeof l>)} />
    </Field>
  );
  const sampleOrder = 20000;
  const sampleEarn = pointsForSpend(sampleOrder, l);
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <CardHead title={<span className="inline-flex flex-wrap items-center gap-2">{t("rewards.loyalty")} {l.enabled ? placedPill : null}</span>} sub={t("rewards.loyaltySub")} />
        </div>
        <Toggle on={l.enabled} onChange={(enabled) => set({ enabled })} label={t("rewards.loyalty")} />
      </div>
      {l.enabled ? (
        <>
          <p className="mb-0 mt-3 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px]">
            {t("rewards.earnBefore", { amount: naira(sampleOrder) })} <strong>{t("rewards.earnPoints", { points: formatNumber(sampleEarn, locale) })}</strong>{t("rewards.earnAfter", { worth: naira(pointsValue(sampleEarn, l)), currency, max: l.maxRedeemPercent })}
            {l.startedAt ? ` ${t("rewards.countingSince", { date: formatDate(l.startedAt, locale) })}` : ` ${t("rewards.countFromSave")}`}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {field("pointsPer100", t("rewards.loy.per100"), t("rewards.loy.per100Hint"), 0.1)}
            {field("pointValue", t("rewards.loy.value"), undefined, 0.01)}
            {field("maxRedeemPercent", t("rewards.loy.max"), t("rewards.loy.maxHint"))}
            {field("minRedeemPoints", t("rewards.loy.min"))}
            {field("silverAt", t("rewards.loy.silverAt"))}
            {field("silverMultiplier", t("rewards.loy.silverX"), undefined, 0.05)}
            {field("goldAt", t("rewards.loy.goldAt"))}
            {field("goldMultiplier", t("rewards.loy.goldX"), undefined, 0.05)}
            <Field label={t("rewards.loy.silverPerk")} htmlFor="loy-sp" className="sm:col-span-2">
              <input id="loy-sp" className={inputClass} maxLength={80} placeholder={t("rewards.loy.silverPerkPlaceholder")} value={l.silverPerk} onChange={(event) => set({ silverPerk: event.target.value })} />
            </Field>
            <Field label={t("rewards.loy.goldPerk")} htmlFor="loy-gp" className="sm:col-span-2">
              <input id="loy-gp" className={inputClass} maxLength={80} placeholder={t("rewards.loy.goldPerkPlaceholder")} value={l.goldPerk} onChange={(event) => set({ goldPerk: event.target.value })} />
            </Field>
          </div>
          <p className="mb-0 mt-3 text-[12.5px] leading-5 text-app-ink-soft">{t("rewards.loy.spendNote")}</p>
        </>
      ) : null}
    </Card>
  );
}
