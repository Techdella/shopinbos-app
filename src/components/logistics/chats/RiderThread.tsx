"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { PartnerAvatar, formatClock } from "@/components/conversations/parts";
import { announceMessagesChanged, messagesApi } from "@/components/conversations/client";
import { groupByDay, mergeMessages } from "@/lib/conversations/pure";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate } from "@shared/i18n";
import { RIDER_MESSAGE_MAX, type RiderMessageView } from "@shared/rider-chat";
import { RIDER_THREAD_POLL_MS, bubbleRuns } from "@shared/logistics-chats";
import { friendlyError } from "@/lib/errors/report-client";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { ChatKindChip } from "./ChatKindChip";

// The delivery company's chat with one rider on the Messages page (/logistics/inbox?rider=<id>): bubbles by day,
// grouped runs, ticks on your own messages (sent, then seen once the rider opened the chat in the Riders app),
// optimistic sending with retry, Enter to send (Shift+Enter for a new line), and a refresh every 10 seconds while
// the tab is visible. Same JSON route as the phone (GET/POST /api/mobile/logistics/riders/<id>/messages).
// The seller's unified inbox (/home/messages?r=<job>) reuses it for the shop's chat with the rider on one delivery:
// `url` is then the job's route, `top` the order/delivery bar and `link` the order. Voice notes: the mic writes
// down what you say (POST /api/ai/transcribe) and sends it, as in every other chat.

type Line = RiderMessageView & { status?: "sending" | "failed"; error?: string };

export interface RiderThreadInfo {
  riderId: string;
  name: string;
  phone: string | null;
  active: boolean;
}

export function RiderThread({
  rider,
  onBack,
  onActivity,
  url: threadUrl,
  subtitle,
  link,
  top,
  voice = true,
}: {
  rider: RiderThreadInfo;
  onBack?: () => void;
  onActivity?: () => void;
  /** The thread's JSON route; the company's chat with this rider when left out. */
  url?: string;
  /** The line under the name; "Rider on your team" (or "No longer on your team") when left out. */
  subtitle?: string;
  /** The button on the right of the header; the Riders page when left out, none when null. */
  link?: { href: string; label: string } | null;
  /** Shown under the header (the order and delivery a shop's rider chat belongs to). */
  top?: ReactNode;
  /** The mic next to Send (speak, and the words are sent). */
  voice?: boolean;
}) {
  const t = useT("logistics", "inbox", "common");
  const locale = useLocale();
  const url = threadUrl ?? `/api/mobile/logistics/riders/${encodeURIComponent(rider.riderId)}/messages`;
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const load = useCallback(
    async (first: boolean) => {
      try {
        const body = await messagesApi<{ messages: RiderMessageView[] }>(url, { cache: "no-store" });
        const incoming = body.data.messages ?? [];
        const hadNew = incoming.some((line) => !line.mine && !linesRef.current.some((local) => local.id === line.id));
        // Keep messages still being sent (or that failed) on screen.
        setLines((current) => mergeMessages(current.filter((line) => line.status), incoming));
        setLoadError(null);
        if (hadNew || first) {
          announceMessagesChanged();
          onActivityRef.current?.();
        }
      } catch (error) {
        if (first) setLoadError(friendlyError(error));
      } finally {
        if (first) setLoading(false);
      }
    },
    [url],
  );

  useEffect(() => {
    setLines([]);
    setLoading(true);
    setLoadError(null);
    stickToBottom.current = true;
    void load(true);
    const poll = () => document.visibilityState === "visible" && void load(false);
    const timer = window.setInterval(poll, RIDER_THREAD_POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [load]);

  // Keep the newest message in view unless the person scrolled up to read.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  async function deliver(body: string, localId: string) {
    stickToBottom.current = true;
    setLines((current) => mergeMessages(current.filter((line) => line.id !== localId), [{ id: localId, body, mine: true, read: false, createdAt: new Date().toISOString(), status: "sending" }]));
    try {
      const sent = await messagesApi<{ message: RiderMessageView }>(url, { method: "POST", body: JSON.stringify({ body }) });
      setLines((current) => mergeMessages(current.filter((line) => line.id !== localId), [sent.data.message]));
      announceMessagesChanged();
      onActivityRef.current?.();
    } catch (error) {
      setLines((current) => current.map((line) => (line.id === localId ? { ...line, status: "failed", error: friendlyError(error) } : line)));
    }
  }

  function send(spoken?: string) {
    const body = (spoken ?? text).trim();
    if (!body) return;
    void deliver(body.slice(0, RIDER_MESSAGE_MAX), `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
    setText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    inputRef.current?.focus();
  }

  const runs = bubbleRuns(lines);
  const groups = groupByDay(lines).map((group) => ({
    ...group,
    label: group.label === "Today" ? t("time.today") : group.label === "Yesterday" ? t("time.yesterday") : locale === "en" ? group.label : formatDate(group.items[0].createdAt, locale, { weekday: "short", day: "numeric", month: "short" }),
  }));
  // "Seen" under the last of your messages the rider has read.
  const lastSeen = [...lines].reverse().find((line) => line.mine && line.read && !line.status)?.id ?? null;
  const first = rider.name.split(" ")[0] || rider.name;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-app-line px-3 py-2.5 sm:px-4">
        {onBack && (
          <button type="button" onClick={onBack} aria-label={t("thread.back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas lg:hidden">
            <Icon name="arrowLeft" size={18} />
          </button>
        )}
        <PartnerAvatar name={rider.name} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="m-0 truncate text-[15px] font-extrabold">{rider.name}</h2>
            <ChatKindChip kind="rider" />
          </div>
          <div className="truncate text-[12.5px] text-app-ink-soft">{subtitle ?? (rider.active ? t("chats.riderSub") : t("chats.riderOff"))}</div>
        </div>
        {rider.phone && (
          <a href={`tel:${rider.phone.replace(/[^\d+]/g, "")}`} aria-label={t("chats.call", { name: first })} title={t("chats.call", { name: first })} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-app-line text-app-ink no-underline hover:border-app-line-strong">
            <Icon name="phone" size={16} />
          </a>
        )}
        {link !== null && (
          <Link href={link?.href ?? "/logistics/couriers"} className="hidden min-h-[34px] shrink-0 items-center rounded-full border border-app-line px-3 text-[12.5px] font-bold text-app-ink no-underline hover:border-app-line-strong sm:inline-flex">
            {link?.label ?? t("chats.riderPage")}
          </Link>
        )}
      </header>
      {top}

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-app-canvas/50 px-3 py-4 sm:px-4"
        aria-live="polite"
        aria-busy={loading}
      >
        {loading ? (
          <div className="grid gap-3 p-2" aria-label={t("pt.loadingMessages")}>
            {[60, 40, 70].map((width, index) => (
              <div key={index} className={cx("h-10 animate-pulse rounded-[16px] bg-app-line/60", index % 2 ? "ml-auto" : "")} style={{ width: `${width}%` }} />
            ))}
          </div>
        ) : loadError ? (
          <div className="p-6 text-center">
            <p role="alert" className="m-0 text-[14px] font-semibold text-app-danger">{loadError}</p>
            <button type="button" onClick={() => { setLoading(true); void load(true); }} className="mt-3 min-h-[36px] rounded-full border border-app-line bg-white px-4 text-[13px] font-bold">{t("tryAgain")}</button>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <PartnerAvatar name={rider.name} size={56} />
            <p className="mb-0 mt-3 text-[14.5px] font-extrabold">{t("chats.sayHello", { name: first })}</p>
            <p className="mb-0 mt-1 max-w-[340px] text-[13.5px] text-app-ink-soft">{t("chats.helloBody")}</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <div className="my-3 flex items-center gap-3 text-[11.5px] font-bold text-app-ink-faint">
                <span className="h-px flex-1 bg-app-line" />
                {group.label}
                <span className="h-px flex-1 bg-app-line" />
              </div>
              <div className="grid">
                {group.items.map((line) => {
                  const run = runs.get(line.id) ?? { first: true, last: true };
                  return (
                    <div key={line.id} className={cx("flex flex-col", line.mine ? "items-end" : "items-start", run.first ? "mt-2" : "mt-0.5")}>
                      <div
                        className={cx(
                          "max-w-[85%] rounded-[18px] px-3.5 py-2 text-[14px] leading-[1.45] sm:max-w-[70%]",
                          line.mine ? "bg-app-ink text-white" : "border border-app-line bg-white text-app-ink",
                          run.last && (line.mine ? "rounded-br-[6px]" : "rounded-bl-[6px]"),
                          line.status === "sending" && "opacity-70",
                          line.status === "failed" && "ring-2 ring-app-danger/50",
                        )}
                      >
                        <div className="whitespace-pre-wrap break-words">{line.body}</div>
                        <div className={cx("mt-0.5 flex items-center justify-end gap-1 text-[11px]", line.mine ? "text-white/60" : "text-app-ink-faint")}>
                          {line.status === "sending" ? t("msg.sending") : formatClock(line.createdAt, locale)}
                          {line.mine && !line.status && (
                            <span className={cx("inline-flex", line.read ? "text-app-mint" : "")} aria-label={line.read ? t("msgr.seen") : t("chats.sent")} title={line.read ? t("msgr.seen") : t("chats.sent")}>
                              <Icon name="check" size={12} />
                              {line.read && <Icon name="check" size={12} className="-ml-[7px]" />}
                            </span>
                          )}
                        </div>
                      </div>
                      {line.status === "failed" && (
                        <div className="mt-1 flex items-center gap-2 text-[12px]">
                          <span className="font-semibold text-app-danger">{line.error ?? t("pt.notSent")}</span>
                          <button type="button" onClick={() => void deliver(line.body, line.id)} className="font-extrabold text-app-ink underline">{t("pt.retry")}</button>
                          <button type="button" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} className="text-app-ink-soft underline">{t("delete")}</button>
                        </div>
                      )}
                      {line.id === lastSeen && (
                        <div className="mt-0.5 text-[11.5px] font-semibold text-app-ink-soft">{t("msgr.seen")}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="shrink-0 border-t border-app-line bg-white px-3 pb-3 pt-2 sm:px-4"
      >
        <div className="flex items-end gap-1.5">
          <label htmlFor={`rider-composer-${rider.riderId}`} className="sr-only">{t("riders.message", { name: first })}</label>
          <textarea
            id={`rider-composer-${rider.riderId}`}
            ref={inputRef}
            value={text}
            rows={1}
            maxLength={RIDER_MESSAGE_MAX}
            onChange={(event) => {
              setText(event.target.value);
              const el = event.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={t("partner.write")}
            className="max-h-[140px] min-h-[44px] min-w-0 flex-1 resize-none rounded-[22px] border border-app-line bg-white px-4 py-[10px] text-[16px] leading-[1.4] outline-none placeholder:text-app-ink-faint focus:border-app-ink sm:text-[15px]"
          />
          {voice && <VoiceInputButton variant="icon" value={text} onChange={setText} onSpoken={(spoken) => send(spoken)} maxLength={RIDER_MESSAGE_MAX} context="a chat message to a delivery rider" />}
          <button type="submit" disabled={!text.trim()} aria-label={t("send")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-accent text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45">
            <Icon name="send" size={17} />
          </button>
        </div>
        <p className="m-0 mt-1.5 hidden text-[11.5px] text-app-ink-faint sm:block">{t("pt.enterHint")}</p>
      </form>
    </div>
  );
}
