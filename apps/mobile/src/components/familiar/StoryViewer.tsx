import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StatusBar, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Picture } from "@/components/kit";
import { AppIcon } from "@/components/icons";
import { LinkButton, PillButton, T } from "@/components/ui";
import { TILE } from "@/components/design";
import { likeStatus, markStatusSeen, type StatusAuthor, type StatusPost } from "@/lib/familiar";
import { useT } from "@/lib/i18n";
import { useIntroAudioStop } from "@/lib/intro-audio";
import { callOn, usePeggyCall } from "@/lib/peggy-call";
import { hideShopinbosStatus, markShopinbosSeen, runShopinbosCta, watchOutside } from "@/lib/shopinbos";
import { colors, fonts } from "@/theme";
import { Mascot } from "@/components/Mascot";
import { ShopinbosMark } from "./ShopinbosMark";

// Full-screen Status viewer ("Familiar app" prototype `storyView`): progress bars, who posted and when, tap the left
// or right half to go back or on, the headline and caption over a dark shade, a like and the post's one action
// ("Add to my shop", "Chat with them", "Offer to deliver"…). Each post moves on by itself after a few seconds.
// Shopinbos's own posts (author.official): the brand logo, no like, their video plays here (expo-video) and moves on
// when it ends, or "Watch" opens the 60-second intro; their buttons open a screen of the app or share the shop;
// "Don't show again" hides them for good.

const SHOW_MS = 6000;
const ROLE_KEY = { seller: "role.seller", supplier: "role.supplier", logistics_partner: "role.partner" } as const;

function ago(iso: string, t: ReturnType<typeof useT<["m_familiar"]>>) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return t("ago.minutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  return hours < 24 ? t("ago.hours", { count: hours }) : t("ago.days", { count: Math.round(hours / 24) });
}

/** The line under the name: the role (left out when it only repeats the name, as "Shopinbos" does) and the time. */
export function storyByline(author: Pick<StatusAuthor, "name" | "roleLabel">, role: string | null, time: string) {
  const label = role && role.trim().toLowerCase() !== author.name.trim().toLowerCase() ? role : null;
  return label ? `${label} · ${time}` : time;
}

/** A post's video, full screen behind the words; `onEnd` moves on. */
function StoryVideo({ url, onEnd }: { url: string; onEnd: () => void }) {
  const player = useVideoPlayer(url, (created) => {
    created.staysActiveInBackground = false;
    created.play();
  });
  // The app going to the background or a Peggy call starting pauses it (lib/intro-audio.ts); closing frees it.
  useIntroAudioStop(() => {
    try {
      player.pause();
    } catch {
      // Already released.
    }
  });
  const end = useRef(onEnd);
  useEffect(() => {
    end.current = onEnd;
  });
  useEffect(() => {
    const subscription = player.addListener("playToEnd", () => end.current());
    // The web build only starts once the view is on screen; native starts from the setup above.
    const timer = setTimeout(() => player.play(), 300);
    return () => {
      subscription.remove();
      clearTimeout(timer);
    };
  }, [player]);
  return <VideoView testID="story-video" player={player} nativeControls={false} contentFit="contain" style={{ position: "absolute", inset: 0 }} />;
}

export function StoryViewer({
  authors,
  start,
  startPost = 0,
  visible,
  onClose,
  onCta,
  own = false,
}: {
  authors: StatusAuthor[];
  start: number;
  /** The post to open on, in the first author's posts (the Getting started card opens one of Shopinbos's). */
  startPost?: number;
  visible: boolean;
  onClose: () => void;
  /** The post's action was tapped; the caller routes it (the viewer closes first). Shopinbos's buttons route here. */
  onCta?: (post: StatusPost, author: StatusAuthor) => void;
  /** Showing your own posts: views instead of a like, no action. */
  own?: boolean;
}) {
  const t = useT("m_familiar");
  const insets = useSafeAreaInsets();
  const [authorIndex, setAuthorIndex] = useState(start);
  const [postIndex, setPostIndex] = useState(startPost);
  const [likes, setLikes] = useState<Record<string, { likes: number; liked: boolean }>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [opened, setOpened] = useState(visible);
  if (opened !== visible) {
    setOpened(visible);
    if (visible) {
      setAuthorIndex(start);
      setPostIndex(startPost);
    }
  }

  // A Peggy call starting closes the viewer, so the screens she opens show clearly (no tip over them).
  const calling = callOn(usePeggyCall());
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (visible && calling) closeRef.current();
  }, [visible, calling]);

  const author = authors[authorIndex];
  const post = author?.posts[postIndex];
  const official = Boolean(author?.official);
  const videoUrl = official ? post?.video?.url ?? null : null;

  const next = () => {
    if (!author) return onClose();
    if (postIndex + 1 < author.posts.length) setPostIndex(postIndex + 1);
    else if (authorIndex + 1 < authors.length) {
      setAuthorIndex(authorIndex + 1);
      setPostIndex(0);
    } else onClose();
  };
  const back = () => {
    if (postIndex > 0) setPostIndex(postIndex - 1);
    else if (authorIndex > 0) {
      setAuthorIndex(authorIndex - 1);
      setPostIndex(Math.max(0, (authors[authorIndex - 1]?.posts.length ?? 1) - 1));
    }
  };

  useEffect(() => {
    if (!visible || !post) return;
    if (official) markShopinbosSeen(post.id);
    else if (!own) void markStatusSeen(post.id);
    // A video moves on when it ends instead.
    if (!videoUrl) timer.current = setTimeout(next, SHOW_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // The timer restarts for each post shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, post?.id]);

  if (!author || !post) return null;
  const like = likes[post.id] ?? { likes: post.likes, liked: post.liked };
  const tone = TILE[post.tone] ?? TILE.ink;
  const photo = Boolean(post.imageUrl) || Boolean(videoUrl);
  // Words and controls: white over a photo or video, the tone's ink on a plain coloured post.
  const ink = photo ? "#FFFFFF" : tone.fg;
  // Shopinbos's video posts without a file to play here: "Watch" opens the 60-second intro (or the video's page).
  const watchable = official && !videoUrl && Boolean(post.video && (post.video.intro || post.video.watchUrl));
  const hasCta = !own && post.cta && (official ? post.cta.kind === "open" || post.cta.kind === "share" || post.cta.kind === "call_peggy" : Boolean(onCta));

  async function toggleLike() {
    const nextLiked = !like.liked;
    setLikes((all) => ({ ...all, [post!.id]: { likes: like.likes + (nextLiked ? 1 : -1), liked: nextLiked } }));
    try {
      const saved = await likeStatus(post!.id, nextLiked);
      setLikes((all) => ({ ...all, [post!.id]: saved }));
    } catch {
      setLikes((all) => ({ ...all, [post!.id]: like }));
    }
  }

  function action() {
    onClose();
    if (official) runShopinbosCta(post!);
    else onCta?.(post!, author!);
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle={photo ? "light-content" : "dark-content"} />
      <View style={{ flex: 1, backgroundColor: photo ? "#000" : tone.bg }}>
        {post.imageUrl ? <Image source={{ uri: post.imageUrl }} style={{ position: "absolute", inset: 0 }} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
        {videoUrl ? <StoryVideo key={post.id} url={videoUrl} onEnd={next} /> : null}
        {/* Soft shades keep the white words readable on a photo; a text-only post uses its own ink colour instead. */}
        {photo ? (
          <>
            <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 180 }} />
            <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.6)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "55%" }} />
          </>
        ) : null}

        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {author.posts.map((entry, index) => (
              <View key={entry.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: index <= postIndex ? ink : photo ? "rgba(255,255,255,0.35)" : "rgba(22,20,31,0.18)" }} />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {official ? <ShopinbosMark size={38} /> : <Picture uri={author.logoUrl} name={author.name} size={38} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <T weight="bold" numberOfLines={1} style={{ color: ink, fontSize: 15 }}>{author.name}</T>
              <T numberOfLines={1} style={{ color: ink, opacity: 0.85, fontSize: 13 }}>{storyByline(author, official ? author.roleLabel ?? t("role.shopinbos") : t(ROLE_KEY[author.role]), ago(post.createdAt, t))}</T>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={onClose} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="x" size={26} color={ink} />
            </Pressable>
          </View>
        </View>

        {/* Tap the left third to go back, the rest to go on. A post without a picture is a designed card: a big
            mark, the headline large and centred, the words under it. */}
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, flexDirection: "row" }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("previous")} onPress={back} style={{ flex: 1 }} />
            <Pressable accessibilityRole="button" accessibilityLabel={t("next")} onPress={next} style={{ flex: 2 }} />
          </View>
          {!photo ? (
            <View testID="story-text-card" pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 18 }}>
              {official ? (
                <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: "rgba(255,255,255,0.7)", alignItems: "center", justifyContent: "center" }}>
                  {post.video ? <AppIcon name="play" size={44} color={tone.fg} strokeWidth={2.2} /> : <Mascot who="rex" mood="wave" size={92} decorative />}
                </View>
              ) : (
                <Picture uri={author.logoUrl} name={author.name} size={96} />
              )}
              <T style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: ink, textAlign: "center", letterSpacing: -0.6 }}>{post.headline}</T>
              {post.caption ? <T style={{ fontSize: 17, lineHeight: 24, color: ink, textAlign: "center", opacity: 0.9 }}>{post.caption}</T> : null}
              {post.product ? <T weight="bold" style={{ fontSize: 16, color: ink, textAlign: "center" }}>{`${post.product.name} · ₦${Math.round(post.product.price).toLocaleString("en-NG")}`}</T> : null}
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + (official ? 4 : 18), gap: 14 }}>
          {photo ? (
            <View style={{ gap: 6 }}>
              <T style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: ink }}>{post.headline}</T>
              {post.caption ? <T style={{ fontSize: 15, lineHeight: 21, color: ink }}>{post.caption}</T> : null}
              {post.product ? <T weight="bold" style={{ fontSize: 15, color: ink }}>{`${post.product.name} · ₦${Math.round(post.product.price).toLocaleString("en-NG")}`}</T> : null}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {own ? (
              <T weight="semibold" style={{ color: ink, fontSize: 14 }}>{t("status.views", { count: post.views })}</T>
            ) : official ? (
              watchable ? (
                <PillButton
                  testID="story-watch"
                  tone={hasCta ? "white" : "accent"}
                  accessibilityLabel={t("sib.watch")}
                  style={hasCta ? undefined : { flex: 1 }}
                  onPress={() => {
                    onClose();
                    watchOutside(post.video);
                  }}
                >
                  <AppIcon name="play" size={18} color={colors.ink} />
                  <T weight="extrabold" style={{ fontSize: 17, color: colors.ink }}>{t("sib.watch")}</T>
                </PillButton>
              ) : null
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={like.liked ? t("unlike") : t("like")} accessibilityState={{ selected: like.liked }} onPress={() => void toggleLike()} style={{ minWidth: 56, height: 52, borderRadius: 26, backgroundColor: photo ? "rgba(255,255,255,0.22)" : "rgba(22,20,31,0.1)", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }}>
                <AppIcon name="star" size={20} color={like.liked ? colors.accent : ink} />
                <T weight="bold" style={{ color: ink }}>{String(like.likes)}</T>
              </Pressable>
            )}
            {hasCta && post.cta ? <PillButton tone="accent" title={post.cta.label} style={{ flex: 1 }} onPress={action} /> : null}
          </View>
          {official ? (
            <LinkButton
              testID="story-dont-show"
              title={t("sib.dontShow")}
              color={ink}
              onPress={() => {
                onClose();
                void hideShopinbosStatus();
              }}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
