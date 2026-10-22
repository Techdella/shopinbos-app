"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, Segmented, cx } from "@/components/app-ui";
import { naira } from "@shared/onboarding";
import { markDelivered, markFailed, markStage, setRiderOnline, startRun, type RiderActionResult } from "./actions";
import { useT } from "@/components/i18n/I18nProvider";

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
  collect: number;
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

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "R";
}

export function RiderApp({
  token,
  rider,
  earnedToday,
  paySet,
  dropsDone,
  cashInHand,
  runs,
}: {
  token: string;
  rider: { name: string; partnerName: string; online: boolean };
  earnedToday: number;
  /** The partner set this rider's pay, so the amounts are the rider's earnings rather than delivery fees. */
  paySet: boolean;
  dropsDone: number;
  cashInHand: number;
  runs: RiderRun[];
}) {
  const router = useRouter();
  const t = useT("rider");
  const [online, setOnline] = useState(rider.online);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const drops = runs.reduce((sum, run) => sum + run.drops.length, 0);

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 py-2">
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[16px] font-extrabold">{initials(rider.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[13.5px] text-app-ink-soft">Shopinbos Riders · {rider.partnerName}</p>
          <h1 className="m-0 truncate text-[20px] font-extrabold tracking-[-0.01em]">{rider.name}</h1>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={online}
          onClick={toggleOnline}
          disabled={pending}
          className={cx(
            "inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-full px-5 text-[15px] font-extrabold transition disabled:opacity-70",
            online ? "bg-app-success text-white" : "border border-app-line-strong bg-white text-app-ink",
          )}
        >
          <span aria-hidden className={cx("h-2.5 w-2.5 rounded-full", online ? "bg-white" : "bg-app-ink-faint")} />
          {online ? t("app.online") : t("app.offline")}
        </button>
      </header>

      {error && <div className="mt-2"><Notice>{error}</Notice></div>}

      <section aria-label={t("app.today")} className="mt-3 grid grid-cols-[1fr_auto] gap-3 rounded-[22px] bg-app-ink p-4 text-white sm:p-5">
        <div className="min-w-0">
          <p className="m-0 text-[13.5px] text-white/70">{t(paySet ? "app.earnedToday" : "app.feesToday")}</p>
          <p className="m-0 mt-1 text-[32px] font-extrabold leading-none tracking-[-0.02em]">{naira(earnedToday)}</p>
          <p className="m-0 mt-2 text-[13.5px] text-white/70">{t("app.dropsDone", { count: dropsDone })}</p>
        </div>
        <div className="min-w-[132px] rounded-[16px] bg-white/10 p-3.5">
          <p className="m-0 text-[13px] text-white/70">{t("app.cashInHand")}</p>
          <p className={cx("m-0 mt-1 text-[22px] font-extrabold leading-none", cashInHand > 0 ? "text-[#FFB38F]" : "text-white")}>{naira(cashInHand)}</p>
          <p className="m-0 mt-1.5 text-[12.5px] text-white/70">{cashInHand > 0 ? t("app.handInTo", { name: rider.partnerName }) : t("app.nothingToHandIn")}</p>
        </div>
      </section>

      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[19px] font-extrabold">{runs.length > 1 ? t("app.yourRuns") : t("app.nextRun")}</h2>
        <button type="button" onClick={() => router.refresh()} className="min-h-[40px] rounded-full px-3 text-[14px] font-bold text-app-ink-soft hover:text-app-ink">
          {t("app.refresh")}
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="mt-3 rounded-[22px] bg-white px-5 py-10 text-center">
          <p className="m-0 text-[17px] font-extrabold">{t("app.noJobs")}</p>
          <p className="m-0 mt-1.5 text-[15px] leading-[1.5] text-app-ink-soft">
            {online ? t("app.whenJob", { name: rider.partnerName }) : t("app.goOnline")}
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-4">
          {runs.map((run) => <RunCard key={run.key} token={token} run={run} paySet={paySet} onError={setError} />)}
        </div>
      )}

      {drops > 0 && (
        <p className="m-0 mt-5 text-center text-[13px] text-app-ink-soft">
          {t("app.askCode")}
        </p>
      )}
    </div>
  );
}

function RunCard({ token, run, paySet, onError }: { token: string; run: RiderRun; paySet: boolean; onError: (error: string | null) => void }) {
  const router = useRouter();
  const t = useT("rider");
  const [pending, startTransition] = useTransition();
  const toPickUp = run.drops.filter((drop) => drop.status === "confirmed").map((drop) => drop.id);
  const cashCount = run.drops.filter((drop) => drop.collect > 0).length;

  function accept() {
    onError(null);
    startTransition(async () => {
      const result = await startRun(token, toPickUp);
      if (!result.ok) onError(result.error);
      router.refresh();
    });
  }

  return (
    <article className="rounded-[22px] bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-app-peach text-app-accent-ink"><Icon name="store" size={22} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[17px] font-extrabold leading-tight">{t("run.pickUp", { name: run.pickupName })}</h3>
          <p className="m-0 mt-0.5 break-words text-[14px] text-app-ink-soft">{run.pickupAddress}</p>
          {run.pickupWindow && <p className="m-0 mt-0.5 text-[14.5px] font-extrabold text-app-accent-ink">{run.pickupWindow}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-app-canvas px-3 py-1.5 text-[13px] font-bold">{t("run.drops", { count: run.drops.length })}</span>
        {cashCount > 0 && (
          <span className="rounded-full bg-app-peach px-3 py-1.5 text-[13px] font-bold text-app-accent-ink">
            {t("run.cashCollections", { count: cashCount })}
          </span>
        )}
      </div>
      <p className="m-0 mt-3 text-[22px] font-extrabold tracking-[-0.01em]">{t(paySet ? "run.youEarn" : "run.fees", { amount: naira(run.fees) })}</p>

      {toPickUp.length > 0 && (
        <div className="mt-3">
          <PillButton tone="accent" size="lg" className="w-full" busy={pending} onClick={accept}>
            {t("run.accept")}
          </PillButton>
          <p className="m-0 mt-2 text-center text-[13px] text-app-ink-soft">{t("run.acceptHint")}</p>
        </div>
      )}

      <ol className="m-0 mt-4 grid list-none gap-3 p-0">
        {run.drops.map((drop, index) => <DropRow key={drop.id} token={token} drop={drop} index={index} />)}
      </ol>
    </article>
  );
}

function DropRow({ token, drop, index }: { token: string; drop: RiderDrop; index: number }) {
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
    <li className="rounded-[18px] border border-app-line p-3.5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-app-ink text-[13px] font-extrabold text-white">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="m-0 break-words text-[15.5px] font-bold leading-snug">{drop.address}</p>
          <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">
            {[drop.buyerName, drop.item].filter(Boolean).join(" · ")}
          </p>
          {drop.collect > 0 && (
            <p className="m-0 mt-1.5 inline-block rounded-full bg-app-peach px-3 py-1 text-[13px] font-extrabold text-app-accent-ink">{t("drop.collect", { amount: naira(drop.collect) })}</p>
          )}
        </div>
        {drop.buyerPhone && (
          <div className="flex shrink-0 gap-1.5">
            <a href={`tel:${drop.buyerPhone}`} aria-label={t("drop.call", { name: drop.buyerName ?? t("drop.theBuyer") })} className="grid h-11 w-11 place-items-center rounded-full bg-app-canvas text-app-ink">
              <Icon name="phone" size={18} />
            </a>
            <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" aria-label={t("drop.whatsapp", { name: drop.buyerName ?? t("drop.theBuyer") })} className="grid h-11 w-11 place-items-center rounded-full bg-app-canvas text-app-success">
              <Icon name="whatsapp" size={18} />
            </a>
          </div>
        )}
      </div>

      {!onTheRoad ? (
        <p className="m-0 mt-2.5 text-[13px] text-app-ink-soft">{t("drop.acceptFirst")}</p>
      ) : mode === "idle" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {canGoOut && (
            <PillButton tone="white" size="md" className="col-span-2" busy={pending} onClick={() => run(() => markStage(token, { jobId: drop.id, to: "out_for_delivery" }))}>
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
            <label htmlFor={`code-${drop.id}`} className="mb-1.5 block text-[14px] font-bold">{t("drop.code")}</label>
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
    </li>
  );
}
