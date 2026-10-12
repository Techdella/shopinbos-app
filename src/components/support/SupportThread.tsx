"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Mascot, Notice, cx } from "@/components/app-ui";
import { MAX_ATTACHMENTS, STATUS_LABEL, attachmentProblem, formatTicketNumber } from "@/lib/support/pure";
import { formatBytes, supportFetch, timeLabel, type ChatMessage, type ChatTicket } from "./client";

// One support conversation inside the in-app help panel: the thread (team replies polled while open),
// the reply box with files, and the satisfaction rating once it's solved.

const POLL_MS = 6000;

export function SupportThread({ initial, onChange }: { initial: ChatTicket; onChange?: (ticket: ChatTicket) => void }) {
  const [ticket, setTicket] = useState(initial);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const count = ticket.messages.length;

  useEffect(() => setTicket(initial), [initial]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  // Live replies: poll while the panel is open and the tab is visible.
  useEffect(() => {
    let stopped = false;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await supportFetch<ChatTicket>(`/api/support/tickets/${initial.number}`);
        if (!stopped) {
          setTicket(next);
          onChange?.(next);
        }
      } catch {
        // Keep showing what we have; the next poll tries again.
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [initial.number, onChange]);

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

  const send = async () => {
    if (busy || (!text.trim() && !files.length)) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("message", text.trim());
      for (const file of files) form.append("files", file);
      const next = await supportFetch<ChatTicket>(`/api/support/tickets/${ticket.number}/messages`, { method: "POST", body: form });
      setTicket(next);
      onChange?.(next);
      setText("");
      setFiles([]);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "We couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const closed = ticket.status === "closed";
  const solved = ticket.status === "solved" || closed;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite" aria-relevant="additions">
        <p className="m-0 mb-4 text-center text-[12px] text-app-ink-faint">
          {formatTicketNumber(ticket.number)} · started {timeLabel(ticket.createdAt)}
        </p>
        {ticket.messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
        {!ticket.answered && !solved && (
          <div className="mx-auto mt-2 max-w-[300px] rounded-[14px] bg-app-mint px-3.5 py-2.5 text-center text-[12.5px] leading-[1.45] text-app-forest">
            A person from the team usually replies within an hour. We&apos;ll email you too, so you can close this.
          </div>
        )}
        {solved && <Rating ticket={ticket} onRated={(next) => { setTicket(next); onChange?.(next); }} />}
        <div ref={endRef} />
      </div>

      {closed ? (
        <div className="border-t border-app-line px-4 py-4 text-center text-[13px] text-app-ink-soft">This conversation is closed. Start a new one and we&apos;ll pick it up.</div>
      ) : (
        <div className="border-t border-app-line px-3 pb-3 pt-2.5">
          {error && <div className="mb-2"><Notice>{error}</Notice></div>}
          {files.length > 0 && (
            <ul className="m-0 mb-2 flex list-none flex-wrap gap-1.5 p-0">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex max-w-full items-center gap-1.5 rounded-full bg-app-canvas py-1 pl-3 pr-1 text-[12px]">
                  <span className="truncate">{file.name}</span>
                  <span className="text-app-ink-faint">{formatBytes(file.size)}</span>
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, i) => i !== index))} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white">
                    <Icon name="x" size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas hover:text-app-ink focus-within:ring-2 focus-within:ring-app-ink/30" title="Attach a screenshot or PDF">
              <Icon name="paperclip" size={17} />
              <span className="sr-only">Attach a file</span>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="sr-only" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
            </label>
            <label className="sr-only" htmlFor={`support-reply-${ticket.number}`}>Reply</label>
            <textarea
              id={`support-reply-${ticket.number}`}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={5000}
              placeholder={solved ? "Reply to reopen this conversation" : "Write a reply…"}
              className="max-h-[140px] min-h-[44px] flex-1 resize-none rounded-[18px] border border-app-line bg-white px-3.5 py-2.5 text-[15px] leading-[1.4] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-ink"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || (!text.trim() && !files.length)}
              aria-label="Send"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-ink text-white transition hover:bg-black disabled:opacity-40"
            >
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" /> : <Icon name="send" size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.authorType === "system") {
    return <p className="my-3 text-center text-[12px] text-app-ink-faint">{message.body}</p>;
  }
  const mine = message.authorType === "user";
  return (
    <div className={cx("mb-3.5 flex gap-2.5", mine ? "flex-row-reverse" : "flex-row")}>
      {!mine && (
        <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-app-forest text-[12px] font-extrabold text-white" aria-hidden>
          {message.authorType === "ai" ? <Mascot name="peggy" className="h-8 w-8" alt="" /> : (message.authorName ?? "S").slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className={cx("flex max-w-[80%] flex-col", mine ? "items-end" : "items-start")}>
        {!mine && (
          <span className="mb-1 text-[11.5px] font-bold text-app-ink-soft">
            {message.authorType === "ai" ? "Peggy" : `${(message.authorName ?? "Shopinbos").split(" ")[0]} · Shopinbos team`}
          </span>
        )}
        {message.body && (
          <div className={cx("whitespace-pre-wrap break-words px-3.5 py-2.5 text-[14px] leading-[1.5]", mine ? "rounded-[16px_16px_4px_16px] bg-app-ink text-white" : "rounded-[16px_16px_16px_4px] bg-app-canvas text-app-ink")}>
            {message.body}
          </div>
        )}
        {message.attachments.map((file) => (
          <a
            key={file.url}
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 flex max-w-full items-center gap-2 rounded-[12px] border border-app-line bg-white px-3 py-2 text-[12.5px] font-semibold text-app-ink no-underline hover:border-app-line-strong"
          >
            <Icon name={file.type.startsWith("image/") ? "image" : "file"} size={14} />
            <span className="truncate">{file.name}</span>
            <span className="shrink-0 font-normal text-app-ink-faint">{formatBytes(file.size)}</span>
          </a>
        ))}
        <span className="mt-1 text-[11px] text-app-ink-faint">
          {timeLabel(message.createdAt)}
          {message.channel === "email" ? " · by email" : ""}
        </span>
      </div>
    </div>
  );
}

function Rating({ ticket, onRated }: { ticket: ChatTicket; onRated: (ticket: ChatTicket) => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ticket.rating) {
    return (
      <div className="mx-auto mt-3 max-w-[300px] rounded-[14px] bg-app-canvas px-3.5 py-3 text-center text-[13px] text-app-ink-soft">
        {STATUS_LABEL[ticket.status]}. You rated the help {ticket.rating}/5. Thank you.
      </div>
    );
  }

  const submit = async () => {
    if (!rating || busy) return;
    setBusy(true);
    setError(null);
    try {
      onRated(await supportFetch<ChatTicket>(`/api/support/tickets/${ticket.number}/rating`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment: comment.trim() || undefined }) }));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "We couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-[18px] border border-app-line bg-white p-4">
      <p className="m-0 text-[14px] font-extrabold">Marked as solved. How did we do?</p>
      <div role="radiogroup" aria-label="Rate the help you got" className="mt-2.5 flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} out of 5`}
            onClick={() => setRating(value)}
            className={cx("grid h-10 w-10 place-items-center rounded-full transition", value <= rating ? "text-[#F2A93B]" : "text-app-line-strong hover:text-app-ink-faint")}
          >
            <Icon name="star" size={22} />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <label htmlFor={`support-rate-${ticket.number}`} className="sr-only">Anything to add?</label>
          <textarea
            id={`support-rate-${ticket.number}`}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={rating >= 4 ? "Anything we did especially well? (optional)" : "What could we have done better? (optional)"}
            className="mt-2 w-full resize-none rounded-[14px] border border-app-line px-3 py-2 text-[14px] outline-none focus:border-app-ink"
          />
          {error && <div className="mt-2"><Notice>{error}</Notice></div>}
          <button type="button" onClick={() => void submit()} disabled={busy} className="mt-2 min-h-[38px] rounded-full bg-app-ink px-4 text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? "Sending…" : "Send rating"}
          </button>
        </>
      )}
      <p className="m-0 mt-2 text-[12px] text-app-ink-faint">Still stuck? Reply below and the conversation reopens.</p>
    </div>
  );
}
