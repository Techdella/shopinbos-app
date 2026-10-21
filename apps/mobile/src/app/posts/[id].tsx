import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import { ShareSheet } from "@/components/familiar/ShareSheet";
import { PLATFORM_KEY } from "@/components/familiar/ScheduleSheet";
import { Banner, Pill, Small } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fetchPosts, optional, updatePost, type ScheduledPost } from "@/lib/familiar";
import { postDay, postPill } from "@/lib/familiar-pure";
import { formatDate } from "@shared/i18n";
import { useLoad } from "@/lib/useLoad";
import { useLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One post from the calendar. The "Time to post" reminder (push and notification link app:/posts/<id>) lands here:
// Share opens the same sheet as Create (the phone's share sheet, WhatsApp, Instagram, TikTok, Facebook, Save), and
// "Mark as posted" ticks it off (PATCH status posted). We never post for anyone.

const DAY = 24 * 60 * 60 * 1000;

/** GET /api/mobile/posts/[id] when the server has it, else the post found in the calendar around today. */
async function loadPost(id: string): Promise<ScheduledPost | null> {
  const one = await optional(api<{ post: ScheduledPost }>(`/api/mobile/posts/${encodeURIComponent(id)}`)).catch((error) => {
    if (error instanceof ApiError && error.status === 405) return null;
    throw error;
  });
  if (one?.post) return one.post;
  const now = Date.now();
  const week = await fetchPosts(new Date(now - 120 * DAY), new Date(now + 120 * DAY));
  if (!week) throw new ApiError("", 404);
  return week.posts.find((post) => post.id === id) ?? null;
}

export default function PostDetail() {
  const t = useT("m_familiar");
  const locale = useLocale();
  const { id, scheduled } = useLocalSearchParams<{ id: string; scheduled?: string }>();
  const [sheet, setSheet] = useState(false);
  const [marking, setMarking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [missing, setMissing] = useState(false);
  const item = useLoad(async () => {
    try {
      return await loadPost(String(id ?? ""));
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
        setMissing(true);
        return null;
      }
      throw error;
    }
  }, String(id ?? ""));
  const post = item.data;

  const markPosted = async () => {
    if (!post) return;
    setMarking(true);
    setProblem(null);
    try {
      const { post: next } = await updatePost(post.id, { status: "posted" });
      item.setData(next ?? { ...post, status: "posted", postedAt: new Date().toISOString() });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("posts.failed"));
    } finally {
      setMarking(false);
    }
  };

  const copy = async () => {
    if (!post?.caption) return;
    await Clipboard.setStringAsync(post.caption).catch(() => null);
    setCopied(true);
  };

  const at = post ? postDay(post) : null;
  const when = post && at ? formatDate(at, locale, { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: undefined }) : null;
  const pill = post ? postPill(post.status) : null;

  return (
    <Screen
      title={t("posts.one")}
      refreshing={item.refreshing}
      onRefresh={() => void item.refresh()}
      footer={
        post ? (
          <>
            <PillButton tone="accent" onPress={() => setSheet(true)} accessibilityLabel={t("posts.share")}>
              <AppIcon name="share" size={20} color={colors.ink} />
              <T weight="extrabold" style={{ fontSize: 17 }}>{t("posts.share")}</T>
            </PillButton>
            {post.status !== "posted" ? <PillButton title={t("posts.markPosted")} tone="white" size="md" busy={marking} onPress={() => void markPosted()} /> : null}
          </>
        ) : null
      }
    >
      {item.loading && !post ? <LoadingBlock /> : null}
      {item.error && !post ? <ErrorState message={item.error} onRetry={() => void item.reload()} /> : null}
      {missing ? <EmptyState icon="clock" title={t("soon.title")}>{t("posts.soon")}</EmptyState> : null}
      {!item.loading && !item.error && !missing && !post ? <EmptyState icon="image" title={t("posts.gone")}>{t("posts.goneText")}</EmptyState> : null}

      {post ? (
        <>
          {scheduled === "1" && post.status === "scheduled" ? <Banner tone="mint" icon="check" title={t("posts.added")}>{t("sched.remind")}</Banner> : null}
          {post.imageUrl ? (
            <Image source={{ uri: post.imageUrl }} style={{ width: "100%", aspectRatio: 1, borderRadius: 24, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityLabel={t("posts.picture")} />
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {pill ? <Pill label={t(`posts.status.${pill.key}`)} tone={pill.tone} /> : null}
            {when ? <Small>{post.status === "posted" ? t("posts.postedAt", { when }) : t("posts.scheduledAt", { when })}</Small> : null}
          </View>
          {post.platforms.length ? (
            <Small>{t("posts.for", { apps: post.platforms.map((key) => (key in PLATFORM_KEY ? t(PLATFORM_KEY[key as keyof typeof PLATFORM_KEY]) : key)).join(", ") })}</Small>
          ) : null}
          {post.caption ? (
            <Card style={{ gap: 8, borderRadius: 24 }}>
              <T style={{ fontSize: 15.5, lineHeight: 23 }} selectable>{post.caption}</T>
              <LinkButton title={copied ? t("posts.copied") : t("posts.copy")} onPress={() => void copy()} style={{ alignItems: "flex-start" }} />
            </Card>
          ) : null}
          {problem ? <Notice>{problem}</Notice> : null}
          <Small>{t("posts.statusNote")}</Small>
        </>
      ) : null}

      <ShareSheet visible={sheet} onClose={() => setSheet(false)} imageUrl={post?.imageUrl ?? null} caption={post?.caption ?? ""} />
    </Screen>
  );
}
