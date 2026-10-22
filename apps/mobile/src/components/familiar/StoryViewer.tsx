import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StatusBar, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Initials } from "@/components/kit";
import { AppIcon } from "@/components/icons";
import { PillButton, T } from "@/components/ui";
import { TILE } from "@/components/design";
import { likeStatus, markStatusSeen, type StatusAuthor, type StatusPost } from "@/lib/familiar";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// Full-screen Status viewer ("Familiar app" prototype `storyView`): progress bars, who posted and when, tap the left
// or right half to go back or on, the headline and caption over a dark shade, a like and the post's one action
// ("Add to my shop", "Chat with them", "Offer to deliver"…). Each post moves on by itself after a few seconds.

const SHOW_MS = 6000;
const ROLE_KEY = { seller: "role.seller", supplier: "role.supplier", logistics_partner: "role.partner" } as const;

function ago(iso: string, t: ReturnType<typeof useT<["m_familiar"]>>) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return minutes < 60 ? t("ago.minutes", { count: minutes }) : t("ago.hours", { count: Math.round(minutes / 60) });
}

export function StoryViewer({
  authors,
  start,
  visible,
  onClose,
  onCta,
  own = false,
}: {
  authors: StatusAuthor[];
  start: number;
  visible: boolean;
  onClose: () => void;
  /** The post's action was tapped; the caller routes it (the viewer closes first). */
  onCta?: (post: StatusPost, author: StatusAuthor) => void;
  /** Showing your own posts: views instead of a like, no action. */
  own?: boolean;
}) {
  const t = useT("m_familiar");
  const insets = useSafeAreaInsets();
  const [authorIndex, setAuthorIndex] = useState(start);
  const [postIndex, setPostIndex] = useState(0);
  const [likes, setLikes] = useState<Record<string, { likes: number; liked: boolean }>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [opened, setOpened] = useState(visible);
  if (opened !== visible) {
    setOpened(visible);
    if (visible) {
      setAuthorIndex(start);
      setPostIndex(0);
    }
  }

  const author = authors[authorIndex];
  const post = author?.posts[postIndex];

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
    if (!own) void markStatusSeen(post.id);
    timer.current = setTimeout(next, SHOW_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // The timer restarts for each post shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, post?.id]);

  if (!author || !post) return null;
  const like = likes[post.id] ?? { likes: post.likes, liked: post.liked };
  const tone = TILE[post.tone] ?? TILE.ink;
  const photo = Boolean(post.imageUrl);
  // Words and controls: white over a photo, the tone's ink on a plain coloured post.
  const ink = photo ? "#FFFFFF" : tone.fg;

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

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle={photo ? "light-content" : "dark-content"} />
      <View style={{ flex: 1, backgroundColor: post.imageUrl ? "#000" : tone.bg }}>
        {post.imageUrl ? <Image source={{ uri: post.imageUrl }} style={{ position: "absolute", inset: 0 }} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
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
            <Initials name={author.name} size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T weight="bold" numberOfLines={1} style={{ color: ink, fontSize: 15 }}>{author.name}</T>
              <T numberOfLines={1} style={{ color: ink, opacity: 0.85, fontSize: 13 }}>{`${t(ROLE_KEY[author.role])} · ${ago(post.createdAt, t)}`}</T>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={onClose} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="x" size={26} color={ink} />
            </Pressable>
          </View>
        </View>

        {/* Tap the left third to go back, the rest to go on. */}
        <View style={{ flex: 1, flexDirection: "row" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("previous")} onPress={back} style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel={t("next")} onPress={next} style={{ flex: 2 }} />
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 18, gap: 14 }}>
          <View style={{ gap: 6 }}>
            <T style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: ink }}>{post.headline}</T>
            {post.caption ? <T style={{ fontSize: 15, lineHeight: 21, color: ink }}>{post.caption}</T> : null}
            {post.product ? <T weight="bold" style={{ fontSize: 15, color: ink }}>{`${post.product.name} · ₦${Math.round(post.product.price).toLocaleString("en-NG")}`}</T> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {own ? (
              <T weight="semibold" style={{ color: ink, fontSize: 14 }}>{t("status.views", { count: post.views })}</T>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={like.liked ? t("unlike") : t("like")} accessibilityState={{ selected: like.liked }} onPress={() => void toggleLike()} style={{ minWidth: 56, height: 52, borderRadius: 26, backgroundColor: photo ? "rgba(255,255,255,0.22)" : "rgba(22,20,31,0.1)", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }}>
                <AppIcon name="star" size={20} color={like.liked ? colors.accent : ink} />
                <T weight="bold" style={{ color: ink }}>{String(like.likes)}</T>
              </Pressable>
            )}
            {!own && post.cta && onCta ? (
              <PillButton
                tone="accent"
                title={post.cta.label}
                style={{ flex: 1 }}
                onPress={() => {
                  onClose();
                  onCta(post, author);
                }}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
