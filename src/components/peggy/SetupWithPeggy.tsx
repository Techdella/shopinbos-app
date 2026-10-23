"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { PeggyCall } from "./PeggyCall";

// Getting set up, with Peggy: the checklist (each step links to its page), a chat where Peggy asks for one thing
// at a time and saves the answers (pickup points, delivery areas, prices), and a free voice call. On supplier,
// delivery partner and seller dashboards until setup is done. Free: no AI credits.

type Step = { id: string; label: string; done: boolean; href: string; hint: string };
type Status = { role: string; firstName: string; business: string; steps: Step[]; next: Step | null; done: number };
type Line = { role: "user" | "assistant"; content: string; saved?: string[] };

export function SetupWithPeggy({ initial, question, voice, checklist = true }: { initial: Status; question: string | null; voice: boolean; checklist?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [lines, setLines] = useState<Line[]>(question ? [{ role: "assistant", content: question }] : []);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length]);

  const total = status.steps.length;
  const percent = Math.round((status.done / Math.max(1, total)) * 100);

  const send = () => {
    const content = text.trim();
    if (!content) return;
    const next: Line[] = [...lines, { role: "user", content }];
    setLines(next);
    setText("");
    setError(null);
    start(async () => {
      const response = await fetch("/api/app/setup-peggy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.map(({ role, content: c }) => ({ role, content: c })) }) }).catch(() => null);
      const json = (await response?.json().catch(() => null)) as { data?: { reply: string; saved: string[]; status: Status }; error?: { message?: string } } | null;
      if (!response?.ok || !json?.data) return setError(json?.error?.message ?? "Peggy couldn't answer just now. Try again.");
      setLines([...next, { role: "assistant", content: json.data.reply, saved: json.data.saved }]);
      setStatus(json.data.status);
      if (json.data.saved.length) router.refresh();
    });
  };

  return (
    <section aria-labelledby="setup-peggy" className="mb-6 overflow-hidden rounded-[24px] border border-app-line bg-white">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="border-b border-app-line p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-forest text-[16px] font-extrabold text-white" aria-hidden>P</span>
            <div className="min-w-0">
              <h2 id="setup-peggy" className="m-0 text-[18px] font-extrabold tracking-[-0.01em]">{checklist ? <>Let&apos;s get {status.business} ready</> : "Stuck? Ask Peggy"}</h2>
              <p className="m-0 text-[13px] text-app-ink-soft">{status.done} of {total} done · Peggy can help, free</p>
            </div>
          </div>
          {checklist && <>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-app-canvas" aria-hidden>
            <div className="h-full rounded-full bg-app-forest transition-all" style={{ width: `${percent}%` }} />
          </div>
          <ol className="m-0 mt-4 grid list-none gap-1.5 p-0">
            {status.steps.map((step) => (
              <li key={step.id}>
                <Link href={step.href} className={cx("flex items-center gap-3 rounded-[14px] px-3 py-2.5 no-underline", step.id === status.next?.id ? "bg-[#EEF7F5]" : "hover:bg-app-canvas")}>
                  <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", step.done ? "border-app-forest bg-app-forest text-white" : step.id === status.next?.id ? "border-app-forest" : "border-app-line-strong")} aria-hidden>
                    {step.done && <Icon name="check" size={13} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-[14px] font-bold", step.done ? "text-app-ink-soft line-through" : "text-app-ink")}>{step.label}</span>
                    {!step.done && <span className="block truncate text-[12.5px] text-app-ink-soft">{step.hint}</span>}
                  </span>
                  {!step.done && <Icon name="arrow" size={14} className="shrink-0 text-app-ink-soft" />}
                </Link>
              </li>
            ))}
          </ol>
          </>}
          {voice && (
            <div className="mt-4">
              <PeggyCall />
              <p className="mb-0 mt-2 text-center text-[12.5px] text-app-ink-soft">Talk it through with Peggy, Shopinbos&apos;s AI support. She&apos;ll walk you through each step.</p>
            </div>
          )}
        </div>

        <div className="flex min-h-[380px] flex-col bg-[#FAF7F1]">
          <div className="flex-1 space-y-3 overflow-y-auto p-5" aria-live="polite">
            {lines.map((line, index) => (
              <div key={index} className={cx("flex", line.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cx("max-w-[85%] rounded-[18px] px-4 py-2.5 text-[14.5px] leading-[1.5]", line.role === "user" ? "rounded-br-[6px] bg-app-ink text-white" : "rounded-bl-[6px] bg-white text-app-ink shadow-sm")}>
                  <div className="whitespace-pre-wrap">{line.content}</div>
                  {line.saved?.map((saved) => (
                    <div key={saved} className="mt-2 flex items-center gap-1.5 rounded-[10px] bg-app-success-tint px-2.5 py-1.5 text-[12.5px] font-bold text-app-success">
                      <Icon name="check" size={13} /> {saved}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {pending && <div className="text-[13px] text-app-ink-soft">Peggy is typing…</div>}
            <div ref={endRef} />
          </div>
          {error && <p role="alert" className="mx-5 mb-2 mt-0 rounded-[12px] bg-app-danger-tint px-3 py-2 text-[13px] font-semibold text-app-danger">{error}</p>}
          <form
            className="flex items-end gap-2 border-t border-app-line bg-white p-3"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <label className="sr-only" htmlFor="setup-peggy-input">Message Peggy</label>
            <textarea
              id="setup-peggy-input"
              rows={1}
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Answer Peggy or ask anything…"
              className="max-h-[120px] min-h-[46px] flex-1 resize-none rounded-[16px] border border-app-line px-4 py-3 text-[15px] outline-none focus:border-app-ink"
            />
            <button type="submit" disabled={pending || !text.trim()} aria-label="Send" className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-app-forest text-white disabled:opacity-50">
              <Icon name="send" size={17} />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
