"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { Mascot, Notice, cx } from "@/components/app-ui";
import { SupportThread } from "@/components/support/SupportThread";
import { supportFetch, timeLabel, type ChatTicket, type ChatTicketSummary } from "@/components/support/client";
import { MAX_ATTACHMENTS, STATUS_LABEL, SUPPORT_EMAIL, TOPICS, attachmentProblem, formatTicketNumber, parseTicketNumber, type SupportTopic } from "@/lib/support/pure";

const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");

// The in-app help panel (all portals): Peggy answers how-to questions first when AI is on, "Talk to a person"
// opens a ticket with the support team straight away, and replies arrive here live (polled), by email and in
// notifications. A badge appears when the team has replied and the panel is closed; ?support=1042 opens a ticket.

interface SupportChatModalProps {
  open: boolean;
  onClose: () => void;
}

type View = "home" | "peggy" | "person" | "thread";
type PeggyLine = { role: "agent" | "user"; text: string };

const GREETING: PeggyLine = { role: "agent", text: "Hi! Ask me how to do anything in Shopinbos: building your store, products, orders, payments or delivery. For account problems, tap \"Talk to a person\"." };
const UNREAD_POLL_MS = 60_000;

export function SupportChatModal({ open, onClose }: SupportChatModalProps) {
  // The panel can also open itself: from the unread badge or a ?support= link in an email.
  const [selfOpen, setSelfOpen] = useState(false);
  const isOpen = open || selfOpen;
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [view, setView] = useState<View>("home");
  const [tickets, setTickets] = useState<ChatTicketSummary[] | null>(null);
  const [ready, setReady] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [active, setActive] = useState<ChatTicket | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiOff, setAiOff] = useState(false);
  const [peggy, setPeggy] = useState<PeggyLine[]>([GREETING]);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setSelfOpen(false);
    onClose();
  }, [onClose]);

  const loadTickets = useCallback(async () => {
    try {
      const data = await supportFetch<{ tickets: ChatTicketSummary[]; unread: number; ready: boolean; role: string }>("/api/support/tickets");
      setTickets(data.tickets);
      setUnread(data.unread);
      setReady(data.ready);
      setRole(data.role);
      setLoadError(null);
    } catch (error) {
      setTickets((current) => current ?? []);
      setLoadError(error instanceof Error ? error.message : "We couldn't load your conversations.");
    }
  }, []);

  const openTicket = useCallback(async (number: number) => {
    setLoadError(null);
    try {
      const ticket = await supportFetch<ChatTicket>(`/api/support/tickets/${number}`);
      setActive(ticket);
      setView("thread");
      setTickets((current) => current?.map((row) => (row.number === number ? { ...row, unread: false } : row)) ?? current);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "We couldn't open that conversation.");
      setView("home");
    }
  }, []);

  // ?support=1042 (from a reply email or notification) opens that conversation once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const number = parseTicketNumber(params.get("support"));
    if (!number) return;
    params.delete("support");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    setSelfOpen(true);
    void openTicket(number);
  }, [openTicket]);

  // Unread badge while closed: a light poll, only when the tab is visible.
  useEffect(() => {
    if (isOpen) return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const data = await supportFetch<{ unread: number }>("/api/support/unread");
        if (!stopped) setUnread(data.unread);
      } catch {
        // Signed out, offline or not set up yet: no badge.
      }
    };
    const first = window.setTimeout(check, 4000);
    const timer = window.setInterval(check, UNREAD_POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
      void loadTickets();
      window.setTimeout(() => panelRef.current?.focus(), 50);
    } else {
      setVisible(false);
      const timer = setTimeout(() => {
        setMounted(false);
        setView("home");
        setActive(null);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, loadTickets]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, close]);

  const onThreadChange = useCallback((ticket: ChatTicket) => setActive(ticket), []);

  const goHome = () => {
    setView("home");
    setActive(null);
    void loadTickets();
  };

  if (!mounted) {
    return unread > 0 ? (
      <button
        type="button"
        onClick={() => {
          setSelfOpen(true);
        }}
        className="fixed bottom-4 right-4 z-40 flex min-h-[48px] items-center gap-2.5 rounded-full bg-app-ink py-2 pl-2 pr-4 font-app text-[14px] font-bold text-white shadow-[0_12px_30px_-10px_rgba(22,20,31,0.6)] transition hover:bg-black"
      >
        <span className="relative">
          <Mascot name="peggy" className="h-8 w-8" alt="" />
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-app-accent px-1 text-[11px] font-extrabold">{unread}</span>
        </span>
        Support replied
      </button>
    ) : null;
  }

  const title = view === "thread" && active ? active.subject : view === "peggy" ? "Ask Peggy" : view === "person" ? "Talk to a person" : "Need help?";
  const subtitle =
    view === "thread" && active
      ? `${formatTicketNumber(active.number)} · ${STATUS_LABEL[active.status]}`
      : view === "peggy"
        ? "AI help assistant · a person is one tap away"
        : "A real person replies, in English or Pidgin";

  return (
    <div className="fixed inset-0 z-50 font-app text-app-ink">
      <div
        onClick={close}
        aria-hidden
        className="absolute inset-0 bg-[rgba(22,20,31,0.35)]"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease-out" }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute bottom-0 right-0 flex h-full w-full flex-col bg-white shadow-[0_0_60px_-20px_rgba(22,20,31,0.5)] outline-none sm:w-[420px] sm:border-l sm:border-app-line"
        style={{ transform: visible ? "translateX(0)" : "translateX(100%)", transition: "transform 200ms ease-out" }}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-app-line px-4 py-3.5">
          {view !== "home" ? (
            <button type="button" onClick={goHome} aria-label="Back to help" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-canvas text-app-ink hover:bg-app-lilac">
              <Icon name="arrowLeft" size={16} />
            </button>
          ) : (
            <Mascot name="peggy" className="h-9 w-9 shrink-0" alt="" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-[15px] font-extrabold">{title}</h2>
            <div className="truncate text-[12px] text-app-ink-soft">{subtitle}</div>
          </div>
          <button type="button" onClick={close} aria-label="Close help" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-canvas text-app-ink-soft hover:text-app-ink">
            <Icon name="x" size={14} />
          </button>
        </div>

        {view === "home" && (
          <Home
            tickets={tickets}
            ready={ready}
            role={role}
            aiOff={aiOff}
            error={loadError}
            onPeggy={() => setView("peggy")}
            onPerson={() => setView("person")}
            onOpen={(number) => void openTicket(number)}
          />
        )}
        {view === "peggy" && (
          <Peggy
            lines={peggy}
            setLines={setPeggy}
            onAiOff={() => {
              setAiOff(true);
              setView("person");
            }}
            onPerson={() => setView("person")}
          />
        )}
        {view === "person" && (
          ready ? (
            <NewTicket
              peggy={peggy}
              onCreated={(ticket) => {
                setActive(ticket);
                setView("thread");
                setPeggy([GREETING]);
              }}
            />
          ) : (
            <Fallback />
          )
        )}
        {view === "thread" && active && <SupportThread initial={active} onChange={onThreadChange} />}
      </div>
    </div>
  );
}

function Home({
  tickets,
  ready,
  role,
  aiOff,
  error,
  onPeggy,
  onPerson,
  onOpen,
}: {
  tickets: ChatTicketSummary[] | null;
  ready: boolean;
  role: string | null;
  aiOff: boolean;
  error: string | null;
  onPeggy: () => void;
  onPerson: () => void;
  onOpen: (number: number) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
      {role === "admin" && (
        <div className="mb-4 rounded-[16px] bg-app-lilac px-4 py-3 text-[13.5px] leading-[1.45]">
          You&apos;re on the support team.{" "}
          <Link href="/admin/support" className="font-bold text-app-ink underline">
            Open the support desk
          </Link>
        </div>
      )}
      <div className="grid gap-2.5">
        {!aiOff && (
          <button type="button" onClick={onPeggy} className="flex items-center gap-3 rounded-[18px] border border-app-line bg-white px-4 py-3.5 text-left transition hover:border-app-line-strong">
            <Mascot name="peggy" className="h-10 w-10 shrink-0" alt="" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-extrabold">Ask Peggy</span>
              <span className="block text-[12.5px] text-app-ink-soft">Instant answers on how to do things in Shopinbos</span>
            </span>
            <Icon name="chevron" size={14} />
          </button>
        )}
        <button type="button" onClick={onPerson} className="flex items-center gap-3 rounded-[18px] bg-app-forest px-4 py-3.5 text-left text-white transition hover:brightness-110">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15">
            <Icon name="chat" size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-extrabold">Talk to a person</span>
            <span className="block text-[12.5px] text-white/75">{ready ? "Usually replies within an hour" : "WhatsApp or email the team"}</span>
          </span>
          <Icon name="chevron" size={14} />
        </button>
      </div>

      {error && <div className="mt-4"><Notice>{error}</Notice></div>}

      {ready && (
        <section aria-label="Your conversations" className="mt-6">
          <h3 className="m-0 mb-2 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">Your conversations</h3>
          {tickets === null ? (
            <div className="grid gap-2">
              {[0, 1].map((key) => <div key={key} className="h-[62px] animate-pulse rounded-[14px] bg-app-canvas" />)}
            </div>
          ) : tickets.length === 0 ? (
            <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[13px] text-app-ink-soft">No conversations yet. When you talk to the team, they&apos;ll show up here.</p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <button type="button" onClick={() => onOpen(ticket.number)} className="flex w-full items-start gap-3 rounded-[14px] px-3 py-2.5 text-left hover:bg-app-canvas">
                    <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", ticket.unread ? "bg-app-accent" : "bg-transparent")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={cx("min-w-0 flex-1 truncate text-[14px]", ticket.unread ? "font-extrabold" : "font-bold")}>{ticket.subject}</span>
                        <span className="shrink-0 text-[11px] text-app-ink-faint">{timeLabel(ticket.lastMessageAt)}</span>
                      </span>
                      <span className="block truncate text-[12.5px] text-app-ink-soft">{ticket.preview}</span>
                      <span className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-app-ink-faint">
                        {formatTicketNumber(ticket.number)} · <StatusText status={ticket.status} />
                        {ticket.unread && <span className="sr-only">, new reply</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="m-0 mt-6 text-center text-[12.5px] text-app-ink-soft">
        or email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-app-ink">{SUPPORT_EMAIL}</a>
        {SUPPORT_WHATSAPP ? (
          <>
            {" "}·{" "}
            <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-app-ink">WhatsApp</a>
          </>
        ) : null}
      </p>
    </div>
  );
}

function StatusText({ status }: { status: ChatTicketSummary["status"] }) {
  const tone = status === "open" ? "text-[#8A5A00]" : status === "pending" ? "text-[#3D4FB8]" : "text-app-success";
  // From the customer's side "pending" means the team replied and is waiting on them.
  const label = status === "open" ? "Waiting for the team" : status === "pending" ? "Team replied" : STATUS_LABEL[status];
  return <span className={tone}>{label}</span>;
}

function Peggy({ lines, setLines, onAiOff, onPerson }: { lines: PeggyLine[]; setLines: (update: (lines: PeggyLine[]) => PeggyLine[]) => void; onAiOff: () => void; onPerson: () => void }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length, sending]);

  const handleSend = async () => {
    const text = message.trim();
    if (!text || sending) return;
    const history = [...lines, { role: "user" as const, text }];
    setLines(() => history);
    setMessage("");
    setSending(true);
    try {
      const response = await fetch("/api/ai/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The opening greeting is not part of the conversation the assistant answers.
          messages: history.slice(1).map((entry) => ({ role: entry.role === "agent" ? "assistant" : "user", content: entry.text })),
          path: window.location.pathname,
        }),
      });
      const json = (await response.json().catch(() => null)) as { data?: { text?: string }; error?: { code?: string; message?: string } } | null;
      // No AI configured: go straight to a person, keeping what they typed.
      if (json?.error?.code === "AI_OFF") return onAiOff();
      const reply = json?.data?.text ?? json?.error?.message ?? "I couldn't answer just now. Tap \"Talk to a person\" and the team will reply.";
      setLines((prev) => [...prev, { role: "agent", text: reply }]);
    } catch {
      setLines((prev) => [...prev, { role: "agent", text: "I couldn't reach the help assistant. Check your connection, or tap \"Talk to a person\"." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {lines.map((line, index) => (
          <div key={index} className={cx("mb-3.5 flex gap-2.5", line.role === "user" ? "flex-row-reverse" : "flex-row")}>
            {line.role === "agent" && <Mascot name="peggy" className="h-8 w-8 shrink-0" alt="" />}
            <div className={cx("max-w-[78%] whitespace-pre-wrap px-3.5 py-2.5 text-[14px] leading-[1.5]", line.role === "user" ? "rounded-[16px_16px_4px_16px] bg-app-ink text-white" : "rounded-[16px_16px_16px_4px] bg-app-canvas text-app-ink")}>
              {line.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="mb-3.5 flex gap-2.5">
            <Mascot name="peggy" className="h-8 w-8 shrink-0" alt="" />
            <div className="rounded-[16px_16px_16px_4px] bg-app-canvas px-3.5 py-2.5 text-[14px] text-app-ink-soft">Thinking…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-app-line px-3 pb-3 pt-2.5">
        <button type="button" onClick={onPerson} className="mb-2.5 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-full border border-app-line bg-white text-[13.5px] font-bold text-app-ink hover:border-app-line-strong">
          <Icon name="chat" size={15} /> Talk to a person
        </button>
        <div className="flex items-center gap-2">
          <label htmlFor="peggy-question" className="sr-only">Ask Peggy</label>
          <input
            id="peggy-question"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSend();
            }}
            placeholder="How do I…"
            maxLength={4000}
            className="h-11 min-w-0 flex-1 rounded-full border border-app-line bg-white px-4 text-[15px] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-ink"
          />
          <button type="button" onClick={() => void handleSend()} disabled={!message.trim() || sending} aria-label="Send" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-ink text-white hover:bg-black disabled:opacity-40">
            <Icon name="arrow" size={15} />
          </button>
        </div>
      </div>
    </>
  );
}

function NewTicket({ peggy, onCreated }: { peggy: PeggyLine[]; onCreated: (ticket: ChatTicket) => void }) {
  const asked = peggy.filter((line) => line.role === "user");
  const [topic, setTopic] = useState<SupportTopic>("other");
  const [message, setMessage] = useState(asked[asked.length - 1]?.text ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const submit = async () => {
    if (busy) return;
    if (!message.trim()) return setError("Tell us what's going on.");
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("topic", topic);
      form.set("message", message.trim());
      form.set("path", window.location.pathname);
      if (asked.length) form.set("transcript", JSON.stringify(peggy.slice(1).map((line) => ({ role: line.role === "agent" ? "assistant" : "user", content: line.text.slice(0, 4000) }))));
      for (const file of files) form.append("files", file);
      onCreated(await supportFetch<ChatTicket>("/api/support/tickets", { method: "POST", body: form }));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "We couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        <p className="m-0 text-[14px] leading-[1.5] text-app-ink-soft">
          A person from the Shopinbos team will reply here, usually within an hour. We&apos;ll email you too.
          {asked.length ? " We'll include your chat with Peggy so you don't have to repeat yourself." : ""}
        </p>
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 p-0 text-[13.5px] font-bold">What&apos;s it about?</legend>
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((item) => (
              <label
                key={item.value}
                className={cx(
                  "inline-flex min-h-[36px] cursor-pointer items-center rounded-full border px-3 text-[13px] font-bold focus-within:ring-2 focus-within:ring-app-ink/30",
                  topic === item.value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
                )}
              >
                <input type="radio" name="support-topic" value={item.value} checked={topic === item.value} onChange={() => setTopic(item.value)} className="sr-only" />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="support-new-message" className="mb-2 block text-[13.5px] font-bold">Your message</label>
          <textarea
            id="support-new-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={5000}
            placeholder="What happened, and what you were trying to do. Order numbers help."
            className="w-full resize-y rounded-[16px] border border-app-line bg-white px-3.5 py-3 text-[15px] leading-[1.5] outline-none placeholder:text-app-ink-faint focus:border-app-ink"
          />
        </div>
        <div>
          <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-full border border-dashed border-app-line-strong px-3.5 text-[13px] font-bold hover:bg-app-canvas focus-within:ring-2 focus-within:ring-app-ink/30">
            <Icon name="paperclip" size={14} /> Add screenshots
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {files.length > 0 && (
            <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-[12.5px] text-app-ink-soft">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center gap-2">
                  <span className="min-w-0 truncate">{file.name}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, i) => i !== index))} className="font-bold text-app-ink underline">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <Notice>{error}</Notice>}
      </div>
      <div className="border-t border-app-line px-4 py-3">
        <button type="button" onClick={() => void submit()} disabled={busy} className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-app-accent text-[15px] font-bold text-white hover:brightness-95 disabled:opacity-55">
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" /> : <Icon name="send" size={15} />}
          Send to the team
        </button>
      </div>
    </div>
  );
}

/** Before the support tables exist: the old WhatsApp/email route, so nobody hits a dead end. */
function Fallback() {
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5 text-[14px] leading-[1.5]">
      <p className="m-0 text-app-ink-soft">Message the team and a real person will reply, in English or Pidgin.</p>
      {SUPPORT_WHATSAPP && (
        <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-app-forest font-bold text-white no-underline">
          <Icon name="whatsapp" size={16} /> WhatsApp the team
        </a>
      )}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="flex min-h-[46px] items-center justify-center gap-2 rounded-full border border-app-line font-bold text-app-ink no-underline">
        <Icon name="mail" size={16} /> {SUPPORT_EMAIL}
      </a>
    </div>
  );
}
