"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cx } from "@/components/app-ui";
import { Avatar } from "@/components/seller-core";
import { Icon } from "@/components/ui/Icon";
import { ChannelMark, formatWhen, inboxApi, useChannelLabel, type ListChannelKey } from "@/components/messaging/inbox-ui";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@shared/i18n/catalog";
import { CHANNEL_KEYS } from "@/lib/inbox/meta";
import type { InboxListItem } from "@/lib/inbox/queries";
import { InboxThread } from "./InboxThread";
import { PartnerThread } from "./PartnerThread";

// The all-in-one inbox: conversation list (channel marks, filters) → thread → customer sidebar.
// Phones show one pane at a time. The list refreshes every 10 seconds; the open thread every 5.

type StatusFilter = "open" | "snoozed" | "closed" | "all";
type ViewFilter = "all" | "unread" | "mine" | "unassigned";

const STATUS_TABS: Array<{ value: StatusFilter; label: MessageKey<"inbox"> }> = [
  { value: "open", label: "list.open" },
  { value: "snoozed", label: "list.snoozed" },
  { value: "closed", label: "list.closed" },
  { value: "all", label: "list.all" },
];

interface Props {
  initialItems: InboxListItem[];
  initialKey: string | null;
  me: { id: string; email: string; name: string; phone: string | null };
  team: Array<{ email: string; label: string }>;
  canned: Array<{ id: string; title: string; body: string }>;
  connected: string[];
  aiAvailable: boolean;
  autoReplyOn: boolean;
  partnerContacts: Array<{ userId: string; name: string; role: string }>;
}

export function UnifiedInbox({ initialItems, initialKey, me, team, canned, connected, aiAvailable, autoReplyOn, partnerContacts }: Props) {
  const t = useT("inbox");
  const locale = useLocale();
  const channelLabel = useChannelLabel();
  const [items, setItems] = useState(initialItems);
  const [selected, setSelected] = useState<string | null>(initialKey ?? null);
  const [pane, setPane] = useState<"list" | "thread">(initialKey ? "thread" : "list");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [channel, setChannel] = useState<ListChannelKey | "any">("any");
  const [view, setView] = useState<ViewFilter>("all");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [draftPartner, setDraftPartner] = useState<{ userId: string; name: string; role: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await inboxApi<InboxListItem[]>("/api/app/inbox/conversations"));
    } catch {
      // Keep the last list; the next poll tries again.
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Keep the open conversation in the address bar so a refresh or a shared link reopens it.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("c");
    url.searchParams.delete("p");
    if (selected?.startsWith("c:")) url.searchParams.set("c", selected.slice(2));
    if (selected?.startsWith("p:")) url.searchParams.set("p", selected.slice(2));
    window.history.replaceState(null, "", url.toString());
  }, [selected]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (status !== "all" && item.status !== status) return false;
      if (channel !== "any" && item.channel !== channel) return false;
      if (view === "unread" && item.unread === 0) return false;
      if (view === "mine" && item.assigneeEmail !== me.email) return false;
      if (view === "unassigned" && (item.assigneeEmail || item.source === "partner")) return false;
      if (q && !`${item.name} ${item.sub ?? ""} ${item.preview} ${item.tags.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, status, channel, view, query, me.email]);

  const counts = useMemo(() => {
    const byStatus: Record<StatusFilter, number> = { open: 0, snoozed: 0, closed: 0, all: items.length };
    for (const item of items) byStatus[item.status] += 1;
    return byStatus;
  }, [items]);

  const channelsInUse = useMemo(() => {
    const used = new Set(items.map((item) => item.channel));
    return [...CHANNEL_KEYS.filter((key) => used.has(key)), ...(used.has("partner") ? (["partner"] as const) : [])];
  }, [items]);

  const active = items.find((item) => item.key === selected) ?? null;

  function open(key: string) {
    setSelected(key);
    setPane("thread");
    setDraftPartner(null);
  }

  function patchActive(patch: Partial<InboxListItem>) {
    if (!selected) return;
    setItems((current) => current.map((item) => (item.key === selected ? { ...item, ...patch } : item)));
  }

  const select = "h-10 min-w-0 rounded-full border border-app-line bg-white px-3 text-[13px] font-bold outline-none focus:border-app-ink";

  return (
    <div className="flex h-[calc(100dvh-210px)] min-h-[520px] overflow-hidden rounded-[22px] border border-app-line bg-white">
      <section aria-label={t("list.conversations")} className={cx("min-h-0 min-w-0 flex-col border-app-line lg:flex lg:w-[340px] lg:shrink-0 lg:border-r 2xl:w-[380px]", pane === "list" ? "flex w-full" : "hidden")}>
        <div className="grid gap-2 border-b border-app-line p-3">
          <div className="flex items-center gap-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-app-line px-3 focus-within:border-app-ink">
              <Icon name="search" size={15} className="shrink-0 text-app-ink-soft" />
              <span className="sr-only">{t("list.searchLabel")}</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("list.search")} className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] outline-none placeholder:text-app-ink-faint" />
            </label>
            <button type="button" onClick={() => setPicking((v) => !v)} aria-expanded={picking} aria-label={t("list.messagePartner")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-ink text-white hover:bg-black">
              <Icon name="plus" size={16} />
            </button>
          </div>
          <div role="tablist" aria-label={t("list.status")} className="flex gap-1 overflow-x-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={status === tab.value}
                onClick={() => setStatus(tab.value)}
                className={cx("inline-flex min-h-[34px] shrink-0 items-center rounded-full px-3 text-[13px] font-bold", status === tab.value ? "bg-app-ink text-white" : "text-app-ink hover:bg-app-canvas")}
              >
                {t(tab.label)}
                {tab.value !== "all" && counts[tab.value] > 0 && <span className={cx("ml-1", status === tab.value ? "text-white/70" : "text-app-ink-soft")}>{counts[tab.value]}</span>}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="sr-only" htmlFor="inbox-channel">{t("list.channel")}</label>
            <select id="inbox-channel" value={channel} onChange={(e) => setChannel(e.target.value as ListChannelKey | "any")} className={select}>
              <option value="any">{t("list.allChannels")}</option>
              {channelsInUse.map((key) => <option key={key} value={key}>{channelLabel(key)}</option>)}
            </select>
            <label className="sr-only" htmlFor="inbox-view">{t("list.show")}</label>
            <select id="inbox-view" value={view} onChange={(e) => setView(e.target.value as ViewFilter)} className={select}>
              <option value="all">{t("list.everyones")}</option>
              <option value="unread">{t("list.unread")}</option>
              <option value="mine">{t("list.mine")}</option>
              <option value="unassigned">{t("list.unassigned")}</option>
            </select>
          </div>
          {autoReplyOn && <p className="m-0 flex items-center gap-1.5 text-[12px] text-app-ink-soft"><Icon name="clock" size={13} /> {t("list.away")}</p>}
        </div>

        {picking && (
          <div className="max-h-[50%] overflow-y-auto border-b border-app-line bg-app-canvas/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-extrabold">{t("list.messagePartner")}</span>
              <Link href="/marketplace/suppliers" className="text-[12.5px] font-bold text-app-accent-ink">{t("list.findMore")}</Link>
            </div>
            {partnerContacts.length === 0 ? (
              <p className="m-0 text-[13px] text-app-ink-soft">{t("list.noPartners")}</p>
            ) : (
              <ul className="m-0 grid list-none gap-1 p-0">
                {partnerContacts.map((contact) => {
                  const existing = items.find((item) => item.partner?.contactUserId === contact.userId);
                  return (
                    <li key={contact.userId}>
                      <button
                        type="button"
                        onClick={() => {
                          setPicking(false);
                          if (existing) open(existing.key);
                          else {
                            setSelected(null);
                            setDraftPartner(contact);
                            setPane("thread");
                          }
                        }}
                        className="flex w-full items-center gap-2.5 rounded-[12px] bg-white px-3 py-2 text-left hover:ring-1 hover:ring-app-line-strong"
                      >
                        <Avatar name={contact.name} size={30} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{contact.name}</span>
                        <span className="shrink-0 text-[12px] text-app-ink-soft">{contact.role}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <div className="p-6 text-center text-[14px] text-app-ink-soft">
              {items.length === 0 ? (
                <>
                  <p className="m-0 font-bold text-app-ink">{t("list.emptyTitle")}</p>
                  <p className="mb-3 mt-1">{t("list.emptyBody")}</p>
                  <Link href="/home/inbox/channels" className="inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[14px] font-bold text-white no-underline">{t("list.connect")}</Link>
                </>
              ) : (
                <p className="m-0">{t("list.noMatch")}</p>
              )}
            </div>
          ) : (
            <ul className="m-0 list-none divide-y divide-app-line p-0">
              {shown.map((item) => {
                const isActive = item.key === selected;
                const unread = item.unread > 0;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => open(item.key)}
                      aria-current={isActive ? "true" : undefined}
                      className={cx("flex w-full items-start gap-3 px-4 py-3 text-left transition", isActive ? "bg-app-canvas" : "hover:bg-app-canvas/60")}
                    >
                      <span className="relative shrink-0">
                        <Avatar name={item.name} size={42} />
                        <ChannelMark channel={item.channel} size={20} className="absolute -bottom-1 -right-1 ring-2 ring-white" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cx("truncate text-[14.5px]", unread ? "font-extrabold" : "font-bold")}>{item.name}</span>
                          <span className="shrink-0 text-[12px] text-app-ink-soft">{formatWhen(item.at, locale)}</span>
                        </span>
                        <span className={cx("mt-0.5 block truncate text-[13px]", unread ? "font-semibold text-app-ink" : "text-app-ink-soft")}>{item.preview || item.sub || channelLabel(item.channel)}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          {unread && <span className="inline-flex items-center gap-1 rounded-full bg-app-accent px-2 py-0.5 text-[11px] font-bold text-white">{t("list.new", { count: item.unread })}</span>}
                          {item.status === "snoozed" && <span className="rounded-full bg-[#FDF0D5] px-2 py-0.5 text-[11px] font-bold text-[#8A5A00]">{t("list.snoozed")}</span>}
                          {item.status === "closed" && <span className="rounded-full bg-app-canvas px-2 py-0.5 text-[11px] font-bold text-app-ink-soft">{t("list.closed")}</span>}
                          {item.assigneeEmail && <span className="truncate rounded-full bg-app-canvas px-2 py-0.5 text-[11px] font-bold text-app-ink-soft">{item.assigneeEmail === me.email ? t("you") : item.assigneeEmail.split("@")[0]}</span>}
                          {item.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-app-canvas px-2 py-0.5 text-[11px] font-bold text-app-ink-soft">{tag}</span>)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section aria-label={t("list.conversation")} className={cx("min-h-0 min-w-0 flex-1 flex-col lg:flex", pane === "thread" ? "flex" : "hidden")}>
        {draftPartner ? (
          <PartnerThread
            key={`new-${draftPartner.userId}`}
            conversationId={null}
            recipientId={draftPartner.userId}
            name={draftPartner.name}
            roleLabel={draftPartner.role}
            meId={me.id}
            onBack={() => setPane("list")}
            onStarted={(id) => {
              void refresh().then(() => open(`p:${id}`));
            }}
          />
        ) : active?.source === "partner" && active.partner ? (
          <PartnerThread
            key={active.key}
            conversationId={active.id}
            recipientId={active.partner.contactUserId}
            name={active.name}
            roleLabel={active.sub ?? t("role.partnerShort")}
            meId={me.id}
            onBack={() => setPane("list")}
            onStarted={() => undefined}
          />
        ) : selected?.startsWith("c:") ? (
          <InboxThread
            key={selected}
            conversationId={selected.slice(2)}
            me={me}
            team={team}
            canned={canned}
            connected={connected}
            aiAvailable={aiAvailable}
            onBack={() => setPane("list")}
            onChanged={(patch) => patchActive(patch)}
            onOpen={(id) => open(`c:${id}`)}
          />
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center text-[14px] text-app-ink-soft">
            <div>
              <Icon name="message" size={30} className="mx-auto" />
              <p className="mb-0 mt-2">{t("list.pick")}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
