"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { SetupHelpRequest } from "@/components/support/SetupHelpRequest";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate } from "@shared/i18n";
import { naira } from "@shared/onboarding";

// Domains bought through Shopinbos (src/lib/domains/billing.server.ts), on /home/domain:
// - DomainPurchaseBanner: after Paystack sends the seller back (?domain=bought|renewed|processing|failed), shows
//   progress and the result, and keeps checking while the domain is being bought.
// - BoughtDomainPanel: inside the connected-domain card, when this domain was bought through us: until when it is
//   paid, "Renew for ₦X", and "Move my domain to another company" (the transfer code, or the 60-day lock date).

interface PurchaseRow {
  id: string;
  domain: string;
  kind: "new" | "renewal";
  status: string;
  amountNgn: number;
  coveredByPlan: boolean;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  card: { last4: string | null; brand: string | null; reusable: boolean } | null;
}

const IN_PROGRESS = new Set(["paid", "buying"]);
const DAY_MS = 24 * 60 * 60 * 1000;

async function loadPurchaseState(): Promise<{ rows: PurchaseRow[]; freeDomain: boolean }> {
  const response = await fetch("/api/domains/purchase", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as { data?: PurchaseRow[]; meta?: { freeDomain?: boolean } } | null;
  if (!response.ok || !payload?.data) throw new Error("load failed");
  return { rows: payload.data, freeDomain: payload.meta?.freeDomain === true };
}

async function loadPurchases(): Promise<PurchaseRow[]> {
  return (await loadPurchaseState()).rows;
}

function bareDomain(host: string) {
  return host.toLowerCase().replace(/^www\./, "");
}

export function DomainPurchaseBanner({ result }: { result: string | null }) {
  const t = useT("domain");
  const locale = useLocale();
  const router = useRouter();
  const [latest, setLatest] = useState<PurchaseRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refreshed = useRef(false);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let tries = 0;
    async function tick() {
      try {
        const rows = await loadPurchases();
        if (stopped) return;
        const row = rows[0] ?? null;
        setLatest(row);
        setLoaded(true);
        if (row && IN_PROGRESS.has(row.status) && tries++ < 90) {
          timer = window.setTimeout(tick, 4000);
        } else if (row?.status === "bought" && !refreshed.current) {
          refreshed.current = true;
          router.refresh(); // the connected-domain card picks the new domain up
        }
      } catch {
        if (!stopped) setLoaded(true);
      }
    }
    void tick();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [router]);

  if (!loaded) {
    return result ? <Notice tone="info">{t("bought.checking")}</Notice> : null;
  }
  // Without ?domain= only an unfinished purchase is worth a banner.
  if (!result && !(latest && IN_PROGRESS.has(latest.status))) return null;

  if (!latest || latest.status === "pending_payment" || latest.status === "payment_failed") {
    return result ? <Notice>{t("bought.notPaid")}</Notice> : null;
  }
  const price = naira(latest.amountNgn);
  const domain = latest.domain;

  if (IN_PROGRESS.has(latest.status)) {
    return (
      <div className="flex items-start gap-3 rounded-[18px] bg-app-mint px-4 py-4 text-app-forest" role="status">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white"><Icon name="clock" size={18} /></span>
        <div className="min-w-0">
          <p className="m-0 text-[16px] font-extrabold">{latest.kind === "renewal" ? t("bought.renewing", { domain }) : t("bought.processingTitle")}</p>
          <p className="mb-0 mt-1 text-[14px] leading-[1.5]">{t("bought.processingBody", { domain })}</p>
        </div>
      </div>
    );
  }

  if (latest.status === "bought") {
    const until = latest.expiresAt ? formatDate(latest.expiresAt, locale, { day: "numeric", month: "long", year: "numeric" }) : "";
    return (
      <div className="grid gap-2 rounded-[18px] bg-app-success-tint px-4 py-4 text-app-ink" role="status">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-app-success"><Icon name="checkCircle" size={18} /></span>
          <div className="min-w-0">
            <p className="m-0 break-all text-[17px] font-extrabold">{latest.kind === "renewal" ? t("bought.renewedTitle", { domain }) : t("bought.doneTitle", { domain })}</p>
            <p className="mb-0 mt-1 text-[14px] leading-[1.5]">
              {latest.kind === "renewal" ? t("bought.renewedBody", { date: until }) : t("bought.doneBody")}
            </p>
          </div>
        </div>
        {latest.kind === "new" && <p className="m-0 rounded-[14px] bg-white px-3.5 py-3 text-[14px] font-semibold leading-[1.5]"><Icon name="mail" size={14} className="mr-1.5 inline align-[-2px]" />{t("bought.email")}</p>}
      </div>
    );
  }

  if (latest.coveredByPlan && (latest.status === "failed" || latest.status === "refund_failed")) {
    return <Notice>{t("free.failed", { domain })}</Notice>;
  }
  if (latest.status === "refunded") return <Notice tone="info">{t("bought.refunded", { domain, price })}</Notice>;
  if (latest.status === "refund_failed" || latest.status === "failed") return <Notice>{t("bought.refundFailed", { domain, price })}</Notice>;
  return null;
}

type MoveState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "code"; code: string }
  | { kind: "locked"; availableAt: string | null }
  | { kind: "failed" };

export function BoughtDomainPanel({ domain }: { domain: string }) {
  const t = useT("domain");
  const locale = useLocale();
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  // The seller's annual plan pays for the domain now: it renews free (the cron checks the plan again, and that it
  // is paid past the domain's expiry, before renewing).
  const [planCovers, setPlanCovers] = useState(false);
  const [renewPrice, setRenewPrice] = useState<number | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [move, setMove] = useState<MoveState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadPurchaseState()
      .then((state) => {
        setRows(state.rows);
        setPlanCovers(state.freeDomain);
      })
      .catch(() => setRows([]));
  }, []);

  const key = bareDomain(domain);
  const bought = (rows ?? []).filter((row) => row.status === "bought" && bareDomain(row.domain) === key);
  const current = bought.reduce<PurchaseRow | null>((best, row) => (!best || (row.expiresAt ?? "") > (best.expiresAt ?? "") ? row : best), null);
  const first = bought.find((row) => row.kind === "new") ?? null;
  const daysLeft = current?.expiresAt ? Math.ceil((new Date(current.expiresAt).getTime() - Date.now()) / DAY_MS) : null;
  const renewDue = daysLeft !== null && daysLeft <= 45;
  const renewingNow = (rows ?? []).some((row) => row.kind === "renewal" && IN_PROGRESS.has(row.status) && bareDomain(row.domain) === key);

  useEffect(() => {
    if (!current || !renewDue || planCovers) return;
    fetch(`/api/domains/renew?domain=${encodeURIComponent(current.domain)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { data?: { amountNgn?: number } }) => setRenewPrice(payload?.data?.amountNgn ?? null))
      .catch(() => setRenewPrice(null));
  }, [current, renewDue, planCovers]);

  if (!current) return null;

  const until = current.expiresAt ? formatDate(current.expiresAt, locale, { day: "numeric", month: "long", year: "numeric" }) : null;
  const recent = first?.paidAt ? Date.now() - new Date(first.paidAt).getTime() < 15 * DAY_MS : false;
  const card = bought.find((row) => row.card?.reusable)?.card ?? null;

  async function renew() {
    setRenewing(true);
    setRenewError(null);
    try {
      const response = await fetch("/api/domains/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: current!.domain }),
      });
      const payload = (await response.json().catch(() => null)) as { data?: { authorizationUrl?: string }; error?: { message?: string } } | null;
      if (!response.ok || !payload?.data?.authorizationUrl) throw new Error(payload?.error?.message ?? t("mine.renewFailed"));
      window.location.assign(payload.data.authorizationUrl);
    } catch (error) {
      setRenewError(error instanceof Error && error.message ? error.message : t("mine.renewFailed"));
      setRenewing(false);
    }
  }

  async function getCode() {
    setMove({ kind: "loading" });
    try {
      const response = await fetch("/api/domains/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: current!.domain }),
      });
      const payload = (await response.json().catch(() => null)) as { data?: { locked: boolean; availableAt: string | null; authCode: string | null } } | null;
      if (!response.ok || !payload?.data) throw new Error("failed");
      if (payload.data.locked) setMove({ kind: "locked", availableAt: payload.data.availableAt });
      else if (payload.data.authCode) setMove({ kind: "code", code: payload.data.authCode });
      else setMove({ kind: "failed" });
    } catch {
      setMove({ kind: "failed" });
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the code is selectable text.
    }
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-app-line pt-4">
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <Icon name="calendar" size={16} className="text-app-ink-soft" />
        <span>{until ? t("mine.paidUntil", { date: until }) : t("mine.boughtHere")}</span>
      </div>
      {recent && <p className="m-0 text-[14px] leading-[1.5] text-app-ink-soft">{t("bought.email")}</p>}

      {renewingNow ? (
        <Notice tone="info">{t("bought.renewing", { domain: current.domain })}</Notice>
      ) : planCovers ? (
        <p className="m-0 flex items-center gap-2 text-[14px] font-semibold text-app-success"><Icon name="checkCircle" size={16} />{t("free.renewsCard")}</p>
      ) : renewDue ? (
        <div className="grid gap-2">
          <p className="m-0 text-[14px] font-semibold">{daysLeft !== null && daysLeft > 0 ? t("mine.endsIn", { count: daysLeft }) : t("mine.ended")}</p>
          <PillButton size="md" tone="accent" busy={renewing} onClick={() => void renew()} className="w-full sm:w-auto sm:justify-self-start">
            {renewPrice ? t("mine.renewFor", { price: naira(renewPrice) }) : t("mine.renewNow")}
          </PillButton>
          {card?.last4 && <p className="m-0 text-[13px] text-app-ink-soft">{t("mine.card", { last4: card.last4 })}</p>}
          {renewError && <Notice>{renewError}</Notice>}
        </div>
      ) : (
        <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">{t("mine.remind")}</p>
      )}

      {move.kind === "idle" || move.kind === "loading" ? (
        <PillButton size="sm" tone="white" busy={move.kind === "loading"} onClick={() => void getCode()} className="justify-self-start">
          {t("move.button")}
        </PillButton>
      ) : (
        <section className="grid gap-3 rounded-[18px] bg-app-canvas p-4" aria-labelledby="move-domain-title">
          <h3 id="move-domain-title" className="m-0 text-[16px] font-extrabold">{t("move.button")}</h3>
          {move.kind === "code" && (
            <>
              <ol className="m-0 grid list-decimal gap-1.5 pl-5 text-[14px] leading-[1.5]">
                <li>{t("move.step1")}</li>
                <li>{t("move.step2", { domain: current.domain })}</li>
                <li>{t("move.step3")}</li>
              </ol>
              <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-[14px] bg-white px-3.5 py-3">
                <span className="text-[13px] text-app-ink-soft">{t("move.code")}</span>
                <span className="min-w-0 flex-1 break-all font-mono text-[15px] font-bold">{move.code}</span>
                <button type="button" onClick={() => void copy(move.code)} className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full border border-app-line bg-white px-3 text-[13px] font-bold">
                  <Icon name={copied ? "check" : "copy"} size={13} /> {copied ? t("setup.copied") : t("setup.copy")}
                </button>
              </div>
              <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">{t("move.after")}</p>
            </>
          )}
          {move.kind === "locked" && (
            <p className="m-0 text-[14px] leading-[1.5]">
              {move.availableAt
                ? t("move.locked", { domain: current.domain, date: formatDate(move.availableAt, locale, { day: "numeric", month: "long", year: "numeric" }) })
                : t("move.lockedNoDate")}
            </p>
          )}
          {move.kind === "failed" && (
            <SetupHelpRequest
              title={t("move.helpTitle")}
              description={t("move.helpDesc")}
              feature="domain_transfer_out"
              softwareQuestion={t("move.which")}
              softwarePlaceholder={current.domain}
            />
          )}
        </section>
      )}
    </div>
  );
}
