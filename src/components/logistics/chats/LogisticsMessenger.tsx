"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { MESSAGES_CHANGED_EVENT, messagesApi } from "@/components/conversations/client";
import { PartnerAvatar, formatListTime } from "@/components/conversations/parts";
import { Thread } from "@/components/conversations/Thread";
import type { ContextRef, ConversationSummary, ThreadMessage } from "@/lib/conversations/pure";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { friendlyError } from "@/lib/errors/report-client";
import { CHAT_FILTERS, CHAT_LIST_POLL_MS, chatFilterCounts, filterChatList, mergeChatList, type ChatFilter, type ChatListItem, type RiderChatSummary } from "@shared/logistics-chats";
import type { MessageKey } from "@shared/i18n/catalog";
import { ChatKindChip } from "./ChatKindChip";
import { RiderThread } from "./RiderThread";

// The delivery partner's Messages page (/logistics/inbox), WhatsApp-style: on the left every chat — their riders
// (GET /api/mobile/logistics/rider-chats) and the shops and suppliers they work with (GET /api/conversations) — with
// search, filter chips (All, Riders, Shops, Suppliers, Unread), unread counts and the last message; on the right the
// open chat. On a phone it's the list, then the chat with a back arrow.
// URL: ?rider=<id> opens a rider's chat, ?c=<conversationId> a conversation, ?with=<id>&ctx=<kind:id> starts one.

export interface LogisticsMessengerInitial {
  rider?: string | null;
  conversation?: string | null;
  with?: string | null;
  context?: ContextRef | null;
}

type Active = { kind: "rider"; id: string } | { kind: "conversation"; summary: ConversationSummary; context: ContextRef | null };

const FILTER_WORD: Record<ChatFilter, MessageKey<"logistics">> = {
  all: "chats.filter.all",
  rider: "chats.filter.rider",
  seller: "chats.filter.seller",
  supplier: "chats.filter.supplier",
  unread: "chats.filter.unread",
};

export function LogisticsMessenger({ initial }: { initial?: LogisticsMessengerInitial | null }) {
  const t = useT("logistics", "inbox", "common");
  const locale = useLocale();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [riders, setRiders] = useState<RiderChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filesEnabled, setFilesEnabled] = useState(true);
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Active | null>(initial?.rider ? { kind: "rider", id: initial.rider } : null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    // Riders and conversations load side by side; one failing doesn't hide the other.
    const [partners, team] = await Promise.allSettled([
      messagesApi<ConversationSummary[], { filesEnabled?: boolean }>("/api/conversations"),
      messagesApi<RiderChatSummary[]>("/api/mobile/logistics/rider-chats"),
    ]);
    if (partners.status === "fulfilled") {
      setConversations(partners.value.data);
      setFilesEnabled(partners.value.meta?.filesEnabled ?? true);
      // Keep the open chat's header in step with the list.
      setActive((current) => {
        if (current?.kind !== "conversation") return current;
        const fresh = partners.value.data.find((item) => item.id === current.summary.id);
        return fresh ? { ...current, summary: { ...current.summary, with: fresh.with } } : current;
      });
    }
    if (team.status === "fulfilled") setRiders(team.value.data);
    const failed = partners.status === "rejected" && team.status === "rejected" ? partners.reason : null;
    setListError(failed ? friendlyError(failed) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadList();
    const poll = () => document.visibilityState === "visible" && void loadList();
    const timer = window.setInterval(poll, CHAT_LIST_POLL_MS);
    window.addEventListener(MESSAGES_CHANGED_EVENT, poll);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(MESSAGES_CHANGED_EVENT, poll);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [loadList]);

  const select = useCallback((next: Active | null) => {
    setActive(next);
    setOpenError(null);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    for (const key of ["with", "ctx", "c", "rider"]) url.searchParams.delete(key);
    if (next?.kind === "rider") url.searchParams.set("rider", next.id);
    if (next?.kind === "conversation") url.searchParams.set("c", next.summary.id);
    window.history.replaceState(null, "", url.toString());
  }, []);

  // A rider's chat from a link while the page is already open (a notification, the Today card).
  const initialRider = initial?.rider ?? null;
  useEffect(() => {
    if (initialRider) setActive({ kind: "rider", id: initialRider });
  }, [initialRider]);

  // A conversation to open on arrival (?c=) or a business to start one with (?with=).
  const initialKey = initial && !initial.rider ? JSON.stringify(initial) : "";
  useEffect(() => {
    if (!initial || initial.rider || (!initial.with && !initial.conversation)) return;
    let alive = true;
    setOpening(true);
    setOpenError(null);
    const run = async () => {
      if (initial.with) return (await messagesApi<ConversationSummary>("/api/conversations", { method: "POST", body: JSON.stringify({ with: initial.with }) })).data;
      const body = await messagesApi<ThreadMessage[], { conversation: ConversationSummary | null }>(`/api/conversations/${encodeURIComponent(initial.conversation!)}/messages`);
      if (!body.meta?.conversation) throw new Error(t("msgr.unavailable"));
      return body.meta.conversation;
    };
    run()
      .then((summary) => {
        if (!alive) return;
        select({ kind: "conversation", summary, context: initial.context ?? null });
        void loadList();
      })
      .catch((error: Error) => alive && setOpenError(friendlyError(error)))
      .finally(() => alive && setOpening(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const items = useMemo(() => mergeChatList(conversations, riders), [conversations, riders]);
  const shown = useMemo(() => filterChatList(items, filter, q), [items, filter, q]);
  const counts = useMemo(() => chatFilterCounts(items), [items]);
  const activeRider = active?.kind === "rider" ? riders.find((rider) => rider.riderId === active.id) ?? null : null;
  const activeKey = active ? (active.kind === "rider" ? `r:${active.id}` : `c:${active.summary.id}`) : null;
  const riderMissing = active?.kind === "rider" && !loading && !activeRider;

  function open(item: ChatListItem) {
    if (item.kind === "rider") return select({ kind: "rider", id: item.id });
    const summary = conversations.find((conversation) => conversation.id === item.id);
    if (summary) select({ kind: "conversation", summary, context: null });
  }

  const searchRef = useRef<HTMLInputElement>(null);

  const list = (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="shrink-0 px-3 pt-3 sm:px-4">
        <label className="flex h-10 items-center gap-2 rounded-full bg-app-canvas px-3.5 text-app-ink-soft focus-within:ring-2 focus-within:ring-app-ink/15">
          <Icon name="search" size={15} />
          <span className="sr-only">{t("list.searchLabel")}</span>
          <input ref={searchRef} value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("msgr.search")} className="min-w-0 flex-1 bg-transparent text-[16px] text-app-ink outline-none placeholder:text-app-ink-faint sm:text-[14px]" />
          {q && (
            <button type="button" onClick={() => { setQ(""); searchRef.current?.focus(); }} aria-label={t("msgr.clearSearch")} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white">
              <Icon name="x" size={11} />
            </button>
          )}
        </label>
      </div>
      <div role="tablist" aria-label={t("msgr.filter")} className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-app-line px-3 py-2.5 sm:px-4">
        {CHAT_FILTERS.map((key) => {
          const on = filter === key;
          const count = key === "all" ? 0 : counts[key];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(key)}
              className={cx(
                "inline-flex min-h-[32px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-bold transition",
                on ? "bg-app-ink text-white" : "border border-app-line bg-white text-app-ink-soft hover:text-app-ink",
              )}
            >
              {t(FILTER_WORD[key])}
              {count > 0 && (
                <span className={cx("grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-extrabold", on ? "bg-white text-app-ink" : "bg-app-accent text-white")}>
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid gap-1 p-3" aria-label={t("msgr.loading")}>
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="flex items-center gap-3 px-1 py-2">
                <span className="h-10 w-10 animate-pulse rounded-full bg-app-line/70" />
                <span className="grid flex-1 gap-1.5">
                  <span className="h-3 w-1/2 animate-pulse rounded bg-app-line/70" />
                  <span className="h-3 w-4/5 animate-pulse rounded bg-app-line/50" />
                </span>
              </div>
            ))}
          </div>
        ) : listError && !items.length ? (
          <div className="p-6 text-center">
            <p role="alert" className="m-0 text-[14px] font-semibold text-app-danger">{listError}</p>
            <button type="button" onClick={() => void loadList()} className="mt-3 min-h-[36px] rounded-full border border-app-line px-4 text-[13px] font-bold">{t("tryAgain")}</button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="chat" size={22} /></span>
            <h3 className="mb-0 mt-4 text-[17px] font-extrabold">{t("chats.emptyTitle")}</h3>
            <p className="mb-0 mt-1.5 max-w-[360px] text-[14px] leading-[1.55] text-app-ink-soft">{t("chats.emptyBody")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/logistics/couriers#add-rider" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white no-underline hover:bg-black">
                <Icon name="plus" size={14} /> {t("chats.addRider")}
              </Link>
              <Link href="/logistics/bookings" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold text-app-ink no-underline hover:border-app-line-strong">
                <Icon name="truck" size={14} /> {t("chats.yourJobs")}
              </Link>
            </div>
          </div>
        ) : shown.length === 0 ? (
          <p className="m-0 p-6 text-center text-[14px] text-app-ink-soft">{q ? t("msgr.noMatch", { q }) : t("msgr.noneHere")}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {shown.map((item) => {
              const selected = activeKey === item.key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => open(item)}
                    aria-current={selected ? "true" : undefined}
                    className={cx("flex w-full items-center gap-3 border-b border-app-line/70 px-3 py-3 text-left sm:px-4", selected ? "bg-app-canvas" : "hover:bg-app-canvas/60")}
                  >
                    <PartnerAvatar name={item.name} logoUrl={item.logoUrl} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cx("min-w-0 truncate text-[14px]", item.unread ? "font-extrabold" : "font-bold")}>{item.name}</span>
                        <ChatKindChip kind={item.kind} />
                        <span className={cx("ml-auto shrink-0 text-[11.5px]", item.unread ? "font-bold text-app-accent-ink" : "text-app-ink-faint")}>{item.last ? formatListTime(item.last.createdAt, Date.now(), locale) : ""}</span>
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-2">
                        {item.last?.mine && (
                          <span className={cx("inline-flex shrink-0", item.last.seen ? "text-app-forest" : "text-app-ink-faint")} aria-label={item.last.seen ? t("msgr.seen") : t("chats.sent")}>
                            <Icon name="check" size={12} />
                            {item.last.seen && <Icon name="check" size={12} className="-ml-[7px]" />}
                          </span>
                        )}
                        <span className={cx("min-w-0 flex-1 truncate text-[13px]", item.unread ? "font-semibold text-app-ink" : "text-app-ink-soft")}>
                          {item.last ? item.last.text : t("msgr.noMessages")}
                        </span>
                        {item.unread > 0 && (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-app-accent px-1.5 text-[11px] font-extrabold text-white" aria-label={t("msgr.unread", { count: item.unread })}>
                            {item.unread > 99 ? "99+" : item.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  const placeholder = (
    <div className="flex h-full flex-1 flex-col items-center justify-center bg-app-canvas/40 p-8 text-center">
      {opening ? (
        <p className="m-0 text-[14px] text-app-ink-soft">{t("msgr.opening")}</p>
      ) : openError || riderMissing ? (
        <>
          <p role="alert" className="m-0 max-w-[340px] text-[14px] font-semibold text-app-danger">{openError ?? t("chats.riderMissing")}</p>
          <button type="button" onClick={() => select(null)} className="mt-3 min-h-[36px] rounded-full border border-app-line bg-white px-4 text-[13px] font-bold lg:hidden">{t("thread.back")}</button>
        </>
      ) : active?.kind === "rider" ? (
        <p className="m-0 text-[14px] text-app-ink-soft">{t("msgr.opening")}</p>
      ) : (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-app-ink-soft"><Icon name="chat" size={22} /></span>
          <p className="mb-0 mt-3 text-[15px] font-extrabold">{t("chats.pick")}</p>
          <p className="mb-0 mt-1 max-w-[320px] text-[13.5px] text-app-ink-soft">{t("chats.pickSub")}</p>
        </>
      )}
    </div>
  );

  const thread =
    active?.kind === "rider" && activeRider ? (
      <RiderThread key={`r:${activeRider.riderId}`} rider={activeRider} onBack={() => select(null)} onActivity={() => void loadList()} />
    ) : active?.kind === "conversation" ? (
      <Thread
        key={`c:${active.summary.id}`}
        conversation={active.summary}
        role="logistics_partner"
        initialContext={active.context}
        filesEnabled={filesEnabled}
        onBack={() => select(null)}
        onActivity={() => void loadList()}
      />
    ) : null;

  const showRight = Boolean(active || opening || openError);
  return (
    <div className="grid h-[calc(100dvh-210px)] min-h-[520px] overflow-hidden rounded-[22px] border border-app-line bg-white lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <div className={cx("min-h-0 border-app-line lg:block lg:border-r", showRight ? "hidden" : "block")}>{list}</div>
      <div className={cx("min-h-0 lg:flex", showRight ? "flex" : "hidden")}>{thread ?? placeholder}</div>
    </div>
  );
}
