"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, Segmented, cx } from "@/components/app-ui";
import { naira } from "@shared/onboarding";
import { markDelivered, markFailed, markStage, resendPayLink, setRiderOnline, startRun, type RiderActionResult } from "./actions";
import { PAY_AT_DOOR_WAIT_MINUTES } from "@shared/pay-at-door";
import { useT } from "@/components/i18n/I18nProvider";
import { RiderChatBox } from "@/components/logistics/RiderChatBox";

export interface RiderDrop {
  id: string;
  status: string;
  /** Logistics marketplace: the parcel goes to a pickup point, where the customer collects it. */
  toPickupPoint?: boolean;
  address: string;
  area: string;
  buyerName: string | null;
  /** E.164, e.g. +2348034127790. */
  buyerPhone: string | null;
  /** Cash to collect: only older jobs. Pay on delivery (payInApp) is paid as the shop agreed, or in the app. */
  collect: number;
  /** Pay on delivery: paid at the door as the shop agreed (cash or transfer), or in the app; `url` is their order page (the QR code). */
  payInApp?: { amount: number; paid: boolean; url: string } | null;
  item: string;
}

export interface RiderRun {
  key: string;
  pickupName: string;
  pickupAddress: string;
  /** Supplier pickups: "Pick up 12–4pm today". */
  pickupWindow?: string | null;
  /** The rider's earnings for the run's drops once their pay is set (paySet), else the delivery fees. */
  fees: number;
  drops: RiderDrop[];
}

// Sent in English (the partner and the seller read it); shown in the rider's language (rider fail.<n>).
const FAIL_REASONS = ["Buyer didn't answer", "Buyer not at the address", "Buyer refused the parcel", "Wrong or incomplete address", "Buyer couldn't pay"];

export interface RiderWeek {
  total: number;
  count: number;
  /** Deliveries per Lagos day, Monday to Sunday; `today` is today's index. */
  bars: number[];
  today: number;
  groups: { group: "today" | "yesterday" | "earlier"; items: { id: string; from: string; to: string; time: string; amount: number }[] }[];
}

type Tab = "today" | "earnings" | "me";

const TABS: { id: Tab; icon: "home" | "coin" | "user" }[] = [
  { id: "today", icon: "home" },
  { id: "earnings", icon: "coin" },
  { id: "me", icon: "user" },
];

const mapUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "R";
}

// The Riders app on the web, laid out like the phone app (Today / Earnings / Me, a bottom tab bar on phones and tabs
// in the header on wide screens) and like the big ride-hailing driver apps: a map with today's earnings on a pill
// and the online switch on a card over it, then the jobs.
export function RiderApp({
  token,
  rider,
  earnedToday,
  paySet,
  dropsDone,
  cashInHand,
  runs,
  week,
}: {
  token: string;
  rider: { name: string; partnerName: string; partnerPhone: string | null; plate: string | null; online: boolean };
  earnedToday: number;
  /** The partner set this rider's pay, so the amounts are the rider's earnings rather than delivery fees. */
  paySet: boolean;
  dropsDone: number;
  cashInHand: number;
  runs: RiderRun[];
  week: RiderWeek;
}) {
  const router = useRouter();
  const t = useT("rider");
  const [tab, setTab] = useState<Tab>("today");
  const [online, setOnline] = useState(rider.online);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  // Keep the list fresh (new jobs from dispatch) and "last seen" current while the app is open.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [router]);

  function toggleOnline() {
    const next = !online;
    setOnline(next);
    setError(null);
    startTransition(async () => {
      const result = await setRiderOnline(token, next);
      if (!result.ok) {
        setOnline(!next);
        setError(result.error);
      }
    });
  }

  function choose(next: Tab) {
    setTab(next);
    window.scrollTo({ top: 0 });
  }

  const drops = runs.reduce((sum, run) => sum + run.drops.length, 0);
  const earnedLabel = t(paySet ? "app.earnedToday" : "app.feesToday");

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))] sm:px-6 lg:pb-12">
      <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-app-canvas/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-mint text-[15px] font-extrabold text-app-forest">{initials(rider.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[12.5px] font-semibold text-app-ink-soft">Shopinbos Riders · {rider.partnerName}</p>
          <h1 className="m-0 truncate text-[18px] font-extrabold tracking-[-0.01em]">{rider.name}</h1>
        </div>
        <nav aria-label="Riders" className="hidden rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(22,20,31,0.06)] lg:flex">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => choose(item.id)}
              className={cx("inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-[14px] font-bold transition", tab === item.id ? "bg-app-ink text-white" : "text-app-ink-soft hover:text-app-ink")}
            >
              <Icon name={item.icon} size={16} />
              {t(`tab.${item.id}`)}
            </button>
          ))}
        </nav>
        <span className={cx("inline-flex min-h-[34px] shrink-0 items-center gap-2 rounded-full px-3 text-[13px] font-bold", online ? "bg-app-success-tint text-app-success" : "bg-white text-app-ink-soft")}>
          <span aria-hidden className="relative flex h-2.5 w-2.5">
            {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-app-success opacity-60" />}
            <span className={cx("relative inline-flex h-2.5 w-2.5 rounded-full", online ? "bg-app-success" : "bg-app-ink-faint")} />
          </span>
          {online ? t("app.online") : t("app.offline")}
        </span>
      </header>

      {error && <div className="mt-2"><Notice>{error}</Notice></div>}

      {tab === "today" && (
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:sticky lg:top-[76px]">
            <MapHero online={online} pending={pending} onToggle={toggleOnline} earned={earnedToday} earnedLabel={earnedLabel} partnerName={rider.partnerName} />

            <section aria-label={t("app.today")} className="grid grid-cols-3 gap-2.5">
              <Stat label={earnedLabel} value={naira(earnedToday)} />
              <Stat label={t("app.dropsToday")} value={String(dropsDone)} />
              <Stat
                label={t("app.cashInHand")}
                value={naira(cashInHand)}
                sub={cashInHand > 0 ? t("app.handInTo", { name: rider.partnerName }) : t("app.nothingToHandIn")}
                tone={cashInHand > 0 ? "warn" : "plain"}
              />
            </section>

            <button
              type="button"
              onClick={() => choose("earnings")}
              className="flex items-center gap-4 rounded-[22px] bg-white p-4 text-left transition hover:shadow-[0_6px_20px_rgba(22,20,31,0.06)]"
            >
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13px] font-semibold text-app-ink-soft">{t("earn.week")}</p>
                <p className="m-0 mt-0.5 font-app-display text-[24px] font-extrabold leading-none tracking-[-0.02em]">{naira(week.total)}</p>
                <p className="m-0 mt-1.5 truncate text-[12.5px] text-app-ink-soft">{t("earn.line", { count: week.count, company: rider.partnerName })}</p>
              </div>
              <WeekBars bars={week.bars} today={week.today} height={56} compact />
              <Icon name="chevRight" size={18} className="shrink-0 text-app-ink-faint" />
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 flex items-center gap-2 text-[19px] font-extrabold">
                {runs.length > 1 ? t("app.yourRuns") : t("app.nextRun")}
                {drops > 0 && <span className="rounded-full bg-app-ink px-2.5 py-0.5 text-[12.5px] font-bold text-white">{drops}</span>}
              </h2>
              <button
                type="button"
                onClick={() => startRefresh(() => router.refresh())}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white px-3.5 text-[13.5px] font-bold text-app-ink-soft hover:text-app-ink"
              >
                <Icon name="refresh" size={15} className={refreshing ? "animate-spin" : undefined} />
                {t("app.refresh")}
              </button>
            </div>

            {runs.length === 0 ? (
              <div className="mt-3 grid justify-items-center rounded-[24px] bg-white px-5 py-10 text-center">
                <span aria-hidden className="relative grid h-20 w-20 place-items-center">
                  {online && <span className="absolute inset-0 animate-ping rounded-full bg-app-mint" />}
                  <span className={cx("relative grid h-16 w-16 place-items-center rounded-full", online ? "bg-app-mint text-app-forest" : "bg-app-canvas text-app-ink-faint")}>
                    <Icon name="truck" size={28} />
                  </span>
                </span>
                <p className="m-0 mt-4 text-[17px] font-extrabold">{online ? t("app.waiting") : t("app.noJobs")}</p>
                <p className="m-0 mt-1.5 max-w-[340px] text-[14.5px] leading-[1.5] text-app-ink-soft">
                  {online ? t("app.whenJob", { name: rider.partnerName }) : t("app.goOnline")}
                </p>
              </div>
            ) : (
              <div className="mt-3 grid gap-4">
                {runs.map((run) => <RunCard key={run.key} token={token} run={run} paySet={paySet} onError={setError} />)}
              </div>
            )}

            {drops > 0 && (
              <p className="m-0 mt-4 flex items-start justify-center gap-2 text-center text-[13px] text-app-ink-soft">
                <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
                {t("app.askCode")}
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "earnings" && <EarningsTab week={week} partnerName={rider.partnerName} />}

      {tab === "me" && <MeTab token={token} rider={rider} online={online} />}

      <nav
        aria-label="Riders"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-app-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-[560px] grid-cols-3">
          {TABS.map((item) => {
            const on = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => choose(item.id)}
                className="grid min-h-[64px] justify-items-center content-center gap-1 text-[12px] font-bold"
              >
                <span className={cx("grid h-8 w-14 place-items-center rounded-full transition", on ? "bg-app-mint text-app-forest" : "text-app-ink-soft")}>
                  <Icon name={item.icon} size={20} />
                </span>
                <span className={on ? "text-app-ink" : "text-app-ink-soft"}>{t(`tab.${item.id}`)}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** A drawn street map (not a real one: the web app never reads the rider's location) with the earnings pill and the online card. */
function MapHero({
  online,
  pending,
  onToggle,
  earned,
  earnedLabel,
  partnerName,
}: {
  online: boolean;
  pending: boolean;
  onToggle: () => void;
  earned: number;
  earnedLabel: string;
  partnerName: string;
}) {
  const t = useT("rider");
  return (
    <section className="relative h-[300px] overflow-hidden rounded-[26px] bg-[#E9EEE8] sm:h-[340px]">
      <svg aria-hidden viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={cx("absolute inset-0 h-full w-full transition duration-500", !online && "grayscale-[0.6]")}>
        <rect width="400" height="300" fill="#E9EEE8" />
        <path d="M-10 230 C 60 210, 90 260, 160 250 S 260 280, 410 240 L 410 310 L -10 310 Z" fill="#D3E6EF" />
        <path d="M250 20 h90 a14 14 0 0 1 14 14 v50 a14 14 0 0 1 -14 14 h-90 a14 14 0 0 1 -14 -14 v-50 a14 14 0 0 1 14 -14 Z" fill="#D2EAD8" />
        <g fill="#DFE5DD">
          <rect x="20" y="20" width="70" height="52" rx="8" />
          <rect x="110" y="20" width="96" height="52" rx="8" />
          <rect x="20" y="96" width="70" height="70" rx="8" />
          <rect x="110" y="96" width="44" height="70" rx="8" />
          <rect x="240" y="120" width="60" height="60" rx="8" />
          <rect x="322" y="120" width="70" height="60" rx="8" />
        </g>
        <g stroke="#FFFFFF" strokeLinecap="round" fill="none">
          <path d="M-10 84 L 410 84" strokeWidth="12" />
          <path d="M222 -10 L 222 230" strokeWidth="12" />
          <path d="M-10 190 C 120 180, 200 196, 410 196" strokeWidth="14" />
          <path d="M100 -10 L 100 200" strokeWidth="6" opacity="0.85" />
          <path d="M310 100 L 310 200" strokeWidth="6" opacity="0.85" />
          <path d="M160 84 L 190 190" strokeWidth="6" opacity="0.85" />
        </g>
        <path d="M-10 190 C 120 180, 200 196, 410 196" stroke="#F4E3A1" strokeWidth="3" fill="none" opacity="0.8" />
      </svg>

      {/* The rider: a pulsing dot while online. */}
      <span aria-hidden className="absolute left-1/2 top-[42%] grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center">
        {online && <span className="absolute inset-0 animate-ping rounded-full bg-app-forest/25" />}
        <span className={cx("absolute inset-0 rounded-full", online ? "bg-app-forest/15" : "bg-app-ink/10")} />
        <span className={cx("relative grid h-9 w-9 place-items-center rounded-full border-[3px] border-white shadow-[0_4px_12px_rgba(12,74,68,0.35)]", online ? "bg-app-forest text-white" : "bg-app-ink-faint text-white")}>
          <Icon name="truck" size={16} />
        </span>
      </span>

      {/* Today's money on a pill at the top, like the driver apps. */}
      <div className="absolute inset-x-0 top-3 flex justify-center">
        <div className="rounded-full bg-app-ink px-5 py-2 text-center text-white shadow-[0_8px_24px_rgba(22,20,31,0.25)]">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">{earnedLabel}</p>
          <p className="m-0 font-app-display text-[22px] font-extrabold leading-tight tracking-[-0.01em]">{naira(earned)}</p>
        </div>
      </div>

      <div className="absolute inset-x-3 bottom-3 rounded-[20px] bg-white p-3.5 shadow-[0_10px_30px_rgba(22,20,31,0.12)]">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[16px] font-extrabold">{online ? t("app.online") : t("app.offline")}</p>
            <p className="m-0 mt-0.5 truncate text-[13px] text-app-ink-soft">{online ? t("app.onlineSub", { name: partnerName }) : t("app.offlineSub")}</p>
          </div>
          {online && (
            <button
              type="button"
              role="switch"
              aria-checked
              onClick={onToggle}
              disabled={pending}
              className="min-h-[44px] shrink-0 rounded-full border border-app-line-strong bg-white px-4 text-[14px] font-bold text-app-ink transition hover:bg-app-canvas disabled:opacity-70"
            >
              {t("app.goOfflineNow")}
            </button>
          )}
        </div>
        {!online && (
          <button
            type="button"
            role="switch"
            aria-checked={false}
            onClick={onToggle}
            disabled={pending}
            className="mt-3 inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-app-forest text-[16px] font-extrabold text-white shadow-[0_6px_18px_rgba(12,74,68,0.3)] transition hover:brightness-110 disabled:opacity-70"
          >
            <Icon name="bolt" size={18} />
            {t("app.goOnlineNow")}
          </button>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, sub, tone = "plain" }: { label: string; value: string; sub?: string; tone?: "plain" | "warn" }) {
  return (
    <div className={cx("min-w-0 rounded-[20px] p-3.5", tone === "warn" ? "bg-app-peach" : "bg-white")}>
      <p className="m-0 text-[12px] font-semibold leading-tight text-app-ink-soft">{label}</p>
      <p className={cx("m-0 mt-1 truncate font-app-display text-[20px] font-extrabold leading-tight tracking-[-0.01em]", tone === "warn" && "text-app-accent-ink")}>{value}</p>
      {sub && <p className="m-0 mt-0.5 text-[11.5px] leading-tight text-app-ink-soft">{sub}</p>}
    </div>
  );
}

/** "Deliveries by day": Monday to Sunday, today's bar dark (the phone app's Earnings chart). */
function WeekBars({ bars, today, height, compact = false }: { bars: number[]; today: number; height: number; compact?: boolean }) {
  const t = useT("rider");
  const most = Math.max(1, ...bars);
  return (
    <div
      role="img"
      aria-label={`${t("earn.byDay")}. ${bars.map((count, index) => `${t(`wk.${index}` as "wk.0")} ${count}`).join(", ")}`}
      className={cx("flex items-end", compact ? "w-[112px] shrink-0 gap-1" : "gap-2 sm:gap-3")}
      style={{ height }}
    >
      {bars.map((count, index) => (
        <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          {!compact && count > 0 && <span className="text-[11.5px] font-bold text-app-ink-soft">{count}</span>}
          <span
            className={cx("w-full rounded-[6px]", index === today ? "bg-app-forest" : index > today ? "bg-app-line" : "bg-[#D6F0E9]")}
            style={{ height: `${Math.round(Math.max(0.08, count / most) * (compact ? 100 : 72))}%` }}
          />
          {!compact && <span className={cx("text-[11.5px] font-semibold", index === today ? "text-app-ink" : "text-app-ink-soft")}>{t(`wk.${index}` as "wk.0")}</span>}
        </div>
      ))}
    </div>
  );
}

function EarningsTab({ week, partnerName }: { week: RiderWeek; partnerName: string }) {
  const t = useT("rider");
  return (
    <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <section className="relative overflow-hidden rounded-[26px] bg-app-forest p-5 text-white sm:p-6">
          <span aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/[0.06]" />
          <span aria-hidden className="absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/[0.04]" />
          <p className="relative m-0 text-[13.5px] font-semibold text-[#BFE6DD]">{t("earn.week")}</p>
          <p className="relative m-0 mt-1.5 font-app-display text-[40px] font-extrabold leading-none tracking-[-0.025em]">{naira(week.total)}</p>
          <p className="relative m-0 mt-2.5 text-[13.5px] text-[#BFE6DD]">{t("earn.line", { count: week.count, company: partnerName })}</p>
        </section>
        <section className="rounded-[24px] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-[15px] font-extrabold">{t("earn.byDay")}</h2>
            <span className="text-[13px] text-app-ink-soft">{t("earn.todayCount", { count: week.bars[week.today] ?? 0 })}</span>
          </div>
          <div className="mt-4">
            <WeekBars bars={week.bars} today={week.today} height={150} />
          </div>
        </section>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        {week.groups.length === 0 ? (
          <div className="rounded-[24px] bg-white px-5 py-10 text-center">
            <span aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-app-canvas text-app-ink-faint"><Icon name="coin" size={24} /></span>
            <p className="m-0 mt-3 text-[15px] text-app-ink-soft">{t("earn.none")}</p>
          </div>
        ) : (
          week.groups.map((group) => (
            <section key={group.group}>
              <h3 className="m-0 mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-app-ink-soft">{t(`day.${group.group}`)}</h3>
              <ul className="m-0 list-none divide-y divide-app-line-soft overflow-hidden rounded-[22px] bg-white p-0">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3.5">
                    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-success-tint text-app-success"><Icon name="check" size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[15px] font-bold">{item.from} → {item.to}</p>
                      <p className="m-0 mt-0.5 font-mono text-[12.5px] text-app-ink-soft">{item.time}</p>
                    </div>
                    <span className="shrink-0 text-[15.5px] font-extrabold">{naira(item.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function MeTab({ token, rider, online }: { token: string; rider: { name: string; partnerName: string; partnerPhone: string | null; plate: string | null }; online: boolean }) {
  const t = useT("rider");
  const [chat, setChat] = useState(false);
  const wa = rider.partnerPhone?.replace(/\D/g, "");
  const row = "flex min-h-[64px] items-center gap-3 px-4 py-3";
  return (
    <div className="mx-auto mt-2 grid w-full max-w-[640px] grid-cols-[minmax(0,1fr)] gap-4">
      <section className="grid justify-items-center rounded-[26px] bg-white px-5 py-7 text-center">
        <span aria-hidden className="relative grid h-20 w-20 place-items-center rounded-full bg-app-mint font-app-display text-[26px] font-extrabold text-app-forest">
          {initials(rider.name)}
          <span className={cx("absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-white", online ? "bg-app-success" : "bg-app-ink-faint")} />
        </span>
        <h2 className="m-0 mt-3 text-[22px] font-extrabold tracking-[-0.01em]">{rider.name}</h2>
        <p className="m-0 mt-0.5 text-[14px] text-app-ink-soft">{t("me.riderFor", { company: rider.partnerName })}</p>
      </section>

      <ul className="m-0 list-none divide-y divide-app-line-soft overflow-hidden rounded-[22px] bg-white p-0">
        <li className={row}>
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-app-canvas"><Icon name="truck" size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[15px] font-bold">{t("me.bike")}</p>
            <p className={cx("m-0 mt-0.5 text-[13.5px]", rider.plate ? "font-mono text-app-ink" : "text-app-ink-soft")}>{rider.plate || t("me.noPlate", { company: rider.partnerName })}</p>
          </div>
        </li>
        {rider.partnerPhone && (
          <>
            <li>
              <a href={`tel:${rider.partnerPhone}`} className={cx(row, "text-app-ink no-underline hover:bg-app-canvas")}>
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-app-canvas"><Icon name="phone" size={18} /></span>
                <span className="min-w-0 flex-1 text-[15px] font-bold">{t("me.call", { name: rider.partnerName })}</span>
                <Icon name="chevRight" size={18} className="text-app-ink-faint" />
              </a>
            </li>
            <li>
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={cx(row, "text-app-ink no-underline hover:bg-app-canvas")}>
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-app-success-tint text-app-success"><Icon name="whatsapp" size={18} /></span>
                <span className="min-w-0 flex-1 text-[15px] font-bold">{t("me.whatsapp", { name: rider.partnerName })}</span>
                <Icon name="chevRight" size={18} className="text-app-ink-faint" />
              </a>
            </li>
          </>
        )}
      </ul>

      {/* Chat with the company in the app (shared/rider-chat.ts); they answer from their app or the web. */}
      <section className="grid gap-3 rounded-[22px] bg-white p-4">
        <button type="button" onClick={() => setChat(!chat)} aria-expanded={chat} className="flex min-h-[44px] items-center gap-3 text-left">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-app-mint text-app-forest"><Icon name="chat" size={18} /></span>
          <span className="min-w-0 flex-1 text-[15px] font-bold">{t("chat.messageCompany", { company: rider.partnerName })}</span>
          <Icon name="chevRight" size={18} className={cx("text-app-ink-faint transition", chat && "rotate-90")} />
        </button>
        {chat ? (
          <RiderChatBox url="/api/mobile/logistics/rider/messages" token={token} extra={{ with: "company" }} labels={{ placeholder: t("chat.placeholder"), send: t("chat.send"), empty: t("chat.empty"), failed: t("chat.failed") }} />
        ) : null}
      </section>

      <p className="m-0 flex items-start justify-center gap-2 px-2 text-center text-[13px] text-app-ink-soft">
        <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
        {t("me.linkNote")}
      </p>
    </div>
  );
}

function RunCard({ token, run, paySet, onError }: { token: string; run: RiderRun; paySet: boolean; onError: (error: string | null) => void }) {
  const router = useRouter();
  const t = useT("rider");
  const [pending, startTransition] = useTransition();
  const toPickUp = run.drops.filter((drop) => drop.status === "confirmed").map((drop) => drop.id);
  const cashCount = run.drops.filter((drop) => drop.collect > 0).length;
  const appCount = run.drops.filter((drop) => drop.payInApp && !drop.payInApp.paid).length;

  function accept() {
    onError(null);
    startTransition(async () => {
      const result = await startRun(token, toPickUp);
      if (!result.ok) onError(result.error);
      router.refresh();
    });
  }

  return (
    <article className="overflow-hidden rounded-[24px] bg-white">
      <div className="flex items-center justify-between gap-3 bg-app-ink px-4 py-3 text-white sm:px-5">
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[12.5px] font-bold">{t("run.drops", { count: run.drops.length })}</span>
          {cashCount > 0 && (
            <span className="rounded-full bg-[#FFB38F]/20 px-2.5 py-1 text-[12.5px] font-bold text-[#FFB38F]">
              {t("run.cashCollections", { count: cashCount })}
            </span>
          )}
          {appCount > 0 && (
            <span className="rounded-full bg-app-teal-mid/20 px-2.5 py-1 text-[12.5px] font-bold text-app-teal-mid">
              {t("run.payInApp", { count: appCount })}
            </span>
          )}
        </div>
        <p className="m-0 shrink-0 font-app-display text-[17px] font-extrabold tracking-[-0.01em]">{t(paySet ? "run.youEarn" : "run.fees", { amount: naira(run.fees) })}</p>
      </div>

      <div className="p-4 sm:p-5">
        {/* The route: the pickup (orange), then each drop (numbered), on one line like a trip. */}
        <div className="relative flex items-start gap-3">
          <span aria-hidden className="absolute bottom-[-18px] left-[23px] top-12 border-l-2 border-dashed border-app-line-strong" />
          <span aria-hidden className="relative grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-app-peach text-app-accent-ink"><Icon name="store" size={22} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[17px] font-extrabold leading-tight">{t("run.pickUp", { name: run.pickupName })}</h3>
            <p className="m-0 mt-0.5 break-words text-[14px] text-app-ink-soft">{run.pickupAddress}</p>
            {run.pickupWindow && <p className="m-0 mt-1 inline-flex items-center gap-1.5 text-[14px] font-extrabold text-app-accent-ink"><Icon name="clock" size={14} />{run.pickupWindow}</p>}
          </div>
          <DirectionsLink address={run.pickupAddress} />
        </div>

        {toPickUp.length > 0 && (
          <div className="relative mt-4 pl-[60px]">
            <PillButton tone="accent" size="lg" className="w-full" busy={pending} onClick={accept}>
              {t("run.accept")}
            </PillButton>
            <p className="m-0 mt-2 text-center text-[13px] text-app-ink-soft">{t("run.acceptHint")}</p>
          </div>
        )}

        <ol className="m-0 mt-5 grid list-none gap-4 p-0">
          {run.drops.map((drop, index) => <DropRow key={drop.id} token={token} drop={drop} index={index} last={index === run.drops.length - 1} />)}
        </ol>
      </div>
    </article>
  );
}

function DirectionsLink({ address }: { address: string }) {
  const t = useT("rider");
  return (
    <a
      href={mapUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${t("run.openMap")}: ${address}`}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-blue-tint text-app-blue"
    >
      <Icon name="pin" size={18} />
    </a>
  );
}

function DropRow({ token, drop, index, last }: { token: string; drop: RiderDrop; index: number; last: boolean }) {
  const router = useRouter();
  const t = useT("rider");
  const [mode, setMode] = useState<"idle" | "deliver" | "fail">("idle");
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState(drop.collect > 0 ? String(drop.collect) : "");
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [reason, setReason] = useState(FAIL_REASONS[0]);
  const [other, setOther] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const onTheRoad = drop.status === "picked_up" || drop.status === "in_transit" || drop.status === "out_for_delivery";
  const canGoOut = !drop.toPickupPoint && (drop.status === "picked_up" || drop.status === "in_transit");
  const waNumber = drop.buyerPhone?.replace(/\D/g, "");
  const [chat, setChat] = useState(false);

  function run(action: () => Promise<RiderActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode("idle");
      router.refresh();
    });
  }

  function submitDelivered(event: React.FormEvent) {
    event.preventDefault();
    run(() => markDelivered(token, {
      jobId: drop.id,
      code,
      codCollected: drop.collect > 0 ? Number(amount.replace(/,/g, "")) : null,
      codMethod: drop.collect > 0 ? method : null,
    }));
  }

  function submitFailed(event: React.FormEvent) {
    event.preventDefault();
    const text = reason === "Other" ? other.trim() : reason;
    if (!text) {
      setError(t("drop.sayWhat"));
      return;
    }
    run(() => markFailed(token, { jobId: drop.id, reason: text }));
  }

  const fieldClass = "h-12 w-full min-w-0 rounded-[14px] border border-app-line bg-white px-3.5 text-[17px] text-app-ink outline-none focus:border-app-ink";

  return (
    <li className="relative flex gap-3">
      {!last && <span aria-hidden className="absolute bottom-[-18px] left-[23px] top-10 border-l-2 border-dashed border-app-line-strong" />}
      <span aria-hidden className="relative grid w-12 shrink-0 justify-items-center pt-1">
        <span className={cx("grid h-8 w-8 place-items-center rounded-full text-[13px] font-extrabold", onTheRoad ? "bg-app-forest text-white" : "bg-app-canvas text-app-ink")}>{index + 1}</span>
      </span>
      <div className="min-w-0 flex-1 rounded-[18px] border border-app-line p-3.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2.5">
        <div className="min-w-[180px] flex-1">
          <p className="m-0 break-words text-[15.5px] font-bold leading-snug">{drop.address}</p>
          <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">
            {[drop.buyerName, drop.item].filter(Boolean).join(" · ")}
          </p>
          {/* The customer's number, to call ahead or check the address. */}
          {drop.buyerPhone ? <p className="m-0 mt-0.5 font-mono text-[13.5px] text-app-ink">{drop.buyerPhone}</p> : null}
          {drop.collect > 0 && (
            <p className="m-0 mt-1.5 inline-block rounded-full bg-app-peach px-3 py-1 text-[13px] font-extrabold text-app-accent-ink">{t("drop.collect", { amount: naira(drop.collect) })}</p>
          )}
          {drop.payInApp && (
            drop.payInApp.paid ? (
              <p className="m-0 mt-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-app-success-tint px-3 py-1 text-[13px] font-extrabold text-app-success"><Icon name="check" size={14} />{t("pay.paid")}</p>
            ) : (
              <p className="m-0 mt-1.5 inline-block rounded-[12px] bg-app-mint px-3 py-1 text-[13px] font-extrabold leading-snug text-app-forest">{t("pay.pill", { amount: naira(drop.payInApp.amount) })}</p>
            )
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {drop.buyerPhone && (
            <>
              <a href={`tel:${drop.buyerPhone}`} aria-label={t("drop.call", { name: drop.buyerName ?? t("drop.theBuyer") })} className="grid h-11 w-11 place-items-center rounded-full bg-app-canvas text-app-ink">
                <Icon name="phone" size={18} />
              </a>
              <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" aria-label={t("drop.whatsapp", { name: drop.buyerName ?? t("drop.theBuyer") })} className="grid h-11 w-11 place-items-center rounded-full bg-app-canvas text-app-success">
                <Icon name="whatsapp" size={18} />
              </a>
            </>
          )}
          {onTheRoad && <DirectionsLink address={drop.address} />}
        </div>
      </div>

      {mode === "idle" ? (
        <div className="mt-2">
          <button type="button" onClick={() => setChat(!chat)} aria-expanded={chat} className="inline-flex min-h-[40px] items-center gap-1.5 text-[14px] font-bold text-app-accent-ink">
            <Icon name="chat" size={16} />
            {t("chat.messageShop")}
          </button>
          {chat ? (
            <RiderChatBox url="/api/mobile/logistics/rider/messages" token={token} extra={{ with: "shop", job: drop.id }} labels={{ placeholder: t("chat.placeholder"), send: t("chat.send"), empty: t("chat.empty"), failed: t("chat.failed") }} />
          ) : null}
        </div>
      ) : null}

      {onTheRoad && mode === "idle" && drop.payInApp && !drop.payInApp.paid && !drop.toPickupPoint && <PayAtDoorBox token={token} drop={drop} pay={drop.payInApp} />}

      {!onTheRoad ? (
        <p className="m-0 mt-2.5 text-[13px] text-app-ink-soft">{t("drop.acceptFirst")}</p>
      ) : mode === "idle" ? (
        <div className="mt-3 grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
          {canGoOut && (
            <PillButton tone="white" size="md" className="min-[480px]:col-span-2" busy={pending} onClick={() => run(() => markStage(token, { jobId: drop.id, to: "out_for_delivery" }))}>
              {t.dynamic("drop.outForDelivery", "On my way to the customer")}
            </PillButton>
          )}
          <PillButton tone="white" size="md" onClick={() => { setError(null); setMode("fail"); }}>{t("drop.couldnt")}</PillButton>
          {drop.toPickupPoint ? (
            <PillButton tone="ink" size="md" busy={pending} onClick={() => run(() => markStage(token, { jobId: drop.id, to: "at_pickup_point" }))}>{t.dynamic("drop.atPickupPoint", "Left at pickup point")}</PillButton>
          ) : (
            <PillButton tone="ink" size="md" onClick={() => { setError(null); setMode("deliver"); }}>{t("drop.delivered")}</PillButton>
          )}
        </div>
      ) : mode === "deliver" ? (
        <form onSubmit={submitDelivered} className="mt-3 grid gap-3">
          <div>
            <label htmlFor={`code-${drop.id}`} className="mb-1.5 block text-[14px] font-bold">{drop.payInApp ? t("pay.codeLabel") : t("drop.code")}</label>
            <input
              id={`code-${drop.id}`}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              pattern="\d{4}"
              required
              placeholder={t("drop.codePlaceholder")}
              className={cx(fieldClass, "text-center font-mono text-[24px] tracking-[0.4em]")}
            />
          </div>
          {drop.collect > 0 && (
            <>
              <div>
                <label htmlFor={`amount-${drop.id}`} className="mb-1.5 block text-[14px] font-bold">{t("drop.amount")}</label>
                <input id={`amount-${drop.id}`} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" required className={fieldClass} />
              </div>
              <div>
                <p className="m-0 mb-1.5 text-[14px] font-bold" id={`method-${drop.id}`}>{t("drop.howPaid")}</p>
                <div aria-labelledby={`method-${drop.id}`}>
                  <Segmented options={[{ value: "cash", label: t("drop.cash") }, { value: "transfer", label: t("drop.transfer") }]} value={method} onChange={setMethod} />
                </div>
                {method === "transfer" && <p className="m-0 mt-1.5 text-[13px] text-app-ink-soft">{t("drop.transferNote")}</p>}
              </div>
            </>
          )}
          {error && <Notice>{error}</Notice>}
          <div className="grid grid-cols-2 gap-2">
            <PillButton tone="white" size="md" onClick={() => setMode("idle")}>{t("drop.back")}</PillButton>
            <PillButton type="submit" tone="accent" size="md" busy={pending} disabled={code.length !== 4}>{t("drop.confirm")}</PillButton>
          </div>
        </form>
      ) : (
        <form onSubmit={submitFailed} className="mt-3 grid gap-3">
          <div>
            <label htmlFor={`reason-${drop.id}`} className="mb-1.5 block text-[14px] font-bold">{t("drop.whatHappened")}</label>
            <select id={`reason-${drop.id}`} value={reason} onChange={(event) => setReason(event.target.value)} className={fieldClass}>
              {[...FAIL_REASONS, "Other"].map((item, index) => <option key={item} value={item}>{index < FAIL_REASONS.length ? t.dynamic(`fail.${index}`, item) : t("fail.other")}</option>)}
            </select>
          </div>
          {reason === "Other" && (
            <div>
              <label htmlFor={`other-${drop.id}`} className="mb-1.5 block text-[14px] font-bold">{t("drop.tellDispatcher")}</label>
              <input id={`other-${drop.id}`} value={other} onChange={(event) => setOther(event.target.value)} maxLength={300} required className={fieldClass} />
            </div>
          )}
          {error && <Notice>{error}</Notice>}
          <div className="grid grid-cols-2 gap-2">
            <PillButton tone="white" size="md" onClick={() => setMode("idle")}>{t("drop.back")}</PillButton>
            <PillButton type="submit" tone="ink" size="md" busy={pending}>{t("drop.report")}</PillButton>
          </div>
        </form>
      )}
      {mode === "idle" && error && <div className="mt-2"><Notice>{error}</Notice></div>}
      </div>
    </li>
  );
}

/**
 * Pay on delivery at the door (shared/pay-at-door.ts): the customer checks the parcel, then pays in the app with the
 * link we texted them or by scanning this QR code (their order page). Once the money is in they get the code; no code,
 * no drop. The rider never takes cash.
 */
function PayAtDoorBox({ token, drop, pay }: { token: string; drop: RiderDrop; pay: { amount: number; url: string } }) {
  const router = useRouter();
  const t = useT("rider");
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [checking, startCheck] = useTransition();

  useEffect(() => {
    if (!showQr || qr) return;
    let live = true;
    void import("qrcode").then((QRCode) => QRCode.toDataURL(pay.url, { margin: 1, width: 480 })).then((data) => { if (live) setQr(data); }).catch(() => null);
    return () => { live = false; };
  }, [showQr, qr, pay.url]);

  function resend() {
    setNote(null);
    startTransition(async () => {
      const result = await resendPayLink(token, drop.id);
      setNote(result.ok ? { ok: true, text: t("pay.resent") } : { ok: false, text: result.error });
    });
  }

  return (
    <div className="mt-3 rounded-[16px] bg-app-mint p-3.5">
      <p className="m-0 flex items-center gap-2 text-[14.5px] font-extrabold text-app-forest"><Icon name="lock" size={15} />{t("pay.title", { amount: naira(pay.amount) })}</p>
      <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-app-ink">{t("pay.body")}</p>
      {showQr && (
        <div className="mt-3 grid justify-items-center rounded-[14px] bg-white p-3">
          {qr ? <img src={qr} alt={t("pay.qrAlt")} width={240} height={240} className="h-60 w-60" /> : <span className="grid h-60 w-60 place-items-center text-[13px] text-app-ink-soft">…</span>}
          <p className="m-0 mt-2 text-center text-[12.5px] text-app-ink-soft">{t("pay.qrHint")}</p>
        </div>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
        <PillButton tone="white" size="md" onClick={() => setShowQr((open) => !open)}>{showQr ? t("pay.hideQr") : t("pay.showQr")}</PillButton>
        <PillButton tone="white" size="md" busy={pending} onClick={resend}>{t("pay.resend")}</PillButton>
        <PillButton tone="ink" size="md" className="min-[480px]:col-span-2" busy={checking} onClick={() => startCheck(() => router.refresh())}>{t("pay.check")}</PillButton>
      </div>
      {note && <p role={note.ok ? "status" : "alert"} className={cx("m-0 mt-2 text-[13px] font-bold", note.ok ? "text-app-success" : "text-app-danger")}>{note.text}</p>}
      <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">{t("pay.wait", { minutes: PAY_AT_DOOR_WAIT_MINUTES })}</p>
    </div>
  );
}
