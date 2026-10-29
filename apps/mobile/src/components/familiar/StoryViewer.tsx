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
import { WebButtonLabel } from "@/components/WebBadge";
import { API_URL } from "@/lib/api";
import { likeStatus, markStatusSeen, type StatusAuthor, type StatusPost } from "@/lib/familiar";
import { useT } from "@/lib/i18n";
import { useIntroAudioStop } from "@/lib/intro-audio";
import { callOn, usePeggyCall } from "@/lib/peggy-call";
import { hideShopinbosStatus, markShopinbosSeen, runShopinbosCta, watchOutside } from "@/lib/shopinbos";
import { colors, fonts } from "@/theme";
import { Mascot } from "@/components/Mascot";
import { ShopinbosMark } from "./ShopinbosMark";
import { storyDurationMs, storyProgress, storyTimeUp } from "@shared/status-video";

// Full-screen Status viewer ("Familiar app" prototype `storyView`): progress bars, who posted and when, tap the left
// or right half to go back or on, the headline and caption over a dark shade, a like and the post's one action
// ("Add to my shop", "Chat with them", "Offer to deliver"…). A photo or text post moves on by itself after a few
// seconds; a video post (a person's video status, or one of Shopinbos's) plays here with expo-video, muted until the
// sound button is tapped, its bar filling with the video's own time, and moves on when it ends (no loop). Holding a
// finger down pauses either. The poster shows while the video loads; only the post on screen has a player, so the
// next video isn't fetched before it's shown. Timing rules: shared/status-video.ts.
// Shopinbos's own posts (author.official): the brand logo, no like, "Watch" opens a 60-second intro when there's no
// video to play here; their buttons open a screen of the app or share the shop; "Don't show again" hides them.

/** Fills the viewer (explicit edges and size: the web build sizes a video by its own pixels otherwise). */
const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" } as const;
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

/** A video URL the player can open: Shopinbos's clips may come as a path on the app's own site. */
export function playableUrl(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith("/") ? `${API_URL}${url}` : url;
}

/**
 * A post's video, full screen behind the words: muted until the sound button, paused while held, its progress
 * (0..1) reported as it plays, the poster on top until the first frame. `onEnd` moves on.
 */
function StoryVideo({
  url,
  poster,
  fit,
  muted,
  paused,
  onEnd,
  onProgress,
}: {
  url: string;
  poster: string | null;
  /** "cover" for a short vertical status video, "contain" for a longer help video (often landscape). */
  fit: "cover" | "contain";
  muted: boolean;
  paused: boolean;
  onEnd: () => void;
  onProgress: (fraction: number) => void;
}) {
  const [started, setStarted] = useState(false);
  const player = useVideoPlayer(url, (created) => {
    created.staysActiveInBackground = false;
    created.loop = false;
    created.muted = muted;
    created.timeUpdateEventInterval = 0.2;
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
  const progress = useRef(onProgress);
  const held = useRef(paused);
  useEffect(() => {
    end.current = onEnd;
    progress.current = onProgress;
    held.current = paused;
  });
  useEffect(() => {
    let ended = false;
    let failed: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (ended) return;
      ended = true;
      progress.current(1);
      end.current();
    };
    const subscriptions = [
      player.addListener("playToEnd", finish),
      player.addListener("timeUpdate", ({ currentTime }) => {
        if (currentTime > 0.05) setStarted(true);
        const total = storyDurationMs({ video: { url } }, player.duration);
        progress.current(storyProgress(currentTime * 1000, total));
      }),
      // A video that can't play moves on after the usual few seconds instead of hanging.
      player.addListener("statusChange", ({ status }) => {
        if (status === "error" && !failed) failed = setTimeout(finish, 3000);
      }),
    ];
    // The web build only starts once the view is on screen; native starts from the setup above.
    const timer = setTimeout(() => {
      if (!held.current) player.play();
    }, 300);
    return () => {
      ended = true;
      for (const subscription of subscriptions) subscription.remove();
      clearTimeout(timer);
      if (failed) clearTimeout(failed);
    };
  }, [player, url]);
  useEffect(() => {
    try {
      player.muted = muted;
    } catch {
      // Released.
    }
  }, [player, muted]);
  useEffect(() => {
    try {
      if (paused) player.pause();
      else player.play();
    } catch {
      // Released.
    }
  }, [player, paused]);
  return (
    <>
      <VideoView testID="story-video" player={player} nativeControls={false} contentFit={fit} style={FILL} />
      {poster && !started ? <Image testID="story-poster" source={{ uri: poster }} style={FILL} contentFit={fit} accessibilityIgnoresInvertColors /> : null}
    </>
  );
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
  // Videos start muted; the choice holds for the rest of this viewing. A finger held down pauses.
  const [muted, setMuted] = useState(true);
  const [held, setHeld] = useState(false);
  const [progress, setProgress] = useState(0);
  const elapsed = useRef(0);
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
  const videoUrl = playableUrl(post?.video?.url);

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
    elapsed.current = 0;
    setProgress(0);
    if (official) markShopinbosSeen(post.id);
    else if (!own) void markStatusSeen(post.id);
    // A new post was seen once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, post?.id]);

  // A photo or text post's clock: its bar fills over a few seconds (stopped while held), then the next post shows.
  // A video's bar follows the video instead, and it moves on when it ends.
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  });
  useEffect(() => {
    if (!visible || !post || videoUrl || held) return;
    const total = storyDurationMs(post);
    const tick = setInterval(() => {
      elapsed.current += 100;
      setProgress(storyProgress(elapsed.current, total));
      if (storyTimeUp(elapsed.current, total)) {
        clearInterval(tick);
        nextRef.current();
      }
    }, 100);
    return () => clearInterval(tick);
  }, [visible, post, videoUrl, held]);

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
        {videoUrl ? (
          <StoryVideo key={post.id} url={videoUrl} poster={playableUrl(post.video?.posterUrl)} fit={(post.video?.durationSeconds ?? 0) > 31 ? "contain" : "cover"} muted={muted} paused={held} onEnd={next} onProgress={setProgress} />
        ) : null}
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
              <View key={entry.id} style={{ flex: 1, height: 3, borderRadius: 2, overflow: "hidden", backgroundColor: index < postIndex ? ink : photo ? "rgba(255,255,255,0.35)" : "rgba(22,20,31,0.18)" }}>
                {index === postIndex ? <View testID="story-progress" style={{ width: `${Math.round(progress * 1000) / 10}%`, height: "100%", backgroundColor: ink }} /> : null}
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {official ? <ShopinbosMark size={38} /> : <Picture uri={author.logoUrl} name={author.name} size={38} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <T weight="bold" numberOfLines={1} style={{ color: ink, fontSize: 15 }}>{author.name}</T>
              <T numberOfLines={1} style={{ color: ink, opacity: 0.85, fontSize: 13 }}>{storyByline(author, official ? author.roleLabel ?? t("role.shopinbos") : t(ROLE_KEY[author.role]), ago(post.createdAt, t))}</T>
            </View>
            {videoUrl ? (
              <Pressable
                testID="story-sound"
                accessibilityRole="button"
                accessibilityLabel={muted ? t("story.unmute") : t("story.mute")}
                accessibilityState={{ checked: !muted }}
                onPress={() => setMuted(!muted)}
                hitSlop={8}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center" }}
              >
                <AppIcon name={muted ? "volumeOff" : "volume"} size={22} color="#FFFFFF" />
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={onClose} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="x" size={26} color={ink} />
            </Pressable>
          </View>
        </View>

        {/* Tap the left third to go back, the rest to go on. A post without a picture is a designed card: a big
            mark, the headline large and centred, the words under it. */}
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, flexDirection: "row" }}>
            {/* Hold anywhere to pause; letting go carries on (a long press doesn't also move on). */}
            <Pressable accessibilityRole="button" accessibilityLabel={t("previous")} onPress={back} onLongPress={() => setHeld(true)} onPressOut={() => setHeld(false)} delayLongPress={220} style={{ flex: 1 }} />
            <Pressable accessibilityRole="button" accessibilityLabel={t("next")} onPress={next} onLongPress={() => setHeld(true)} onPressOut={() => setHeld(false)} delayLongPress={220} style={{ flex: 2 }} />
          </View>
          {held ? (
            <View pointerEvents="none" style={{ position: "absolute", top: 12, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
              <T weight="semibold" style={{ color: "#FFFFFF", fontSize: 13 }}>{t("story.paused")}</T>
            </View>
          ) : null}
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
                  icon="play"
                  title={t("sib.watch")}
                  onPress={() => {
                    onClose();
                    watchOutside(post.video);
                  }}
                />
              ) : null
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={like.liked ? t("unlike") : t("like")} accessibilityState={{ selected: like.liked }} onPress={() => void toggleLike()} style={{ minWidth: 56, height: 52, borderRadius: 26, backgroundColor: photo ? "rgba(255,255,255,0.22)" : "rgba(22,20,31,0.1)", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }}>
                <AppIcon name="star" size={20} color={like.liked ? colors.accent : ink} />
                <T weight="bold" style={{ color: ink }}>{String(like.likes)}</T>
              </Pressable>
            )}
            {hasCta && post.cta ? (
              // "See their shop" opens the shop's website, so it says so.
              <PillButton tone="accent" title={post.cta.label} style={{ flex: 1 }} onPress={action} accessibilityLabel={post.cta.label}>
                {!official && post.cta.kind === "view_shop" ? <WebButtonLabel title={post.cta.label} tone="accent" /> : undefined}
              </PillButton>
            ) : null}
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
