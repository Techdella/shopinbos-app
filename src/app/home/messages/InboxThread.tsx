"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx, PillButton, Segmented } from "@/components/app-ui";
import { Avatar } from "@/components/seller-core";
import { Icon } from "@/components/ui/Icon";
import { ChannelMark, channelLabel, formatStamp, formatWhen, inboxApi } from "@/components/messaging/inbox-ui";
import { CHANNELS, type InboxChannelKey } from "@/lib/inbox/meta";
import type { InboxThread as ThreadData, InboxThreadMessage } from "@/lib/inbox/queries";
import { naira } from "@shared/onboarding";

// One customer conversation: the messages, a reply box that sends on the conversation's own channel (or saves
// a private note), Peggy's suggested reply, saved replies, calls, and the customer sidebar.

const SNOOZE = [
  { hours: 3, label: "3 hours" },
  { hours: 24, label: "Tomorrow" },
  { hours: 24 * 7, label: "Next week" },
];

const STATUS_LABEL: Record<string, string> = { queued: "Sending…", sent: "Sent", delivered: "Delivered", read: "Read", failed: "Not sent", logged: "", received: "" };
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

function replyHint(channel: InboxChannelKey, data: ThreadData, connected: string[]) {
  const c = data.conversation;
  switch (channel) {
    case "livechat":
      return c.contactEmail ? `Shows in their chat window. If they've left your store, it's emailed to ${c.contactEmail}.` : "Shows in their chat window on your store.";
    case "form":
      return c.contactEmail ? `Sent by email to ${c.contactEmail}.` : c.contactPhone && connected.includes("sms") ? `Sent by SMS to ${c.contactPhone}.` : "They didn't leave an email, so you can't reply here.";
    case "email":
      return `Sent by email to ${c.contactEmail ?? "them"}.`;
    case "voice":
      return connected.includes("sms") ? `Sent by SMS to ${c.contactPhone ?? "the caller"}.` : "Connect SMS to text callers back, or call them.";
    case "tiktok":
      return "TikTok doesn't let apps reply yet. Reply in the TikTok app.";
    default:
      return connected.includes(channel) ? `Sent on ${CHANNELS[channel].label}.` : `${CHANNELS[channel].label} isn't connected, so replies can't be sent.`;
  }
}

function Attachments({ message }: { message: InboxThreadMessage }) {
  if (!message.attachments.length) return null;
  return (
    <div className="mt-2 grid gap-1.5">
      {message.attachments.map((attachment, index) => {
        const href = `/api/app/inbox/media/${message.id}/${index}`;
        if (attachment.type === "audio" || attachment.contentType?.startsWith("audio/")) {
          return <audio key={index} controls preload="none" src={href} className="w-full max-w-[280px]" aria-label={attachment.name ?? "Voice message"} />;
        }
        return (
          <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-bold underline">
            <Icon name={attachment.type === "image" ? "image" : "paperclip"} size={14} />
            {attachment.name || (attachment.type === "image" ? "Photo" : attachment.type === "video" ? "Video" : "Attachment")}
          </a>
        );
      })}
    </div>
  );
}

function MessageBubble({ message }: { message: InboxThreadMessage }) {
  if (message.direction === "note") {
    return (
      <div className="mx-auto w-full max-w-[560px] rounded-[16px] border border-[#F2D58A] bg-[#FFF8E6] px-3.5 py-2.5 text-[13.5px]">
        <div className="mb-0.5 flex items-center gap-1.5 text-[12px] font-bold text-[#8A5A00]">
          <Icon name={message.kind === "call" ? "phone" : "lock"} size={13} />
          {message.kind === "call" ? "Call" : "Private note"} · {message.authorName ?? "You"} · {formatStamp(message.createdAt)}
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
            {message.kind === "voicemail" ? "Voicemail" : message.kind === "call" ? "Call" : message.kind === "form" ? "Form message" : "Auto-reply"}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{message.body}</div>
        <Attachments message={message} />
        <div className={cx("mt-1 flex justify-end gap-1.5 text-[11px]", mine && message.status !== "failed" ? "text-white/60" : "text-app-ink-faint")}>
          {mine && message.authorName && <span>{message.authorName} ·</span>}
          <span>{formatWhen(message.createdAt)}</span>
          {mine && STATUS_LABEL[message.status] && <span>· {STATUS_LABEL[message.status]}</span>}
        </div>
        {message.status === "failed" && message.error && <div className="mt-1 text-[12.5px] font-semibold text-app-danger">{message.error}</div>}
      </div>
    </div>
  );
}

function CustomerPanel({ data, onOpen, onSaveTags }: { data: ThreadData; onOpen: (id: string) => void; onSaveTags: (tags: string[]) => void }) {
  const c = data.conversation;
  const [tag, setTag] = useState("");
  return (
    <div className="grid content-start gap-4 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Avatar name={c.name} size={48} />
        <div className="min-w-0">
          <h3 className="m-0 truncate text-[16px] font-extrabold">{c.name}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-app-ink-soft"><ChannelMark channel={c.channel} size={18} /> {c.channelLabel}</div>
        </div>
      </div>
      <dl className="m-0 grid gap-2 text-[13.5px]">
        {c.contactEmail && <div className="flex min-w-0 gap-2"><dt className="sr-only">Email</dt><Icon name="mail" size={15} className="mt-0.5 shrink-0 text-app-ink-soft" /><dd className="m-0 min-w-0 break-all">{c.contactEmail}</dd></div>}
        {c.contactPhone && <div className="flex min-w-0 gap-2"><dt className="sr-only">Phone</dt><Icon name="phone" size={15} className="mt-0.5 shrink-0 text-app-ink-soft" /><dd className="m-0"><a href={`tel:${c.contactPhone}`} className="text-app-ink">{c.contactPhone}</a></dd></div>}
        {c.contactHandle && <div className="flex min-w-0 gap-2"><dt className="sr-only">Handle</dt><Icon name="user" size={15} className="mt-0.5 shrink-0 text-app-ink-soft" /><dd className="m-0 truncate">{c.contactHandle}</dd></div>}
        <div className="flex gap-2 text-app-ink-soft"><dt className="sr-only">First message</dt><Icon name="calendar" size={15} className="mt-0.5 shrink-0" /><dd className="m-0">First message {formatStamp(c.createdAt)}</dd></div>
      </dl>

      <section aria-label="Orders" className="rounded-[18px] bg-app-canvas p-3.5">
        {data.customer.matched ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div><div className="text-[12px] text-app-ink-soft">Total spent</div><div className="text-[18px] font-extrabold">{naira(data.customer.totalSpent)}</div></div>
              <div><div className="text-[12px] text-app-ink-soft">Orders</div><div className="text-[18px] font-extrabold">{data.customer.orderCount}</div></div>
            </div>
            <ul className="m-0 mt-3 grid list-none gap-1.5 p-0">
              {data.customer.orders.map((order) => (
                <li key={order.id}>
                  <Link href={`/home/orders/${order.id}`} className="flex items-center justify-between gap-2 rounded-[12px] bg-white px-3 py-2 text-[13px] text-app-ink no-underline hover:ring-1 hover:ring-app-line-strong">
                    <span className="min-w-0 truncate font-bold">#{order.orderNumber}</span>
                    <span className="shrink-0 text-app-ink-soft">{order.status.replace(/_/g, " ")} · {naira(order.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="m-0 text-[13px] text-app-ink-soft">
            {c.contactEmail || c.contactPhone ? "No orders from this email or phone yet." : "No email or phone yet, so we can't match their orders."}
          </p>
        )}
      </section>

      <section aria-label="Tags">
        <h4 className="m-0 mb-2 text-[13px] font-extrabold">Tags</h4>
        <div className="flex flex-wrap gap-1.5">
          {c.tags.map((t) => (
            <button key={t} type="button" onClick={() => onSaveTags(c.tags.filter((x) => x !== t))} className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-app-canvas px-2.5 text-[12.5px] font-bold" aria-label={`Remove tag ${t}`}>
              {t} <Icon name="x" size={12} />
            </button>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (tag.trim()) onSaveTags([...c.tags, tag.trim()]);
              setTag("");
            }}
          >
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add tag" aria-label="Add a tag" maxLength={30} className="h-[30px] w-[110px] rounded-full border border-app-line px-3 text-[13px] outline-none focus:border-app-ink" />
          </form>
        </div>
      </section>

      {data.related.length > 0 && (
        <section aria-label="Other conversations">
          <h4 className="m-0 mb-2 text-[13px] font-extrabold">Also talked on</h4>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {data.related.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="flex w-full items-center gap-2 rounded-[12px] border border-app-line px-3 py-2 text-left text-[13px] hover:bg-app-canvas">
                  <ChannelMark channel={r.channel as InboxChannelKey} size={20} />
                  <span className="min-w-0 flex-1 truncate">{r.preview || channelLabel(r.channel as InboxChannelKey)}</span>
                  <span className="shrink-0 text-[12px] text-app-ink-soft">{formatWhen(r.at)}</span>
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
      setMessage({ tone: "ok", text: mode === "click" ? "Your phone will ring now. Pick up and we'll connect you." : "Call saved to the conversation." });
      onDone();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const input = "h-11 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";
  return (
    <div className="border-b border-app-line bg-app-canvas/60 px-3 py-3 sm:px-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        {voiceOn && phone ? (
          <Segmented options={[{ value: "click", label: "Call now" }, { value: "log", label: "Log a call" }]} value={mode} onChange={setMode} />
        ) : (
          <span className="text-[14px] font-extrabold">Log a call</span>
        )}
        <button type="button" onClick={onClose} aria-label="Close calls" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white"><Icon name="x" size={16} /></button>
      </div>
      {mode === "click" ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="text-[13px] font-bold">Your phone (we ring you first)
            <input value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} type="tel" placeholder="+2348012345678" className={cx(input, "mt-1")} />
          </label>
          <PillButton size="md" busy={busy} onClick={() => void submit()}><Icon name="phone" size={15} /> Call {phone}</PillButton>
        </div>
      ) : (
        <div className="grid gap-2">
          {!voiceOn && <p className="m-0 text-[12.5px] text-app-ink-soft">Connect Phone calls in Channels to call from here. Meanwhile, write down calls you make from your phone.</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} aria-label="Who called" className={input}>
              <option value="outgoing">I called them</option>
              <option value="incoming">They called me</option>
            </select>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} aria-label="What happened" className={input}>
              <option value="answered">Answered</option>
              <option value="missed">No answer</option>
              <option value="voicemail">Left a voicemail</option>
            </select>
            <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Minutes" aria-label="How many minutes" className={input} />
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="What was said" aria-label="Call notes" className="w-full rounded-[14px] border border-app-line bg-white px-3 py-2 text-[15px] outline-none focus:border-app-ink" />
          <div><PillButton size="sm" busy={busy} onClick={() => void submit()}>Save call</PillButton></div>
        </div>
      )}
      {message && <p role={message.tone === "error" ? "alert" : "status"} className={cx("m-0 mt-2 text-[13px] font-semibold", message.tone === "error" ? "text-app-danger" : "text-app-success")}>{message.text}</p>}
    </div>
  );
}

export function InboxThread({ conversationId, me, team, canned, connected, aiAvailable, onBack, onChanged, onOpen }: ThreadProps) {
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
      setLoadError((error as Error).message);
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
      setNotice({ tone: "error", text: (error as Error).message });
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
      setNotice({ tone: "error", text: (error as Error).message });
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
      setNotice({ tone: "ok", text: "Peggy wrote a reply. Check it, edit it, then send." });
    } catch (error) {
      setNotice({ tone: "error", text: (error as Error).message });
    } finally {
      setSuggesting(false);
    }
  }

  if (!data) {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center text-[14px] text-app-ink-soft">
        {loadError ? <p role="alert" className="m-0">{loadError}</p> : <p className="m-0">Loading conversation…</p>}
      </div>
    );
  }

  const c = data.conversation;
  const channel = c.channel;
  const canReply = CHANNELS[channel].replies && !(channel === "form" && !c.contactEmail && !(c.contactPhone && connected.includes("sms"))) && !(channel === "voice" && !connected.includes("sms")) && (["livechat", "form", "email", "voice"].includes(channel) || connected.includes(channel));
  const windowClosed = META_WINDOW.includes(channel) && c.lastInboundAt && Date.now() - new Date(c.lastInboundAt).getTime() > 24 * 3_600_000;
  const phone = c.contactPhone;

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-app-line px-3 py-2.5 sm:px-5">
          <button type="button" onClick={onBack} aria-label="Back to conversations" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas lg:hidden">
            <Icon name="arrowLeft" size={18} />
          </button>
          <ChannelMark channel={channel} size={34} />
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-[15px] font-extrabold">{c.name}</h2>
            <div className="truncate text-[12.5px] text-app-ink-soft">{c.channelLabel}{c.subject ? ` · ${c.subject}` : ""}</div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setShowCall((v) => !v)} aria-label={phone ? "Call" : "Log a call"} aria-expanded={showCall} className="grid h-10 w-10 place-items-center rounded-full border border-app-line hover:border-app-line-strong">
              <Icon name="phone" size={16} />
            </button>
            <label className="sr-only" htmlFor={`assign-${c.id}`}>Assigned to</label>
            <select
              id={`assign-${c.id}`}
              value={c.assigneeEmail ?? ""}
              onChange={(e) => void patch({ assigneeEmail: e.target.value || null }, e.target.value ? "Assigned." : "Unassigned.")}
              className="h-10 max-w-[150px] rounded-full border border-app-line bg-white px-3 text-[13px] font-bold outline-none focus:border-app-ink"
            >
              <option value="">Unassigned</option>
              {team.map((member) => <option key={member.email} value={member.email}>{member.label}</option>)}
            </select>
            {c.status === "closed" ? (
              <PillButton size="sm" tone="white" onClick={() => void patch({ status: "open" }, "Reopened.")}>Reopen</PillButton>
            ) : (
              <>
                <label className="sr-only" htmlFor={`snooze-${c.id}`}>Snooze</label>
                <select
                  id={`snooze-${c.id}`}
                  value=""
                  onChange={(e) => e.target.value && void patch({ status: "snoozed", snoozeHours: Number(e.target.value) }, "Snoozed. It comes back to Open on time.")}
                  className="h-10 rounded-full border border-app-line bg-white px-3 text-[13px] font-bold outline-none focus:border-app-ink"
                >
                  <option value="">{c.status === "snoozed" && c.snoozedUntil ? `Snoozed to ${formatStamp(c.snoozedUntil)}` : "Snooze"}</option>
                  {SNOOZE.map((s) => <option key={s.hours} value={s.hours}>{s.label}</option>)}
                </select>
                <PillButton size="sm" onClick={() => void patch({ status: "closed" }, "Closed.")}><Icon name="check" size={14} /> Close</PillButton>
              </>
            )}
            <button type="button" onClick={() => setShowInfo((v) => !v)} aria-label="Customer details" aria-expanded={showInfo} className="grid h-10 w-10 place-items-center rounded-full border border-app-line hover:border-app-line-strong 2xl:hidden">
              <Icon name="user" size={16} />
            </button>
          </div>
        </header>

        {showCall && <CallPanel conversationId={c.id} phone={phone} voiceOn={connected.includes("voice")} defaultPhone={me.phone} onDone={() => void load()} onClose={() => setShowCall(false)} />}

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-app-canvas/50 px-3 py-4 sm:px-5" aria-live="polite">
          {data.messages.map((message) => <MessageBubble key={message.id} message={message} />)}
          <div ref={endRef} />
        </div>

        <div className="border-t border-app-line px-3 py-2.5 sm:px-5">
          {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={cx("m-0 mb-2 text-[13px] font-semibold", notice.tone === "error" ? "text-app-danger" : "text-app-success")}>{notice.text}</p>}
          {windowClosed && mode === "reply" && (
            <p className="m-0 mb-2 rounded-[12px] bg-[#FDF0D5] px-3 py-2 text-[12.5px] text-[#8A5A00]">
              It's been more than 24 hours since they last wrote. {CHANNELS[channel].label} only delivers replies within 24 hours of the customer's last message, so this may not go through.
            </p>
          )}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Segmented options={[{ value: "reply", label: "Reply" }, { value: "note", label: "Private note" }]} value={mode} onChange={setMode} />
            <div className="relative">
              <button type="button" onClick={() => setShowCanned((v) => !v)} aria-expanded={showCanned} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-app-line px-3 text-[13px] font-bold hover:border-app-line-strong">
                <Icon name="list" size={14} /> Saved replies
              </button>
              {showCanned && (
                <div className="absolute bottom-[44px] left-0 z-20 w-[min(320px,80vw)] rounded-[16px] border border-app-line bg-white p-2 shadow-lg">
                  {canned.length === 0 ? (
                    <p className="m-0 p-2 text-[13px] text-app-ink-soft">No saved replies yet. <Link href="/home/inbox/settings" className="font-bold text-app-ink">Add some</Link>.</p>
                  ) : (
                    <ul className="m-0 max-h-[260px] list-none overflow-y-auto p-0">
                      {canned.map((reply) => (
                        <li key={reply.id}>
                          <button type="button" onClick={() => { setText((t) => (t ? `${t}\n${reply.body}` : reply.body)); setShowCanned(false); }} className="w-full rounded-[10px] px-2.5 py-2 text-left hover:bg-app-canvas">
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
                <Icon name="sparkle" size={14} /> {suggesting ? "Peggy is writing…" : "Peggy, suggest a reply"}
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
              aria-label={mode === "note" ? "Private note" : `Reply to ${c.name}`}
              placeholder={mode === "note" ? "Only your team sees notes" : canReply ? "Write a reply" : "Replies can't be sent on this channel"}
              className={cx("min-h-[48px] min-w-0 flex-1 resize-y rounded-[18px] border px-4 py-2.5 text-[16px] outline-none placeholder:text-app-ink-faint focus:border-app-ink sm:text-[15px]", mode === "note" ? "border-[#F2D58A] bg-[#FFF8E6]" : "border-app-line bg-white")}
            />
            <button type="submit" disabled={sending || !text.trim() || (mode === "reply" && !canReply)} aria-label={mode === "note" ? "Save note" : "Send reply"} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-accent text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
              <Icon name={mode === "note" ? "check" : "send"} size={18} />
            </button>
          </form>
          <p className="m-0 mt-1.5 text-[12px] text-app-ink-soft">{mode === "note" ? "Saved to the conversation for your team. The customer never sees it." : replyHint(channel, data, connected)}</p>
        </div>
      </div>

      <aside
        aria-label="Customer"
        className={cx(
          "min-h-0 w-full shrink-0 overflow-y-auto border-app-line bg-white 2xl:block 2xl:w-[320px] 2xl:border-l",
          showInfo ? "fixed inset-0 z-40 block sm:static sm:inset-auto sm:z-auto sm:w-[320px] sm:border-l" : "hidden",
        )}
      >
        <div className="flex items-center justify-between border-b border-app-line px-4 py-2.5 2xl:hidden">
          <span className="text-[14px] font-extrabold">Customer</span>
          <button type="button" onClick={() => setShowInfo(false)} aria-label="Close customer details" className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas"><Icon name="x" size={16} /></button>
        </div>
        <CustomerPanel data={data} onOpen={onOpen} onSaveTags={(tags) => void patch({ tags })} />
      </aside>
    </div>
  );
}
