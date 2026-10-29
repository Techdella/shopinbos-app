import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import Svg, { Circle } from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Mascot, T, Wash, Wordmark, images } from "@/components/ui";
import { PEGGY_TIPS, timeAgo, type CachedDashboard } from "@/lib/launch";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Loading states from the "App loading" prototype boards:
// 1 launch screen (native splash + LaunchView), 2 opening your shop (first open), 3 Home skeleton (later opens),
// 4 slow network or offline (after 8 seconds).

const MINT = "#8BE3D3";
const MARK_RATIO = 537 / 469; // height / width of assets/brand/mark-white.png
const AMBER = { bg: "#FDF0D5", fg: "#8A5A08" };
const EASE_IN_OUT = Easing.inOut(Easing.ease); // module-level so loop effects don't restart on every render

/** True when the phone asks for less motion. Animations stop; content still updates. */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => alive && setReduce(value))
      .catch(() => null);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** A 0 → 1 value that loops while `active` (native driver, so it stays smooth while JS is busy loading). */
function useLoop(active: boolean, duration: number, easing: (value: number) => number = Easing.linear, pingPong = false) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    value.setValue(0);
    if (!active) return;
    const step = (toValue: number) => Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
    const animation = Animated.loop(pingPong ? Animated.sequence([step(1), step(0)]) : step(1));
    animation.start();
    return () => animation.stop();
  }, [active, duration, easing, pingPong, value]);
  return value;
}

// ── 1 · Launch screen ───────────────────────────────────────────────────────

/** The JS twin of the native splash (same green, same mark, plus the wordmark), shown while the app decides where to go. */
export function LaunchView() {
  const insets = useSafeAreaInsets();
  const t = useT("m_home");
  return (
    <View style={{ flex: 1, backgroundColor: colors.forestFill, alignItems: "center", justifyContent: "center" }} accessible accessibilityLabel={t("loading.starting")} accessibilityState={{ busy: true }}>
      <StatusBar style="light" />
      <Image source={images.markWhite} style={{ width: 76, height: 76 * MARK_RATIO }} contentFit="contain" />
      <View style={{ position: "absolute", bottom: Math.max(64, insets.bottom + 32), opacity: 0.85 }}>
        <Wordmark height={13} light />
      </View>
    </View>
  );
}

// ── 2 · Opening your shop (first open) ──────────────────────────────────────

const LINE_HEIGHT = 24;
const LINE_EVERY = 2000;

export function OpeningShop({ storeName }: { storeName?: string | null }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const t = useT("m_home");
  const [tipIndex] = useState(() => Math.floor(Math.random() * PEGGY_TIPS.length));
  const tip = t.dynamic(`tip.${tipIndex + 1}`, PEGGY_TIPS[tipIndex]);
  const lines = [storeName ? t("loading.openingName", { name: storeName }) : t("loading.opening"), t("loading.checkingOrders"), t("loading.brief"), t("loading.almost")];

  const spin = useLoop(!reduceMotion, 1200);
  const pulse = useLoop(!reduceMotion, 900, EASE_IN_OUT, true);
  const slide = useLoop(!reduceMotion, 1600, EASE_IN_OUT);

  // Status lines move up one every 2 seconds and stay on "Almost there".
  const [line, setLine] = useState(0);
  const lineY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (line >= lines.length - 1) return;
    const timer = setTimeout(() => setLine((current) => current + 1), LINE_EVERY);
    return () => clearTimeout(timer);
  }, [line, lines.length]);
  useEffect(() => {
    if (reduceMotion) lineY.setValue(-line * LINE_HEIGHT);
    else Animated.timing(lineY, { toValue: -line * LINE_HEIGHT, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
  }, [line, lineY, reduceMotion]);

  // Tip card fades up once.
  const tipIn = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(tipIn, { toValue: 1, duration: 600, delay: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [tipIn]);

  const TRACK = 168;
  const BAR = TRACK * 0.4;

  return (
    <View style={{ flex: 1, backgroundColor: colors.forestFill, alignItems: "center" }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 30, paddingTop: 40, paddingHorizontal: 16, width: "100%" }}>
        <View style={{ width: 132, height: 132, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }]}>
            <Svg width={132} height={132} viewBox="0 0 132 132">
              <Circle cx={66} cy={66} r={62} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={3} />
              <Circle cx={66} cy={66} r={62} fill="none" stroke={MINT} strokeWidth={3} strokeLinecap="round" strokeDasharray="90 300" />
            </Svg>
          </Animated.View>
          <Animated.View style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}>
            <Image source={images.markWhite} style={{ width: 62, height: 62 * MARK_RATIO }} contentFit="contain" />
          </Animated.View>
        </View>

        <Wordmark height={15} light />

        <View style={{ alignItems: "center", gap: 14, width: "100%" }}>
          <View style={{ width: TRACK, height: 4, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.14)", overflow: "hidden" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Animated.View
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                width: BAR,
                borderRadius: radii.pill,
                backgroundColor: MINT,
                // Reduced motion: the bar rests in the middle of the track.
                transform: [{ translateX: reduceMotion ? (TRACK - BAR) / 2 : slide.interpolate({ inputRange: [0, 1], outputRange: [-BAR * 1.1, BAR * 2.6] }) }],
              }}
            />
          </View>
          <View style={{ height: LINE_HEIGHT, overflow: "hidden", width: "100%", maxWidth: 300 }} accessibilityRole="progressbar" accessibilityLabel={lines[line]} accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>
            <Animated.View style={{ transform: [{ translateY: lineY }] }}>
              {lines.map((text) => (
                <T key={text} weight="semibold" numberOfLines={1} style={{ height: LINE_HEIGHT, lineHeight: LINE_HEIGHT, fontSize: 15, color: "#FFFFFF", textAlign: "center" }}>
                  {text}
                </T>
              ))}
            </Animated.View>
          </View>
        </View>
      </View>

      <Animated.View
        style={{
          alignSelf: "stretch",
          marginHorizontal: 16,
          marginBottom: insets.bottom + 24,
          backgroundColor: "rgba(255,255,255,0.07)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          borderRadius: 24,
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          opacity: tipIn,
          transform: [{ translateY: tipIn.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        }}
        accessible
        accessibilityLabel={t("loading.tipLabel", { tip })}
      >
        <Mascot name="peggy" size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <T weight="extrabold" style={{ fontSize: 12, color: MINT, letterSpacing: 0.5 }}>{t("loading.tipTitle")}</T>
          <T style={{ fontSize: 14, lineHeight: 20, color: "#E6FBF6" }}>{tip}</T>
        </View>
      </Animated.View>
    </View>
  );
}

// ── 3 · Home skeleton (later opens) ─────────────────────────────────────────

const SKELETON = { card: "#E6E3EE", wash: "#F1EFF5", mint: "#B9E2D8" } as const;

function Bone({ tone = "card", width, height, radius = 10, style, opacity }: { tone?: keyof typeof SKELETON; width?: DimensionValue; height: DimensionValue; radius?: number; style?: StyleProp<ViewStyle>; opacity: Animated.AnimatedInterpolation<number> | number }) {
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: SKELETON[tone], opacity }, style]} />;
}

/** Same layout as Home (header, headline, Ask Peggy, this week, today's counts, Peggy's brief) so nothing jumps when data lands. */
export function HomeSkeleton() {
  const reduceMotion = useReduceMotion();
  const shimmer = useLoop(!reduceMotion, 700, EASE_IN_OUT, true);
  const opacity = reduceMotion ? 1 : shimmer.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] });
  const bars = ["40%", "65%", "50%", "80%", "55%", "70%"] as const;
  const t = useT("m_home");

  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: 320 }}>
        <Wash />
      </View>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, gap: 18 }} scrollEnabled={false}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Bone tone="wash" width={46} height={46} radius={23} opacity={opacity} />
            <View style={{ flex: 1 }} />
            <Bone tone="wash" width={46} height={46} radius={23} opacity={opacity} />
            <Bone tone="wash" width={46} height={46} radius={23} opacity={opacity} />
          </View>
          <View style={{ gap: 10 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Bone tone="wash" width={150} height={16} opacity={opacity} />
            <Bone tone="wash" width={260} height={34} radius={12} style={{ maxWidth: "80%" }} opacity={opacity} />
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel={t("askPeggy")} onPress={() => router.push("/peggy")} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: 8, height: 54 }}>
            <Mascot name="peggy" size={36} label="" />
            <T weight="semibold" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14.5, color: colors.inkSoft }}>{t("askPeggy")}</T>
          </Pressable>

          <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 16, gap: 14 }} accessible accessibilityRole="progressbar" accessibilityLabel={t("loading.sales")} accessibilityState={{ busy: true }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Bone width={110} height={14} opacity={opacity} />
              <Bone width={60} height={14} opacity={opacity} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, height: 92 }}>
              {bars.map((height, index) => (
                <Bone key={index} height={height} radius={8} style={{ flex: 1 }} opacity={opacity} />
              ))}
              <View style={{ flex: 1, height: "95%", borderRadius: 8, backgroundColor: colors.peach }} />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {[36, 44, 30].map((width, index) => (
              <View key={index} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 24, padding: 14, gap: 10 }}>
                <Bone width={50} height={12} style={{ maxWidth: "100%" }} opacity={opacity} />
                <Bone width={width} height={22} opacity={opacity} />
              </View>
            ))}
          </View>

          <View style={{ backgroundColor: colors.mintTint, borderRadius: 24, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }} accessible accessibilityRole="progressbar" accessibilityLabel={t("loading.brief")} accessibilityState={{ busy: true }}>
              <Mascot name="peggy" mood="thinking" size={34} label="" />
              <T weight="extrabold" style={{ flex: 1, fontSize: 14, color: colors.forest }}>{t("loading.brief")}</T>
            </View>
            {[["80%", "55%"], ["70%", "45%"]].map(([first, second], index) => (
              <View key={index} style={{ flexDirection: "row", gap: 10, alignItems: "center" }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <Bone tone="mint" width={40} height={40} radius={12} opacity={opacity} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Bone tone="mint" width={first as DimensionValue} height={12} opacity={opacity} />
                  <Bone tone="mint" width={second as DimensionValue} height={12} opacity={opacity} />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── 4 · Slow network or offline ─────────────────────────────────────────────

export function OfflineBanner({ offline, savedAt, action }: { offline: boolean; savedAt: number; action?: ReactNode }) {
  const t = useT("m_home");
  const ago = timeAgo(savedAt, Date.now(), t);
  return (
    <View style={{ backgroundColor: AMBER.bg, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 }} accessibilityLiveRegion="polite">
      <AppIcon name="wifiOff" size={20} color={AMBER.fg} strokeWidth={2} />
      <T weight="bold" style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: AMBER.fg }}>
        {offline ? t("offline.bannerOffline", { ago }) : t("offline.bannerSlow", { ago })}
      </T>
      {action}
    </View>
  );
}

function StillRow({ icon, label, tint, onPress, last }: { icon: AppIconName; label: string; tint?: boolean; onPress: () => void; last?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 56, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: tint ? colors.peach : colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name={icon} size={18} color={tint ? colors.accentInk : colors.ink} strokeWidth={1.8} />
      </View>
      <T weight="bold" style={{ flex: 1, fontSize: 15 }}>{label}</T>
      <AppIcon name="chevron" size={18} color={colors.inkSoft} strokeWidth={1.8} />
    </Pressable>
  );
}

/**
 * Shown when Home hasn't loaded after 8 seconds, or straight away when the request can't reach Shopinbos.
 * The app has no offline queue, so the copy only promises what works: the last Home this phone saw (if any),
 * and automatic retries.
 */
export function SlowNetwork({
  offline,
  cached,
  attempting,
  nextRetryAt,
  onRetry,
  onUseCached,
}: {
  offline: boolean;
  cached: CachedDashboard | null;
  attempting: boolean;
  nextRetryAt: number | null;
  onRetry: () => void;
  onUseCached: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 700;
  const t = useT("m_home", "common");

  // Re-render every second for the "next try" countdown and the "N min ago" age.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const waitSeconds = nextRetryAt ? Math.max(0, Math.ceil((nextRetryAt - now) / 1000)) : 0;

  const body = offline ? t("offline.bodyOffline") : t("offline.bodySlow");
  const ago = cached ? timeAgo(cached.savedAt, now, t) : "";

  const still: Array<{ icon: AppIconName; label: string; tint?: boolean }> = [];
  if (cached) {
    still.push({ icon: "receipt", label: t("offline.stillSales"), tint: true });
    if (cached.data.tasks.length) still.push({ icon: "sparkle", label: t("offline.stillTasks") });
    if (cached.data.sellingFast.length) still.push({ icon: "tag", label: t("offline.stillStock") });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        {offline && cached && (
          <View style={{ marginTop: 8, marginHorizontal: 16 }}>
            <OfflineBanner offline savedAt={cached.savedAt} />
          </View>
        )}

        <View style={{ paddingTop: compact ? 28 : 48, paddingHorizontal: 24, alignItems: "center", gap: 14 }}>
          <Mascot name="peggy" mood="oops" size={compact ? 96 : 120} label="" />
          <T weight="extrabold" style={{ fontSize: 26, letterSpacing: -0.26, textAlign: "center" }} accessibilityRole="header">
            {offline ? t("offline.titleOffline") : t("offline.titleSlow")}
          </T>
          <T style={{ fontSize: 15, lineHeight: 23, color: colors.inkSoft, textAlign: "center", maxWidth: 310 }}>{body}</T>
        </View>

        {still.length > 0 && cached && (
          <View style={{ marginTop: 26, marginHorizontal: 16, backgroundColor: colors.surface, borderRadius: 24, paddingVertical: 6, paddingHorizontal: 16 }}>
            <T weight="extrabold" style={{ fontSize: 12, color: colors.inkSoft, letterSpacing: 0.5, paddingTop: 12, paddingBottom: 4 }}>
              {t("offline.stillTitle", { ago }).toUpperCase()}
            </T>
            {still.map((item, index) => (
              <StillRow key={item.label} {...item} onPress={onUseCached} last={index === still.length - 1} />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 8, gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={attempting ? t("offline.trying") : t("offline.tryNow")}
          accessibilityHint={!attempting && waitSeconds ? t("offline.retryHint", { count: waitSeconds }) : undefined}
          accessibilityState={{ busy: attempting }}
          onPress={attempting ? undefined : onRetry}
          style={({ pressed }) => ({ minHeight: 52, borderRadius: radii.pill, backgroundColor: colors.inkFill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: pressed ? 0.85 : 1 })}
        >
          {attempting && <ActivityIndicator size="small" color="#FFFFFF" />}
          <T weight="bold" numberOfLines={1} style={{ flexShrink: 1, fontSize: 16, color: "#FFFFFF" }}>
            {attempting ? t("offline.tryingDots") : waitSeconds ? t("offline.tryNowIn", { seconds: waitSeconds }) : t("tryAgain")}
          </T>
        </Pressable>
        {cached && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={offline ? t("offline.keepWorking") : t("offline.showSaved", { ago })}
            onPress={onUseCached}
            style={({ pressed }) => ({ minHeight: 52, borderRadius: radii.pill, backgroundColor: pressed ? colors.canvas : colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 })}
          >
            <T weight="bold" numberOfLines={1} style={{ flexShrink: 1, fontSize: 16 }}>{offline ? t("offline.keepWorking") : t("offline.showSaved", { ago })}</T>
          </Pressable>
        )}
      </View>
    </View>
  );
}
