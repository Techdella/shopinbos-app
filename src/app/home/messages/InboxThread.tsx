"use client";

import { SMS_ENABLED, WEB_CALLS_ENABLED } from "@/lib/features";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx, PillButton, Segmented } from "@/components/app-ui";
import { Avatar } from "@/components/seller-core";
import { Icon } from "@/components/ui/Icon";
import { ChannelMark, formatStamp, formatWhen, inboxApi, useChannelLabel } from "@/components/messaging/inbox-ui";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import type { TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";
import { CHANNELS, type InboxChannelKey } from "@/lib/inbox/meta";
import type { InboxThread as ThreadData, InboxThreadMessage } from "@/lib/inbox/queries";
import { naira } from "@shared/onboarding";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { friendlyError } from "@/lib/errors/report-client";

// One customer conversation: the messages, a reply box that sends on the conversation's own channel (or saves
// a private note), Peggy's suggested reply, saved replies, calls, and the customer sidebar.

type InboxT = TFunction<MessageKey<"inbox">>;

const SNOOZE: Array<{ hours: number; label: MessageKey<"inbox"> }> = [
  { hours: 3, label: "thread.snooze3h" },
  { hours: 24, label: "thread.snoozeTomorrow" },
  { hours: 24 * 7, label: "thread.snoozeWeek" },
];

const STATUS_LABEL: Record<string, MessageKey<"inbox"> | ""> = { queued: "msg.sending", sent: "msg.sent", delivered: "msg.delivered", read: "msg.read", failed: "msg.notSent", logged: "", received: "" };
const META_WINDOW: InboxChannelKey[] = ["whatsapp", "messenger", "instagram"];

export interface ThreadProps {
  conversationId: string;
  me: { id: string; email: string; name: string; phone: string | null };
  team: Array<{ email: string; label: string }>;
  canned: Array<{ id: string; title: string; body: string }>;
  connected: string[];
  aiAvailable: boolean;
  onBack: () => void;
  onChanged: (patch: { status?: "open" | "snoozed" | "closed"; assigneeEmail?: string | null; tags?: string[]; unread?: number; preview?: string; at?: string }) => void;
  onOpen: (conversationId: string) => void;
}

function replyHint(channel: InboxChannelKey, data: ThreadData, connected: string[], t: InboxT) {
  const c = data.conversation;
  const name = t.dynamic(`channel.${channel}`, CHANNELS[channel].label);
  switch (channel) {
    case "livechat":
      return c.contactEmail ? t("hint.livechatEmail", { email: c.contactEmail }) : t("hint.livechat");
    case "form":
      return c.contactEmail ? t("hint.byEmail", { to: c.contactEmail }) : SMS_ENABLED && c.contactPhone && connected.includes("sms") ? t("hint.bySms", { to: c.contactPhone }) : t("hint.noEmail");
    case "email":
      return t("hint.byEmail", { to: c.contactEmail ?? t("hint.them") });
    case "voice":
      return SMS_ENABLED && connected.includes("sms") ? t("hint.bySms", { to: c.contactPhone ?? t("hint.caller") }) : t("hint.connectSms");
    case "tiktok":
      return t("hint.tiktok");
    default:
      return connected.includes(channel) ? t("hint.sentOn", { channel: name }) : t("hint.notConnected", { channel: name });
  }
}

function Attachments({ message }: { message: InboxThreadMessage }) {
  const t = useT("inbox");
  if (!message.attachments.length) return null;
  return (
    <div className="mt-2 grid gap-1.5">
      {message.attachments.map((attachment, index) => {
        const href = `/api/app/inbox/media/${message.id}/${index}`;
        if (attachment.type === "audio" || attachment.contentType?.startsWith("audio/")) {
          return <audio key={index} controls preload="none" src={href} className="w-full max-w-[280px]" aria-label={attachment.name ?? t("msg.voice")} />;
        }
        return (
          <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-bold underline">
            <Icon name={attachment.type === "image" ? "image" : "paperclip"} size={14} />
            {attachment.name || (attachment.type === "image" ? t("msg.photo") : attachment.type === "video" ? t("msg.video") : t("msg.attachment"))}
          </a>
        );
      })}
    </div>
  );
}

function MessageBubble({ message }: { message: InboxThreadMessage }) {
  const t = useT("inbox");
  const locale = useLocale();
  if (message.direction === "note") {
    return (
      <div className="mx-auto w-full max-w-[560px] rounded-[16px] border border-[#F2D58A] bg-[#FFF8E6] px-3.5 py-2.5 text-[13.5px]">
        <div className="mb-0.5 flex items-center gap-1.5 text-[12px] font-bold text-[#8A5A00]">
          <Icon name={message.kind === "call" ? "phone" : "lock"} size={13} />
          {message.kind === "call" ? t("msg.call") : t("msg.note")} · {message.authorName ?? t("you")} · {formatStamp(message.createdAt, locale)}
        </div>
        <div className="whitespace-pre-wrap break-words">{message.body}</div>
      </div>
    );
  }
  const mine = message.direction === "outbound";
  const call = message.kind === "call" || message.kind === "voicemail";
  return (
    <div className={cx("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[88%] rounded-[18px] px-3.5 py-2.5 text-[14px] leading-[1.45] sm:max-w-[72%]",
          mine ? (message.status === "failed" ? "rounded-br-[6px] border border-app-danger bg-app-danger-tint text-app-ink" : "rounded-br-[6px] bg-app-ink text-white") : "rounded-bl-[6px] border border-app-line bg-white",
        )}
      >
        {(call || message.kind === "auto_reply" || message.kind === "form") && (
          <div className={cx("mb-1 flex items-center gap-1.5 text-[12px] font-bold", mine && message.status !== "failed" ? "text-white/70" : "text-app-ink-soft")}>
            <Icon name={call ? "phone" : message.kind === "form" ? "document" : "clock"} size={13} />
            {message.kind === "voicemail" ? t("msg.voicemail") : message.kind === "call" ? t("msg.call") : message.kind === "form" ? t("msg.form") : t("msg.autoReply")}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{message.body}</div>
        <Attachments message={message} />
        <div className={cx("mt-1 flex justify-end gap-1.5 text-[11px]", mine && message.status !== "failed" ? "text-white/60" : "text-app-ink-faint")}>
          {mine && message.authorName && <span>{message.authorName} ·</span>}
          <span>{formatWhen(message.createdAt, locale)}</span>
          {mine && STATUS_LABEL[message.status] ? <span>· {t(STATUS_LABEL[message.status] as MessageKey<"inbox">)}</span> : null}
        </div>
        {message.status === "failed" && message.error && <div className="mt-1 text-[12.5px] font-semibold text-app-danger">{message.error}</div>}
      </div>
    </div>
  );
}

function CustomerPanel({ data, onOpen, onSaveTags }: { data: ThreadData; onOpen: (id: string) => void; onSaveTags: (tags: string[]) => void }) {
  const t = useT("inbox");
  const locale = useLocale();
  const channelLabel = useChannelLabel();
  const c = data.conversation;
  const [tag, setTag] = useState("");
  return (
    <div className="grid content-start gap-4 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Avatar name={c.name} size={48} />
        <div className="min-w-0">
          <h3 className="m-0 truncate text-[16px] font-extrabold">{c.name}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-app-ink-soft"><ChannelMark channel={c.channel} size={18} /> {channelLabel(c.channel)}</div>
        </div>
      </div>
      <dl className="m-0 grid gap-2 text-[13.5px]">
        {c.contactEmail && <div className="flex min-w-0 gap-2"><dt className="sr-only">{t("panel.email")}</dt><Icon name="mail" size={15} className="mt-0.5 shrink-0 text-app-ink-soft" /><dd className="m-0 min-w-0 break-all">{c.contactEmail}</dd></div>}
        {c.contactPhone && <div className="flex min-w-0 gap-2"><dt className="sr-only">{t("panel.phone")}</dt><Icon name="phone" size={15} className="mt-0.5 shrink-0 text-app-ink-soft" /><dd className="m-0"><a href={`tel:${c.contactPhone}`} className="text-app-ink">{c.contactPhone}</a></dd></div>}
        {c.contactHandle && <div className="flex min-w-0 gap-2"><dt className="sr-only">{t("panel.handle")}</dt><Icon name="user" size={15} className="mt-0.5 shrink-0 text-app-ink-soft" /><dd className="m-0 truncate">{c.contactHandle}</dd></div>}
        <div className="flex gap-2 text-app-ink-soft"><dt className="sr-only">{t("panel.firstMessageLabel")}</dt><Icon name="calendar" size={15} className="mt-0.5 shrink-0" /><dd className="m-0">{t("panel.firstMessage", { date: formatStamp(c.createdAt, locale) })}</dd></div>
      </dl>

      <section aria-label={t("panel.orders")} className="rounded-[18px] bg-app-canvas p-3.5">
        {data.customer.matched ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div><div className="text-[12px] text-app-ink-soft">{t("panel.totalSpent")}</div><div className="text-[18px] font-extrabold">{naira(data.customer.totalSpent)}</div></div>
              <div><div className="text-[12px] text-app-ink-soft">{t("panel.orders")}</div><div className="text-[18px] font-extrabold">{data.customer.orderCount}</div></div>
            </div>
            <ul className="m-0 mt-3 grid list-none gap-1.5 p-0">
              {data.customer.orders.map((order) => (
                <li key={order.id}>
                  <Link href={`/home/orders/${order.id}`} className="flex items-center justify-between gap-2 rounded-[12px] bg-white px-3 py-2 text-[13px] text-app-ink no-underline hover:ring-1 hover:ring-app-line-strong">
                    <span className="min-w-0 truncate font-bold">#{order.orderNumber}</span>
                    <span className="shrink-0 text-app-ink-soft">{t.dynamic(`orderStatus.${order.status}`, order.status.replace(/_/g, " "))} · {naira(order.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="m-0 text-[13px] text-app-ink-soft">
            {c.contactEmail || c.contactPhone ? t("panel.noOrders") : t("panel.noContact")}
          </p>
        )}
      </section>

      <section aria-label={t("panel.tags")}>
        <h4 className="m-0 mb-2 text-[13px] font-extrabold">{t("panel.tags")}</h4>
        <div className="flex flex-wrap gap-1.5">
          {c.tags.map((tagName) => (
            <button key={tagName} type="button" onClick={() => onSaveTags(c.tags.filter((x) => x !== tagName))} className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-app-canvas px-2.5 text-[12.5px] font-bold" aria-label={t("thread.removeTag", { tag: tagName })}>
              {tagName} <Icon name="x" size={12} />
            </button>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (tag.trim()) onSaveTags([...c.tags, tag.trim()]);
              setTag("");
            }}
          >
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t("panel.addTag")} aria-label={t("panel.addATag")} maxLength={30} className="h-[30px] w-[110px] rounded-full border border-app-line px-3 text-[13px] outline-none focus:border-app-ink" />
          </form>
        </div>
      </section>

      {data.related.length > 0 && (
        <section aria-label={t("panel.other")}>
          <h4 className="m-0 mb-2 text-[13px] font-extrabold">{t("panel.alsoOn")}</h4>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {data.related.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="flex w-full items-center gap-2 rounded-[12px] border border-app-line px-3 py-2 text-left text-[13px] hover:bg-app-canvas">
                  <ChannelMark channel={r.channel as InboxChannelKey} size={20} />
                  <span className="min-w-0 flex-1 truncate">{r.preview || channelLabel(r.channel as InboxChannelKey)}</span>
                  <span className="shrink-0 text-[12px] text-app-ink-soft">{formatWhen(r.at, locale)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CallPanel({ conversationId, phone, voiceOn, defaultPhone, onDone, onClose }: { conversationId: string; phone: string | null; voiceOn: boolean; defaultPhone: string | null; onDone: () => void; onClose: () => void }) {
  const t = useT("inbox");
  const [mode, setMode] = useState<"click" | "log">(voiceOn && phone ? "click" : "log");
  const [sellerPhone, setSellerPhone] = useState(defaultPhone ?? "");
  const [direction, setDirection] = useState<"incoming" | "outgoing">("outgoing");
  const [outcome, setOutcome] = useState<"answered" | "missed" | "voicemail">("answered");
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const body = mode === "click" ? { mode, sellerPhone } : { mode, direction, outcome, minutes: minutes ? Number(minutes) : null, notes };
      await inboxApi(`/api/app/inbox/conversations/${conversationId}/call`, { method: "POST", body: JSON.stringify(body) });
      setMessage({ tone: "ok", text: mode === "click" ? t("call.ringing") : t("call.saved") });
      onDone();
    } catch (error) {
      setMessage({ tone: "error", text: friendlyError(error) });
    } finally {
      setBusy(false);
    }
  }

  const input = "h-11 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";
  return (
    <div className="border-b border-app-line bg-app-canvas/60 px-3 py-3 sm:px-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        {voiceOn && phone ? (
          <Segmented options={[{ value: "click", label: t("call.now") }, { value: "log", label: t("call.log") }]} value={mode} onChange={setMode} />
        ) : (
          <span className="text-[14px] font-extrabold">{t("call.log")}</span>
        )}
        <button type="button" onClick={onClose} aria-label={t("call.close")} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white"><Icon name="x" size={16} /></button>
      </div>
      {mode === "click" ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="text-[13px] font-bold">{t("call.yourPhone")}
            <input value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} type="tel" placeholder="+2348012345678" className={cx(input, "mt-1")} />
          </label>
          <PillButton size="md" busy={busy} onClick={() => void submit()}><Icon name="phone" size={15} /> {t("call.callNumber", { phone: phone ?? "" })}</PillButton>
        </div>
      ) : (
        <div className="grid gap-2">
          {!voiceOn && <p className="m-0 text-[12.5px] text-app-ink-soft">{t("call.connectVoice")}</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} aria-label={t("call.who")} className={input}>
              <option value="outgoing">{t("call.iCalled")}</option>
              <option value="incoming">{t("call.theyCalled")}</option>
            </select>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} aria-label={t("call.what")} className={input}>
              <option value="answered">{t("call.answered")}</option>
              <option value="missed">{t("call.missed")}</option>
              <option value="voicemail">{t("call.voicemail")}</option>
            </select>
            <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={t("call.minutes")} aria-label={t("call.howMany")} className={input} />
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t("call.said")} aria-label={t("call.notes")} className="w-full rounded-[14px] border border-app-line bg-white px-3 py-2 text-[15px] outline-none focus:border-app-ink" />
          <VoiceInputButton value={notes} onChange={setNotes} context="notes from a phone call" className="mt-2" />
          <div><PillButton size="sm" busy={busy} onClick={() => void submit()}>{t("call.save")}</PillButton></div>
        </div>
      )}
      {message && <p role={message.tone === "error" ? "alert" : "status"} className={cx("m-0 mt-2 text-[13px] font-semibold", message.tone === "error" ? "text-app-danger" : "text-app-success")}>{message.text}</p>}
    </div>
  );
}

export function InboxThread({ conversationId, me, team, canned, connected, aiAvailable, onBack, onChanged, onOpen }: ThreadProps) {
  const t = useT("inbox");
  const locale = useLocale();
  const [data, setData] = useState<ThreadData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const next = await inboxApi<ThreadData>(`/api/app/inbox/conversations/${conversationId}`);
      setData(next);
      setLoadError(null);
    } catch (error) {
      setLoadError(friendlyError(error));
    }
  }, [conversationId]);

  useEffect(() => {
    setData(null);
    setText("");
    setNotice(null);
    setShowCall(false);
    lastCount.current = 0;
    void load().then(() => onChanged({ unread: 0 }));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, load]);

  useEffect(() => {
    const count = data?.messages.length ?? 0;
    if (count !== lastCount.current) endRef.current?.scrollIntoView({ block: "nearest" });
    lastCount.current = count;
  }, [data?.messages.length]);

  async function patch(body: Record<string, unknown>, done?: string) {
    try {
      const saved = await inboxApi<{ status: "open" | "snoozed" | "closed"; assigneeEmail: string | null; tags: string[] }>(`/api/app/inbox/conversations/${conversationId}`, { method: "PATCH", body: JSON.stringify(body) });
      onChanged({ status: saved.status, assigneeEmail: saved.assigneeEmail, tags: saved.tags });
      if (done) setNotice({ tone: "ok", text: done });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: friendlyError(error) });
    }
  }

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setNotice(null);
    try {
      await inboxApi(`/api/app/inbox/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ body: text, mode }) });
      if (mode === "reply") onChanged({ preview: text.trim().slice(0, 140), at: new Date().toISOString() });
      setText("");
    } catch (error) {
      setNotice({ tone: "error", text: friendlyError(error) });
    } finally {
      setSending(false);
      await load();
    }
  }

  async function suggest() {
    setSuggesting(true);
    setNotice(null);
    try {
      const result = await inboxApi<{ text: string }>(`/api/app/inbox/conversations/${conversationId}/suggest`, { method: "POST", body: JSON.stringify({ instruction: text.trim() && text.trim().length < 200 ? text.trim() : null }) });
      setMode("reply");
      setText(result.text);
      setNotice({ tone: "ok", text: t("thread.peggyWrote") });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyError(error) });
    } finally {
      setSuggesting(false);
    }
  }

  if (!data) {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center text-[14px] text-app-ink-soft">
        {loadError ? <p role="alert" className="m-0">{loadError}</p> : <p className="m-0">{t("thread.loading")}</p>}
      </div>
    );
  }

  const c = data.conversation;
  const channel = c.channel;
  const canReply = CHANNELS[channel].replies && !(channel === "form" && !c.contactEmail && !(SMS_ENABLED && c.contactPhone && connected.includes("sms"))) && !(channel === "voice" && !(SMS_ENABLED && connected.includes("sms"))) && (["livechat", "form", "email", "voice"].includes(channel) || connected.includes(channel));
  const windowClosed = META_WINDOW.includes(channel) && c.lastInboundAt && Date.now() - new Date(c.lastInboundAt).getTime() > 24 * 3_600_000;
  const phone = c.contactPhone;

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-app-line px-3 py-2.5 sm:px-5">
          <button type="button" onClick={onBack} aria-label={t("thread.back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas lg:hidden">
            <Icon name="arrowLeft" size={18} />
          </button>
          <ChannelMark channel={channel} size={34} />
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-[15px] font-extrabold">{c.name}</h2>
            <div className="truncate text-[12.5px] text-app-ink-soft">{t.dynamic(`channel.${c.channel}`, c.channelLabel)}{c.subject ? ` · ${c.subject}` : ""}</div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {WEB_CALLS_ENABLED && (
              <button type="button" onClick={() => setShowCall((v) => !v)} aria-label={phone ? t("msg.call") : t("call.log")} aria-expanded={showCall} className="grid h-10 w-10 place-items-center rounded-full border border-app-line hover:border-app-line-strong">
                <Icon name="phone" size={16} />
              </button>
            )}
            <label className="sr-only" htmlFor={`assign-${c.id}`}>{t("thread.assignedTo")}</label>
            <select
              id={`assign-${c.id}`}
              value={c.assigneeEmail ?? ""}
              onChange={(e) => void patch({ assigneeEmail: e.target.value || null }, e.target.value ? t("thread.assigned") : t("thread.unassignedDone"))}
              className="h-10 max-w-[150px] rounded-full border border-app-line bg-white px-3 text-[13px] font-bold outline-none focus:border-app-ink"
            >
              <option value="">{t("thread.unassigned")}</option>
              {team.map((member) => <option key={member.email} value={member.email}>{member.label}</option>)}
            </select>
            {c.status === "closed" ? (
              <PillButton size="sm" tone="white" onClick={() => void patch({ status: "open" }, t("thread.reopened"))}>{t("thread.reopen")}</PillButton>
            ) : (
              <>
                <label className="sr-only" htmlFor={`snooze-${c.id}`}>{t("thread.snooze")}</label>
                <select
                  id={`snooze-${c.id}`}
                  value=""
                  onChange={(e) => e.target.value && void patch({ status: "snoozed", snoozeHours: Number(e.target.value) }, t("thread.snoozedDone"))}
                  className="h-10 rounded-full border border-app-line bg-white px-3 text-[13px] font-bold outline-none focus:border-app-ink"
                >
                  <option value="">{c.status === "snoozed" && c.snoozedUntil ? t("thread.snoozedTo", { date: formatStamp(c.snoozedUntil, locale) }) : t("thread.snooze")}</option>
                  {SNOOZE.map((s) => <option key={s.hours} value={s.hours}>{t(s.label)}</option>)}
                </select>
                <PillButton size="sm" onClick={() => void patch({ status: "closed" }, t("thread.closedDone"))}><Icon name="check" size={14} /> {t("thread.close")}</PillButton>
              </>
            )}
            <button type="button" onClick={() => setShowInfo((v) => !v)} aria-label={t("thread.customerDetails")} aria-expanded={showInfo} className="grid h-10 w-10 place-items-center rounded-full border border-app-line hover:border-app-line-strong 2xl:hidden">
              <Icon name="user" size={16} />
            </button>
          </div>
        </header>

        {WEB_CALLS_ENABLED && showCall && <CallPanel conversationId={c.id} phone={phone} voiceOn={connected.includes("voice")} defaultPhone={me.phone} onDone={() => void load()} onClose={() => setShowCall(false)} />}

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-app-canvas/50 px-3 py-4 sm:px-5" aria-live="polite">
          {data.messages.map((message) => <MessageBubble key={message.id} message={message} />)}
          <div ref={endRef} />
        </div>

        <div className="border-t border-app-line px-3 py-2.5 sm:px-5">
          {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={cx("m-0 mb-2 text-[13px] font-semibold", notice.tone === "error" ? "text-app-danger" : "text-app-success")}>{notice.text}</p>}
          {windowClosed && mode === "reply" && (
            <p className="m-0 mb-2 rounded-[12px] bg-[#FDF0D5] px-3 py-2 text-[12.5px] text-[#8A5A00]">
              {t("thread.window", { channel: t.dynamic(`channel.${channel}`, CHANNELS[channel].label) })}
            </p>
          )}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Segmented options={[{ value: "reply", label: t("thread.reply") }, { value: "note", label: t("msg.note") }]} value={mode} onChange={setMode} />
            <div className="relative">
              <button type="button" onClick={() => setShowCanned((v) => !v)} aria-expanded={showCanned} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-app-line px-3 text-[13px] font-bold hover:border-app-line-strong">
                <Icon name="list" size={14} /> {t("thread.saved")}
              </button>
              {showCanned && (
                <div className="absolute bottom-[44px] left-0 z-20 w-[min(320px,80vw)] rounded-[16px] border border-app-line bg-white p-2 shadow-lg">
                  {canned.length === 0 ? (
                    <p className="m-0 p-2 text-[13px] text-app-ink-soft">{t("thread.noSaved")} <Link href="/home/inbox/settings" className="font-bold text-app-ink">{t("thread.addSome")}</Link>.</p>
                  ) : (
                    <ul className="m-0 max-h-[260px] list-none overflow-y-auto p-0">
                      {canned.map((reply) => (
                        <li key={reply.id}>
                          <button type="button" onClick={() => { setText((current) => (current ? `${current}\n${reply.body}` : reply.body)); setShowCanned(false); }} className="w-full rounded-[10px] px-2.5 py-2 text-left hover:bg-app-canvas">
                            <span className="block text-[13.5px] font-bold">{reply.title}</span>
                            <span className="block truncate text-[12.5px] text-app-ink-soft">{reply.body}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            {aiAvailable && mode === "reply" && canReply && (
              <button type="button" onClick={() => void suggest()} disabled={suggesting} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-app-mint px-3 text-[13px] font-bold text-app-forest disabled:opacity-60">
                <Icon name="sparkle" size={14} /> {suggesting ? t("thread.peggyWriting") : t("thread.peggySuggest")}
              </button>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              disabled={mode === "reply" && !canReply}
              aria-label={mode === "note" ? t("msg.note") : t("thread.replyTo", { name: c.name })}
              placeholder={mode === "note" ? t("thread.notePlaceholder") : canReply ? t("thread.writeReply") : t("thread.cantReply")}
              className={cx("min-h-[48px] min-w-0 flex-1 resize-y rounded-[18px] border px-4 py-2.5 text-[16px] outline-none placeholder:text-app-ink-faint focus:border-app-ink sm:text-[15px]", mode === "note" ? "border-[#F2D58A] bg-[#FFF8E6]" : "border-app-line bg-white")}
            />
            <VoiceInputButton variant="icon" value={text} onChange={setText} context={mode === "note" ? "a private team note" : "a reply to a customer"} disabled={mode === "reply" && !canReply} />
            <button type="submit" disabled={sending || !text.trim() || (mode === "reply" && !canReply)} aria-label={mode === "note" ? t("thread.saveNote") : t("thread.sendReply")} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-accent text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
              <Icon name={mode === "note" ? "check" : "send"} size={18} />
            </button>
          </form>
          <p className="m-0 mt-1.5 text-[12px] text-app-ink-soft">{mode === "note" ? t("thread.noteHint") : replyHint(channel, data, connected, t)}</p>
        </div>
      </div>

      <aside
        aria-label={t("thread.customer")}
        className={cx(
          "min-h-0 w-full shrink-0 overflow-y-auto border-app-line bg-white 2xl:block 2xl:w-[320px] 2xl:border-l",
          showInfo ? "fixed inset-0 z-40 block sm:static sm:inset-auto sm:z-auto sm:w-[320px] sm:border-l" : "hidden",
        )}
      >
        <div className="flex items-center justify-between border-b border-app-line px-4 py-2.5 2xl:hidden">
          <span className="text-[14px] font-extrabold">{t("thread.customer")}</span>
          <button type="button" onClick={() => setShowInfo(false)} aria-label={t("thread.closeDetails")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas"><Icon name="x" size={16} /></button>
        </div>
        <CustomerPanel data={data} onOpen={onOpen} onSaveTags={(tags) => void patch({ tags })} />
      </aside>
    </div>
  );
}
