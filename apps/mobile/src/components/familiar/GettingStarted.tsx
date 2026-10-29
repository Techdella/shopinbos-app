import { useState } from "react";
import { parseShopinbosPostId, shopinbosMessageKeys } from "@shared/shopinbos-status";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Eyebrow, List, Row, TILE, Tile } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { dismissShopinbos, fetchShopinbos, type StatusAuthor, type StatusPost } from "@/lib/familiar";
import { useT } from "@/lib/i18n";
import { markShopinbosSeen, runShopinbosCta, seenHere, useShopinbosHere, watchOutside } from "@/lib/shopinbos";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";
import { StoryViewer } from "./StoryViewer";

// "Getting started" for new sellers, suppliers and delivery partners: Shopinbos's own getting-started posts
// (shared/shopinbos-status.ts, GET /api/mobile/status/shopinbos) as a small row of tiles on Home, each ticked once
// watched; an X closes it for good (on the account). Help lists the videos again (GettingStartedVideos).
// A video plays in the Status viewer (a recorded one) or as the 60-second intro; a tip opens in the Status viewer
// with its button. Hidden when the server doesn't have it (404) or there's nothing to show.

/** A Shopinbos post's headline in the app's language (the server sends it in the language asked for; this covers a
 * feed fetched before the language changed). */
function headline(post: StatusPost, t: { dynamic: (key: string, fallback?: string) => string }) {
  const known = parseShopinbosPostId(post.id);
  return known ? t.dynamic(shopinbosMessageKeys(known.role, known.key).title, post.headline) : post.headline;
}

/** The card's side padding, the gap between tiles, and how many tiles show across before the row scrolls (a
 * part of the next tile shows, so it clearly scrolls). Up to three fit across exactly. */
const PAD = 18;
const GAP = 10;
const ACROSS = 2.4;

/** A tile's width: the whole row when up to three fit, else 2.4 across so the next one peeks in. */
export function startTileWidth(screenWidth: number, count: number) {
  const inner = screenWidth - 40 - PAD * 2;
  if (count <= 3) return Math.floor((inner - GAP * (Math.max(1, count) - 1)) / Math.max(1, count));
  return Math.floor((inner - GAP * 2) / ACROSS);
}

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
  const { width } = useWindowDimensions();
  const author = state.data?.author ?? null;
  if (closed || !author || state.data?.startOff || !author.posts.length) return viewer;

  const done = author.posts.filter(seenHere).length;
  const tileWidth = startTileWidth(width, author.posts.length);

  function close() {
    setClosed(true);
    void dismissShopinbos("start").catch(() => null);
  }

  return (
    <View testID="getting-started" style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, paddingVertical: PAD, gap: 12 }}>
      {/* The same header as "Get your shop ready" above it: title, "n of m done", X. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: PAD, paddingRight: PAD - 6 }}>
        <T weight="extrabold" style={{ fontSize: 16, flex: 1 }} numberOfLines={1}>{t("start.title")}</T>
        <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }} numberOfLines={1}>{t("start.count", { done, total: author.posts.length })}</T>
        <Pressable testID="getting-started-close" accessibilityRole="button" accessibilityLabel={t("start.hide")} onPress={close} hitSlop={8} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="x" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={author.posts.length > 3} contentContainerStyle={{ gap: GAP, paddingHorizontal: PAD }}>
        {author.posts.map((post, index) => {
          const tone = TILE[post.tone] ?? TILE.ink;
          const watched = seenHere(post);
          const video = Boolean(post.video);
          return (
            <Pressable
              key={post.id}
              accessibilityRole="button"
              accessibilityLabel={`${video ? t("start.video") : t("start.tip")}: ${headline(post, t)}`}
              accessibilityState={{ checked: watched }}
              onPress={() => open(author, post, index)}
              style={({ pressed }) => ({ width: tileWidth, minHeight: 118, borderRadius: 18, backgroundColor: tone.bg, padding: 12, gap: 8, justifyContent: "space-between", opacity: pressed ? 0.85 : 1 })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.85)", alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name={video ? "play" : "sparkle"} size={15} color={colors.ink} />
                </View>
                {watched ? (
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.inkFill, alignItems: "center", justifyContent: "center" }} accessibilityLabel={t("start.done")}>
                    <AppIcon name="check" size={13} color="#FFFFFF" strokeWidth={3} />
                  </View>
                ) : null}
              </View>
              <T weight="bold" numberOfLines={4} style={{ fontSize: 13.5, lineHeight: 17, color: tone.fg }}>{headline(post, t)}</T>
            </Pressable>
          );
        })}
      </ScrollView>
      {viewer}
    </View>
  );
}

/** Help's "Getting started": every getting-started item for the role, to watch or do again any time. Videos play
 * (as on Home); a tip with a button opens its screen straight away (a tip without one opens in the viewer). */
export function GettingStartedVideos() {
  const t = useT("m_familiar");
  const { state, open, viewer } = useStart();
  useShopinbosHere();
  const author = state.data?.author ?? null;
  const items = author ? author.posts.map((post, index) => ({ post, index })) : [];
  if (!author || !items.length) return viewer;

  function press(post: StatusPost, index: number) {
    if (!post.video && post.cta && runShopinbosCta(post)) {
      markShopinbosSeen(post.id);
      return;
    }
    open(author!, post, index);
  }

  return (
    <View testID="help-getting-started" style={{ gap: 10, marginTop: 10 }}>
      <Eyebrow>{t("start.title")}</Eyebrow>
      <List>
        {items.map(({ post, index }) => (
          <Row
            key={post.id}
            lead={<Tile icon={post.video ? "play" : "sparkle"} tone={post.tone === "ink" ? "gray" : post.tone} />}
            title={headline(post, t)}
            sub={post.video ? t("start.video") : post.cta?.label ?? t("start.tip")}
            right={seenHere(post) ? <AppIcon name="check" size={18} color={colors.success} /> : undefined}
            chevron
            onPress={() => press(post, index)}
          />
        ))}
      </List>
      {viewer}
    </View>
  );
}
