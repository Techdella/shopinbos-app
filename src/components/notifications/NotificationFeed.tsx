"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Mascot, PillButton, Spinner, cx } from "@/components/app-ui";
import { categoriesFor, groupByDay, type NotifyCategory } from "@shared/notifications";
import { categoryName, fetchFeed, localTimeAgo, markRead, useLiveRefresh, type NotificationItem } from "./client";
import { useLocale, useT } from "@/components/i18n/I18nProvider";

// The list of notifications, used by the bell's panel (compact) and the Notifications page: tabs by category,
// Today / Yesterday / Earlier, an icon per kind, an unread dot, mark one or all read, and a tap opens the page.

export const CATEGORY_ICON: Record<NotifyCategory, IconName> = {
  orders: "cart",
  money: "coin",
  messages: "chat",
  deliveries: "truck",
  stock: "box",
  marketing: "megaphone",
  account: "shield",
};

const PRIORITY_TILE: Record<NotificationItem["priority"], string> = {
  critical: "bg-app-danger-tint text-app-danger",
  warning: "bg-[#FDF0D5] text-[#8A5A00]",
  info: "bg-app-canvas text-app-ink",
  success: "bg-app-success-tint text-app-success",
};

const EMPTY = {
  all: { title: "feed.emptyAll", text: "feed.emptyAllText" },
  unread: { title: "feed.emptyUnread", text: "feed.emptyUnreadText" },
} as const;

// groupByDay's English labels → "common" time words.
const DAY_KEY = { Today: "time.today", Yesterday: "time.yesterday", Earlier: "time.earlier" } as const;

export function NotificationFeed({ role, compact = false, onNavigate }: { role: string; compact?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const limit = compact ? 25 : 40;
  const t = useT("notifications", "common");
  const locale = useLocale();

  const load = useCallback(async () => {
    try {
      const feed = await fetchFeed(tab, 1, limit);
      setItems(feed.items);
      setHasMore(feed.hasNextPage);
      setPage(1);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error && loadError.message ? loadError.message : t("feed.loadFailed"));
    }
  }, [tab, limit, t]);
  useLiveRefresh(() => void load());

  const switchTab = (next: string) => {
    setTab(next);
    setItems(null);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const feed = await fetchFeed(tab, page + 1, limit);
      setItems((current) => [...(current ?? []), ...feed.items.filter((item) => !current?.some((existing) => existing.id === item.id))]);
      setHasMore(feed.hasNextPage);
      setPage(page + 1);
    } catch {
      // keep what's on screen
    } finally {
      setLoadingMore(false);
    }
  };

  const open = async (item: NotificationItem) => {
    if (!item.read) {
      setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, read: true } : row)) ?? null);
      void markRead({ id: item.id });
    }
    const href = item.actionUrl || item.link;
    if (!href) return;
    onNavigate?.();
    if (/^https?:\/\//.test(href)) window.open(href, "_blank", "noopener");
    else router.push(href);
  };

  const readAll = async () => {
    setItems((current) => current?.map((row) => ({ ...row, read: true })) ?? null);
    await markRead({ all: true, tab: tab === "all" || tab === "unread" ? undefined : tab });
  };

  const tabs = [{ key: "all", label: t("feed.all") }, { key: "unread", label: t("feed.unread") }, ...categoriesFor(role).map((category) => ({ key: category.key, label: categoryName(category.key, role, t) }))];
  const unreadHere = items?.filter((item) => !item.read).length ?? 0;
  const groups = items ? groupByDay(items) : [];
  const preset = tab === "all" || tab === "unread" ? EMPTY[tab] : null;
  const empty = preset
    ? { title: t(preset.title), text: t(preset.text) }
    : { title: t("feed.emptyCategory", { category: categoryName(tab as NotifyCategory, role, t).toLowerCase() }), text: t("feed.emptyCategoryText") };

  return (
    <div className={cx("flex min-h-0 flex-col", compact ? "flex-1" : "gap-4")}>
      <div className={cx("flex items-center gap-2", compact ? "border-b border-app-line px-4 pb-2.5" : "flex-wrap justify-between")}>
        <nav aria-label={t("feed.type")} className={cx("-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-1", !compact && "md:flex-wrap md:overflow-visible")}>
          {tabs.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={tab === option.key}
              onClick={() => switchTab(option.key)}
              className={cx(
                "inline-flex shrink-0 items-center rounded-full border font-bold transition",
                compact ? "min-h-[34px] px-3 text-[13px]" : "min-h-[40px] px-4 text-[14px]",
                tab === option.key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
              )}
            >
              {option.label}
            </button>
          ))}
        </nav>
        {!compact && unreadHere > 0 && (
          <PillButton tone="ink" size="md" onClick={() => void readAll()}>
            <Icon name="check" size={16} /> {t("feed.markAllRead")}
          </PillButton>
        )}
      </div>
      {compact && unreadHere > 0 && (
        <div className="flex justify-end px-4 pt-2">
          <button type="button" onClick={() => void readAll()} className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-2 text-[13px] font-bold text-app-ink hover:bg-app-canvas">
            <Icon name="check" size={14} /> {t("feed.markAllRead")}
          </button>
        </div>
      )}

      <div className={cx(compact && "min-h-0 flex-1 overflow-y-auto")} aria-live="polite">
        {error && !items ? (
          <div className="m-4 rounded-[16px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger" role="alert">
            {error}{" "}
            <button type="button" onClick={() => void load()} className="font-bold underline">{t("tryAgain")}</button>
          </div>
        ) : !items ? (
          <div role="status" className="flex items-center justify-center gap-3 py-14 text-[14px] text-app-ink-soft">
            <Spinner /> {t("feed.loading")}
          </div>
        ) : items.length === 0 ? (
          <div className={cx("flex flex-col items-center px-6 py-12 text-center", !compact && "rounded-[22px] border border-app-line bg-white")}>
            <Mascot name="peggy" className="h-16 w-16" alt="" />
            <h2 className="mb-0 mt-3 text-[17px] font-extrabold">{empty.title}</h2>
            <p className="mb-0 mt-1.5 max-w-[320px] text-[14px] text-app-ink-soft">{empty.text}</p>
          </div>
        ) : (
          <div className={cx(!compact && "grid gap-4")}>
            {groups.map((group) => (
              <section key={group.label} aria-label={t.dynamic(DAY_KEY[group.label as keyof typeof DAY_KEY] ?? "", group.label)}>
                <h3 className={cx("m-0 text-[12px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft", compact ? "px-4 pb-1.5 pt-3" : "mb-2")}>{t.dynamic(DAY_KEY[group.label as keyof typeof DAY_KEY] ?? "", group.label)}</h3>
                <ul className={cx("m-0 list-none p-0", !compact && "divide-y divide-app-line overflow-hidden rounded-[22px] border border-app-line bg-white")}>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void open(item)}
                        className={cx("flex w-full gap-3 text-left transition hover:bg-app-canvas", compact ? "px-4 py-3" : "px-4 py-4 sm:px-5", !item.read && "bg-app-canvas/60")}
                      >
                        <span className={cx("relative grid h-10 w-10 shrink-0 place-items-center rounded-[14px]", PRIORITY_TILE[item.priority] ?? PRIORITY_TILE.info)}>
                          <Icon name={CATEGORY_ICON[item.category] ?? "bell"} size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3">
                            <span className={cx("min-w-0 text-[14px] leading-[1.35]", item.read ? "font-semibold" : "font-extrabold")}>
                              {!item.read && <span className="sr-only">{t("feed.unreadPrefix")}</span>}
                              {item.title}
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-[12px] text-app-ink-soft">{localTimeAgo(item.createdAt, locale, t)}</span>
                          </span>
                          <span className={cx("mt-0.5 block text-[13.5px] leading-[1.45] text-app-ink-soft", compact && "line-clamp-2")}>{item.description}</span>
                          {!compact && item.actionLabel && (item.actionUrl || item.link) && (
                            <span className="mt-2 inline-flex min-h-[34px] items-center rounded-full bg-app-ink px-3.5 text-[13px] font-bold text-white">{item.actionLabel}</span>
                          )}
                        </span>
                        {!item.read && <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-app-accent" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {hasMore && (
              <div className="flex justify-center py-3">
                <PillButton tone="white" size="sm" busy={loadingMore} onClick={() => void loadMore()}>{t("feed.showOlder")}</PillButton>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
