"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { MESSAGES_PATH, POLL_MS, filterConversations, type ContextRef, type ConversationSummary, type ConversationTab, type PartnerRole, type ThreadMessage } from "@/lib/conversations/pure";
import { MESSAGES_CHANGED_EVENT, messagesApi, type OpenConversationDetail } from "./client";
import { EmptyPartners, PartnerAvatar, RoleBadge, formatListTime } from "./parts";
import { Thread } from "./Thread";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@shared/i18n/catalog";

// The partner messenger used by the Messages drawer and the full pages in all three portals:
// conversation list (search, tabs, unread counts) and the open chat.

const TABS: Record<PartnerRole, Array<{ id: ConversationTab; label: MessageKey<"inbox"> }>> = {
  seller: [
    { id: "all", label: "list.all" },
    { id: "supplier", label: "msgr.suppliers" },
    { id: "logistics_partner", label: "msgr.logistics" },
  ],
  supplier: [
    { id: "all", label: "list.all" },
    { id: "seller", label: "msgr.sellers" },
    { id: "logistics_partner", label: "msgr.logistics" },
  ],
  logistics_partner: [
    { id: "all", label: "list.all" },
    { id: "seller", label: "msgr.sellers" },
    { id: "supplier", label: "msgr.suppliers" },
  ],
  admin: [{ id: "all", label: "list.all" }],
};

type ListMeta = { unread: number; filesEnabled: boolean };

export function Messenger({
  role,
  variant,
  initial,
  onNavigate,
}: {
  role: PartnerRole;
  variant: "drawer" | "page";
  /** Chat to open on arrival: a conversation, or a person/business to start one with (+ a linked card). */
  initial?: OpenConversationDetail | null;
  /** The drawer closes when a link inside is followed. */
  onNavigate?: () => void;
}) {
  const t = useT("inbox", "common");
  const locale = useLocale();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filesEnabled, setFilesEnabled] = useState(true);
  const [tab, setTab] = useState<ConversationTab>("all");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<ConversationSummary | null>(null);
  const [activeContext, setActiveContext] = useState<ContextRef | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const loadList = useCallback(async () => {
    try {
      const body = await messagesApi<ConversationSummary[], ListMeta>("/api/conversations");
      setItems(body.data);
      setFilesEnabled(body.meta?.filesEnabled ?? true);
      setListError(null);
      // Keep the open chat's header (name, logo) in step with the list.
      const current = activeRef.current;
      if (current) {
        const fresh = body.data.find((item) => item.id === current.id || item.with.userId === current.with.userId);
        if (fresh && fresh.id === current.id) setActive((value) => (value ? { ...value, with: fresh.with } : value));
      }
    } catch (error) {
      setListError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
    const poll = () => document.visibilityState === "visible" && void loadList();
    const timer = window.setInterval(poll, POLL_MS.list);
    window.addEventListener(MESSAGES_CHANGED_EVENT, poll);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(MESSAGES_CHANGED_EVENT, poll);
    };
  }, [loadList]);

  const select = useCallback(
    (summary: ConversationSummary | null, context: ContextRef | null = null) => {
      setActive(summary ? { ...summary } : null);
      setActiveContext(context);
      setOpenError(null);
      if (variant === "page" && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("with");
        url.searchParams.delete("ctx");
        if (summary) url.searchParams.set("c", summary.id);
        else url.searchParams.delete("c");
        window.history.replaceState(null, "", url.toString());
      }
    },
    [variant],
  );

  // Open what we were asked to: start a chat with someone, or jump to a conversation.
  const initialKey = initial ? JSON.stringify(initial) : "";
  useEffect(() => {
    if (!initial || (!initial.with && !initial.conversation)) return;
    let alive = true;
    setOpening(true);
    setOpenError(null);
    const run = async () => {
      if (initial.with) {
        const body = await messagesApi<ConversationSummary>("/api/conversations", { method: "POST", body: JSON.stringify({ with: initial.with }) });
        return body.data;
      }
      const body = await messagesApi<ThreadMessage[], { conversation: ConversationSummary | null }>(`/api/conversations/${encodeURIComponent(initial.conversation!)}/messages`);
      if (!body.meta?.conversation) throw new Error(t("msgr.unavailable"));
      return body.meta.conversation;
    };
    run()
      .then((summary) => {
        if (!alive) return;
        select(summary, initial.context ?? null);
        void loadList();
      })
      .catch((error: Error) => alive && setOpenError(error.message))
      .finally(() => alive && setOpening(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const tabs = TABS[role] ?? TABS.seller;
  const shown = useMemo(() => filterConversations(items, tab, q), [items, tab, q]);
  const unreadByTab = useMemo(() => {
    const counts: Partial<Record<ConversationTab, number>> = {};
    for (const item of items) {
      counts.all = (counts.all ?? 0) + item.unread;
      counts[item.with.role as ConversationTab] = (counts[item.with.role as ConversationTab] ?? 0) + item.unread;
    }
    return counts;
  }, [items]);

  const list = (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="shrink-0 px-3 pt-3 sm:px-4">
        <label className="flex h-10 items-center gap-2 rounded-full bg-app-canvas px-3.5 text-app-ink-soft focus-within:ring-2 focus-within:ring-app-ink/15">
          <Icon name="search" size={15} />
          <span className="sr-only">{t("list.searchLabel")}</span>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("msgr.search")} className="min-w-0 flex-1 bg-transparent text-[16px] text-app-ink outline-none placeholder:text-app-ink-faint sm:text-[14px]" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label={t("msgr.clearSearch")} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white">
              <Icon name="x" size={11} />
            </button>
          )}
        </label>
      </div>
      <div role="tablist" aria-label={t("msgr.filter")} className="flex shrink-0 gap-1 border-b border-app-line px-3 pt-2 sm:px-4">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cx(
              "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-bold",
              tab === item.id ? "border-app-ink text-app-ink" : "border-transparent text-app-ink-soft hover:text-app-ink",
            )}
          >
            {t(item.label)}
            {(unreadByTab[item.id] ?? 0) > 0 && <span className="h-1.5 w-1.5 rounded-full bg-app-accent" aria-label={t("msgr.hasUnread")} />}
          </button>
        ))}
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
          <div onClickCapture={(event) => (event.target as HTMLElement).closest("a") && onNavigate?.()}>
            <EmptyPartners role={role} compact={variant === "drawer"} />
          </div>
        ) : shown.length === 0 ? (
          <p className="m-0 p-6 text-center text-[14px] text-app-ink-soft">{q ? t("msgr.noMatch", { q }) : t("msgr.noneHere")}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {shown.map((item) => {
              const selected = active?.id === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => select(item)}
                    aria-current={selected ? "true" : undefined}
                    className={cx("flex w-full items-center gap-3 border-b border-app-line/70 px-3 py-3 text-left sm:px-4", selected ? "bg-app-canvas" : "hover:bg-app-canvas/60")}
                  >
                    <PartnerAvatar name={item.with.name} logoUrl={item.with.logoUrl} size={42} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cx("min-w-0 truncate text-[14px]", item.unread ? "font-extrabold" : "font-bold")}>{item.with.name}</span>
                        <RoleBadge role={item.with.role} />
                        <span className="ml-auto shrink-0 text-[11.5px] text-app-ink-faint">{item.lastMessage ? formatListTime(item.lastMessage.createdAt, Date.now(), locale) : ""}</span>
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-2">
                        <span className={cx("min-w-0 flex-1 truncate text-[13px]", item.unread ? "font-semibold text-app-ink" : "text-app-ink-soft")}>
                          {item.lastMessage ? `${item.lastMessage.mine ? `${t("msgr.youPrefix")} ` : ""}${item.lastMessage.text}` : t("msgr.noMessages")}
                        </span>
                        {item.unread > 0 ? (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-app-accent px-1.5 text-[11px] font-extrabold text-white" aria-label={t("msgr.unread", { count: item.unread })}>
                            {item.unread > 99 ? "99+" : item.unread}
                          </span>
                        ) : item.lastMessage?.mine && item.lastMessage.seen ? (
                          <span className="shrink-0 text-app-ink-faint" title={t("msgr.seen")}><Icon name="checkCircle" size={13} /></span>
                        ) : null}
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
      ) : openError ? (
        <p role="alert" className="m-0 max-w-[340px] text-[14px] font-semibold text-app-danger">{openError}</p>
      ) : (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-app-ink-soft"><Icon name="chat" size={22} /></span>
          <p className="mb-0 mt-3 text-[15px] font-extrabold">{t("msgr.pick")}</p>
          <p className="mb-0 mt-1 max-w-[320px] text-[13.5px] text-app-ink-soft">{t("msgr.pickSub")}</p>
        </>
      )}
    </div>
  );

  const thread = active ? (
    <Thread
      key={active.id}
      conversation={active}
      role={role}
      initialContext={activeContext}
      filesEnabled={filesEnabled}
      onBack={() => select(null)}
      onActivity={() => void loadList()}
      compact={variant === "drawer"}
    />
  ) : null;

  if (variant === "drawer") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {opening || openError ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {placeholder}
            {openError && (
              <div className="border-t border-app-line p-3 text-center">
                <button type="button" onClick={() => setOpenError(null)} className="min-h-[36px] rounded-full border border-app-line px-4 text-[13px] font-bold">{t("thread.back")}</button>
              </div>
            )}
          </div>
        ) : (
          thread ?? list
        )}
        <div className="shrink-0 border-t border-app-line px-4 py-2.5 text-center">
          <Link href={active ? `${MESSAGES_PATH[role]}?c=${active.id}` : MESSAGES_PATH[role]} onClick={onNavigate} className="text-[13px] font-extrabold text-app-accent-ink no-underline hover:underline">
            {t("msgr.fullPage")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100dvh-210px)] min-h-[520px] overflow-hidden rounded-[22px] border border-app-line bg-white lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <div className={cx("min-h-0 border-app-line lg:block lg:border-r", active || opening ? "hidden" : "block")}>{list}</div>
      <div className={cx("min-h-0 lg:flex", active || opening || openError ? "flex" : "hidden")}>{thread ?? placeholder}</div>
    </div>
  );
}
