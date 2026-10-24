import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Eyebrow, List, Row, TILE, Tile } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { dismissShopinbos, fetchShopinbos, type StatusAuthor, type StatusPost } from "@/lib/familiar";
import { useT } from "@/lib/i18n";
import { markShopinbosSeen, seenHere, useShopinbosHere, watchOutside } from "@/lib/shopinbos";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";
import { StoryViewer } from "./StoryViewer";

// "Getting started" for new sellers, suppliers and delivery partners: Shopinbos's own getting-started posts
// (shared/shopinbos-status.ts, GET /api/mobile/status/shopinbos) as a small row of tiles on Home, each ticked once
// watched; an X closes it for good (on the account). Help lists the videos again (GettingStartedVideos).
// A video plays in the Status viewer (a recorded one) or as the 60-second intro; a tip opens in the Status viewer
// with its button. Hidden when the server doesn't have it (404) or there's nothing to show.

const TILE_W = 128;

function useStart() {
  const state = useLoad(fetchShopinbos);
  const [story, setStory] = useState<{ author: StatusAuthor; index: number } | null>(null);

  function open(author: StatusAuthor, post: StatusPost, index: number) {
    if (post.video && !post.video.url && watchOutside(post.video)) {
      markShopinbosSeen(post.id);
      return;
    }
    setStory({ author, index });
  }

  const viewer = story ? (
    <StoryViewer
      authors={[story.author]}
      start={0}
      startPost={story.index}
      visible
      onClose={() => {
        setStory(null);
        void state.refresh();
      }}
    />
  ) : null;

  return { state, open, viewer };
}

/** The Home card: a compact row of the role's getting-started videos and tips. */
export function GettingStartedCard() {
  const t = useT("m_familiar");
  const { state, open, viewer } = useStart();
  useShopinbosHere();
  const [closed, setClosed] = useState(false);
  const author = state.data?.author ?? null;
  if (closed || !author || state.data?.startOff || !author.posts.length) return viewer;

  const done = author.posts.filter(seenHere).length;

  function close() {
    setClosed(true);
    void dismissShopinbos("start").catch(() => null);
  }

  return (
    <View testID="getting-started" style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, paddingVertical: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 8 }}>
        <T weight="extrabold" style={{ fontSize: 16, flexShrink: 1 }} numberOfLines={1}>{t("start.title")}</T>
        <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft, flex: 1 }} numberOfLines={1}>{t("start.count", { done, total: author.posts.length })}</T>
        <Pressable testID="getting-started-close" accessibilityRole="button" accessibilityLabel={t("start.hide")} onPress={close} hitSlop={8} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="x" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
        {author.posts.map((post, index) => {
          const tone = TILE[post.tone] ?? TILE.ink;
          const watched = seenHere(post);
          const video = Boolean(post.video);
          return (
            <Pressable
              key={post.id}
              accessibilityRole="button"
              accessibilityLabel={`${video ? t("start.video") : t("start.tip")}: ${post.headline}`}
              accessibilityState={{ checked: watched }}
              onPress={() => open(author, post, index)}
              style={({ pressed }) => ({ width: TILE_W, minHeight: 112, borderRadius: 18, backgroundColor: tone.bg, padding: 12, gap: 8, justifyContent: "space-between", opacity: pressed ? 0.85 : 1 })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.85)", alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name={video ? "play" : "sparkle"} size={15} color={colors.ink} />
                </View>
                {watched ? (
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }} accessibilityLabel={t("start.done")}>
                    <AppIcon name="check" size={13} color="#FFFFFF" strokeWidth={3} />
                  </View>
                ) : null}
              </View>
              <T weight="bold" numberOfLines={3} style={{ fontSize: 13.5, lineHeight: 17, color: tone.fg }}>{post.headline}</T>
            </Pressable>
          );
        })}
      </ScrollView>
      <T style={{ fontSize: 13, color: colors.inkSoft, paddingHorizontal: 16 }}>{t("start.again")}</T>
      {viewer}
    </View>
  );
}

/** Help's "Getting started videos": every getting-started video for the role, to watch again any time. */
export function GettingStartedVideos() {
  const t = useT("m_familiar");
  const { state, open, viewer } = useStart();
  useShopinbosHere();
  const author = state.data?.author ?? null;
  const videos = author ? author.posts.map((post, index) => ({ post, index })).filter(({ post }) => post.video) : [];
  if (!author || !videos.length) return viewer;
  return (
    <View testID="help-getting-started" style={{ gap: 10, marginTop: 10 }}>
      <Eyebrow>{t("start.helpTitle")}</Eyebrow>
      <List>
        {videos.map(({ post, index }) => (
          <Row
            key={post.id}
            lead={<Tile icon="play" tone={post.tone === "ink" ? "gray" : post.tone} />}
            title={post.headline}
            right={seenHere(post) ? <AppIcon name="check" size={18} color={colors.success} /> : undefined}
            chevron
            onPress={() => open(author, post, index)}
          />
        ))}
      </List>
      {viewer}
    </View>
  );
}
