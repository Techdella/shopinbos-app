import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import Svg, { Path } from "react-native-svg";
import { formatDate } from "@shared/i18n";
import { motionLines, motionStyle, slideDurationMs, updateTheme } from "@shared/weekly-updates";
import type { TeamUpdate } from "@/lib/updates";
import { openPath } from "@/lib/web";
import { useLocale, useT } from "@/lib/i18n";
import { fonts } from "@/theme";

// Weekly updates from the Shopinbos team, played like a status (the web's UpdatesViewer.tsx): segmented progress,
// tap the right side for the next, the left for the previous, hold to pause. Text and motion cards are words on a
// brand colour (motion lines animate in one by one); pictures fill the screen; uploaded videos play to the end;
// YouTube and Vimeo open in the in-app browser. Each update is marked seen as it shows.

const TICK_MS = 100;

function Glyph({ name, size = 18, color = "#FFFFFF" }: { name: "x" | "play" | "pause" | "arrow"; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      {name === "x" && <Path d="M6 6 L18 18 M18 6 L6 18" />}
      {name === "play" && <Path d="M7 4.5 L19 12 L7 19.5 Z" fill={color} />}
      {name === "pause" && <Path d="M8 5 V19 M16 5 V19" strokeWidth={3.4} />}
      {name === "arrow" && <Path d="M5 12 H19 M13 6 L19 12 L13 18" />}
    </Svg>
  );
}

function MotionCard({ update, paused }: { update: TeamUpdate; paused: boolean }) {
  const theme = updateTheme(update.theme);
  const style = motionStyle(update.motion);
  const lines = [update.title, ...motionLines(update.body)];
  const [values] = useState(() => lines.map(() => new Animated.Value(0)));
  const [reduced, setReduced] = useState(false);
  const started = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
  }, []);

  useEffect(() => {
    if (reduced) {
      values.forEach((value) => value.setValue(1));
      return;
    }
    if (paused) {
      started.current?.stop();
      return;
    }
    started.current = Animated.stagger(
      600,
      values.map((value) => Animated.timing(value, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true })),
    );
    started.current.start();
    return () => started.current?.stop();
  }, [paused, reduced, values]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center", paddingHorizontal: 28, gap: 10 }}>
      <View style={{ position: "absolute", top: -60, right: -70, width: 240, height: 240, borderRadius: 120, backgroundColor: theme.accent, opacity: 0.22 }} />
      {lines.map((line, index) => {
        const value = values[index]!;
        const move = style === "slide" ? { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [-34, 0] }) } : style === "pop" ? { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) } : { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) };
        return (
          <Animated.Text
            key={index}
            style={{
              opacity: value,
              transform: [move],
              fontFamily: index === 0 ? fonts.extrabold : fonts.semibold,
              fontSize: index === 0 ? 28 : 19,
              lineHeight: index === 0 ? 33 : 25,
              color: index === 1 ? theme.accent : theme.ink,
              marginBottom: index === 0 ? 8 : 0,
            }}
          >
            {line}
          </Animated.Text>
        );
      })}
    </View>
  );
}

function TextCard({ update }: { update: TeamUpdate }) {
  const theme = updateTheme(update.theme);
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center", paddingHorizontal: 28 }}>
      <View style={{ position: "absolute", top: -60, right: -70, width: 240, height: 240, borderRadius: 120, backgroundColor: theme.accent, opacity: 0.22 }} />
      <Text style={{ fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 33, color: theme.ink }}>{update.title}</Text>
      {update.body ? <Text style={{ fontFamily: fonts.regular, fontSize: 18, lineHeight: 26, color: theme.ink, marginTop: 14 }}>{update.body}</Text> : null}
    </View>
  );
}

function Caption({ update }: { update: TeamUpdate }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingBottom: 110, paddingTop: 40, backgroundColor: "rgba(0,0,0,0.45)" }}>
      <Text style={{ fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 25, color: "#FFFFFF" }}>{update.title}</Text>
      {update.body ? <Text numberOfLines={4} style={{ fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: "rgba(255,255,255,0.88)", marginTop: 6 }}>{update.body}</Text> : null}
    </View>
  );
}

function VideoCard({ update, url, paused, onEnd, onProgress }: { update: TeamUpdate; url: string; paused: boolean; onEnd: () => void; onProgress: (fraction: number) => void }) {
  const player = useVideoPlayer(url, (created) => created.play());
  const ended = useRef(onEnd);
  ended.current = onEnd;
  const progress = useRef(onProgress);
  progress.current = onProgress;

  useEffect(() => {
    const sub = player.addListener("playToEnd", () => ended.current());
    const timer = setInterval(() => {
      if (player.duration > 0) progress.current(Math.min(1, player.currentTime / player.duration));
    }, 250);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [player]);

  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000000", justifyContent: "center" }}>
      <VideoView player={player} nativeControls={false} contentFit="contain" style={{ width: "100%", height: "100%" }} />
      <Caption update={update} />
    </View>
  );
}

export function TeamUpdatesViewer({ updates, startAt = 0, onSeen, onClose }: { updates: TeamUpdate[]; startAt?: number; onSeen?: (id: string) => void; onClose: () => void }) {
  const t = useT("nav");
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(Math.min(startAt, updates.length - 1));
  const [elapsed, setElapsed] = useState(0);
  const [videoFraction, setVideoFraction] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const update = updates[index]!;
  const fileVideo = update.kind === "video" && update.video?.kind === "file" ? update.video.url : null;
  const duration = slideDurationMs(update);
  const stopped = paused || held;

  const go = (next: number) => {
    if (next >= updates.length) return onClose();
    setIndex(Math.max(0, next));
    setElapsed(0);
    setVideoFraction(0);
  };
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    if (!update.seen) onSeen?.(update.id);
  }, [update.id, update.seen, onSeen]);

  // The clock for cards and linked videos (an uploaded video moves on when it ends).
  useEffect(() => {
    if (stopped || fileVideo) return;
    const timer = setInterval(() => setElapsed((current) => current + TICK_MS), TICK_MS);
    return () => clearInterval(timer);
  }, [stopped, fileVideo, index]);

  useEffect(() => {
    if (!fileVideo && elapsed >= duration) goRef.current(index + 1);
  }, [elapsed, duration, fileVideo, index]);

  const progress = (i: number) => (i < index ? 1 : i > index ? 0 : fileVideo ? videoFraction : Math.min(1, elapsed / duration));
  const openCta = () => {
    const url = update.cta?.url;
    if (!url) return;
    onClose();
    if (url.startsWith("/")) void openPath(url);
    else void WebBrowser.openBrowserAsync(url);
  };

  const embedLink = update.kind === "video" && update.video && update.video.kind !== "file" ? update.video.watchUrl : null;
  let card: React.ReactNode;
  if (fileVideo) card = <VideoCard key={update.id} update={update} url={fileVideo} paused={stopped} onEnd={() => goRef.current(index + 1)} onProgress={setVideoFraction} />;
  else if (embedLink) {
    card = (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        {update.posterUrl ? <Image source={{ uri: update.posterUrl }} style={{ flex: 1 }} contentFit="cover" /> : null}
        <Caption update={update} />
      </View>
    );
  } else if (update.kind === "image" && update.imageUrl) {
    card = (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <Image source={{ uri: update.imageUrl }} style={{ flex: 1 }} contentFit="cover" autoplay={!stopped} />
        <Caption update={update} />
      </View>
    );
  } else if (update.kind === "motion") card = <MotionCard key={update.id} update={update} paused={stopped} />;
  else card = <TextCard update={update} />;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View testID="team-updates-viewer" accessibilityViewIsModal style={{ flex: 1, backgroundColor: "#000000" }}>
        {card}

        {/* Tap zones: left goes back, right goes on; holding either pauses. */}
        <View style={{ position: "absolute", top: insets.top + 70, left: 0, right: 0, bottom: 100, flexDirection: "row" }}>
          {(["back", "next"] as const).map((side) => (
            <Pressable
              key={side}
              accessibilityRole="button"
              accessibilityLabel={side === "back" ? t("updates.previous") : t("updates.next")}
              onPress={() => go(side === "back" ? index - 1 : index + 1)}
              onLongPress={() => setHeld(true)}
              onPressOut={() => setHeld(false)}
              delayLongPress={220}
              style={{ flex: side === "back" ? 1 : 2 }}
            />
          ))}
        </View>

        {embedLink ? (
          <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPaused(true);
                void WebBrowser.openBrowserAsync(embedLink);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 22, borderRadius: 999, backgroundColor: "#73D8C8" }}
            >
              <Glyph name="play" color="#0E2A38" />
              <Text style={{ fontFamily: fonts.extrabold, fontSize: 16, color: "#0E2A38" }}>{t("updates.watch")}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + 10, paddingHorizontal: 12, backgroundColor: "rgba(0,0,0,0.25)", paddingBottom: 10 }}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {updates.map((item, i) => (
              <View key={item.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
                <View style={{ width: `${progress(i) * 100}%`, height: 3, backgroundColor: "#FFFFFF" }} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#73D8C8", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: fonts.extrabold, fontSize: 14, color: "#0E2A38" }}>S</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.extrabold, fontSize: 14.5, color: "#FFFFFF" }}>{t("updates.from")}</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{formatDate(update.publishedAt, locale, { day: "numeric", month: "short" })}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={paused ? t("updates.play") : t("updates.pause")} onPress={() => setPaused(!paused)} hitSlop={8} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
              <Glyph name={paused ? "play" : "pause"} />
            </Pressable>
            <Pressable testID="team-updates-close" accessibilityRole="button" accessibilityLabel={t("updates.close")} onPress={onClose} hitSlop={8} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
              <Glyph name="x" size={20} />
            </Pressable>
          </View>
        </View>

        {update.cta ? (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: Math.max(insets.bottom, 16) + 8, alignItems: "center" }}>
            <Pressable accessibilityRole="button" onPress={openCta} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 50, paddingHorizontal: 24, borderRadius: 999, backgroundColor: "#73D8C8", opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ fontFamily: fonts.extrabold, fontSize: 15.5, color: "#0E2A38" }}>{update.cta.label}</Text>
              <Glyph name="arrow" size={16} color="#0E2A38" />
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
