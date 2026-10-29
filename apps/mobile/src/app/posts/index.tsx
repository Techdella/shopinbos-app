import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Eyebrow, List, Pill, Row, Small, Tile } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Notice, PillButton, T } from "@/components/ui";
import { fetchPosts, type ScheduledPost } from "@/lib/familiar";
import { needsConnecting, postDay, postPill, sameDay, startOfDay, weekDays, weekRange } from "@/lib/familiar-pure";
import { PLATFORM_KEY, useConnectPage } from "@/components/familiar/ScheduleSheet";
import { formatDate } from "@shared/i18n";
import { useLoad } from "@/lib/useLoad";
import { useLocale, useT } from "@/lib/i18n";
import { colors, radii, themed } from "@/theme";

// The posts calendar ("Familiar app" prototype `calendar`): this week as a strip of days with dots, the picked
// day's posts (Posted, Scheduled, Draft, Your turn, Didn't go out), the accounts and "Make a new post".
// GET /api/mobile/posts?from&to. Each account says in one line whether it posts by itself (a seller's connected
// Facebook and Instagram) or we remind you; a seller's Facebook or Instagram that isn't connected has Connect.

const DOT = themed(() => ({ posted: colors.success, scheduled: colors.accent, draft: colors.inkFaint, attention: colors.warnInk, yourTurn: colors.accentInk } as const));

function dayParam(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function Posts() {
  const t = useT("m_familiar");
  const locale = useLocale();
  const params = useLocalSearchParams<{ day?: string }>();
  const [day, setDay] = useState<Date>(() => startOfDay(dayParam(params.day) ?? new Date()));
  const days = weekDays(day);
  const range = weekRange(day);
  const week = useLoad(() => fetchPosts(range.from, range.to), range.from.toISOString());
  const data = week.data;
  // No calendar answer (a 404 hides it in the client): the normal error, with Retry.
  const missing = !week.loading && !week.error && !data;
  const [connectProblem, setConnectProblem] = useState<string | null>(null);
  const page = useConnectPage(() => void week.refresh());
  const connect = async () => {
    setConnectProblem(null);
    setConnectProblem(await page.connect());
  };

  const posts = data?.posts ?? [];
  const onDay = (date: Date) => posts.filter((post) => {
    const at = postDay(post);
    return at ? sameDay(at, date) : false;
  });
  const drafts = posts.filter((post) => !postDay(post));
  const today = new Date();
  const shown = [...onDay(day), ...(sameDay(day, today) ? drafts : [])];

  const shiftWeek = (by: number) => setDay((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + by * 7));
  const dayTitle = sameDay(day, today) ? t("sched.today") : formatDate(day, locale, { weekday: "long", day: "numeric", month: "short", timeZone: undefined });
  const timeOf = (post: ScheduledPost) => {
    const at = postDay(post);
    return at ? formatDate(at, locale, { hour: "numeric", minute: "2-digit", timeZone: undefined }) : t("posts.noTime");
  };
  const platformsOf = (post: ScheduledPost) => post.platforms.map((key) => (key in PLATFORM_KEY ? t(PLATFORM_KEY[key as keyof typeof PLATFORM_KEY]) : key)).join(", ");

  return (
    <Screen
      title={t("posts.title")}
      refreshing={week.refreshing}
      onRefresh={() => void week.refresh()}
      footer={
        <PillButton tone="accent" onPress={() => router.push("/create")} accessibilityLabel={t("posts.make")} icon="sparkle" title={t("posts.make")} />
      }
    >
      {missing ? <ErrorState message={t("posts.loadFailed")} onRetry={() => void week.reload()} /> : null}

      {!missing ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("posts.prevWeek")} onPress={() => shiftWeek(-1)} hitSlop={4} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", transform: [{ scaleX: -1 }] }}>
              <AppIcon name="chevron" size={20} />
            </Pressable>
            <Small style={{ flex: 1, textAlign: "center" }}>{formatDate(days[0], locale, { day: "numeric", month: "short", timeZone: undefined })} – {formatDate(days[6], locale, { day: "numeric", month: "short", timeZone: undefined })}</Small>
            <Pressable accessibilityRole="button" accessibilityLabel={t("posts.nextWeek")} onPress={() => shiftWeek(1)} hitSlop={4} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="chevron" size={20} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", gap: 6 }}>
            {days.map((date) => {
              const on = sameDay(date, day);
              const list = onDay(date);
              const status = list.some((post) => post.status === "attention")
                ? "attention"
                : list.some((post) => post.yourTurn)
                  ? "yourTurn"
                  : list.some((post) => post.status === "scheduled")
                    ? "scheduled"
                    : list.some((post) => post.status === "posted")
                      ? "posted"
                      : list.length
                        ? "draft"
                        : null;
              return (
                <Pressable
                  key={date.toISOString()}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t("posts.dayLabel", { day: formatDate(date, locale, { weekday: "long", day: "numeric", month: "long", timeZone: undefined }), count: list.length })}
                  onPress={() => setDay(date)}
                  style={{ flex: 1, minHeight: 66, borderRadius: 18, backgroundColor: on ? colors.inkFill : colors.surface, borderWidth: 1, borderColor: on ? colors.ink : colors.line, alignItems: "center", justifyContent: "center", gap: 3 }}
                >
                  <T weight="semibold" style={{ fontSize: 12, color: on ? "rgba(255,255,255,0.75)" : colors.inkSoft }}>{formatDate(date, locale, { weekday: "narrow", timeZone: undefined })}</T>
                  <T weight="extrabold" style={{ fontSize: 17, color: on ? "#FFFFFF" : colors.ink }}>{date.getDate()}</T>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: status ? DOT[status] : "transparent" }} />
                </Pressable>
              );
            })}
          </View>

          <View style={{ gap: 10 }}>
            <Eyebrow>{dayTitle}</Eyebrow>
            {week.loading && !data ? <LoadingBlock /> : null}
            {week.error && !data ? <ErrorState message={week.error} onRetry={() => void week.reload()} /> : null}
            {data && !shown.length ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18 }}>
                <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("posts.empty")}</T>
              </View>
            ) : null}
            {shown.length ? (
              <List>
                {shown.map((post) => {
                  const pill = postPill(post.status, post.yourTurn);
                  return (
                    <Row
                      key={post.id}
                      onPress={() => router.push({ pathname: "/posts/[id]", params: { id: post.id } })}
                      accessibilityLabel={`${post.caption || t("posts.untitled")}. ${timeOf(post)}. ${t(`posts.status.${pill.key}`)}`}
                      lead={post.imageUrl ? <Image source={{ uri: post.imageUrl }} style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.grayTint }} contentFit="cover" /> : <Tile icon="image" tone="gray" size={52} />}
                      title={<T weight="bold" style={{ fontSize: 15.5, lineHeight: 20 }} numberOfLines={2}>{post.caption || t("posts.untitled")}</T>}
                      sub={[timeOf(post), platformsOf(post)].filter(Boolean).join(" · ")}
                      right={<Pill label={t(`posts.status.${pill.key}`)} tone={pill.tone} />}
                    />
                  );
                })}
              </List>
            ) : null}
          </View>

          {data?.accounts?.length ? (
            <View style={{ gap: 10 }}>
              <Eyebrow>{t("posts.accounts")}</Eyebrow>
              <List>
                {data.accounts.map((account) => {
                  // A seller's Facebook and Instagram post by themselves once the Page is connected; everything
                  // else is a reminder, which needs nothing connected.
                  const toConnect = needsConnecting(account.key, data.accounts);
                  return (
                    <Row
                      key={account.key}
                      title={account.label}
                      /* One status line on every row (Facebook and TikTok looked bare next to a "Connected" pill). */
                      sub={toConnect ? t("posts.notConnected") : account.auto ? t("posts.auto") : account.linked ? `${t("posts.connectedPill")} · ${t("posts.remind")}` : t("posts.remind")}
                      right={
                        toConnect ? (
                          <PillButton
                            title={t("posts.connect")}
                            tone="white"
                            size="sm"
                            busy={page.connecting}
                            accessibilityLabel={t("posts.connectLabel", { name: account.label })}
                            onPress={() => void connect()}
                            style={{ borderRadius: radii.pill }}
                          />
                        ) : null
                      }
                    />
                  );
                })}
              </List>
              {connectProblem ? <Notice>{connectProblem}</Notice> : null}
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
