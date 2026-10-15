"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Card, Pill } from "@/components/app-kit";
import { cx, Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { confirmDialog } from "@/components/ui/dialogs";
import { RegistrarTip } from "@/components/domains/RegistrarTip";
import { useT } from "@/components/i18n/I18nProvider";
import { EMAIL_PREFIXES, type EmailDnsRecord, type EmailOption } from "@/lib/email-channel/shared";
import type { EmailSetupView } from "@/lib/email-channel/server";

// Inbox → Email: connect the store's email so customers get emails from the seller's own address and their
// replies come back to the Inbox. The option we recommend comes first: one click on a domain bought through
// Shopinbos, DNS steps on a domain bought elsewhere, Gmail on a free Shopinbos address. Tokens never reach here.

type ApiError = Error & { code?: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!res.ok || !json || json.error) {
    const error = new Error(json?.error?.message || "") as ApiError;
    error.code = json?.error?.code ?? (res.status === 429 ? "RATE_LIMITED" : undefined);
    throw error;
  }
  return json.data as T;
}

const fieldClass = "h-11 w-full min-w-0 rounded-[14px] border border-app-line bg-white px-3 text-[14.5px] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-ink";
const POLL_MS = 15_000;
const POLL_TIMES = 24;

function CopyValue({ label, value }: { label: string; value: string }) {
  const t = useT("inbox");
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-[12px] font-bold text-app-ink-soft">{label}</span>
      <div className="flex min-w-0 items-center gap-2 rounded-[12px] bg-app-canvas px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-mono text-[12.5px]">{value}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
          aria-label={t("ch.copy", { label })}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white"
        >
          <Icon name={copied ? "check" : "copy"} size={15} />
        </button>
      </div>
    </div>
  );
}

function RecordCard({ record }: { record: EmailDnsRecord }) {
  const t = useT("inbox");
  const tone = record.status === "verified" ? "success" : record.status === "failed" ? "danger" : "warning";
  return (
    <li className="grid min-w-0 gap-2 rounded-[16px] border border-app-line bg-white p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-app-canvas px-2.5 py-1 font-mono text-[12px] font-bold">{record.type}</span>
        <span className="min-w-0 flex-1 text-[13.5px] font-bold">{t.dynamic(`email.purpose.${record.purpose}`, record.purpose)}</span>
        <Pill tone={tone} dot>{t.dynamic(`email.status.${record.status}`, record.status)}</Pill>
      </div>
      <CopyValue label={t("email.rec.name")} value={record.name} />
      <CopyValue label={t("email.rec.value")} value={record.value} />
      {record.priority !== null && <CopyValue label={t("email.rec.priority")} value={String(record.priority)} />}
    </li>
  );
}

function OptionCard({ title, recommended, icon, children }: { title: string; recommended?: boolean; icon: "globe" | "mail" | "cart"; children: ReactNode }) {
  const t = useT("inbox");
  return (
    <Card className={cx("grid content-start gap-3 p-5", recommended && "ring-2 ring-app-ink/80")}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name={icon} size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[16px] font-extrabold">{title}</h2>
            {recommended && <Pill tone="accent">{t("email.recommended")}</Pill>}
          </div>
        </div>
      </div>
      {children}
    </Card>
  );
}

export function EmailSetupClient({ initial, gmailResult }: { initial: EmailSetupView; gmailResult: string | null }) {
  const t = useT("inbox", "common");
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(
    gmailResult ? { tone: gmailResult === "connected" ? "success" : gmailResult === "cancelled" ? "info" : "error", text: t.dynamic(`email.gmail.${gmailResult}`, t("email.err.generic")) } : null,
  );
  const rec = view.recommendation;
  const domain = view.domain;
  const [prefix, setPrefix] = useState(domain?.prefix ?? "hello");
  const [fromName, setFromName] = useState(view.fromName);
  const polls = useRef(0);

  const errorText = useCallback((error: ApiError) => (error.code ? t.dynamic(`email.err.${error.code}`, error.message || t("email.err.generic")) : error.message || t("email.err.generic")), [t]);

  const run = async (key: string, action: () => Promise<EmailSetupView>, ok?: (next: EmailSetupView) => string | null) => {
    setBusy(key);
    setMessage(null);
    try {
      const next = await action();
      setView(next);
      const text = ok?.(next);
      if (text) setMessage({ tone: "success", text });
    } catch (error) {
      setMessage({ tone: "error", text: errorText(error as ApiError) });
    } finally {
      setBusy(null);
    }
  };

  const startDomain = () =>
    run("domain", () => api<EmailSetupView>("/api/app/inbox/email/domain", { method: "POST", body: JSON.stringify({ prefix, fromName }) }), (next) => (next.connected && next.provider === "resend_domain" ? t("email.domain.connected", { address: next.address ?? "" }) : null));
  const checkAgain = () =>
    run("check", () => api<EmailSetupView>("/api/app/inbox/email/domain", { method: "PUT" }), (next) => (next.domain?.status === "verified" ? t("email.domain.connected", { address: next.address ?? "" }) : t("email.domain.stillWaiting")));
  const saveName = () => run("name", () => api<EmailSetupView>("/api/app/inbox/email", { method: "PATCH", body: JSON.stringify({ fromName, ...(view.provider === "resend_domain" ? { prefix } : {}) }) }), () => t("email.saved"));
  const usePlatform = () =>
    run("platform", async () => {
      await api("/api/app/inbox/channels/email", { method: "POST", body: "{}" });
      return api<EmailSetupView>("/api/app/inbox/email");
    }, () => t("email.platform.on"));
  const disconnect = async () => {
    if (!(await confirmDialog(t("email.confirmDisconnect")))) return;
    await run("disconnect", () => api<EmailSetupView>("/api/app/inbox/email", { method: "DELETE" }), () => t("email.disconnected"));
  };

  // A bought domain's records were added for the seller: keep checking quietly until it's connected.
  const waiting = Boolean(domain && domain.status === "pending" && domain.auto);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      if (polls.current >= POLL_TIMES) return window.clearInterval(timer);
      polls.current += 1;
      void api<EmailSetupView>("/api/app/inbox/email/domain", { method: "PUT" }).then(setView).catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting]);

  const prefixField = (
    <div className="grid gap-2">
      <label className="grid gap-1 text-[13.5px] font-bold">
        {t("email.domain.address")}
        <div className="flex min-w-0 items-center gap-2">
          <input value={prefix} onChange={(e) => setPrefix(e.target.value.toLowerCase().replace(/\s+/g, ""))} maxLength={32} autoComplete="off" spellCheck={false} className={cx(fieldClass, "flex-1 font-mono")} />
          <span className="min-w-0 truncate font-mono text-[14px] text-app-ink-soft">@{rec.domain}</span>
        </div>
      </label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("email.domain.pick")}>
        {EMAIL_PREFIXES.map((p) => (
          <button key={p} type="button" aria-pressed={prefix === p} onClick={() => setPrefix(p)} className={cx("min-h-[34px] rounded-full border px-3 text-[12.5px] font-bold", prefix === p ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink")}>
            {p}@
          </button>
        ))}
      </div>
    </div>
  );
  const nameField = (
    <label className="grid gap-1 text-[13.5px] font-bold">
      {t("email.fromName")}
      <input value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={60} className={fieldClass} />
      <span className="text-[12px] font-normal text-app-ink-soft">{t("email.fromNameHint")}</span>
    </label>
  );

  const domainActive = view.connected && view.provider === "resend_domain";
  const domainBody = (auto: boolean) => {
    if (domainActive) return <p className="m-0 text-[13.5px] text-app-ink-soft">{t("email.domain.inUse", { address: view.address ?? "" })}</p>;
    if (!view.ready.resend) return <Notice tone="info">{t("email.err.NOT_READY")}</Notice>;
    if (domain && domain.status !== "verified") {
      const manual = !domain.auto;
      return (
        <div className="grid gap-3">
          <p className="m-0 text-[13.5px] leading-[1.5]">
            {manual ? t("email.domain.addRecords", { domain: domain.name }) : t("email.domain.settingUp", { address: `${domain.prefix}@${domain.name}` })}
          </p>
          {domain.dnsError && auto && <Notice tone="info">{t("email.domain.autoFailed")}</Notice>}
          {manual && (
            <>
              <ul className="m-0 grid list-none gap-2 p-0">{domain.records.map((r) => <RecordCard key={`${r.type}-${r.name}-${r.purpose}`} record={r} />)}</ul>
              <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("email.domain.dmarcNote")}</p>
              <div className="rounded-[18px] bg-app-canvas p-3.5"><RegistrarTip /></div>
            </>
          )}
          {!manual && (
            <ul className="m-0 grid list-none gap-1.5 p-0 text-[13px]">
              {domain.records.map((r) => (
                <li key={`${r.type}-${r.name}-${r.purpose}`} className="flex items-center gap-2">
                  <Icon name={r.status === "verified" ? "checkCircle" : "clock"} size={15} className={r.status === "verified" ? "text-app-forest" : "text-app-ink-soft"} />
                  {t.dynamic(`email.purpose.${r.purpose}`, r.purpose)}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <PillButton size="md" tone="ink" busy={busy === "check"} onClick={() => void checkAgain()}><Icon name="refresh" size={15} /> {t("email.domain.check")}</PillButton>
          </div>
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("email.domain.wait")}</p>
        </div>
      );
    }
    return (
      <div className="grid gap-3">
        <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">{auto ? t("email.domain.autoBlurb", { domain: rec.domain ?? "" }) : t("email.domain.dnsBlurb", { domain: rec.domain ?? "" })}</p>
        {prefixField}
        {nameField}
        <div>
          <PillButton size="md" tone="ink" busy={busy === "domain"} disabled={!prefix.trim() || !fromName.trim()} onClick={() => void startDomain()}>
            {auto ? t("email.domain.oneClick", { domain: rec.domain ?? "" }) : t("email.domain.showRecords")}
          </PillButton>
        </div>
      </div>
    );
  };

  // A Gmail sign-in that expired shows the reconnect button again.
  const gmailActive = view.connected && view.provider === "gmail" && !view.lastError;
  const option = (key: EmailOption) => {
    const recommended = key === rec.primary;
    switch (key) {
      case "domain_auto":
      case "domain_dns":
        return (
          <OptionCard key={key} icon="globe" recommended={recommended} title={t("email.domain.title", { domain: rec.domain ?? "" })}>
            {domainBody(key === "domain_auto")}
          </OptionCard>
        );
      case "gmail":
        return (
          <OptionCard key={key} icon="mail" recommended={recommended} title={t("email.gmail.title")}>
            <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">{gmailActive ? t("email.gmail.inUse", { email: view.gmail?.email ?? "" }) : t("email.gmail.blurb")}</p>
            {!gmailActive &&
              (view.ready.google ? (
                <div>
                  <a href="/api/app/inbox/email/gmail/connect" className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-bold text-white no-underline hover:bg-black">
                    <Icon name="mail" size={15} /> {view.gmail ? t("email.gmail.reconnect") : t("email.gmail.connect")}
                  </a>
                </div>
              ) : (
                <Notice tone="info">{t("email.gmail.notReady")}</Notice>
              ))}
            {!gmailActive && <p className="m-0 text-[12px] text-app-ink-soft">{t("email.gmail.privacy")}</p>}
          </OptionCard>
        );
      case "buy_domain":
        return (
          <OptionCard key={key} icon="cart" title={t("email.buy.title")}>
            <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">{t("email.buy.blurb")}</p>
            <div><Link href="/home/domain" className="inline-flex min-h-[44px] items-center rounded-full border border-app-line px-5 text-[14px] font-bold text-app-ink no-underline hover:border-app-line-strong">{t("email.buy.action")}</Link></div>
          </OptionCard>
        );
    }
  };

  return (
    <div className="grid gap-5">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {view.connected ? (
        <Card className="grid content-start gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[17px] font-extrabold">{t("email.yourEmail")}</h2>
            <Pill tone={view.lastError ? "warning" : "success"} dot>{view.lastError ? t("ch.attention") : t("ch.connected")}</Pill>
          </div>
          <p className="m-0 break-words text-[14px] leading-[1.5]">{t.dynamic(`email.sendsFrom.${view.provider ?? "platform"}`, "", { address: view.address ?? "" })}</p>
          {view.lastError && <Notice tone="error">{view.provider === "gmail" ? t("email.gmail.expired") : t("email.err.generic")}</Notice>}
          {view.provider !== "platform" && (
            <div className="grid gap-3 sm:max-w-[420px]">
              {nameField}
              <div><PillButton size="md" tone="white" busy={busy === "name"} disabled={!fromName.trim() || fromName === view.fromName} onClick={() => void saveName()}>{t("email.save")}</PillButton></div>
            </div>
          )}
          <p className="m-0 text-[13px] text-app-ink-soft">{view.provider === "gmail" || view.ready.inbound ? t("email.repliesHere") : t("email.repliesMailbox")}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/home/messages" className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-bold text-white no-underline hover:bg-black">{t("ch.openInbox")}</Link>
            <PillButton size="md" tone="ghost" busy={busy === "disconnect"} onClick={() => void disconnect()}>{t("ch.disconnect")}</PillButton>
          </div>
        </Card>
      ) : (
        <Card className="grid gap-2 p-5">
          <h2 className="m-0 text-[17px] font-extrabold">{t("email.pickTitle")}</h2>
          <p className="m-0 text-[14px] leading-[1.5] text-app-ink-soft">{t.dynamic(`email.pick.${rec.kind}`, "", { domain: rec.domain ?? "" })}</p>
        </Card>
      )}

      {view.connected && <h2 className="m-0 text-[16px] font-extrabold">{t("email.otherWays")}</h2>}
      <section className="grid gap-4 lg:grid-cols-2">{rec.options.map(option)}</section>

      {!view.connected && view.platformAddress && view.ready.resend && (
        <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">
          {t("email.platform.blurb", { address: view.platformAddress })}{" "}
          <button type="button" disabled={busy === "platform"} onClick={() => void usePlatform()} className="font-bold text-app-accent-ink underline-offset-2 hover:underline">{t("email.platform.action")}</button>
        </p>
      )}
    </div>
  );
}
