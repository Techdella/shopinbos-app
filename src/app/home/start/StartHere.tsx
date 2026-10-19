"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mascot, Notice, PillButton, Toggle } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { withChannelRef } from "@shared/channels";
import { PAYMENT_METHODS, type PaymentMethodKey } from "@shared/onboarding";
import { formatMoney, formatNumber } from "@shared/i18n";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { DELIVERY_CITY_PRESETS, ELSEWHERE_AREA, START_SEEN_COOKIE, type SetupStep, type SetupStepKey } from "@/lib/setup/checklist";
import type { SetupOverview } from "@/lib/setup/server";
import { chooseSetupStep, saveDeliveryPicks, savePaymentChoices } from "./actions";
import { StartHelpers } from "./StartHelpers";
import { useAppSession } from "@/components/billing/useAppSession";

interface Props {
  firstName: string;
  overview: SetupOverview;
  launchResult: "paid" | "failed" | null;
  launchError?: string | null;
  /** A checklist step to open first (from ?step=). */
  openStep?: string | null;
}

type StartT = ReturnType<typeof useT<["home", "common"]>>;

/** Setup step copy comes from lib/setup/checklist in English; fixed sentences have a translation keyed by their text. */
function stepText(t: StartT, text: string) {
  return t.dynamic(`step.${text}`, text);
}

function useNaira() {
  const locale = useLocale();
  return (amount: number) => formatMoney(Math.round(amount), locale);
}

export function StartHere({ firstName, overview, launchResult, launchError, openStep }: Props) {
  const t = useT("home", "common");
  const router = useRouter();
  const { checklist, store } = overview;
  const [open, setOpen] = useState<SetupStepKey | null>(() => {
    // ?step=live (the store preview's "Publish your store") opens that step.
    const asked = checklist.steps.find((step) => step.key === openStep);
    if (asked) return asked.key;
    const next = checklist.next;
    return next && next.action.kind === "inline" ? next.key : null;
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(launchResult === "failed" ? launchError || t("start.launchFailed") : null);
  const [toast, setToast] = useState<string | null>(launchResult === "paid" ? t("start.launchPaid") : null);

  useEffect(() => {
    document.cookie = `${START_SEEN_COOKIE}=1; path=/; SameSite=Lax`;
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function choose(type: "skip" | "unskip" | "dismiss" | "reopen" | "shared", key?: SetupStepKey, then?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await chooseSetupStep(type, key);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (type === "skip" && open === key) setOpen(null);
      router.refresh();
      then?.();
    });
  }

  const remaining = checklist.total - checklist.done;

  return (
    <div className="w-full px-4 py-6 font-app text-app-ink sm:px-6 xl:px-8 2xl:px-10">
      {/* Greeting and progress */}
      <section className="app-wash relative overflow-hidden rounded-[22px] border border-app-line p-6 sm:p-7">
        <div className="flex flex-wrap items-start gap-4">
          <Mascot name="peggy-wave" className="h-16 w-16 shrink-0" alt="" />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[14px] text-app-ink-soft">{t("start.eyebrow")}</p>
            <h1 className="mb-0 mt-1 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">
              {checklist.complete ? t("start.allSet", { name: firstName }) : t("start.welcome", { name: firstName, store: store.name })}
            </h1>
            <p className="mb-0 mt-2 max-w-[620px] text-[15px] leading-[1.5] text-app-ink-soft">
              {checklist.complete ? t("start.allDone") : t("start.left", { count: remaining })}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <div className="min-w-[220px] flex-1">
            <div className="flex justify-between text-[13.5px]">
              <span className="font-bold">{t("start.doneOf", { done: checklist.done, total: checklist.total })}</span>
              <span className="text-app-ink-soft">{checklist.percent}%</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={checklist.percent} aria-label={t("start.progressAria")}>
              <div className="h-full rounded-full bg-app-accent transition-all" style={{ width: `${checklist.percent}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {checklist.complete ? (
              <Link href="/home" className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white no-underline">{t("start.goHome")}</Link>
            ) : checklist.next ? (
              <PillButton
                tone="accent"
                onClick={() => {
                  const next = checklist.next!;
                  if (next.action.kind === "link") router.push(next.action.href);
                  else {
                    setOpen(next.key);
                    document.getElementById(`step-${next.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                }}
              >
                {t("start.next", { title: (() => { const title = stepText(t, checklist.next.title); return title.charAt(0).toLowerCase() + title.slice(1); })() })}
              </PillButton>
            ) : null}
            {overview.choices.dismissed ? (
              <PillButton tone="white" disabled={pending} onClick={() => choose("reopen")}>{t("start.showAgain")}</PillButton>
            ) : !checklist.complete ? (
              <PillButton tone="white" disabled={pending} onClick={() => choose("dismiss", undefined, () => router.push("/home"))}>{t("start.later")}</PillButton>
            ) : null}
          </div>
        </div>
      </section>

      {error && <div className="mt-4"><Notice>{error}</Notice></div>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1fr)_520px]">
        {/* Checklist */}
        <section aria-labelledby="checklist-title" className="rounded-[22px] border border-app-line bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-2 pt-5">
            <h2 id="checklist-title" className="m-0 text-[17px] font-extrabold" data-tour="start-checklist">{t("start.checklist")}</h2>
            <span className="text-[13px] text-app-ink-soft">{t("start.optionalMarked")}</span>
          </div>
          <ol className="m-0 list-none divide-y divide-app-line p-0">
            {checklist.steps.map((step, index) => (
              <StepRow
                key={step.key}
                step={step}
                index={index}
                expanded={open === step.key}
                busy={pending}
                onToggle={() => setOpen(open === step.key ? null : step.key)}
                onSkip={() => choose("skip", step.key)}
                onUnskip={() => choose("unskip", step.key)}
              >
                <StepPanel
                  step={step}
                  overview={overview}
                  onDone={(message) => {
                    setOpen(null);
                    setToast(message);
                    router.refresh();
                  }}
                  onShared={(message) => {
                    setToast(message);
                    choose("shared");
                  }}
                  onError={setError}
                />
              </StepRow>
            ))}
          </ol>
        </section>

        <StartHelpers steps={checklist.steps} onChanged={() => router.refresh()} />
      </div>

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-app-ink px-5 py-3 text-[14px] font-bold text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}

function StepRow({
  step,
  index,
  expanded,
  busy,
  onToggle,
  onSkip,
  onUnskip,
  children,
}: {
  step: SetupStep;
  index: number;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onSkip: () => void;
  onUnskip: () => void;
  children: React.ReactNode;
}) {
  const t = useT("home", "common");
  const panelId = `step-panel-${step.key}`;
  const status = step.done ? t("start.status.done") : step.skipped ? t("start.status.skipped") : step.optional ? t("start.status.optional") : null;
  return (
    <li id={`step-${step.key}`} className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
        <span
          aria-hidden
          className={cx(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-extrabold",
            step.done ? "bg-app-success text-white" : step.skipped ? "bg-app-canvas text-app-ink-faint" : "border-2 border-app-line-strong text-app-ink-soft",
          )}
        >
          {step.done ? <Icon name="check" size={15} strokeWidth={3} /> : step.skipped ? <Icon name="minus" size={15} /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cx("m-0 text-[15px] font-extrabold", (step.done || step.skipped) && "text-app-ink-soft")}>{stepText(t, step.title)}</h3>
            {status && (
              <span className={cx("rounded-full px-2.5 py-0.5 text-[12px] font-bold", step.done ? "bg-app-success-tint text-app-success" : "bg-app-canvas text-app-ink-soft")}>{status}</span>
            )}
          </div>
          <p className="m-0 mt-0.5 text-[13.5px] leading-[1.45] text-app-ink-soft">{stepText(t, step.hint)}</p>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
          {step.skipped ? (
            <button type="button" disabled={busy} onClick={onUnskip} className="min-h-[40px] rounded-full px-3 text-[13.5px] font-bold text-app-ink-soft hover:text-app-ink">{t("start.undoSkip")}</button>
          ) : !step.done && step.key !== "store" ? (
            <button type="button" disabled={busy} onClick={onSkip} className="min-h-[40px] rounded-full px-3 text-[13.5px] font-bold text-app-ink-soft hover:text-app-ink">{t("skip")}</button>
          ) : null}
          {step.key === "store" ? (
            <Link href="/home/store" className="inline-flex min-h-[40px] items-center rounded-full border border-app-line bg-white px-4 text-[13.5px] font-extrabold text-app-ink no-underline hover:border-app-line-strong">{t("view")}</Link>
          ) : step.action.kind === "link" ? (
            <Link
              href={step.action.href}
              className={cx(
                "inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[13.5px] font-extrabold no-underline",
                step.done || step.skipped ? "border border-app-line bg-white text-app-ink hover:border-app-line-strong" : "bg-app-ink text-white",
              )}
            >
              {step.done ? t("open") : stepText(t, step.action.label)} <Icon name="arrow" size={14} />
            </Link>
          ) : (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={onToggle}
              className={cx(
                "inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[13.5px] font-extrabold",
                step.done || step.skipped || expanded ? "border border-app-line bg-white text-app-ink hover:border-app-line-strong" : "bg-app-ink text-white",
              )}
            >
              {expanded ? t("close") : step.done ? t("start.change") : stepText(t, step.action.label)}
              <Icon name="chevDown" size={14} className={cx("transition-transform", expanded && "rotate-180")} />
            </button>
          )}
        </div>
      </div>
      {expanded && step.action.kind === "inline" && (
        <div id={panelId} className="mt-4 rounded-[18px] bg-app-canvas p-4 sm:ml-11">
          {children}
        </div>
      )}
    </li>
  );
}

function StepPanel({
  step,
  overview,
  onDone,
  onShared,
  onError,
}: {
  step: SetupStep;
  overview: SetupOverview;
  onDone: (message: string) => void;
  onShared: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  if (step.key === "payments") return <PaymentsPanel initial={overview.payments} payoutBank={overview.facts.payoutBank} onDone={onDone} />;
  if (step.key === "delivery") return <DeliveryPanel zones={overview.zones} onDone={onDone} />;
  if (step.key === "live") return <LivePanel live={overview.facts.live} launch={overview.launch} onDone={onDone} onError={onError} />;
  if (step.key === "share") return <SharePanel name={overview.store.name} url={overview.store.url} onShared={onShared} />;
  return null;
}

function PaymentsPanel({ initial, payoutBank, onDone }: { initial: Record<PaymentMethodKey, boolean>; payoutBank: boolean; onDone: (message: string) => void }) {
  const t = useT("home", "common");
  const [methods, setMethods] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <p className="m-0 text-[14px] leading-[1.5]">{t("start.pay.intro")}</p>
      <div className="mt-3 divide-y divide-app-line rounded-[16px] bg-white px-4">
        {PAYMENT_METHODS.map((method) => (
          <div key={method.key} className="flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-extrabold">{t.dynamic(`pm.${method.key}.label`, method.label)}</div>
              <div className="text-[13px] leading-[1.35] text-app-ink-soft">{t.dynamic(`pm.${method.key}.hint`, method.hint)}</div>
            </div>
            <Toggle label={t.dynamic(`pm.${method.key}.label`, method.label)} on={methods[method.key]} onChange={(on) => setMethods((current) => ({ ...current, [method.key]: on }))} />
          </div>
        ))}
      </div>
      {methods.transfer && !payoutBank && <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">{t("start.pay.transferNote")}</p>}
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
      <PillButton
        className="mt-3"
        size="md"
        busy={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await savePaymentChoices(methods);
            if (result.error) setError(result.error);
            else onDone(t("start.pay.saved"));
          })
        }
      >
        {t("start.pay.save")}
      </PillButton>
    </div>
  );
}

function DeliveryPanel({ zones, onDone }: { zones: SetupOverview["zones"]; onDone: (message: string) => void }) {
  const t = useT("home", "common");
  const locale = useLocale();
  const existingFee = (city: string) => zones.find((zone) => zone.name.toLowerCase() === city.toLowerCase())?.fee;
  const elsewhere = zones.find((zone) => zone.regions.length === 0);
  const [picked, setPicked] = useState<Record<string, number>>(() => {
    const fromZones = Object.fromEntries(DELIVERY_CITY_PRESETS.filter((preset) => existingFee(preset.city) !== undefined).map((preset) => [preset.city, existingFee(preset.city)!]));
    return Object.keys(fromZones).length ? fromZones : { Lagos: 2000 };
  });
  const [elsewhereOn, setElsewhereOn] = useState(zones.length ? Boolean(elsewhere) : true);
  const [elsewhereFee, setElsewhereFee] = useState(elsewhere?.fee ?? 4000);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const other = zones.filter((zone) => zone.regions.length > 0 && !DELIVERY_CITY_PRESETS.some((preset) => preset.city.toLowerCase() === zone.name.toLowerCase()));
  const feeValue = (value: string) => Number(value.replace(/\D/g, "")) || 0;

  return (
    <div>
      <p className="m-0 text-[14px] leading-[1.5]">{t("start.del.intro")}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("start.del.citiesAria")}>
        {DELIVERY_CITY_PRESETS.map((preset) => {
          const on = preset.city in picked;
          return (
            <button
              key={preset.city}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setPicked((current) => {
                  const next = { ...current };
                  if (on) delete next[preset.city];
                  else next[preset.city] = preset.fee;
                  return next;
                })
              }
              className={cx("min-h-[40px] rounded-full border px-4 text-[13.5px] font-bold transition", on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
            >
              {preset.city}
            </button>
          );
        })}
      </div>
      <div className="mt-3 divide-y divide-app-line rounded-[16px] bg-white px-4">
        {Object.entries(picked).map(([city, fee]) => (
          <label key={city} className="flex items-center gap-3 py-3">
            <span className="flex-1 text-[14.5px] font-semibold">{city}</span>
            <span className="flex items-center gap-1 text-[14.5px] font-extrabold">
              ₦
              <input
                aria-label={t("start.del.feeFor", { city })}
                inputMode="numeric"
                value={formatNumber(fee, locale)}
                onChange={(event) => setPicked((current) => ({ ...current, [city]: feeValue(event.target.value) }))}
                className="w-[88px] rounded-[10px] border border-app-line bg-white px-2 py-1.5 text-right outline-none focus:border-app-ink"
              />
            </span>
          </label>
        ))}
        <div className="flex items-center gap-3 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold">{t.dynamic(`start.del.elsewhere`, ELSEWHERE_AREA)}</span>
            <span className="block text-[12.5px] text-app-ink-soft">{t("start.del.elsewhereHint")}</span>
          </span>
          {elsewhereOn && (
            <span className="flex items-center gap-1 text-[14.5px] font-extrabold">
              ₦
              <input
                aria-label={t("start.del.elsewhereFee")}
                inputMode="numeric"
                value={formatNumber(elsewhereFee, locale)}
                onChange={(event) => setElsewhereFee(feeValue(event.target.value))}
                className="w-[88px] rounded-[10px] border border-app-line bg-white px-2 py-1.5 text-right outline-none focus:border-app-ink"
              />
            </span>
          )}
          <Toggle label={t("start.del.elsewhereToggle")} on={elsewhereOn} onChange={setElsewhereOn} />
        </div>
      </div>
      {other.length > 0 && (
        <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">
          {t("start.del.others", { zones: other.map((zone) => zone.name).join(", ") })} <Link href="/home/shipping" className="font-bold text-app-ink">{t("start.del.shippingRates")}</Link>.
        </p>
      )}
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
      <PillButton
        className="mt-3"
        size="md"
        busy={pending}
        disabled={!Object.keys(picked).length && !elsewhereOn}
        onClick={() =>
          startTransition(async () => {
            const result = await saveDeliveryPicks(
              Object.entries(picked).map(([city, fee]) => ({ city, fee })),
              elsewhereOn ? elsewhereFee : null,
            );
            if (result.error) setError(result.error);
            else onDone(t("start.del.saved"));
          })
        }
      >
        {t("start.del.save")}
      </PillButton>
    </div>
  );
}

function LivePanel({
  live,
  launch,
  onDone,
  onError,
}: {
  live: boolean;
  launch: SetupOverview["launch"];
  onDone: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  const t = useT("home", "common");
  const naira = useNaira();
  const [busy, setBusy] = useState<"full" | "installment" | null>(null);
  const [blocker, setBlocker] = useState<string | null>(null);
  const inApp = useAppSession();
  const tPay = useT("payments");

  if (live) {
    return <p className="m-0 text-[14px] leading-[1.5]">{t("start.live.isLive")}</p>;
  }
  // Opened from the phone app: no price or payment (app store rules; see src/lib/app-session.ts).
  if (inApp) return <p className="m-0 text-[14px] leading-[1.5]">{tPay("app.launchBody")}</p>;

  async function pay(option: "full" | "installment") {
    setBusy(option);
    setBlocker(null);
    onError(null);
    try {
      const response = await fetch("/api/billing/store-launch/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option, returnTo: "/home/start" }),
      });
      const body = (await response.json().catch(() => null)) as { data?: { authorizationUrl?: string }; error?: { message?: string; blockers?: string[] } } | null;
      if (response.status === 409) {
        onDone(t("start.live.already"));
        return;
      }
      if (!response.ok || !body?.data?.authorizationUrl) {
        setBlocker(body?.error?.blockers?.[0] ?? body?.error?.message ?? t("start.live.cantOpen"));
        setBusy(null);
        return;
      }
      window.location.assign(body.data.authorizationUrl);
    } catch {
      setBlocker(t("start.live.cantReach"));
      setBusy(null);
    }
  }

  return (
    <div>
      <p className="m-0 text-[14px] leading-[1.5]">
        {t("start.live.costs", { total: naira(launch.totalNgn) })}
        {launch.depositNgn < launch.totalNgn ? t("start.live.orDeposit", { deposit: naira(launch.depositNgn) }) : ""}{t("start.live.howPay")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <PillButton size="md" tone="accent" busy={busy === "full"} disabled={busy !== null} onClick={() => void pay("full")}>{t("start.live.pay", { amount: naira(launch.totalNgn) })}</PillButton>
        {launch.depositNgn < launch.totalNgn && (
          <PillButton size="md" tone="white" busy={busy === "installment"} disabled={busy !== null} onClick={() => void pay("installment")}>
            {t("start.live.payNow", { amount: naira(launch.depositNgn) })}
          </PillButton>
        )}
        <Link href="/seller/store/builder" className="inline-flex min-h-[44px] items-center rounded-full px-4 text-[14px] font-bold text-app-ink-soft no-underline hover:text-app-ink">{t("start.live.checkDesign")}</Link>
      </div>
      {blocker && <div className="mt-3"><Notice>{blocker}</Notice></div>}
      <p className="mb-0 mt-3 text-[12.5px] text-app-ink-faint">{t("start.live.paystackNote")}</p>
    </div>
  );
}

function SharePanel({ name, url, onShared }: { name: string; url: string; onShared: (message: string) => void }) {
  const t = useT("home", "common");
  const host = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const whatsappText = t("start.share.whatsappText", { name, url: withChannelRef(url, "whatsapp") });

  async function copy(link: string, message: string) {
    try {
      await navigator.clipboard.writeText(link);
      onShared(message);
    } catch {
      onShared(link);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-[16px] bg-white p-3">
        <Icon name="link" size={16} className="shrink-0 text-app-ink-soft" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{host}</span>
        <PillButton size="sm" tone="white" onClick={() => void copy(url, t("start.share.copied"))}>{t("copy")}</PillButton>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
          target="_blank"
          rel="noreferrer"
          onClick={() => onShared(t("start.share.openingWa"))}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-[16px] bg-white px-3 text-[14px] font-bold text-app-ink no-underline hover:shadow-sm"
        >
          <Icon name="whatsapp" size={18} className="text-[#1F9E55]" /> {t("start.share.status")}
        </a>
        <button type="button" onClick={() => void copy(withChannelRef(url, "instagram"), t("start.share.igCopied"))} className="flex min-h-[48px] items-center justify-center gap-2 rounded-[16px] bg-white px-3 text-[14px] font-bold hover:shadow-sm">
          <Icon name="instagram" size={18} className="text-[#B0479A]" /> {t("start.share.igBio")}
        </button>
        <button type="button" onClick={() => void copy(withChannelRef(url, "facebook"), t("start.share.fbCopied"))} className="flex min-h-[48px] items-center justify-center gap-2 rounded-[16px] bg-white px-3 text-[14px] font-bold hover:shadow-sm">
          <Icon name="facebook" size={18} className="text-[#2D5BD0]" /> Facebook
        </button>
      </div>
    </div>
  );
}
