"use client";

import { useEffect, useState } from "react";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { FieldLabel, Notice, PillButton, Segmented, TextInput, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import type { DnsRecord, DomainSettingsState, HostingStatus, ServeAs, VerifyCheck } from "@/lib/domains/verification";

// Connect a domain the seller owns: they claim it, add a TXT record that proves ownership plus the record that
// points it at us, then Verify. Only a verified domain is served (see src/lib/domains/ownership.server.ts).

type ApiError = { error?: { code?: string; message?: string } };

async function call<T>(method: "GET" | "POST" | "DELETE", url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as ({ data?: T } & ApiError) | null;
  if (!response.ok || !payload?.data) throw new Error(payload?.error?.message ?? "Something went wrong. Try again.");
  return payload.data;
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

  useEffect(() => {
    if (initialState) return;
    call<DomainSettingsState>("GET", "/api/domains/connect")
      .then(setState)
      .catch((error: Error) => setLoadError(error.message));
  }, [initialState]);

  const apply = (next: DomainSettingsState) => {
    setState(next);
    onChange?.(next);
  };

  async function claim() {
    const domain = input.trim();
    if (!domain) {
      setClaimError("Enter the domain you own, like yourbrand.com.");
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
      setClaimError(error instanceof Error ? error.message : "We couldn't add that domain.");
    } finally {
      setClaiming(false);
    }
  }

  async function verify() {
    setVerifying(true);
    setVerifyError(null);
    setCheck(null);
    try {
      const result = await call<{ state: DomainSettingsState; check: VerifyCheck }>("POST", "/api/domains/verify");
      setCheck(result.check);
      apply(result.state);
      if (result.check.ok && result.state.live) onVerified?.(result.state.live.domain);
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : "We couldn't check your domain.");
    } finally {
      setVerifying(false);
    }
  }

  async function remove(which: "live" | "pending") {
    setRemoving(which);
    setVerifyError(null);
    try {
      apply(await call<DomainSettingsState>("DELETE", "/api/domains/connect", { which }));
      setCheck(null);
      setConfirmRemove(false);
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : "We couldn't remove that domain.");
    } finally {
      setRemoving(null);
    }
  }

  if (!state) {
    return loadError ? <Notice>{loadError}</Notice> : <Card className="p-4 text-[14px] text-app-ink-soft sm:p-5">Loading your domain…</Card>;
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
              <p className="m-0 text-[13px] text-app-ink-soft">Your own domain</p>
              <a href={`https://${live.domain}`} target="_blank" rel="noopener noreferrer" className="break-all text-[16px] font-extrabold text-app-ink no-underline hover:underline">
                {live.domain}
              </a>
            </div>
            <Pill tone="success" dot>Verified</Pill>
          </div>
          {live.verifiedAt && (
            <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">Ownership verified {new Date(live.verifiedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}.</p>
          )}
          {check?.ok && check.hosting && <HostingNote hosting={check.hosting} />}
          {!state.hostingConfigured && !check?.ok && (
            <p className="mb-0 mt-2 text-[13px] leading-[1.5] text-app-ink-soft">Automatic hosting setup isn&apos;t switched on for this server; Shopinbos support adds verified domains to hosting.</p>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-[13.5px] font-bold text-app-ink">Routing records</summary>
            <RecordList records={live.records} />
          </details>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!pending && !changing && (
              <PillButton size="sm" tone="white" onClick={() => setChanging(true)}>Use a different domain</PillButton>
            )}
            {confirmRemove ? (
              <>
                <span className="text-[13px] font-semibold text-app-danger">Your store stops opening on {live.domain}.</span>
                <PillButton size="sm" tone="ink" busy={removing === "live"} onClick={() => void remove("live")}>Remove it</PillButton>
                <PillButton size="sm" tone="ghost" onClick={() => setConfirmRemove(false)}>Keep it</PillButton>
              </>
            ) : (
              <PillButton size="sm" tone="ghost" onClick={() => setConfirmRemove(true)}>Remove domain</PillButton>
            )}
          </div>
        </Card>
      )}

      {pending && (
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-start gap-3">
            <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-full", check && !check.ok ? "bg-app-danger-tint text-app-danger" : "bg-[#FDF0D5] text-[#8A5A00]")}>
              <Icon name={check && !check.ok ? "warn" : "clock"} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13px] text-app-ink-soft">{live ? "Switching to" : "Connecting"}</p>
              <h3 className="m-0 mt-0.5 break-all text-[20px] font-extrabold">{pending.domain}</h3>
            </div>
            {verifying ? <Pill tone="info" dot>Checking DNS…</Pill> : check && !check.ok ? <Pill tone="danger" dot>Not verified yet</Pill> : <Pill tone="warning" dot>Waiting for DNS</Pill>}
          </div>
          <p className="mb-0 mt-3 text-[14px] leading-[1.5] text-app-ink-soft">
            Add these records at the company you bought the domain from, then press Verify. Your store isn&apos;t served on this domain until it&apos;s verified{live ? `; ${live.domain} keeps working meanwhile` : ""}.
          </p>
          <RecordList records={pending.records} />

          {check && !check.ok && (
            <div className="mt-3">
              <Notice>
                {check.message}
                {check.found && check.found.length > 0 && (
                  <span className="mt-1 block break-all font-mono text-[12.5px]">Found: {check.found.join(" · ")}</span>
                )}
              </Notice>
            </div>
          )}
          {verifyError && <div className="mt-3"><Notice>{verifyError}</Notice></div>}
          {!state.hostingConfigured && (
            <p className="mb-0 mt-3 text-[13px] leading-[1.5] text-app-ink-soft">After verifying, Shopinbos support adds the domain to hosting (automatic setup isn&apos;t switched on for this server).</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <PillButton size="md" busy={verifying} onClick={() => void verify()}>Verify</PillButton>
            <PillButton size="md" tone="ghost" busy={removing === "pending"} onClick={() => void remove("pending")}>
              {live ? "Keep the current domain" : "Use a different domain"}
            </PillButton>
          </div>
        </Card>
      )}

      {showForm && (
        <Card className="min-w-0 p-4 sm:p-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void claim();
            }}
          >
            <CardHead title={live ? "Connect a different domain" : "Connect a domain you own"} sub="You'll prove you own it with a DNS record before it goes live." />
            <div className="mt-4">
              <FieldLabel htmlFor="own-domain">Your domain</FieldLabel>
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
            </div>
            <p className="mb-1.5 mt-4 text-[13px] font-bold text-app-ink-soft">Address buyers see: {serveAs === "www" ? "www.yourbrand.com" : "yourbrand.com"}</p>
            <Segmented
              className="w-full border border-app-line sm:w-fit"
              value={serveAs}
              onChange={setServeAs}
              options={[
                { value: "www", label: "With www." },
                { value: "apex", label: "Without www." },
              ]}
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <PillButton type="submit" size="md" busy={claiming}>Continue</PillButton>
              {live && <PillButton size="md" tone="ghost" onClick={() => setChanging(false)}>Cancel</PillButton>}
            </div>
          </form>
          {claimError && <div className="mt-3"><Notice>{claimError}</Notice></div>}
        </Card>
      )}

      {check?.ok && !live && <Notice tone="success">Verified. Your store opens on your domain once its routing record is in place.</Notice>}
    </div>
  );
}

function HostingNote({ hosting }: { hosting: HostingStatus }) {
  return (
    <div className="mt-3 grid gap-2">
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
    <button type="button" onClick={() => void copy()} aria-label={`Copy ${label}`} className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-full border border-app-line bg-white px-2.5 text-[12px] font-bold">
      <Icon name={copied ? "check" : "copy"} size={12} /> {copied ? "Copied" : "Copy"}
    </button>
  );
}

function RecordRow({ record }: { record: DnsRecord }) {
  return (
    <li className="min-w-0 rounded-[16px] bg-app-canvas px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-bold">{record.type}</span>
        <Pill tone={record.required ? "ink" : "muted"}>{record.purpose === "verify" ? "Proves ownership" : record.required ? "Required" : "Optional"}</Pill>
      </div>
      <dl className="m-0 grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13.5px]">
        <dt className="text-app-ink-soft">Name</dt>
        <dd className="m-0 flex min-w-0 items-start gap-2">
          <span className="min-w-0 flex-1 break-all font-mono">
            {record.label}
            {record.label !== record.name && <span className="block text-[12px] text-app-ink-soft">full name: {record.name}</span>}
          </span>
          <CopyButton value={record.label} label={`${record.type} name`} />
        </dd>
        <dt className="text-app-ink-soft">Value</dt>
        <dd className="m-0 flex min-w-0 items-start gap-2">
          <span className="min-w-0 flex-1 break-all font-mono">{record.value}</span>
          <CopyButton value={record.value} label={`${record.type} value`} />
        </dd>
      </dl>
      {record.note && <p className="mb-0 mt-2 text-[12.5px] leading-[1.45] text-app-ink-soft">{record.note}</p>}
    </li>
  );
}
