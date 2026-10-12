"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";

interface PeggyAction {
  tool: string;
  summary: string;
  href?: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  actions?: PeggyAction[];
  /** Error notes are shown but not sent back to Peggy. */
  failed?: boolean;
}

interface Stats {
  today: string;
  week: string;
  toSend: number;
  unpaid: number;
  lowStock: number;
  unread: number;
}

const MAX_TURNS = 20;
const MAX_CHARS = 4000;

const ACTION_ICON: Record<string, IconName> = {
  create_discount: "tag",
  update_product: "box",
  mark_order: "package",
  draft_blog_post: "edit",
  draft_broadcast: "send",
  draft_ad: "megaphone",
  write_copy: "sparkle",
};

const CAN_DO: { icon: IconName; text: string }[] = [
  { icon: "chart", text: "Sales, orders, stock and customers, from your live shop" },
  { icon: "package", text: "Mark orders paid, sent or delivered" },
  { icon: "box", text: "Change prices and stock, publish or hide products" },
  { icon: "tag", text: "Make discount codes" },
  { icon: "truck", text: "Set up payment methods and delivery fees" },
  { icon: "edit", text: "Draft blog posts, emails to customers and adverts for you to check" },
  { icon: "sparkle", text: "Write WhatsApp statuses, captions and descriptions" },
];

export function PeggyChat({ greeting, initialAsk, suggestions, stats }: { greeting: string; initialAsk: string; suggestions: string[]; stats: Stats }) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState(initialAsk);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!initialAsk) return;
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    // Drop ?ask= so a reload doesn't bring the prompt back after it was sent.
    router.replace("/home/peggy", { scroll: false });
  }, [initialAsk, router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function send(text: string) {
    const message = text.trim().slice(0, MAX_CHARS);
    if (!message || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: message }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    try {
      const messages = next
        .filter((turn) => !turn.failed)
        .slice(-MAX_TURNS)
        .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_CHARS) }));
      const response = await fetch("/api/app/peggy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const body = (await response.json().catch(() => null)) as { data?: { text: string; actions?: PeggyAction[] }; error?: { message?: string } } | null;
      if (!response.ok || !body?.data) throw new Error(body?.error?.message ?? "Peggy couldn't answer just now. Try again in a moment.");
      const data = body.data;
      setTurns((current) => [...current, { role: "assistant", content: data.text, actions: data.actions ?? [] }]);
      // Her changes show up on the other pages straight away.
      if (data.actions?.length) router.refresh();
    } catch (error) {
      setTurns((current) => [...current, { role: "assistant", failed: true, content: error instanceof Error ? error.message : "Peggy couldn't answer just now." }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="grid h-full min-h-0 w-full gap-5 px-4 py-4 font-app text-app-ink sm:px-6 sm:py-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:px-8 2xl:px-10">
      {/* Conversation */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-app-line bg-white">
        <header className="flex items-center gap-3 bg-app-mint px-4 py-3 sm:px-5">
          <Mascot name="peggy" className="h-11 w-11" alt="Peggy" />
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[17px] font-extrabold">Peggy</h1>
            <div className="truncate text-[13px] text-app-ink-soft">Checks your shop and gets things done</div>
          </div>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => setTurns([])}
              disabled={busy}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-extrabold text-app-ink hover:border-app-line-strong disabled:opacity-50"
            >
              <Icon name="plus" size={13} /> New chat
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5" aria-live="polite">
          <div className="mx-auto flex max-w-[760px] flex-col gap-3">
            <Bubble role="assistant" content={greeting} />
            {turns.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    disabled={busy}
                    className="min-h-[40px] rounded-full border border-app-line bg-white px-4 text-left text-[13.5px] font-bold text-app-ink hover:border-app-line-strong disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {turns.map((turn, index) => (
              <div key={index} className="flex flex-col gap-2">
                <Bubble role={turn.role} content={turn.content} failed={turn.failed} />
                {turn.actions?.map((action, actionIndex) => <ActionCard key={actionIndex} action={action} />)}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 self-start rounded-[18px] rounded-tl-[6px] bg-app-mint px-4 py-3 text-[14px] text-app-ink-soft">
                <span className="inline-flex gap-1" aria-hidden>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-app-ink-soft" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-app-ink-soft [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-app-ink-soft [animation-delay:300ms]" />
                </span>
                Peggy is working on it…
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <form
          className="border-t border-app-line px-3 py-3 sm:px-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <div className="mx-auto flex max-w-[760px] items-end gap-2">
            <label htmlFor="peggy-input" className="sr-only">Ask Peggy</label>
            <textarea
              id="peggy-input"
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={MAX_CHARS}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="Ask Peggy, or tell her what to do"
              className="max-h-[160px] min-h-[48px] flex-1 resize-none rounded-[24px] border border-app-line bg-app-canvas px-5 py-3 text-[15px] leading-[1.4] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-line-strong field-sizing-content"
            />
            <VoiceInputButton variant="icon" value={draft} onChange={setDraft} maxLength={MAX_CHARS} context="a request for Peggy" disabled={busy} />
            <button
              type="submit"
              disabled={!draft.trim() || busy}
              aria-label="Send"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-ink text-white disabled:opacity-40"
            >
              <Icon name="arrowUp" size={18} />
            </button>
          </div>
        </form>
      </section>

      {/* Today + what she can do (wide screens) */}
      <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto xl:flex">
        <section className="rounded-[22px] bg-app-mint p-5">
          <h2 className="m-0 text-[15px] font-extrabold">Your shop today</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Sold today" value={stats.today} />
            <Stat label="Last 7 days" value={stats.week} />
            <Stat label="To send" value={stats.toSend} href="/home/orders" />
            <Stat label="Not paid yet" value={stats.unpaid} href="/home/orders" />
            <Stat label="Low on stock" value={stats.lowStock} href="/products" />
            <Stat label="Unread messages" value={stats.unread} href="/home/messages" />
          </div>
        </section>
        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[15px] font-extrabold">What Peggy can do</h2>
          <ul className="m-0 mt-3 grid list-none gap-3 p-0">
            {CAN_DO.map((item) => (
              <li key={item.text} className="flex items-start gap-3 text-[13.5px] leading-[1.4]">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-app-canvas">
                  <Icon name={item.icon} size={15} />
                </span>
                <span className="pt-1.5">{item.text}</span>
              </li>
            ))}
          </ul>
          <p className="mb-0 mt-4 text-[12.5px] text-app-ink-soft">She never sends messages, publishes posts or starts ads on her own; those are saved as drafts for you.</p>
        </section>
      </aside>
    </div>
  );
}

function Bubble({ role, content, failed }: { role: "user" | "assistant"; content: string; failed?: boolean }) {
  return (
    <div
      className={cx(
        "max-w-[88%] whitespace-pre-wrap break-words px-4 py-3 text-[14.5px] leading-[1.5] sm:max-w-[80%]",
        role === "user" ? "self-end rounded-[18px] rounded-br-[6px] bg-app-ink text-white" : "self-start rounded-[18px] rounded-tl-[6px] bg-app-mint text-app-ink",
        failed && "bg-app-danger-tint text-app-danger",
      )}
    >
      {content}
    </div>
  );
}

function ActionCard({ action }: { action: PeggyAction }) {
  const body = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-app-mint">
        <Icon name={ACTION_ICON[action.tool] ?? "check"} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">Peggy did this</span>
        <span className="block text-[13.5px] leading-[1.4]">{action.summary}</span>
      </span>
      {action.href && <Icon name="chevRight" size={16} className="shrink-0 text-app-ink-soft" />}
    </>
  );
  const className = "flex max-w-[88%] items-center gap-3 self-start rounded-[16px] border border-app-line bg-white px-3.5 py-2.5 text-app-ink no-underline sm:max-w-[80%]";
  return action.href ? (
    <Link href={action.href} className={cx(className, "hover:border-app-line-strong hover:shadow-sm")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const inner = (
    <>
      <div className="text-[12px] text-app-ink-soft">{label}</div>
      <div className="mt-0.5 truncate text-[20px] font-extrabold leading-tight tracking-[-0.3px]">{typeof value === "number" ? value.toLocaleString("en-NG") : value}</div>
    </>
  );
  return href ? (
    <Link href={href} className="rounded-[14px] bg-white px-3 py-2.5 text-app-ink no-underline hover:shadow-sm">
      {inner}
    </Link>
  ) : (
    <div className="rounded-[14px] bg-white px-3 py-2.5">{inner}</div>
  );
}
