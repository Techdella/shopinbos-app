"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { cx, Notice, PillButton, Segmented, Spinner } from "@/components/app-ui";
import { Pill } from "@/components/app-kit";
import { Avatar } from "@/components/seller-core";
import { Icon } from "@/components/ui/Icon";
import { formatStamp } from "@/components/messaging/inbox-ui";
import { useDetailLabel } from "@/app/home/marketing/_kit/text";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate, formatMoney } from "@shared/i18n";
import { renderTemplateText } from "@/lib/marketing/text-channels";
import type { CustomerProfile } from "@/lib/customers/drawer.server";
import { friendlyError } from "@/lib/errors/report-client";
import { SMS_ENABLED } from "@/lib/features";

// The customer drawer on /home/customers: a right-side panel (a full-screen sheet on phones) opened by
// ?customer=<key>, so it can be linked and the back button closes it (&compose=email opens on the email composer).
// Contact, shopping history, a one-to-one message box (email from the seller's connected address, SMS, or WhatsApp
// inside the 24-hour window / with an approved template) that writes into the customer's Inbox conversation, their
// orders, reviews and marketing tags and note. Email never opens the device mail app; it is written and sent in here.

const ROW_CLASS = "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-app-ink no-underline hover:bg-app-canvas sm:flex-nowrap sm:px-5";

/** Moves to a list URL without reloading the page (the drawer listens to the URL). */
function go(href: string) {
  window.history.pushState(null, "", href);
}

/** A customer row: a real link (open in a new tab works), but a plain click just opens the drawer. */
export function CustomerRowLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    go(href);
  };
  return (
    <a href={href} onClick={onClick} title={label} className={ROW_CLASS}>
      {children}
    </a>
  );
}

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

export function CustomerDrawer() {
  const params = useSearchParams();
  const key = params.get("customer");
  const t = useT("customers");
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const closeHref = useMemo(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("customer");
    next.delete("compose");
    const text = next.toString();
    return text ? `/home/customers?${text}` : "/home/customers";
  }, [params]);
  const close = useCallback(() => go(closeHref), [closeHref]);

  const load = useCallback(async (customer: string, quiet = false) => {
    if (!quiet) {
      setProfile(null);
      setFailed(false);
    }
    try {
      const data = await api<CustomerProfile>(`/api/app/customers/profile?key=${encodeURIComponent(customer)}`);
      setProfile(data);
    } catch {
      if (!quiet) setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (key) void load(key);
  }, [key, load]);

  useEffect(() => {
    if (!key) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [key, close]);

  if (!key) return null;
  const ready = profile && profile.key === key;

  return (
    <div className="fixed inset-0 z-[60]">
      <button type="button" aria-label={t("drawer.close")} onClick={close} className="absolute inset-0 hidden h-full w-full cursor-default bg-black/30 sm:block" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t("drawer.label")}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-app-canvas font-app text-app-ink shadow-2xl outline-none sm:max-w-[560px] sm:rounded-l-[22px]"
      >
        <header className="flex items-center gap-3 border-b border-app-line bg-white px-4 py-3 sm:rounded-tl-[22px] sm:px-5">
          {ready ? <Avatar name={profile.name} size={40} /> : <span className="h-10 w-10 shrink-0 rounded-full bg-app-canvas" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-extrabold">{ready ? profile.name : t("drawer.label")}</div>
            {ready && <div className="truncate text-[13px] text-app-ink-soft">{profile.email || profile.phone}</div>}
          </div>
          <button type="button" onClick={close} aria-label={t("drawer.close")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-app-line bg-white hover:border-app-line-strong">
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
          {failed ? (
            <div className="grid gap-3">
              <Notice>{t("drawer.error")}</Notice>
              <PillButton size="sm" tone="white" onClick={() => void load(key)} className="justify-self-start">{t("drawer.retry")}</PillButton>
            </div>
          ) : !ready ? (
            <div className="flex items-center gap-2 py-10 text-[14px] text-app-ink-soft" role="status"><Spinner /> {t("drawer.loading")}</div>
          ) : (
            <DrawerBody profile={profile} reload={() => load(key, true)} />
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-[18px] border border-app-line bg-white px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="m-0 text-[15px] font-extrabold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[14px] bg-app-canvas px-3 py-2.5">
      <div className="text-[12px] text-app-ink-soft">{label}</div>
      <div className="mt-0.5 truncate text-[15px] font-extrabold">{value}</div>
    </div>
  );
}

function DrawerBody({ profile, reload }: { profile: CustomerProfile; reload: () => Promise<void> }) {
  const t = useT("customers", "orders");
  const locale = useLocale();
  const params = useSearchParams();
  const money = (amount: number, currency = profile.currency) => formatMoney(Math.round(amount), locale, { currency: currency || "NGN" });
  const date = (iso: string) => formatDate(iso, locale);
  const s = profile.stats;
  const compose = params.get("compose");
  const [channel, setChannel] = useState<Channel>(
    (compose === "whatsapp" || (compose === "sms" && SMS_ENABLED)) && profile.whatsapp.phone ? (compose as Channel) : profile.email ? "email" : profile.whatsapp.phone ? "whatsapp" : "email",
  );
  const composer = useRef<HTMLDivElement>(null);

  // The email address opens the in-app email composer (not the device's mail app): same drawer, same thread.
  const writeEmail = useCallback(() => {
    setChannel("email");
    window.requestAnimationFrame(() => {
      composer.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      composer.current?.querySelector<HTMLElement>("textarea, input, a")?.focus({ preventScroll: true });
    });
  }, []);

  // ?compose=email (from an order page): open straight on the composer.
  const composeEmail = params.get("compose") === "email" && Boolean(profile.email);
  useEffect(() => {
    if (composeEmail) writeEmail();
  }, [composeEmail, writeEmail]);

  return (
    <>
      <Section title={t("drawer.contact")}>
        <ul className="m-0 grid list-none gap-2 p-0 text-[14px]">
          <li className="flex min-w-0 items-center gap-2.5">
            <Icon name="mail" size={16} className="shrink-0 text-app-ink-soft" />
            {profile.email ? (
              <button type="button" onClick={writeEmail} aria-label={t("drawer.writeEmail", { email: profile.email })} className="min-w-0 truncate text-left font-bold text-app-accent-ink underline-offset-2 hover:underline">
                {profile.email}
              </button>
            ) : (
              <span className="text-app-ink-soft">{t("drawer.noEmail")}</span>
            )}
          </li>
          <li className="flex min-w-0 items-center gap-2.5">
            <Icon name="phone" size={16} className="shrink-0 text-app-ink-soft" />
            {profile.phone ? <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`} className="truncate text-app-ink">{profile.phone}</a> : <span className="text-app-ink-soft">{t("drawer.noPhone")}</span>}
          </li>
          <li className="flex min-w-0 items-center gap-2.5">
            <Icon name="pin" size={16} className="shrink-0 text-app-ink-soft" />
            <span className={cx("truncate", !profile.place && "text-app-ink-soft")}>{profile.place ?? t("drawer.noPlace")}</span>
          </li>
        </ul>
      </Section>

      <Section title={t("drawer.history")}>
        <div className="grid grid-cols-2 gap-2">
          <Fact label={t("drawer.orders")} value={String(s.orders)} />
          <Fact label={t("drawer.spent")} value={money(s.spent)} />
          <Fact label={t("drawer.average")} value={s.paidOrders ? money(s.average) : "–"} />
          <Fact label={t("drawer.first")} value={date(s.firstAt)} />
          <Fact label={t("drawer.last")} value={date(s.lastAt)} />
        </div>
      </Section>

      <div ref={composer} className="scroll-mt-4">
        <MessageBox profile={profile} reload={reload} channel={channel} setChannel={setChannel} />
      </div>

      <Section title={t("drawer.ordersList")}>
        <ul className="m-0 grid list-none divide-y divide-app-line p-0">
          {profile.orders.map((o) => (
            <li key={o.id}>
              <Link href={`/home/orders/${o.id}`} className="flex min-w-0 items-center justify-between gap-3 py-2.5 text-app-ink no-underline hover:text-app-accent-ink">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold">#{o.orderNumber}</span>
                  <span className="block truncate text-[12.5px] text-app-ink-soft">{date(o.createdAt)} · {t.dynamic(`status.${o.status}`, o.status)}</span>
                </span>
                <span className="shrink-0 text-[14px] font-extrabold">{money(o.total, o.currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {s.orders > profile.orders.length && <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">{t("drawer.ordersMore", { shown: profile.orders.length, total: s.orders })}</p>}
      </Section>

      <Section title={t("drawer.reviews")}>
        {profile.reviews.length === 0 ? (
          <p className="m-0 text-[13.5px] text-app-ink-soft">{t("drawer.noReviews")}</p>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {profile.reviews.map((r) => (
              <li key={r.id} className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                  <span aria-label={t("drawer.stars", { count: r.rating })} className="font-extrabold text-[#B7791F]">{"★".repeat(r.rating)}<span className="text-app-line-strong">{"★".repeat(Math.max(0, 5 - r.rating))}</span></span>
                  <span className="truncate font-bold">{r.product}</span>
                  <span className="text-app-ink-soft">{date(r.createdAt)}</span>
                </div>
                {(r.title || r.body) && <p className="mb-0 mt-1 break-words text-[13.5px] leading-[1.5]">{r.title && <strong>{r.title} </strong>}{r.body}</p>}
                <div className="mt-1 text-[12px] text-app-ink-soft">{t.dynamic(`drawer.review.${r.status}`, r.status)}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <MarketingBox profile={profile} />

      {profile.otherConversations.length > 0 && (
        <Section title={t("drawer.otherChats")}>
          <ul className="m-0 grid list-none gap-2 p-0">
            {profile.otherConversations.map((c) => (
              <li key={c.id}>
                <Link href={`/home/messages?c=${c.id}`} className="block min-w-0 text-app-ink no-underline hover:text-app-accent-ink">
                  <span className="block truncate text-[13.5px] font-bold">{c.preview || "…"}</span>
                  <span className="block text-[12px] text-app-ink-soft">{formatStamp(c.at, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

// ─── Messaging ───────────────────────────────────────────────────────────────

type Channel = "email" | "whatsapp" | "sms";

/** Characters in one text: 160 plain (GSM), 70 with emoji or other special characters; longer texts go in parts. */
function smsParts(text: string) {
  const unicode = /[^\u0000-\u007f]/.test(text);
  const single = unicode ? 70 : 160;
  const part = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / part);
}

function SetupNote({ children, href, action }: { children: ReactNode; href?: string; action?: string }) {
  return (
    <div className="grid gap-2 rounded-[14px] bg-app-canvas px-3.5 py-3 text-[13.5px] leading-[1.5]">
      <p className="m-0">{children}</p>
      {href && action && (
        <Link href={href} className="inline-flex min-h-[36px] items-center justify-self-start rounded-full bg-app-ink px-4 text-[13px] font-bold text-white no-underline hover:bg-black">{action}</Link>
      )}
    </div>
  );
}

/** Email isn't connected: say how we recommend connecting it for this store, and link to Inbox → Email. */
function EmailConnectNote({ recommended, href }: { recommended: { option: string; domain: string | null } | null; href: string }) {
  const t = useT("customers");
  const option = recommended?.option ?? "gmail";
  const domain = recommended?.domain ?? "";
  return (
    <div className="grid gap-2 rounded-[14px] border border-app-line bg-white px-3.5 py-3 text-[13.5px] leading-[1.5]">
      <div className="flex items-center gap-2 font-extrabold">
        <Icon name="mail" size={16} className="shrink-0" /> {t("chat.connectFirst.title")}
      </div>
      <p className="m-0 break-words text-app-ink-soft">
        {option === "domain_auto" ? t("chat.connectFirst.domain_auto", { domain }) : option === "domain_dns" ? t("chat.connectFirst.domain_dns", { domain }) : t("chat.connectFirst.gmail")}
      </p>
      <Link href={href} className="inline-flex min-h-[40px] items-center justify-self-start rounded-full bg-app-ink px-4 text-[13px] font-bold text-white no-underline hover:bg-black">
        {option === "domain_auto" ? t("chat.connectFirst.oneClick", { domain }) : option === "gmail" ? t("chat.connectFirst.gmailAction") : t("chat.connectEmail")}
      </Link>
    </div>
  );
}

const fieldClass = "w-full rounded-[14px] border border-app-line bg-white px-3.5 py-2.5 text-[14.5px] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-ink";

function MessageBox({ profile, reload, channel, setChannel }: { profile: CustomerProfile; reload: () => Promise<void>; channel: Channel; setChannel: (next: Channel) => void }) {
  const t = useT("customers", "inbox");
  const locale = useLocale();
  const detailLabel = useDetailLabel();
  const wa = profile.whatsapp;
  const mail = profile.emailChannel;
  const sms = profile.sms;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [useTemplate, setUseTemplate] = useState(wa.composer.mode === "template");
  const [templateId, setTemplateId] = useState(wa.templates[0]?.id ?? "");
  const [params, setParams] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const thread = channel === "email" ? mail.messages : channel === "sms" ? sms.messages : wa.messages;
  const conversationId = channel === "email" ? mail.conversationId : channel === "sms" ? sms.conversationId : wa.conversationId;
  const template = wa.templates.find((tpl) => tpl.id === templateId) ?? wa.templates[0] ?? null;
  const values = template ? params[template.id] ?? template.variables.map((v) => v.value) : [];
  const filledPreview = template ? renderTemplateText(template.content, template.variables.map((v, i) => values[i]?.trim() || v.value)) : "";
  const templateMode = channel === "whatsapp" && (wa.composer.mode === "template" || (wa.composer.mode === "free" && useTemplate));

  const errorText = (error: ApiError) => {
    if (error.code === "SEND_FAILED") return t("chat.err.sendFailed", { reason: error.message });
    if (error.code && ["NO_EMAIL", "NO_PHONE", "NOT_APPROVED", "OPTED_OUT", "SMS_OPTED_OUT", "NO_PICTURE", "RATE_LIMITED", "EMAIL_NOT_CONNECTED"].includes(error.code)) return t.dynamic(`chat.err.${error.code}`, error.message);
    return error.message || t("chat.err.generic");
  };

  const send = async () => {
    setBusy(true);
    setResult(null);
    try {
      const payload =
        channel === "email"
          ? { key: profile.key, channel: "email", subject: subject.trim() || null, body }
          : channel === "sms"
            ? { key: profile.key, channel: "sms", body }
          : templateMode && template
            ? { key: profile.key, channel: "whatsapp_template", templateId: template.id, params: values }
            : { key: profile.key, channel: "whatsapp", body };
      await api("/api/app/customers/message", { method: "POST", body: JSON.stringify(payload) });
      setBody("");
      setSubject("");
      setResult({ ok: true, text: t("chat.sentOk") });
    } catch (error) {
      setResult({ ok: false, text: errorText(error as ApiError) });
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const statusLabel = (status: string) => (status === "queued" ? t("msg.sending") : status === "failed" ? t("msg.notSent") : status === "delivered" ? t("msg.delivered") : status === "read" ? t("msg.read") : status === "sent" ? t("msg.sent") : "");
  const newEmailThread = channel === "email" && mail.messages.length === 0;

  return (
    <Section
      title={t("chat.title")}
      action={conversationId ? <Link href={`/home/messages?c=${conversationId}`} className="text-[13px] font-extrabold text-app-accent-ink no-underline hover:underline">{t("chat.openInbox")}</Link> : undefined}
    >
      <Segmented<Channel>
        className="mb-3 border border-app-line"
        value={channel}
        onChange={(next) => {
          setChannel(next);
          setResult(null);
        }}
        options={[
          { value: "email", label: t("chat.email") },
          { value: "whatsapp", label: t("chat.whatsapp") },
          ...(SMS_ENABLED ? [{ value: "sms" as const, label: t("chat.sms") }] : []),
        ]}
      />

      <div className="mb-3 grid max-h-[280px] gap-2 overflow-y-auto rounded-[14px] bg-app-canvas p-3" aria-live="polite">
        {thread.length === 0 ? (
          <p className="m-0 text-[13px] text-app-ink-soft">{t("chat.empty")}</p>
        ) : (
          thread.map((m) => (
            <div key={m.id} className={cx("max-w-[85%] rounded-[14px] px-3 py-2 text-[13.5px] leading-[1.45]", m.direction === "outbound" ? "justify-self-end bg-app-ink text-white" : "justify-self-start border border-app-line bg-white")}>
              <p className="m-0 whitespace-pre-wrap break-words">{m.body}</p>
              <div className={cx("mt-1 text-[11.5px]", m.direction === "outbound" ? "text-white/70" : "text-app-ink-soft")}>
                {formatStamp(m.createdAt, locale)}
                {m.direction === "outbound" && statusLabel(m.status) ? ` · ${statusLabel(m.status)}` : ""}
              </div>
              {m.status === "failed" && m.error && <div className="mt-1 text-[11.5px] text-[#FFB4A6]">{m.error}</div>}
            </div>
          ))
        )}
      </div>

      {channel === "email" ? (
        !mail.address ? (
          <SetupNote>{t("chat.noEmail")}</SetupNote>
        ) : !mail.connected ? (
          <EmailConnectNote recommended={mail.recommended} href={mail.setupHref} />
        ) : !mail.ready ? (
          <SetupNote>{t("chat.emailNotReady")}</SetupNote>
        ) : (
          <div className="grid gap-2">
            {newEmailThread && (
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder={t("chat.subjectPlaceholder")} aria-label={t("chat.subject")} className={fieldClass} />
            )}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={4} placeholder={t("chat.placeholder")} aria-label={t("chat.placeholder")} className={cx(fieldClass, "resize-y")} />
            <p className="m-0 break-words text-[12.5px] text-app-ink-soft">{mail.from ? t("chat.emailFrom", { email: mail.address, from: mail.from }) : t("chat.emailToOnly", { email: mail.address })}</p>
            {mail.provider === "platform" && (
              <p className="m-0 text-[12.5px] text-app-ink-soft">
                {t("chat.ownAddressNudge")} <Link href={mail.setupHref} className="font-bold text-app-accent-ink">{t("chat.ownAddressLink")}</Link>
              </p>
            )}
            <PillButton size="sm" tone="ink" busy={busy} disabled={!body.trim()} onClick={() => void send()} className="justify-self-end">
              <Icon name="send" size={14} /> {t("chat.send")}
            </PillButton>
          </div>
        )
      ) : channel === "sms" ? (
        !sms.phone ? (
          <SetupNote>{t("chat.sms.noPhone")}</SetupNote>
        ) : !sms.ready ? (
          <SetupNote>{t("chat.sms.notReady")}</SetupNote>
        ) : !sms.own && sms.left === 0 ? (
          <SetupNote href={sms.billingHref} action={t("chat.sms.buy")}>{t("chat.sms.noneLeft")}</SetupNote>
        ) : (
          <div className="grid gap-2">
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={918} rows={4} placeholder={t("chat.placeholder")} aria-label={t("chat.placeholder")} className={cx(fieldClass, "resize-y")} />
            {body && <p className="m-0 text-[12px] text-app-ink-soft">{t("chat.sms.length", { count: body.length, parts: smsParts(body) })}</p>}
            <p className="m-0 text-[12.5px] text-app-ink-soft">
              {sms.own || sms.left === null ? t("chat.sms.own", { phone: sms.phone }) : t("chat.sms.shopinbos", { phone: sms.phone, left: sms.left })}
              {!sms.own && sms.left !== null && (
                <> <Link href={sms.billingHref} className="font-bold text-app-accent-ink">{t("chat.sms.buy")}</Link></>
              )}
            </p>
            <PillButton size="sm" tone="ink" busy={busy} disabled={!body.trim()} onClick={() => void send()} className="justify-self-end">
              <Icon name="send" size={14} /> {t("chat.send")}
            </PillButton>
          </div>
        )
      ) : wa.composer.mode === "blocked" ? (
        wa.composer.reason === "no_phone" ? (
          <SetupNote>{t("chat.wa.noPhone")}</SetupNote>
        ) : wa.composer.reason === "not_connected" ? (
          <SetupNote href={wa.setupHref} action={t("chat.wa.connect")}>{t("chat.wa.notConnected")}</SetupNote>
        ) : wa.composer.reason === "no_account" ? (
          <SetupNote href={wa.setupHref} action={t("chat.wa.settings")}>{t("chat.wa.noAccount")}</SetupNote>
        ) : (
          <SetupNote href={wa.templatesHref} action={t("chat.wa.makeTemplate")}>{t("chat.wa.noTemplates")}</SetupNote>
        )
      ) : (
        <div className="grid gap-2">
          <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">
            {wa.composer.mode === "free" ? t("chat.wa.free", { time: wa.composer.closesAt ? formatStamp(wa.composer.closesAt, locale) : "" }) : t("chat.wa.templateOnly")}
          </p>
          {wa.composer.mode === "free" && wa.composer.templates && (
            <button type="button" onClick={() => setUseTemplate((on) => !on)} className="justify-self-start text-[13px] font-bold text-app-accent-ink underline-offset-2 hover:underline">
              {useTemplate ? t("chat.wa.writeFree") : t("chat.wa.useTemplate")}
            </button>
          )}
          {templateMode && template ? (
            <>
              <label className="grid gap-1 text-[13px] font-bold">
                {t("chat.wa.pickTemplate")}
                <select value={template.id} onChange={(e) => setTemplateId(e.target.value)} className={fieldClass}>
                  {wa.templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name.replace(/_/g, " ")} ({tpl.language})</option>
                  ))}
                </select>
              </label>
              {template.variables.length > 0 && (
                <fieldset className="m-0 grid gap-2 border-0 p-0">
                  <legend className="mb-1 text-[13px] font-bold">{t("chat.wa.fill")}</legend>
                  {template.variables.map((v, i) => (
                    <label key={v.n} className="grid gap-1 text-[12.5px] text-app-ink-soft">
                      {v.key ? detailLabel(v.key) : `{{${v.n}}}`}
                      <input
                        value={values[i] ?? ""}
                        maxLength={1000}
                        onChange={(e) => setParams((all) => ({ ...all, [template.id]: values.map((old, j) => (j === i ? e.target.value : old)) }))}
                        className={fieldClass}
                      />
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="rounded-[14px] border border-app-line bg-[#F2FBF7] px-3.5 py-3">
                <div className="mb-1 text-[12px] font-bold text-app-ink-soft">{t("chat.wa.preview")}</div>
                <p className="m-0 whitespace-pre-wrap break-words text-[13.5px] leading-[1.5]">{filledPreview}</p>
                {template.imageHeader && <p className="mb-0 mt-1.5 text-[12px] text-app-ink-soft">{t("chat.wa.imageHeader")}</p>}
              </div>
            </>
          ) : (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={4} placeholder={t("chat.placeholder")} aria-label={t("chat.placeholder")} className={cx(fieldClass, "resize-y")} />
          )}
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("chat.wa.sendsTo", { phone: wa.phone ?? "" })}</p>
          <PillButton size="sm" tone="ink" busy={busy} disabled={templateMode ? !template : !body.trim()} onClick={() => void send()} className="justify-self-end">
            <Icon name="whatsapp" size={14} /> {t("chat.send")}
          </PillButton>
        </div>
      )}

      {result && <div className="mt-3"><Notice tone={result.ok ? "success" : "error"}>{result.text}</Notice></div>}
    </Section>
  );
}

// ─── Marketing: list status, tags and the private note ───────────────────────

function MarketingBox({ profile }: { profile: CustomerProfile }) {
  const t = useT("customers");
  const locale = useLocale();
  const m = profile.marketing;
  const [tags, setTags] = useState<string[]>(m?.tags ?? []);
  const [tag, setTag] = useState("");
  const [note, setNote] = useState(m?.note ?? "");
  const [savedNote, setSavedNote] = useState(m?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!m) {
    return (
      <Section title={t("drawer.marketing")}>
        <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">{t("drawer.notOnList")}</p>
      </Section>
    );
  }

  const save = async (patch: { tags?: string[]; note?: string }) => {
    setBusy(true);
    setMessage(null);
    try {
      const data = await api<{ tags: string[]; note: string }>("/api/app/customers/marketing", { method: "PATCH", body: JSON.stringify({ key: profile.key, ...patch }) });
      setTags(data.tags);
      setSavedNote(data.note);
      if (patch.note !== undefined) setMessage({ ok: true, text: t("drawer.saved") });
    } catch (error) {
      setMessage({ ok: false, text: friendlyError(error) || t("chat.err.generic") });
    } finally {
      setBusy(false);
    }
  };

  const addTag = () => {
    const value = tag.trim().toLowerCase();
    if (!value || tags.includes(value)) return setTag("");
    setTag("");
    void save({ tags: [...tags, value] });
  };

  const tone = m.status === "active" ? "success" : "muted";
  return (
    <Section title={t("drawer.marketing")}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <Pill tone={tone}>{t.dynamic(`drawer.list.${m.status}`, m.status)}</Pill>
        <span className="text-app-ink-soft">{t("drawer.joined", { date: formatDate(m.joinedAt, locale) })}</span>
      </div>

      <div className="mb-1.5 text-[13px] font-bold">{t("drawer.tags")}</div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-[13px] text-app-ink-soft">{t("drawer.noTags")}</span>}
        {tags.map((name) => (
          <span key={name} className="inline-flex items-center gap-1 rounded-full bg-app-canvas py-1 pl-3 pr-1 text-[12.5px] font-bold">
            {name}
            <button type="button" disabled={busy} onClick={() => void save({ tags: tags.filter((x) => x !== name) })} aria-label={t("drawer.removeTag", { tag: name })} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white">
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
      </div>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addTag();
        }}
      >
        <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={40} placeholder={t("drawer.addTag")} aria-label={t("drawer.addTag")} className={cx(fieldClass, "min-w-0 flex-1 py-2")} />
        <PillButton type="submit" size="sm" tone="white" disabled={busy || !tag.trim()}>{t("drawer.add")}</PillButton>
      </form>

      <label className="grid gap-1 text-[13px] font-bold">
        {t("drawer.note")}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} placeholder={t("drawer.notePlaceholder")} className={cx(fieldClass, "resize-y font-normal")} />
      </label>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[12px] text-app-ink-soft">{t("drawer.noteHint")}</span>
        <PillButton size="sm" tone="white" busy={busy} disabled={note === savedNote} onClick={() => void save({ note })}>{t("drawer.saveNote")}</PillButton>
      </div>
      {message && <div className="mt-2"><Notice tone={message.ok ? "success" : "error"}>{message.text}</Notice></div>}
    </Section>
  );
}
