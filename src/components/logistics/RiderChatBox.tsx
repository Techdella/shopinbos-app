"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// One rider chat thread on the web (shared/rider-chat.ts): the Riders web app (with the company or the shop on a job),
// the delivery company's Riders page (with one rider) and the shop's order page (with the rider carrying it). The same
// JSON routes as the phone; riders send their link's token as X-Rider-Token. Refreshes every 20 seconds while open.

interface Line {
  id: string;
  body: string;
  mine: boolean;
  createdAt: string;
}

export interface RiderChatLabels {
  placeholder: string;
  send: string;
  empty: string;
  failed: string;
}

export function RiderChatBox({ url, token, extra, labels }: { url: string; token?: string; extra?: Record<string, string>; labels: RiderChatLabels }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const headers = useCallback((json = false): Record<string, string> => ({ Accept: "application/json", ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { "X-Rider-Token": token } : {}) }), [token]);
  const query = extra ? `?${new URLSearchParams(extra).toString()}` : "";

  const load = useCallback(async () => {
    const response = await fetch(`${url}${query}`, { headers: headers(), cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { data?: { messages?: Line[] }; error?: { message?: string } } | null;
    if (!response?.ok) return setError(body?.error?.message ?? labels.failed);
    setLines(body?.data?.messages ?? []);
  }, [url, query, headers, labels.failed]);

  useEffect(() => {
    // The first load and a gentle refresh while the box is open (the other side replies from their app).
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [lines?.length]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const response = await fetch(url, { method: "POST", headers: headers(true), body: JSON.stringify({ ...extra, body: text }) }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { data?: { message?: Line }; error?: { message?: string } } | null;
    setBusy(false);
    if (!response?.ok || !body?.data?.message) return setError(body?.error?.message ?? labels.failed);
    setDraft("");
    setLines([...(lines ?? []), body.data.message]);
  }

  return (
    <div className="grid gap-2.5">
      <div className="grid max-h-[320px] gap-2 overflow-y-auto rounded-[16px] bg-app-canvas p-3">
        {lines && !lines.length ? <p className="m-0 text-center text-[13.5px] text-app-ink-soft">{labels.empty}</p> : null}
        {(lines ?? []).map((line) => (
          <div key={line.id} className={line.mine ? "justify-self-end" : "justify-self-start"}>
            <p className={`m-0 max-w-[420px] whitespace-pre-wrap break-words rounded-[16px] px-3.5 py-2 text-[14.5px] ${line.mine ? "bg-app-ink text-white" : "bg-white text-app-ink"}`}>{line.body}</p>
            <p className={`m-0 mt-0.5 text-[11.5px] text-app-ink-faint ${line.mine ? "text-right" : ""}`}>
              {new Date(line.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={1000}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
          className="min-h-[44px] min-w-0 flex-1 rounded-full border border-app-line bg-white px-4 text-[15px]"
        />
        <button type="submit" disabled={busy || !draft.trim()} className="min-h-[44px] rounded-full bg-app-ink px-5 text-[14px] font-bold text-white disabled:opacity-50">
          {labels.send}
        </button>
      </form>
      {error ? <p className="m-0 text-[13px] text-app-danger">{error}</p> : null}
    </div>
  );
}

/** "Message <name>" that opens the chat underneath (the shop's order page, the company's Riders page). */
export function RiderChatToggle({ title, open: startOpen = false, ...box }: { title: string; open?: boolean; url: string; token?: string; extra?: Record<string, string>; labels: RiderChatLabels }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="grid gap-2">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex min-h-[40px] items-center gap-1.5 justify-self-start text-[14px] font-bold text-app-accent-ink">
        {title}
      </button>
      {open ? <RiderChatBox {...box} /> : null}
    </div>
  );
}
