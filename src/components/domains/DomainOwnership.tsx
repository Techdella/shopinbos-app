"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Pill } from "@/components/app-kit";
import { FieldLabel, Notice, PillButton, Segmented, TextInput } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { SetupHelpRequest } from "@/components/support/SetupHelpRequest";
import { Fold, TechFold } from "@/components/simple/Fold";
import { dayLabel } from "@/lib/conversations/pure";
import type { DnsRecord, DomainSettingsState, HostingStatus, ServeAs, VerifyCheck } from "@/lib/domains/verification";
import { RegistrarTip } from "./RegistrarTip";
import { BoughtDomainPanel } from "./BoughtDomain";
import { setupStepsMessage, whatsappShareUrl } from "./steps";
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
  const [askTeam, setAskTeam] = useState(false);
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
          <TechFold forWho={t("own.forWho")} className="mt-3">
            {check?.ok && check.hosting && <HostingNote hosting={check.hosting} />}
            <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">{t("own.routing", { domain: live.domain })}</p>
            <RecordList records={live.records} />
          </TechFold>
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
        records={pending.records}
        live={live?.domain ?? null}
        hostingConfigured={state.hostingConfigured}
        verifying={verifying}
        check={check}
        verifyError={verifyError}
        removing={removing === "pending"}
        askTeam={askTeam}
        onAskTeam={() => setAskTeam(true)}
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
  records,
  live,
  hostingConfigured,
  verifying,
  check,
  verifyError,
  removing,
  askTeam,
  onAskTeam,
  onVerify,
  onRemove,
}: {
  domain: string;
  records: DnsRecord[];
  live: string | null;
  hostingConfigured: boolean;
  verifying: boolean;
  check: VerifyCheck | null;
  verifyError: string | null;
  removing: boolean;
  askTeam: boolean;
  onAskTeam: () => void;
  onVerify: () => void;
  onRemove: () => void;
}) {
  const t = useT("domain", "common");
  const [copied, setCopied] = useState(false);
  const message = setupStepsMessage(domain, records);
  const plain = check ? plainCheck(check, t) : null;

  async function copySteps() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the steps are in the technical details as selectable text.
    }
  }

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

      <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        <a
          href={whatsappShareUrl(message)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-app-ink px-6 text-[15px] font-extrabold text-white no-underline hover:bg-black"
        >
          <Icon name="chat" size={18} /> {t("pend.sendWa")}
        </a>
        <PillButton size="md" tone="white" onClick={() => void copySteps()}>
          <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? t("copied") : t("pend.copy")}
        </PillButton>
      </div>

      {plain && <div className="mt-3"><Notice tone="info">{plain}</Notice></div>}
      {verifyError && <div className="mt-3"><Notice>{verifyError}</Notice></div>}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        {!askTeam && (
          <button type="button" onClick={onAskTeam} className="min-h-[44px] text-[14.5px] font-bold text-app-ink underline underline-offset-4">
            {t("pend.noOne")}
          </button>
        )}
        <button type="button" onClick={onRemove} disabled={removing} className="min-h-[44px] text-[14.5px] font-bold text-app-ink-soft underline-offset-4 hover:underline">
          {live ? t("pend.keepCurrent") : t("own.different")}
        </button>
      </div>

      {askTeam && (
        <SetupHelpRequest
          className="mt-3"
          title={t("pend.teamTitle", { domain })}
          description={t("pend.teamDesc")}
          feature="custom_domain"
          softwareQuestion={t("pend.whereBought")}
          softwarePlaceholder={t("pend.wherePlaceholder")}
        />
      )}

      <TechFold forWho={t("own.forWho")} className="mt-4">
        <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">
          {t("pend.dnsIntro", { domain })}
        </p>
        <RecordList records={records} />
        {check && !check.ok && (
          <div className="mt-3">
            <Notice tone="info">
              {check.message}
              {check.found && check.found.length > 0 && <span className="mt-1 block break-all font-mono text-[12.5px]">{t("pend.found", { values: check.found.join(" · ") })}</span>}
            </Notice>
          </div>
        )}
        {!hostingConfigured && (
          <p className="mb-0 mt-3 text-[13px] leading-[1.5] text-app-ink-soft">{t("pend.hosting")}</p>
        )}
        <div className="mt-3">
          <PillButton size="md" busy={verifying} onClick={onVerify}>{t("verify")}</PillButton>
        </div>
        <div className="mt-4 border-t border-app-line pt-4">
          <RegistrarTip />
        </div>
      </TechFold>
    </Card>
  );
}

function HostingNote({ hosting }: { hosting: HostingStatus }) {
  return (
    <div className="mb-3 grid gap-2">
      <Notice tone={hosting.status === "failed" ? "error" : hosting.status === "added" ? "success" : "info"}>{hosting.message}</Notice>
      {hosting.records.length > 0 && (
        <RecordList
          records={hosting.records.map((record) => ({
            purpose: "route" as const,
            type: record.type as DnsRecord["type"],
            name: record.domain,
            label: record.domain,
            value: record.value,
            required: true,
            note: record.reason,
          }))}
        />
      )}
    </div>
  );
}

function RecordList({ records }: { records: DnsRecord[] }) {
  return (
    <ul className="m-0 mt-3 grid list-none gap-2 p-0">
      {records.map((record) => (
        <RecordRow key={`${record.type}-${record.name}-${record.value}`} record={record} />
      ))}
    </ul>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT("domain", "common");
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the value is selectable text.
    }
  }
  return (
    <button type="button" onClick={() => void copy()} aria-label={t("copyLabel", { label })} className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-full border border-app-line bg-white px-2.5 text-[12px] font-bold">
      <Icon name={copied ? "check" : "copy"} size={12} /> {copied ? t("copied") : t("copy")}
    </button>
  );
}

function RecordRow({ record }: { record: DnsRecord }) {
  const t = useT("domain", "common");
  return (
    <li className="min-w-0 rounded-[16px] bg-app-canvas px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-bold">{record.type}</span>
        <Pill tone={record.required ? "ink" : "muted"}>{record.purpose === "verify" ? t("rec.proves") : record.required ? t("rec.required") : t("rec.optional")}</Pill>
      </div>
      <dl className="m-0 grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13.5px]">
        <dt className="text-app-ink-soft">{t("rec.nameLabel")}</dt>
        <dd className="m-0 flex min-w-0 items-start gap-2">
          <span className="min-w-0 flex-1 break-all font-mono">
            {record.label}
            {record.label !== record.name && <span className="block text-[12px] text-app-ink-soft">{t("rec.fullName", { name: record.name })}</span>}
          </span>
          <CopyButton value={record.label} label={t("rec.name", { type: record.type })} />
        </dd>
        <dt className="text-app-ink-soft">{t("rec.valueLabel")}</dt>
        <dd className="m-0 flex min-w-0 items-start gap-2">
          <span className="min-w-0 flex-1 break-all font-mono">{record.value}</span>
          <CopyButton value={record.value} label={t("rec.value", { type: record.type })} />
        </dd>
      </dl>
      {record.note && <p className="mb-0 mt-2 text-[12.5px] leading-[1.45] text-app-ink-soft">{record.note}</p>}
    </li>
  );
}

