import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { ChipRow, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Seg } from "@/components/design";
import { AppIcon, type AppIconName } from "@/components/icons";
import { PushPromptCard } from "@/components/PushPromptCard";
import { Screen } from "@/components/Screen";
import { LinkButton, PillButton, T } from "@/components/ui";
import { fetchNotifications, markNotificationsRead, openNotificationTarget, setUnreadCount, type AppNotification } from "@/lib/notifications";
import { useRole } from "@/lib/role";
import { useLoad } from "@/lib/useLoad";
import { groupByDay, type NotifyCategory } from "@shared/notifications";
import { notificationFilters } from "@/lib/familiar-pure";
import { formatDate, type Locale } from "@shared/i18n";
import { useLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Notifications (web /home/notifications): the same list as the bell on the web, with the "Familiar app" prototype's
// filter chips (sellers and suppliers All / Orders / Money / Rex and Peggy, delivery partners All / Jobs / Money /
// Peggy; lib/familiar-pure notificationFilters maps each to the bell's category), grouped Today / Earlier, Mark all
// read, pull to refresh, tap to open the order, chat, job, payout or post it's about.

const ICON: Record<NotifyCategory, AppIconName> = {
  orders: "bag",
  money: "coin",
  messages: "chat",
  livechat: "users",
  deliveries: "truck",
  stock: "box",
  marketing: "megaphone",
  account: "shield",
  announcements: "sparkle",
};

type Words = ReturnType<typeof useT<["m_notifications", "common"]>>;

/** "Just now", "5m ago", "3h ago", "Yesterday", "4d ago", then the date (like timeAgo in shared/notifications). */
function ago(t: Words, value: string, locale: Locale, now = new Date()) {
  const minutes = Math.floor((now.getTime() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("ago.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("ago.hours", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("time.yesterday");
  if (days < 7) return t("ago.days", { count: days });
  return formatDate(value, locale, { day: "numeric", month: "short" });
}

const FILTER_KEY = { all: "nf.all", orders: "nf.orders", jobs: "nf.jobs", money: "nf.money", ai: "nf.ai", peggy: "nf.peggy" } as const;

const TILE: Record<AppNotification["priority"], { bg: string; fg: string }> = {
  critical: { bg: colors.dangerTint, fg: colors.danger },
  warning: { bg: "#FDF0D5", fg: "#8A5A00" },
  info: { bg: colors.canvas, fg: colors.ink },
  success: { bg: colors.successTint, fg: colors.success },
};

export default function Notifications() {
  const t = useT("m_notifications", "common");
  const words = useT("m_familiar");
  const locale = useLocale();
  const { role } = useRole();
  const [tab, setTab] = useState("all");
  const [more, setMore] = useState<{ page: number; items: AppNotification[]; hasNext: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const feed = useLoad(async () => {
    const page = await fetchNotifications(tab);
    setUnreadCount(page.unreadCount);
    setMore(null);
    return page;
  }, tab);

  const items = [...(feed.data?.items ?? []), ...(more?.items ?? [])];
  const hasNext = more ? more.hasNext : Boolean(feed.data?.hasNextPage);
  // Today and Earlier (yesterday joins Earlier, as in the prototype).
  const byDay = groupByDay(items);
  const earlier = byDay.filter((group) => group.label !== "Today").flatMap((group) => group.items);
  const groups = [...byDay.filter((group) => group.label === "Today").map((group) => ({ key: "today", title: t("time.today"), items: group.items })), ...(earlier.length ? [{ key: "earlier", title: t("time.earlier"), items: earlier }] : [])];
  const unreadHere = items.filter((item) => !item.read).length;
  const tabs = notificationFilters(role).map((filter) => ({ key: filter.tab, label: words(FILTER_KEY[filter.key]) }));

  const markLocal = (match: (item: AppNotification) => boolean) => {
    if (feed.data) feed.setData({ ...feed.data, items: feed.data.items.map((item) => (match(item) ? { ...item, read: true } : item)) });
    if (more) setMore({ ...more, items: more.items.map((item) => (match(item) ? { ...item, read: true } : item)) });
  };

  const open = (item: AppNotification) => {
    if (!item.read) {
      markLocal((row) => row.id === item.id);
      void markNotificationsRead({ id: item.id }).then((count) => count !== null && setUnreadCount(count));
    }
    openNotificationTarget({ url: item.actionUrl || item.link });
  };

  const readAll = async () => {
    markLocal(() => true);
    const count = await markNotificationsRead({ all: true, tab: tab === "all" || tab === "unread" ? undefined : tab });
    if (count !== null) setUnreadCount(count);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await fetchNotifications(tab, (more?.page ?? 1) + 1);
      setMore({ page: (more?.page ?? 1) + 1, items: [...(more?.items ?? []), ...page.items.filter((item) => !items.some((existing) => existing.id === item.id))], hasNext: page.hasNextPage });
    } catch {
      // keep what's on screen
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Screen title={t("bell.label")} sub={t("feed.sub")} refreshing={feed.refreshing} onRefresh={() => void feed.refresh()}>
      <PushPromptCard who={role === "supplier" ? "supplier" : role === "logistics_partner" ? "logistics" : "seller"} />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <LinkButton title={t("settings")} onPress={() => router.push("/notifications/settings")} />
        {unreadHere > 0 ? <LinkButton title={t("feed.markAllRead")} onPress={() => void readAll()} /> : null}
      </View>

      <ChipRow>
        {tabs.map((option) => <Seg key={option.key} label={option.label} on={tab === option.key} onPress={() => setTab(option.key)} />)}
      </ChipRow>

      {feed.loading && !feed.data ? <LoadingBlock label={t("feed.loading")} /> : null}
      {feed.error && !feed.data ? <ErrorState message={feed.error} onRetry={() => void feed.reload()} /> : null}
      {feed.data && !items.length ? (
        <EmptyState icon="bell" title={tab === "unread" ? t("feed.emptyUnread") : t("feed.emptyAll")}>
          {tab === "unread" ? t("feed.emptyUnreadText") : t("feed.emptyAllText")}
        </EmptyState>
      ) : null}

      {groups.map((group) => (
        <View key={group.key} style={{ gap: 8 }}>
          <T weight="extrabold" style={{ fontSize: 13, letterSpacing: 0.8, color: colors.inkSoft, textTransform: "uppercase", marginTop: 4 }} accessibilityRole="header">{group.title}</T>
          {group.items.map((item) => {
            const tile = TILE[item.priority] ?? TILE.info;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.read ? `${item.title}. ${item.description}` : t("feed.unreadLabel", { title: item.title, description: item.description })}
                onPress={() => open(item)}
                style={({ pressed }) => ({ flexDirection: "row", gap: 12, backgroundColor: item.read ? colors.surface : "#FFF7F2", borderRadius: 20, padding: 14, opacity: pressed ? 0.85 : 1 })}
              >
                <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: tile.bg, alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name={ICON[item.category] ?? "bell"} size={19} color={tile.fg} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                    <T weight={item.read ? "semibold" : "extrabold"} style={{ flex: 1, fontSize: 15.5, lineHeight: 21 }}>{item.title}</T>
                    <T style={{ color: colors.inkSoft, fontSize: 13 }}>{ago(t, item.createdAt, locale)}</T>
                  </View>
                  <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20 }} numberOfLines={3}>{item.description}</T>
                </View>
                {!item.read ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, marginTop: 6 }} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      {hasNext ? <PillButton title={t("feed.older")} tone="white" size="sm" busy={loadingMore} onPress={() => void loadMore()} /> : null}
    </Screen>
  );
}
