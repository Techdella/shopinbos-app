"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Pill } from "@/components/app-kit";
import { FieldLabel, Notice, PillButton, Segmented, TextInput } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { EntriConnect } from "./EntriConnect";
import { Fold } from "@/components/simple/Fold";
import { dayLabel } from "@/lib/conversations/pure";
import type { DnsRecord, DomainSettingsState, ServeAs, VerifyCheck } from "@/lib/domains/verification";
import { BoughtDomainPanel } from "./BoughtDomain";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate, type Locale } from "@shared/i18n";

type DomainT = ReturnType<typeof useT<["domain", "common"]>>;

// Connect a domain the seller already owns. The seller types it; we make a WhatsApp message with the setup
// steps for "the person who set it up" and keep checking. The records (TXT proof + routing) and the Verify button
// live behind "Show the technical details". Only a verified address is served (src/lib/domains/ownership.server.ts).

type ApiError = { error?: { code?: string; message?: string } };

class CallError extends Error {
  constructor(message: string, readonly code: string | undefined) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST" | "DELETE", url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as ({ data?: T } & ApiError) | null;
  if (!response.ok || !payload?.data) throw new CallError(payload?.error?.message ?? "", payload?.error?.code);
  return payload.data;
}

/** Server reasons in plain words (the server wording is for the technical fold and the API). */
function plainClaimError(error: unknown, t: DomainT) {
  if (!(error instanceof CallError)) return t("err.add");
  switch (error.code) {
    case "invalid_domain":
      return /platform|Shopinbos/i.test(error.message) ? t("err.platform") : t("err.invalid");
    case "domain_taken":
      return t("err.taken");
    case "rate_limited":
      return t("err.rateLimited");
    default:
      return error.message || t("err.reach");
  }
}

/** "today", "yesterday", or "on Fri 9 Oct". */
function connectedWhen(iso: string, t: DomainT, locale: Locale) {
  const label = dayLabel(iso);
  if (label === "Today") return t("time.today").toLowerCase();
  if (label === "Yesterday") return t("time.yesterday").toLowerCase();
  return locale === "en" ? `on ${label}` : t("when.on", { date: formatDate(iso, locale, { weekday: "short", day: "numeric", month: "short" }) });
}

function plainCheck(check: VerifyCheck, t: DomainT) {
  if (check.ok) return null;
  if (check.code === "mismatch") return t("check.mismatch");
  if (check.code === "timeout" || check.code === "dns_error") return t("check.later");
  return t("check.notYet");
}

export function DomainOwnership({
  initialState,
  onVerified,
  onChange,
}: {
  /** Server-rendered state; fetched from /api/domains/connect when absent. */
  initialState?: DomainSettingsState | null;
  /** Called with the served host once a domain is verified. */
  onVerified?: (domain: string) => void;
  /** Called after any change (claim, verify, remove), e.g. to refresh the page. */
  onChange?: (state: DomainSettingsState) => void;
}) {
  const t = useT("domain", "common");
  const locale = useLocale();
  const [state, setState] = useState<DomainSettingsState | null>(initialState ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [serveAs, setServeAs] = useState<ServeAs>("www");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [check, setCheck] = useState<VerifyCheck | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<"live" | "pending" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [changing, setChanging] = useState(false);
  const autoChecked = useRef(false);

  useEffect(() => {
    if (initialState) return;
    call<DomainSettingsState>("GET", "/api/domains/connect")
      .then(setState)
      .catch(() => setLoadError(t("err.load")));
  }, [initialState, t]);

  const apply = (next: DomainSettingsState) => {
    setState(next);
    onChange?.(next);
  };

  async function claim() {
    const domain = input.trim();
    if (!domain) {
      setClaimError(t("err.enterDomain"));
      return;
    }
    setClaiming(true);
    setClaimError(null);
    setCheck(null);
    setVerifyError(null);
    try {
      const next = await call<DomainSettingsState>("POST", "/api/domains/connect", { domain, serveAs });
      apply(next);
      setChanging(false);
      setInput("");
    } catch (error) {
      setClaimError(plainClaimError(error, t));
    } finally {
      setClaiming(false);
    }
  }

  async function verify(quiet = false) {
    setVerifying(true);
    if (!quiet) setVerifyError(null);
    try {
      const result = await call<{ state: DomainSettingsState; check: VerifyCheck }>("POST", "/api/domains/verify");
      if (!quiet || result.check.ok) setCheck(result.check);
      apply(result.state);
      if (result.check.ok && result.state.live) onVerified?.(result.state.live.domain);
    } catch (error) {
      if (!quiet) {
        setVerifyError(
          error instanceof CallError && error.code === "rate_limited"
            ? t("err.checkedLot")
            : t("err.checkNow"),
        );
      }
    } finally {
      setVerifying(false);
    }
  }

  // "I'll keep checking": one quiet check each time the page opens while a domain is waiting.
  const pendingDomain = state?.pending?.domain;
  useEffect(() => {
    if (!pendingDomain || autoChecked.current) return;
    autoChecked.current = true;
    void verify(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDomain]);

  async function remove(which: "live" | "pending") {
    setRemoving(which);
    setVerifyError(null);
    try {
      apply(await call<DomainSettingsState>("DELETE", "/api/domains/connect", { which }));
      setCheck(null);
      setConfirmRemove(false);
    } catch {
      setVerifyError(t("err.remove"));
    } finally {
      setRemoving(null);
    }
  }

  if (!state) {
    return loadError ? <Notice>{loadError}</Notice> : <Card className="p-4 text-[15px] text-app-ink-soft sm:p-5">{t("loading")}</Card>;
  }

  const { live, pending } = state;
  const showForm = !pending && (!live || changing);

  return (
    <div className="grid min-w-0 gap-4">
      {live && (
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-success-tint text-app-success"><Icon name="checkCircle" size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13px] text-app-ink-soft">{t("own.yours")}</p>
              <a href={`https://${live.domain}`} target="_blank" rel="noopener noreferrer" className="break-all text-[17px] font-extrabold text-app-ink no-underline hover:underline">
                {live.domain}
              </a>
            </div>
            <Pill tone="success" dot>{t("own.connected")}</Pill>
          </div>
          {live.verifiedAt && <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("own.connectedWhen", { when: connectedWhen(live.verifiedAt, t, locale) })}</p>}
          {!state.hostingConfigured && !check?.ok && (
            <p className="mb-0 mt-2 text-[14px] leading-[1.5] text-app-ink-soft">{t("own.finishing")}</p>
          )}
          {/* Bought through Shopinbos: paid-until date, "Renew for ₦X", "Move my domain to another company". */}
          <BoughtDomainPanel domain={live.domain} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!pending && !changing && (
              <PillButton size="sm" tone="white" onClick={() => setChanging(true)}>{t("own.different")}</PillButton>
            )}
            {confirmRemove ? (
              <>
                <span className="text-[14px] font-semibold text-app-danger">{t("own.stops", { domain: live.domain })}</span>
                <PillButton size="sm" tone="ink" busy={removing === "live"} onClick={() => void remove("live")}>{t("own.removeIt")}</PillButton>
                <PillButton size="sm" tone="ghost" onClick={() => setConfirmRemove(false)}>{t("own.keepIt")}</PillButton>
              </>
            ) : (
              <PillButton size="sm" tone="ghost" onClick={() => setConfirmRemove(true)}>{t("own.removeDomain")}</PillButton>
            )}
          </div>
          {verifyError && <div className="mt-3"><Notice>{verifyError}</Notice></div>}
        </Card>
      )}

      {pending && <PendingCard
        domain={pending.domain}
        live={live?.domain ?? null}
        verifying={verifying}
        check={check}
        verifyError={verifyError}
        removing={removing === "pending"}
        records={pending.records}
        onVerify={() => void verify()}
        onRemove={() => void remove("pending")}
      />}

      {showForm && (
        <Card className="min-w-0 p-4 sm:p-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void claim();
            }}
          >
            <FieldLabel htmlFor="own-domain">{live ? t("own.otherDomain") : t("own.whatsYours")}</FieldLabel>
            <TextInput
              id="own-domain"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="yourbrand.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="url"
            />
            <p className="mb-0 mt-2 text-[14px] leading-[1.5] text-app-ink-soft">{t("own.next")}</p>
            <Fold className="mt-3" summary={t("own.www")} hint={t("own.customersSee", { host: serveAs === "www" ? "www.yourbrand.com" : "yourbrand.com" })}>
              <Segmented
                className="w-full border border-app-line sm:w-fit"
                value={serveAs}
                onChange={setServeAs}
                options={[
                  { value: "www", label: t("own.withWww") },
                  { value: "apex", label: t("own.withoutWww") },
                ]}
              />
            </Fold>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <PillButton type="submit" size="lg" busy={claiming} className="w-full sm:w-auto">{t("continue")}</PillButton>
              {live && <PillButton size="md" tone="ghost" onClick={() => setChanging(false)}>{t("cancel")}</PillButton>}
            </div>
          </form>
          {claimError && <div className="mt-3"><Notice>{claimError}</Notice></div>}
        </Card>
      )}

      {check?.ok && !live && <Notice tone="success">{t("own.connectedSoon")}</Notice>}
    </div>
  );
}

function PendingCard({
  domain,
  live,
  verifying,
  check,
  verifyError,
  removing,
  records,
  onVerify,
  onRemove,
}: {
  domain: string;
  live: string | null;
  verifying: boolean;
  check: VerifyCheck | null;
  verifyError: string | null;
  removing: boolean;
  records: DnsRecord[];
  onVerify: () => void;
  onRemove: () => void;
}) {
  const t = useT("domain", "common");
  const plain = check ? plainCheck(check, t) : null;

  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#FDF0D5] text-[#8A5A00]">
          <Icon name="clock" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[13px] text-app-ink-soft">{live ? t("pend.moving") : t("pend.connecting")}</p>
          <h3 className="m-0 mt-0.5 break-all text-[20px] font-extrabold">{domain}</h3>
        </div>
        <Pill tone="warning" dot>{verifying ? t("pend.checking") : t("pend.waiting")}</Pill>
      </div>
      <p className="mb-0 mt-3 text-[16px] font-bold leading-[1.4]" role="status">{t("pend.title")}</p>
      <p className="mb-0 mt-1 text-[15px] leading-[1.5] text-app-ink-soft">
        {t("pend.sub")}
        {live ? ` ${t("pend.liveKeeps", { domain: live })}` : ` ${t("pend.freeKeeps")}`}
      </p>

      {/* One click: Entri logs in to where the domain was bought and adds our records there. */}
      <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:items-start">
        <EntriConnect
          domain={domain}
          records={records.map((record) => ({ type: record.type, host: record.label, value: record.value }))}
          label={t("pend.connect", { domain })}
          failedText={t("pend.connectFailed")}
          onDone={(success) => {
            if (success) onVerify();
          }}
        />
        <PillButton size="md" tone="white" busy={verifying} onClick={onVerify}>{t("pend.checkNow")}</PillButton>
      </div>

      {plain && <div className="mt-3"><Notice tone="info">{plain}</Notice></div>}
      {verifyError && <div className="mt-3"><Notice>{verifyError}</Notice></div>}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" onClick={onRemove} disabled={removing} className="min-h-[44px] text-[14.5px] font-bold text-app-ink-soft underline-offset-4 hover:underline">
          {live ? t("pend.keepCurrent") : t("own.different")}
        </button>
      </div>


    </Card>
  );
}
