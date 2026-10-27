"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import {
  MAX_ATTACHMENTS,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  TOPICS,
  attachmentProblem,
  fillMacro,
  type SupportStatus,
} from "@/lib/support/pure";
import { whatsappWindowHoursLeft, whatsappWindowOpen } from "@/lib/support/whatsapp-pure";
import { formatBytes } from "../client";
import { deskSelect, relativeTime } from "./ui";

// One ticket in the support desk: the full thread (with internal notes and the customer's Peggy chat),
// the reply/note composer with saved replies and files, and the ticket's properties. Refreshes every 15s.

export interface DeskTicket {
  id: string;
  number: number;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string;
  topic: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  /** Where it started: app | web | email | whatsapp. WhatsApp conversations are answered on WhatsApp. */
  source: string;
  /** Their last message, for WhatsApp's 24-hour reply window. */
  lastUserMessageAt: string | null;
}

export interface DeskMessage {
  id: string;
  authorType: "user" | "agent" | "ai" | "system";
  authorName: string | null;
  body: string;
  internal: boolean;
  channel: string;
  attachments: Array<{ name: string; type: string; size: number; url: string }>;
  createdAt: string;
  deliveryStatus?: string | null;
  deliveryError?: string | null;
}

export interface DeskMacro {
  id: string;
  title: string;
  body: string;
  status: string | null;
  starter?: boolean;
}

async function send(url: string, init: RequestInit) {
  const response = await fetch(url, init).catch(() => null);
  if (response?.ok) return null;
  const json = (await response?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return json?.error?.message ?? "That didn't save. Try again.";
}

export function TicketWorkspace({
  ticket,
  messages,
  transcript,
  macros,
  admins,
  me,
  now,
  side,
}: {
  ticket: DeskTicket;
  messages: DeskMessage[];
  transcript: Array<{ role: string; content: string }>;
  macros: DeskMacro[];
  admins: Array<{ id: string; name: string }>;
  me: { id: string; name: string };
  now: number;
  side: ReactNode;
}) {
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  return (
    <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_360px]">
      <div className="grid min-w-0 content-start gap-4">
        <section aria-label="Conversation" className="rounded-[22px] border border-app-line bg-white">
          {transcript.length > 0 && (
            <details className="border-b border-app-line px-4 py-3 sm:px-5">
              <summary className="cursor-pointer text-[13px] font-bold text-app-ink-soft">Their chat with Peggy before asking for a person ({transcript.length} messages)</summary>
              <div className="mt-3 grid gap-2">
                {transcript.map((line, index) => (
                  <p key={index} className="m-0 text-[13px] leading-[1.5]">
                    <b>{line.role === "assistant" ? "Peggy" : ticket.name.split(" ")[0]}:</b> {line.content}
                  </p>
                ))}
              </div>
            </details>
          )}
          <ol className="m-0 grid list-none gap-4 p-4 sm:p-5">
            {messages.map((message) => (
              <ThreadItem key={message.id} message={message} customer={ticket.name} now={now} />
            ))}
          </ol>
          <div ref={endRef} />
        </section>
        <Composer ticket={ticket} macros={macros} me={me} now={now} />
      </div>
      <div className="grid min-w-0 content-start gap-4">
        <Properties ticket={ticket} me={me} admins={admins} />
        {side}
      </div>
    </div>
  );
}

function ThreadItem({ message, customer, now }: { message: DeskMessage; customer: string; now: number }) {
  if (message.authorType === "system") {
    return (
      <li className="flex items-center gap-2 text-[12px] text-app-ink-faint">
        <span className="h-px flex-1 bg-app-line" />
        {message.body} · {relativeTime(message.createdAt, now)}
        <span className="h-px flex-1 bg-app-line" />
      </li>
    );
  }
  const fromCustomer = message.authorType === "user";
  const name = fromCustomer ? message.authorName ?? customer : message.authorType === "ai" ? "Peggy" : message.authorName ?? "Support";
  return (
    <li className={cx("rounded-[18px] px-4 py-3", message.internal ? "border border-[#F2D59B] bg-[#FFF8E6]" : fromCustomer ? "bg-app-canvas" : "border border-app-line bg-white")}>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
        <span className={cx("grid h-6 w-6 place-items-center rounded-full text-[11px] font-extrabold", fromCustomer ? "bg-app-ink text-white" : "bg-app-forest text-white")} aria-hidden>
          {name.slice(0, 1).toUpperCase()}
        </span>
        <b className="text-app-ink">{name}</b>
        {message.internal ? (
          <span className="rounded-full bg-[#FDF0D5] px-2 py-0.5 text-[11px] font-bold text-[#8A5A00]">Internal note</span>
        ) : !fromCustomer ? (
          <span className="text-app-ink-soft">replied</span>
        ) : null}
        <span className="text-app-ink-faint">
          {relativeTime(message.createdAt, now)}
          {message.channel === "email" ? " · by email" : message.channel === "web" ? " · Stuck? form" : message.channel === "whatsapp" ? " · WhatsApp" : ""}
        </span>
        {!fromCustomer && message.deliveryStatus && (
          <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold", message.deliveryStatus === "failed" ? "bg-app-danger-tint text-app-danger" : message.deliveryStatus === "read" ? "bg-app-success-tint text-app-success" : "bg-app-canvas text-app-ink-soft")}>
            {message.deliveryStatus === "read" ? "✓✓ Read" : message.deliveryStatus === "delivered" ? "✓✓ Delivered" : message.deliveryStatus === "failed" ? "Not delivered" : "✓ Sent"}
          </span>
        )}
      </div>
      {message.body && <div className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.55] text-app-ink">{message.body}</div>}
      {message.deliveryStatus === "failed" && message.deliveryError && <p className="m-0 mt-1.5 text-[12.5px] font-semibold text-app-danger">WhatsApp: {message.deliveryError}</p>}
      {message.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {message.attachments.map((file) =>
            file.type.startsWith("image/") ? (
              <a key={file.url} href={file.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-[12px] border border-app-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.url} alt={file.name} className="h-[120px] w-auto max-w-[220px] object-cover" loading="lazy" />
              </a>
            ) : file.type.startsWith("audio/") ? (
              <div key={file.url} className="flex flex-col gap-1 rounded-[12px] border border-app-line bg-white px-3 py-2">
                <audio controls preload="none" src={file.url} className="h-9 w-[260px] max-w-full" />
                <AttachmentLink file={file} />
              </div>
            ) : file.type.startsWith("video/") ? (
              <div key={file.url} className="flex flex-col gap-1 overflow-hidden rounded-[12px] border border-app-line bg-white">
                <video controls preload="metadata" src={file.url} className="max-h-[260px] w-[320px] max-w-full bg-black" />
                <div className="px-3 pb-2">
                  <AttachmentLink file={file} />
                </div>
              </div>
            ) : (
              <a key={file.url} href={file.url} target="_blank" rel="noopener noreferrer" download={file.name} className="inline-flex items-center gap-2 rounded-[12px] border border-app-line bg-white px-3 py-2 text-[13px] font-semibold text-app-ink no-underline hover:border-app-line-strong">
                <Icon name="file" size={14} /> {file.name}
                {file.size > 0 && <span className="font-normal text-app-ink-soft">· {formatBytes(file.size)}</span>}
              </a>
            ),
          )}
        </div>
      )}
    </li>
  );
}

/** Open or download a voice note or video under its player. */
function AttachmentLink({ file }: { file: { name: string; size: number; url: string } }) {
  return (
    <a href={file.url} target="_blank" rel="noopener noreferrer" download={file.name} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-app-ink-soft no-underline hover:text-app-ink">
      <Icon name="file" size={12} /> {file.name}
      {file.size > 0 && <span className="font-normal">· {formatBytes(file.size)}</span>}
    </a>
  );
}

function Composer({ ticket, macros, me, now }: { ticket: DeskTicket; macros: DeskMacro[]; me: { id: string; name: string }; now: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [after, setAfter] = useState<SupportStatus | "">("pending");
  const [macroId, setMacroId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [asPeggy, setAsPeggy] = useState(false);
  const [peggyAsk, setPeggyAsk] = useState("");
  const [peggyNote, setPeggyNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [drafting, startDrafting] = useTransition();
  const draftKey = `support-draft-${ticket.number}`;

  // Peggy writes the reply from the whole conversation and what Shopinbos offers today; the team reads and sends.
  const draftWithPeggy = () =>
    startDrafting(async () => {
      setError(null);
      setPeggyNote(null);
      const response = await fetch(`/api/admin/support/tickets/${ticket.id}/peggy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction: peggyAsk.trim() || undefined }) }).catch(() => null);
      const json = (await response?.json().catch(() => null)) as { data?: { reply: string; needsHuman: boolean; note: string }; error?: { message?: string } } | null;
      if (!response?.ok || !json?.data) return setError(json?.error?.message ?? "Peggy couldn't write a reply just now. Try again.");
      setMode("reply");
      setText(json.data.reply);
      setAsPeggy(true);
      setMacroId(null);
      if (json.data.needsHuman || json.data.note) setPeggyNote({ text: json.data.needsHuman ? `Peggy thinks a person should check this${json.data.note ? `: ${json.data.note}` : "."}` : json.data.note, warn: json.data.needsHuman });
    });

  // Unsent drafts survive the 15-second refresh and a page reload.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) setText(saved);
    } catch {
      // Storage blocked: no draft memory.
    }
  }, [draftKey]);
  useEffect(() => {
    try {
      if (text) window.localStorage.setItem(draftKey, text);
      else window.localStorage.removeItem(draftKey);
    } catch {
      // Storage blocked.
    }
  }, [draftKey, text]);

  const applyMacro = (id: string) => {
    const macro = macros.find((item) => item.id === id);
    if (!macro) return;
    const filled = fillMacro(macro.body, { name: ticket.name, ticket: ticket.number, agent: me.name });
    setText((current) => (current.trim() ? `${current.trimEnd()}\n\n${filled}` : filled));
    setMacroId(macro.starter ? null : macro.id);
    if (macro.status && mode === "reply") setAfter(macro.status as SupportStatus);
  };

  const addFiles = (picked: FileList | null) => {
    setError(null);
    const next = [...files];
    for (const file of Array.from(picked ?? [])) {
      const problem = attachmentProblem(file);
      if (problem) return setError(problem);
      if (next.length >= MAX_ATTACHMENTS) return setError(`Attach up to ${MAX_ATTACHMENTS} files.`);
      next.push(file);
    }
    setFiles(next);
  };

  const submit = () => {
    if (!text.trim() && !files.length) return setError(mode === "note" ? "Write a note first." : "Write a reply first.");
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("message", text.trim());
      form.set("internal", mode === "note" ? "true" : "false");
      if (mode === "reply" && after) form.set("status", after);
      if (macroId) form.set("macroId", macroId);
      if (mode === "reply" && asPeggy) form.set("asPeggy", "true");
      for (const file of files) form.append("files", file);
      const response = await fetch(`/api/admin/support/tickets/${ticket.id}/messages`, { method: "POST", body: form }).catch(() => null);
      const json = (await response?.json().catch(() => null)) as { data?: { delivered?: string }; error?: { message?: string } } | null;
      if (!response?.ok) {
        setError(json?.error?.message ?? "That didn't send. Try again.");
        return;
      }
      const delivered = json?.data?.delivered;
      setNotice(
        mode === "note"
          ? "Note added."
          : delivered === "whatsapp"
            ? "Sent on WhatsApp."
            : delivered === "email"
            ? "Sent. They'll see it in the app and by email."
            : delivered === "sms"
              ? "Sent by SMS. Follow up on WhatsApp if it's urgent."
              : delivered === "app"
                ? "Sent in the app (no email on file)."
                : "Saved, but we have no way to reach them. Use WhatsApp or call.",
      );
      setText("");
      setFiles([]);
      setMacroId(null);
      setAsPeggy(false);
      setPeggyNote(null);
      setPeggyAsk("");
      router.refresh();
    });
  };

  const onWhatsApp = ticket.source === "whatsapp";
  const windowOpen = whatsappWindowOpen(ticket.lastUserMessageAt, now);
  const templateHref = `/admin/support/new?${new URLSearchParams({ channel: "whatsapp", phone: ticket.phone ?? "", name: ticket.name })}`;

  return (
    <section aria-label="Reply" className={cx("rounded-[22px] border bg-white", mode === "note" ? "border-[#F2D59B]" : "border-app-line")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-app-line px-4 py-2.5 sm:px-5">
        <div role="tablist" aria-label="Reply or note" className="flex rounded-full bg-app-canvas p-1">
          {(["reply", "note"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cx("min-h-[32px] rounded-full px-3.5 text-[13px] font-bold", mode === value ? "bg-white text-app-ink shadow-sm" : "text-app-ink-soft")}
            >
              {value === "reply" ? "Reply to customer" : "Internal note"}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="desk-macro">Saved reply</label>
        <select id="desk-macro" className={cx(deskSelect, "min-h-[36px] text-[13px]")} value="" onChange={(e) => applyMacro(e.target.value)}>
          <option value="">Saved replies…</option>
          {macros.map((macro) => <option key={macro.id} value={macro.id}>{macro.title}</option>)}
        </select>
        {ticket.phone && !onWhatsApp && (
          <a href={templateHref} className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-app-line px-3 text-[13px] font-bold text-app-ink no-underline hover:border-app-line-strong">
            <Icon name="whatsapp" size={14} /> Message on WhatsApp
          </a>
        )}
        {onWhatsApp && (
          <span className={cx("ml-auto inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold", windowOpen ? "bg-app-success-tint text-app-success" : "bg-app-canvas text-app-ink-soft")}>
            <Icon name="whatsapp" size={13} /> {windowOpen ? `Reply window: ${whatsappWindowHoursLeft(ticket.lastUserMessageAt, now)}h left` : "Reply window closed"}
          </span>
        )}
      </div>
      <div className="p-4 sm:p-5">
        {mode === "reply" && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[16px] bg-[#EEF7F5] p-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-app-forest text-[13px] font-extrabold text-white" aria-hidden>P</span>
            <label className="sr-only" htmlFor="peggy-ask">What should Peggy say? (optional)</label>
            <input
              id="peggy-ask"
              value={peggyAsk}
              maxLength={600}
              onChange={(e) => setPeggyAsk(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  draftWithPeggy();
                }
              }}
              placeholder="Tell Peggy anything to include (optional), e.g. offer a setup call"
              className="min-h-[38px] min-w-0 flex-1 basis-[220px] rounded-full border border-app-line bg-white px-3.5 text-[13.5px] outline-none placeholder:text-app-ink-faint focus:border-app-ink"
            />
            <button type="button" onClick={draftWithPeggy} disabled={drafting} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-app-forest px-4 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60">
              {drafting ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-r-transparent" /> : <Icon name="sparkle" size={14} />}
              {drafting ? "Peggy is writing…" : text.trim() && asPeggy ? "Rewrite with Peggy" : "Draft with Peggy"}
            </button>
          </div>
        )}
        {peggyNote && mode === "reply" && (
          <p className={cx("m-0 mb-3 rounded-[14px] px-4 py-2.5 text-[13px] font-semibold", peggyNote.warn ? "bg-[#FFF8E6] text-[#8A5A00]" : "bg-app-canvas text-app-ink-soft")}>{peggyNote.text}</p>
        )}
        {onWhatsApp && mode === "reply" && !windowOpen && (
          <p className="m-0 mb-3 rounded-[14px] bg-app-canvas px-4 py-2.5 text-[13.5px] leading-[1.5] text-app-ink">
            WhatsApp only allows free replies within 24 hours of their last message.{" "}
            <a href={templateHref} className="font-bold text-app-ink underline">Send a template</a> to restart the chat; it joins this conversation.
          </p>
        )}
        <label className="sr-only" htmlFor="desk-reply">{mode === "reply" ? "Reply" : "Internal note"}</label>
        <textarea
          id="desk-reply"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={6}
          maxLength={5000}
          placeholder={mode === "reply" ? (onWhatsApp ? `Reply to ${ticket.name.split(" ")[0]} on WhatsApp.` : `Reply to ${ticket.name.split(" ")[0]}. It shows in their app and goes by email.`) : "Only the team sees notes."}
          className={cx("w-full resize-y rounded-[16px] border px-4 py-3 text-[15px] leading-[1.55] outline-none placeholder:text-app-ink-faint focus:border-app-ink", mode === "note" ? "border-[#F2D59B] bg-[#FFFCF3]" : "border-app-line bg-white")}
        />
        {files.length > 0 && (
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-1.5 rounded-full bg-app-canvas py-1 pl-3 pr-1 text-[12.5px]">
                <span className="max-w-[200px] truncate">{file.name}</span>
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, i) => i !== index))} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white">
                  <Icon name="x" size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="m-0 mt-3 rounded-[14px] bg-app-danger-tint px-4 py-2.5 text-[13.5px] font-semibold text-app-danger">{error}</p>}
        {notice && <p role="status" className="m-0 mt-3 rounded-[14px] bg-app-success-tint px-4 py-2.5 text-[13.5px] font-semibold text-app-success">{notice}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!(onWhatsApp && mode === "reply") && <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-app-line-strong px-3.5 text-[13px] font-bold hover:bg-app-canvas focus-within:ring-2 focus-within:ring-app-ink/30">
            <Icon name="paperclip" size={14} /> Attach
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>}
          <span className="flex-1" />
          {mode === "reply" && (
            <>
              <label className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-app-ink-soft">
                <input type="checkbox" checked={asPeggy} onChange={(e) => setAsPeggy(e.target.checked)} className="h-4 w-4 accent-[#16141F]" /> Send as Peggy
              </label>
              <label className="text-[13px] font-semibold text-app-ink-soft" htmlFor="desk-after">Then set</label>
              <select id="desk-after" className={deskSelect} value={after} onChange={(e) => setAfter(e.target.value as SupportStatus | "")}>
                <option value="pending">Waiting on customer</option>
                <option value="solved">Solved</option>
                <option value="open">Open</option>
                <option value="">Leave as is</option>
              </select>
            </>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={cx("inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-[14px] font-bold text-white disabled:opacity-55", mode === "note" ? "bg-[#8A5A00] hover:brightness-110" : "bg-app-accent hover:brightness-95")}
          >
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" /> : <Icon name={mode === "note" ? "edit" : "send"} size={15} />}
            {mode === "note" ? "Add note" : "Send reply"}
          </button>
        </div>
        <p className="m-0 mt-2 text-[12px] text-app-ink-faint">Ctrl/Cmd + Enter sends. Saved replies fill in the customer&apos;s name and ticket number.</p>
      </div>
    </section>
  );
}

function Properties({ ticket, me, admins }: { ticket: DeskTicket; me: { id: string; name: string }; admins: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Record<string, string | null>) => {
    setError(null);
    startTransition(async () => {
      const problem = await send(`/api/admin/support/tickets/${ticket.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (problem) setError(problem);
      else router.refresh();
    });
  };

  return (
    <section aria-label="Ticket" className={cx("rounded-[22px] border border-app-line bg-white p-4 sm:p-5", busy && "opacity-70")}>
      <h2 className="m-0 mb-3 text-[15px] font-extrabold">Ticket</h2>
      <div className="grid gap-3">
        <Field label="Status" htmlFor="ticket-status">
          <select id="ticket-status" className={cx(deskSelect, "w-full")} value={ticket.status} disabled={busy} onChange={(e) => update({ status: e.target.value })}>
            {STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}
          </select>
        </Field>
        <Field label="Priority" htmlFor="ticket-priority">
          <select id="ticket-priority" className={cx(deskSelect, "w-full")} value={ticket.priority} disabled={busy} onChange={(e) => update({ priority: e.target.value })}>
            {[...PRIORITIES].reverse().map((value) => <option key={value} value={value}>{PRIORITY_LABEL[value]}</option>)}
          </select>
        </Field>
        <Field label="Topic" htmlFor="ticket-topic">
          <select id="ticket-topic" className={cx(deskSelect, "w-full")} value={ticket.topic} disabled={busy} onChange={(e) => update({ topic: e.target.value })}>
            {TOPICS.map((topic) => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
          </select>
        </Field>
        <Field label="Assignee" htmlFor="ticket-assignee">
          <div className="flex gap-2">
            <select id="ticket-assignee" className={cx(deskSelect, "min-w-0 flex-1")} value={ticket.assigneeId ?? ""} disabled={busy} onChange={(e) => update({ assigneeId: e.target.value || null })}>
              <option value="">Unassigned</option>
              {admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.id === me.id ? `${admin.name} (you)` : admin.name}</option>)}
            </select>
            {ticket.assigneeId !== me.id && (
              <button type="button" disabled={busy} onClick={() => update({ assigneeId: "me" })} className="min-h-[40px] shrink-0 rounded-full bg-app-ink px-3.5 text-[13px] font-bold text-white hover:bg-black">
                Take it
              </button>
            )}
          </div>
        </Field>
      </div>
      {error && <p role="alert" className="m-0 mt-3 text-[13px] font-semibold text-app-danger">{error}</p>}
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-[12px] font-extrabold uppercase tracking-[0.06em] text-app-ink-soft">{label}</label>
      {children}
    </div>
  );
}
