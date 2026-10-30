import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { PillButton, T } from "@/components/ui";
import { RexHead } from "@/components/rex-build/Frame";
import { useT } from "@/lib/i18n";
import { RexStillWorking, useRexResume } from "@/lib/rex-jobs";
import { applyLook } from "@/lib/templates";
import {
  BUILD_TICKS,
  buildProgress,
  buildShop,
  fetchOnboarding,
  notifyWhenBuilt,
  saveFlow,
  themeFor,
  type OnboardingState,
} from "@/lib/seller-onboarding";
import { colors, fonts, radii } from "@/theme";

// E1 "Watch the magic ✨ Your shop is building" (design RB-14): a bar with the time left, the shop drawing itself
// (banner, products, then the rest) and a checklist ticking off. Rex builds the draft on the server as a Rex job
// (POST /api/mobile/onboarding/build), so leaving the screen or the app loses nothing: Peggy pushes "Your shop is
// ready" when it's done if the seller left (the build is told when the app goes to the background).

const TICK_MS = 450;

export default function Building() {
  const t = useT("m_rexBuild");
  const [state, setState] = useState<OnboardingState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [shownTicks, setShownTicks] = useState(0);
  const [problem, setProblem] = useState<"failed" | "waiting" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const startedAt = useRef(Date.now());

  // The build itself (again on "Try again").
  useEffect(() => {
    let live = true;
    setProblem(null);
    startedAt.current = Date.now();
    void (async () => {
      const loaded = await fetchOnboarding().catch(() => null);
      if (!live) return;
      setState(loaded);
      try {
        // The draft needs a look first (a seller who skipped the style step's save, or an older shop).
        if (loaded?.store && !loaded.store.themeId && !loaded.flow.themeId) {
          const themeId = themeFor(loaded.flow.categories);
          await applyLook(themeId).catch(() => null);
          await saveFlow({ themeId }).catch(() => null);
        }
        await saveFlow({ screen: "building" }).catch(() => null);
        await buildShop();
        if (live) setDone(true);
      } catch (error) {
        if (live) setProblem(error instanceof RexStillWorking ? "waiting" : "failed");
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt]);

  // A build that finished while the seller was away (or still going): picked up here.
  useRexResume(["store_build"], () => setDone(true), problem === "waiting");

  // The bar moves with time while Rex works; once done, the rest of the list ticks off quickly.
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(timer);
  }, [attempt]);
  const timed = buildProgress(elapsed, false);
  useEffect(() => {
    if (!done) {
      setShownTicks((current) => Math.max(current, timed.ticked));
      return;
    }
    if (shownTicks >= BUILD_TICKS.length) {
      const leave = setTimeout(() => router.replace("/onboarding/review"), 700);
      return () => clearTimeout(leave);
    }
    const tick = setTimeout(() => setShownTicks((current) => current + 1), TICK_MS);
    return () => clearTimeout(tick);
  }, [done, shownTicks, timed.ticked]);

  // Leaving the app mid-build: Peggy tells them when it's ready.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" && !done) void notifyWhenBuilt(true);
    });
    return () => sub.remove();
  }, [done]);

  const percent = done ? Math.max(timed.percent, Math.round((shownTicks / BUILD_TICKS.length) * 100)) : timed.percent;
  const secondsLeft = timed.secondsLeft;
  const flow = state?.flow;
  const products = state?.products ?? [];
  const groups = state?.collections?.filter((collection) => collection.productIds.length).length ?? 0;
  const tickLabel = (key: (typeof BUILD_TICKS)[number]) =>
    key === "products" ? (products.length ? t("building.tick.products", { products: products.length, collections: Math.max(1, groups) }) : t("building.tick.productsNone")) : t(`building.tick.${key}`);

  return (
    <View style={{ flex: 1, backgroundColor: "#0B3B37" }}>
      <LinearGradient colors={["#0F5A52", "#0B3B37"]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={{ alignItems: "center", gap: 14, paddingHorizontal: 22, paddingTop: 18 }}>
          <RexHead size={86} />
          <T accessibilityRole="header" style={{ color: "#FFFFFF", fontFamily: fonts.display, fontSize: 27, lineHeight: 31, textAlign: "center" }}>{`${t("building.title")}\n${t("building.title2")}`}</T>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} style={{ alignSelf: "stretch", height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
            <View style={{ width: `${percent}%`, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />
          </View>
          <T style={{ color: "rgba(255,255,255,0.86)", fontSize: 15 }}>{percent >= 90 ? t("building.almost", { percent }) : t("building.progress", { percent, seconds: secondsLeft })}</T>
        </View>

        {/* The shop drawing itself: the banner, then the products, then the rest. */}
        <View style={{ marginHorizontal: 22, marginTop: 22, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: "#FFFFFF", padding: 12, gap: 10, flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 15, color: "#16141F" }} numberOfLines={1}>{state?.store?.name ?? ""}</T>
          <View style={{ height: 120, borderRadius: 16, overflow: "hidden", backgroundColor: "#EEF4F2", opacity: shownTicks >= 2 ? 1 : 0.25 }}>
            {flow?.banner?.url ? <Image source={{ uri: flow.banner.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={400} /> : null}
            {flow?.words?.headline ? <T numberOfLines={1} style={{ position: "absolute", left: 14, right: 14, bottom: 12, color: "#FFFFFF", fontFamily: "serif", fontStyle: "italic", fontSize: 20 }}>{flow.words.headline}</T> : null}
          </View>
          <View style={{ flexDirection: "row", gap: 8, opacity: shownTicks >= 3 ? 1 : 0.2 }}>
            {[0, 1].map((index) => (
              <View key={index} style={{ flex: 1, height: 64, borderRadius: 12, overflow: "hidden", backgroundColor: "#F2F0EC" }}>
                {products[index]?.image ? <Image source={{ uri: products[index]!.image! }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={400} /> : null}
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>

      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -40, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 34, gap: 14 }}>
        {BUILD_TICKS.map((key, index) => {
          const ticked = index < shownTicks;
          const now = index === shownTicks && !problem;
          return (
            <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 28 }}>
              {ticked ? (
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.successFill, alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name="check" size={14} color="#FFFFFF" strokeWidth={2.8} />
                </View>
              ) : now ? (
                <ActivityIndicator color={colors.accent} style={{ width: 26 }} />
              ) : (
                <View style={{ width: 26 }} />
              )}
              <T weight={now ? "extrabold" : "regular"} style={{ fontSize: 16.5, color: ticked || now ? colors.ink : colors.inkFaint }}>{now ? `${tickLabel(key)}…` : tickLabel(key)}</T>
            </View>
          );
        })}
        {problem ? (
          <View style={{ gap: 10 }}>
            <T style={{ fontSize: 14.5, lineHeight: 20, color: problem === "failed" ? colors.danger : colors.inkSoft }}>{problem === "failed" ? t("building.failed") : t("building.stillWorking")}</T>
            <PillButton tone="accent" title={t("retry")} onPress={() => setAttempt((value) => value + 1)} />
          </View>
        ) : (
          <T style={{ fontSize: 14, color: colors.inkSoft, textAlign: "center", borderRadius: radii.pill }}>{t("building.leave")}</T>
        )}
      </View>
    </View>
  );
}
