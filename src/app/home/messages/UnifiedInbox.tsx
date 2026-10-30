"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { cx } from "@/components/app-ui";
import { Avatar } from "@/components/seller-core";
import { Icon } from "@/components/ui/Icon";
import { ChannelMark, formatWhen, inboxApi, useChannelLabel, type ListChannelKey } from "@/components/messaging/inbox-ui";
import { MESSAGES_CHANGED_EVENT, messagesApi } from "@/components/conversations/client";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@shared/i18n/catalog";
import { CHANNEL_KEYS } from "@/lib/inbox/meta";
import type { InboxListItem } from "@/lib/inbox/queries";
import type { ContextRef, ConversationSummary } from "@/lib/conversations/pure";
import { friendlyError } from "@/lib/errors/report-client";
import {
  matchesSellerInboxFilter,
  partnerChatKind,
  sellerInboxChips,
  sellerInboxCounts,
  type SellerChatKind,
  type SellerInboxFilter,
  type ShopRiderChat,
} from "@shared/seller-inbox";
import { InboxThread } from "./InboxThread";
import { PartnerPane } from "./PartnerPane";
import { RiderPane } from "./RiderPane";

// The seller's one chat inbox (founder's plan item 8): every conversation in one list — customers on every channel
// (WhatsApp, Instagram, Messenger, SMS, email, Telegram, calls, live chat, forms), suppliers, delivery partners and
// the riders carrying the shop's parcels (GET /api/mobile/delivery/rider-chats) — with kind chips (All, Customers,
// Suppliers, Delivery, Riders, Unread; Creators once there are creator chats), search and unread badges. On the right
// the open chat, with the order or delivery it belongs to in a bar under its header. Phones show one pane at a time.
// The list refreshes every 10 seconds. URL: ?c=<customer chat> | ?p=<partner conversation> | ?r=<delivery job>
// | ?with=<user/supplier/partner id>&ctx=<kind:id> (starts a partner chat) | ?kind=<chip>.

type StatusFilter = "open" | "snoozed" | "closed" | "all";
type ViewFilter = "all" | "unread" | "mine" | "unassigned";

const STATUS_TABS: Array<{ value: StatusFilter; label: MessageKey<"inbox"> }> = [
  { value: "open", label: "list.open" },
  { value: "snoozed", label: "list.snoozed" },
  { value: "closed", label: "list.closed" },
  { value: "all", label: "list.all" },
];

const CHIP_WORD: Record<SellerInboxFilter, MessageKey<"inbox">> = {
  all: "uni.chip.all",
  customer: "uni.chip.customer",
  supplier: "uni.chip.supplier",
  delivery: "uni.chip.delivery",
  rider: "uni.chip.rider",
  creator: "uni.chip.creator",
  partners: "uni.chip.partners",
  unread: "uni.chip.unread",
};

const KIND_WORD: Record<SellerChatKind, MessageKey<"inbox">> = {
  customer: "uni.kind.customer",
  supplier: "uni.kind.supplier",
  delivery: "uni.kind.delivery",
  rider: "uni.kind.rider",
  creator: "uni.kind.creator",
};

const KIND_TONE: Record<SellerChatKind, string> = {
  customer: "bg-app-peach text-app-accent-ink",
  supplier: "bg-app-mint text-app-forest",
  delivery: "bg-[#FDF0D5] text-[#8A5A00]",
  rider: "bg-app-lilac text-app-ink",
  creator: "bg-app-canvas text-app-ink",
};

/** One row of the list, whatever is on the other side. */
interface Row {
  key: string;
  kind: SellerChatKind;
  name: string;
  preview: string;
  at: string;
  unread: number;
  status: InboxListItem["status"];
  item: InboxListItem | null;
  rider: ShopRiderChat | null;
}

interface Props {
  initialItems: InboxListItem[];
  initialRiders: ShopRiderChat[];
  initialKey: string | null;
  initialFilter: SellerInboxFilter;
  /** ?with=&ctx=: start (or find) a partner chat on arrival. */
  startWith: { with: string; context: ContextRef | null } | null;
  me: { id: string; email: string; name: string; phone: string | null };
  team: Array<{ email: string; label: string }>;
  canned: Array<{ id: string; title: string; body: string }>;
  connected: string[];
  aiAvailable: boolean;
  autoReplyOn: boolean;
  partnerContacts: Array<{ userId: string; name: string; role: string }>;
}

export function UnifiedInbox({ initialItems, initialRiders, initialKey, initialFilter, startWith, me, team, canned, connected, aiAvailable, autoReplyOn, partnerContacts }: Props) {
  const t = useT("inbox");
  const locale = useLocale();
  const channelLabel = useChannelLabel();
  const [items, setItems] = useState(initialItems);
  const [riders, setRiders] = useState(initialRiders);
  const [partners, setPartners] = useState<ConversationSummary[]>([]);
  const [filesEnabled, setFilesEnabled] = useState(true);
  const [selected, setSelected] = useState<string | null>(initialKey ?? null);
  const [pane, setPane] = useState<"list" | "thread">(initialKey || startWith ? "thread" : "list");
  const [kind, setKind] = useState<SellerInboxFilter>(initialFilter);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [channel, setChannel] = useState<ListChannelKey | "any">("any");
  const [view, setView] = useState<ViewFilter>("all");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startContext, setStartContext] = useState<{ key: string; context: ContextRef | null } | null>(null);

  const refresh = useCallback(async () => {
    // Customers (with the partner chats), riders and the partner conversations load side by side; one failing
    // keeps the last list of that kind.
    const [inbox, riderChats, conversations] = await Promise.allSettled([
      inboxApi<InboxListItem[]>("/api/app/inbox/conversations"),
      messagesApi<ShopRiderChat[]>("/api/mobile/delivery/rider-chats"),
      messagesApi<ConversationSummary[], { filesEnabled?: boolean }>("/api/conversations"),
    ]);
    if (inbox.status === "fulfilled") setItems(inbox.value);
    if (riderChats.status === "fulfilled") setRiders(riderChats.value.data);
    if (conversations.status === "fulfilled") {
      setPartners(conversations.value.data);
      setFilesEnabled(conversations.value.meta?.filesEnabled ?? true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = () => document.visibilityState === "visible" && void refresh();
    const timer = window.setInterval(poll, 10_000);
    window.addEventListener(MESSAGES_CHANGED_EVENT, poll);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(MESSAGES_CHANGED_EVENT, poll);
    };
  }, [refresh]);

  // Keep the open conversation and the chip in the address bar so a refresh or a shared link reopens them.
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const key of ["c", "p", "r", "with", "ctx", "kind"]) url.searchParams.delete(key);
    if (selected) url.searchParams.set(selected.slice(0, 1), selected.slice(2));
    if (kind !== "all") url.searchParams.set("kind", kind);
    window.history.replaceState(null, "", url.toString());
  }, [selected, kind]);

  const open = useCallback((key: string) => {
    setSelected(key);
    setPane("thread");
    setStartError(null);
  }, []);

  // Start (or find) a chat with a supplier or delivery partner, then open it.
  const startPartner = useCallback(
    async (withId: string, context: ContextRef | null = null) => {
      setStarting(true);
      setStartError(null);
      setSelected(null);
      setPane("thread");
      try {
        const summary = (await messagesApi<ConversationSummary>("/api/conversations", { method: "POST", body: JSON.stringify({ with: withId }) })).data;
        setPartners((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
        setStartContext({ key: `p:${summary.id}`, context });
        open(`p:${summary.id}`);
      } catch (error) {
        setStartError(friendlyError(error));
      } finally {
        setStarting(false);
      }
    },
    [open],
  );

  const startKey = startWith ? JSON.stringify(startWith) : "";
  useEffect(() => {
    if (startWith) void startPartner(startWith.with, startWith.context);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey]);

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = items.map((item) => ({
      key: item.key,
      kind: item.source === "partner" ? partnerChatKind(item.partner?.role) : "customer",
      name: item.name,
      preview: item.preview || item.sub || "",
      at: item.at,
      unread: item.unread,
      status: item.status,
      item,
      rider: null,
    }));
    for (const rider of riders) {
      list.push({
        key: `r:${rider.jobId}`,
        kind: "rider",
        name: rider.riderName,
        preview: rider.last?.text || (rider.order ? t("uni.riderOrder", { number: rider.order.number }) : t("uni.riderSub")),
        at: rider.at,
        unread: rider.unread,
        status: "open",
        item: null,
        rider,
      });
    }
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [items, riders, t]);

  // Status, channel and "assigned" only mean something for customer chats.
  const customerFilters = kind === "all" || kind === "customer";
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesSellerInboxFilter(row, kind)) return false;
      if (customerFilters) {
        if (status !== "all" && row.status !== status) return false;
        if (channel !== "any" && row.item?.channel !== channel) return false;
        if (view === "unread" && row.unread === 0) return false;
        if (view === "mine" && row.item?.assigneeEmail !== me.email) return false;
        if (view === "unassigned" && (row.kind !== "customer" || row.item?.assigneeEmail)) return false;
      }
      if (q) {
        const rider = row.rider ? `${row.rider.company} ${row.rider.order?.number ?? ""}` : "";
        const extra = row.item ? `${row.item.sub ?? ""} ${row.item.tags.join(" ")}` : "";
        if (!`${row.name} ${row.preview} ${extra} ${rider}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, kind, customerFilters, status, channel, view, query, me.email]);

  const counts = useMemo(() => {
    const byStatus: Record<StatusFilter, number> = { open: 0, snoozed: 0, closed: 0, all: rows.length };
    for (const row of rows) byStatus[row.status] += 1;
    return byStatus;
  }, [rows]);
  const chipCounts = useMemo(() => sellerInboxCounts(rows), [rows]);
  const chips = useMemo(() => sellerInboxChips(rows, kind), [rows, kind]);

  const channelsInUse = useMemo(() => {
    const used = new Set(items.filter((item) => item.source === "inbox").map((item) => item.channel));
    return CHANNEL_KEYS.filter((key) => used.has(key));
  }, [items]);

  function patchActive(patch: Partial<InboxListItem>) {
    if (!selected) return;
    setItems((current) => current.map((item) => (item.key === selected ? { ...item, ...patch } : item)));
  }

  const backToList = () => setPane("list");
  const select = "h-10 min-w-0 rounded-full border border-app-line bg-white px-3 text-[13px] font-bold outline-none focus:border-app-ink";
  const selectedId = selected ? selected.slice(2) : null;

  let thread: ReactNode;
  if (selected?.startsWith("p:") && selectedId) {
    thread = (
      <PartnerPane
        key={selected}
        conversationId={selectedId}
        known={partners.find((item) => item.id === selectedId) ?? null}
        filesEnabled={filesEnabled}
        initialContext={startContext?.key === selected ? startContext.context : null}
        onBack={backToList}
        onActivity={() => void refresh()}
      />
    );
  } else if (selected?.startsWith("r:") && selectedId) {
    thread = <RiderPane key={selected} jobId={selectedId} known={riders.find((rider) => rider.jobId === selectedId) ?? null} onBack={backToList} onActivity={() => void refresh()} />;
  } else if (selected?.startsWith("c:") && selectedId) {
    thread = (
      <InboxThread
        key={selected}
        conversationId={selectedId}
        me={me}
        team={team}
        canned={canned}
        connected={connected}
        aiAvailable={aiAvailable}
        onBack={backToList}
        onChanged={(patch) => patchActive(patch)}
        onOpen={(id) => open(`c:${id}`)}
      />
    );
  } else {
    thread = (
      <div className="grid flex-1 place-items-center p-6 text-center text-[14px] text-app-ink-soft">
        {starting ? (
          <p className="m-0">{t("msgr.opening")}</p>
        ) : startError ? (
          <div>
            <p role="alert" className="m-0 font-semibold text-app-danger">{startError}</p>
            <button type="button" onClick={backToList} className="mt-3 min-h-[36px] rounded-full border border-app-line bg-white px-4 text-[13px] font-bold lg:hidden">{t("thread.back")}</button>
          </div>
        ) : (
          <div>
            <Icon name="message" size={30} className="mx-auto" />
            <p className="mb-0 mt-2">{t("list.pick")}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-210px)] min-h-[520px] overflow-hidden rounded-[22px] border border-app-line bg-white">
      <section aria-label={t("list.conversations")} className={cx("min-h-0 min-w-0 flex-col border-app-line lg:flex lg:w-[360px] lg:shrink-0 lg:border-r 2xl:w-[400px]", pane === "list" ? "flex w-full" : "hidden")}>
        <div className="grid gap-2 border-b border-app-line p-3">
          <div className="flex items-center gap-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-app-line px-3 focus-within:border-app-ink">
              <Icon name="search" size={15} className="shrink-0 text-app-ink-soft" />
              <span className="sr-only">{t("list.searchLabel")}</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("uni.search")} className="min-w-0 flex-1 border-0 bg-transparent text-[16px] outline-none placeholder:text-app-ink-faint sm:text-[14.5px]" />
            </label>
            <button type="button" onClick={() => setPicking((v) => !v)} aria-expanded={picking} aria-label={t("list.messagePartner")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-ink text-white hover:bg-black">
              <Icon name="plus" size={16} />
            </button>
          </div>
          <div role="tablist" aria-label={t("uni.kinds")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {chips.map((chip) => {
              const on = kind === chip;
              const count = chip === "all" ? 0 : chipCounts[chip];
              return (
                <button
                  key={chip}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setKind(chip)}
                  className={cx(
                    "inline-flex min-h-[32px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-bold transition",
                    on ? "bg-app-ink text-white" : "border border-app-line bg-white text-app-ink-soft hover:text-app-ink",
                  )}
                >
                  {t(CHIP_WORD[chip])}
                  {count > 0 && (
                    <span className={cx("grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-extrabold", on ? "bg-white text-app-ink" : "bg-app-accent text-white")}>
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {customerFilters && (
            <>
              <div role="tablist" aria-label={t("list.status")} className="flex gap-1 overflow-x-auto">
                {STATUS_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={status === tab.value}
                    onClick={() => setStatus(tab.value)}
                    className={cx("inline-flex min-h-[30px] shrink-0 items-center rounded-full px-3 text-[12.5px] font-bold", status === tab.value ? "bg-app-canvas text-app-ink ring-1 ring-app-line-strong" : "text-app-ink-soft hover:bg-app-canvas")}
                  >
                    {t(tab.label)}
                    {tab.value !== "all" && counts[tab.value] > 0 && <span className="ml-1 text-app-ink-soft">{counts[tab.value]}</span>}
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
            </>
          )}
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
                          else void startPartner(contact.userId);
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
              {rows.length === 0 ? (
                <>
                  <p className="m-0 font-bold text-app-ink">{t("list.emptyTitle")}</p>
                  <p className="mb-3 mt-1">{t("list.emptyBody")}</p>
                  <Link href="/home/inbox/channels" className="inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[14px] font-bold text-white no-underline">{t("list.connect")}</Link>
                </>
              ) : kind === "rider" && !query ? (
                <p className="m-0">{t("uni.noRiders")}</p>
              ) : (
                <p className="m-0">{t("list.noMatch")}</p>
              )}
            </div>
          ) : (
            <ul className="m-0 list-none divide-y divide-app-line p-0">
              {shown.map((row) => {
                const isActive = row.key === selected;
                const unread = row.unread > 0;
                const item = row.item;
                return (
                  <li key={row.key}>
                    <button
                      type="button"
                      onClick={() => open(row.key)}
                      aria-current={isActive ? "true" : undefined}
                      className={cx("flex w-full items-start gap-3 px-4 py-3 text-left transition", isActive ? "bg-app-canvas" : "hover:bg-app-canvas/60")}
                    >
                      <span className="relative shrink-0">
                        <Avatar name={row.name} size={42} />
                        {item ? (
                          <ChannelMark channel={item.channel} size={20} className="absolute -bottom-1 -right-1 ring-2 ring-white" />
                        ) : (
                          <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-app-lilac text-app-ink ring-2 ring-white" aria-hidden>
                            <Icon name="truck" size={11} />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cx("truncate text-[14.5px]", unread ? "font-extrabold" : "font-bold")}>{row.name}</span>
                          <span suppressHydrationWarning className="shrink-0 text-[12px] text-app-ink-soft">{formatWhen(row.at, locale)}</span>
                        </span>
                        <span className={cx("mt-0.5 block truncate text-[13px]", unread ? "font-semibold text-app-ink" : "text-app-ink-soft")}>{row.preview || (item ? channelLabel(item.channel) : "")}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold", KIND_TONE[row.kind])}>{t(KIND_WORD[row.kind])}</span>
                          {unread && <span className="inline-flex items-center gap-1 rounded-full bg-app-accent px-2 py-0.5 text-[11px] font-bold text-white">{t("list.new", { count: row.unread })}</span>}
                          {row.rider?.order && <span className="truncate rounded-full bg-app-canvas px-2 py-0.5 text-[11px] font-bold text-app-ink-soft">{t("uni.riderOrder", { number: row.rider.order.number })}</span>}
                          {row.status === "snoozed" && <span className="rounded-full bg-[#FDF0D5] px-2 py-0.5 text-[11px] font-bold text-[#8A5A00]">{t("list.snoozed")}</span>}
                          {row.status === "closed" && <span className="rounded-full bg-app-canvas px-2 py-0.5 text-[11px] font-bold text-app-ink-soft">{t("list.closed")}</span>}
                          {item?.assigneeEmail && <span className="truncate rounded-full bg-app-canvas px-2 py-0.5 text-[11px] font-bold text-app-ink-soft">{item.assigneeEmail === me.email ? t("you") : item.assigneeEmail.split("@")[0]}</span>}
                          {item?.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-app-canvas px-2 py-0.5 text-[11px] font-bold text-app-ink-soft">{tag}</span>)}
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
        {thread}
      </section>
    </div>
  );
}
