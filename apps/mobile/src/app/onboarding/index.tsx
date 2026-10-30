import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { useT } from "@/lib/i18n";
import { redeemFeatureInvite } from "@/lib/features";
import { finishOnboarding } from "@/lib/onboarding";
import {
  REX_CHOSE_FLASH_MS,
  fetchOnboarding,
  forgetEntry,
  isFlowScreen,
  nextScreen,
  previousScreen,
  readEntry,
  resumeScreen,
  saveFlow,
  stepOf,
  track,
  welcomeBack,
  type FlowMode,
  type FlowScreen,
  type RexBuildMemory,
} from "@/lib/seller-onboarding";
import { ChooseStep, IntroStep, NameStep, SellStep, ShopStep } from "@/components/rex-build/basics";
import { CategoriesStep, PlanStep, ProductsStep } from "@/components/rex-build/products";
import { BannerStep, ColoursStep, LayoutStep, SectionsStep, StyleStep, WordsStep } from "@/components/rex-build/design";
import { AboutStep, ContactStep, MediaStep } from "@/components/rex-build/pages";
import type { LoadedState, StepCtx } from "@/components/rex-build/context";
import { colors } from "@/theme";

// Seller onboarding on the phone: "Rex builds your shop (step by step)" (spec "Seller Onboarding Flow: Shopinbos
// Business (mobile)", design RB-01…RB-16; the order and rules are shared/seller-onboarding.ts). Shop basics (B1–B4:
// Let's open your shop, your name, what you sell, the shop name and free link), how to build it (C1: Rex, or the
// store editor with a starter template), then Rex's five steps (D0–D4c). Every answer is saved on the server as it's
// given (PATCH /api/mobile/onboarding), so the app reopens on the same screen with "Welcome back, Ada. Let's finish
// your shop: Step 3 of 5." The build (E1), review (E2) and "is live" (E3) are their own screens
// (onboarding/building.tsx, review.tsx, launched.tsx). ?redesign=1 (My shop › Settings › "Redesign with Rex") runs
// the design steps again into the draft; nothing goes live until the seller says so on the review.

export default function SellerOnboarding() {
  const t = useT("m_rexBuild");
  const params = useLocalSearchParams<{ redesign?: string; screen?: string }>();
  const mode: FlowMode = params.redesign === "1" ? "redesign" : "start";
  const [data, setData] = useState<LoadedState | null>(null);
  const [failed, setFailed] = useState(false);
  const [flow, setFlow] = useState<RexBuildMemory>({});
  const [screen, setScreen] = useState<FlowScreen | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const shownAt = useRef(Date.now());
  const started = useRef(false);

  const reload = useCallback(async () => {
    try {
      const next = await fetchOnboarding();
      if (!next.store) throw new Error("no store");
      setData(next as LoadedState);
      setFailed(false);
      return next as LoadedState;
    } catch {
      setFailed(true);
      return null;
    }
  }, []);

  // First load: where to pick up, what the link carried, and the welcome back line.
  useEffect(() => {
    void (async () => {
      const loaded = await reload();
      if (!loaded || started.current) return;
      started.current = true;
      let saved = loaded.flow ?? {};
      const entry = readEntry();
      const patch: Partial<RexBuildMemory> = {};
      if (!saved.startedAt) {
        patch.startedAt = new Date().toISOString();
        patch.source = entry.source ?? (entry.intent ? "website" : entry.ref ? "referral" : entry.invite ? "pilot_invite" : "app");
        track("onboarding_started", { source: patch.source, intent: entry.intent ?? null });
      }
      if (entry.intent && entry.productSlug && !saved.intent) patch.intent = { kind: entry.intent, productSlug: entry.productSlug, addedProductId: null };
      if (entry.ref && !saved.referralCode) patch.referralCode = entry.ref;
      // A pilot invite from the WhatsApp test link: redeemed quietly (FeatureInvite), never asked about.
      if (entry.invite && !saved.pilotInvite) {
        patch.pilotInvite = entry.invite;
        void redeemFeatureInvite(entry.invite).catch(() => null);
        forgetEntry(["invite"]);
      }
      if (mode === "redesign" && saved.mode !== "redesign") Object.assign(patch, { mode: "redesign", screen: "plan", builtAt: null, liveAt: saved.liveAt ?? null });
      if (mode === "start" && saved.mode === "redesign") patch.mode = "start";
      if (Object.keys(patch).length) {
        saved = { ...saved, ...patch };
        void saveFlow(patch).catch(() => null);
      }
      setFlow(saved);

      const live = loaded.store.live;
      const wanted = isFlowScreen(params.screen) ? params.screen : mode === "redesign" ? (saved.screen && saved.mode === "redesign" && stepOf(saved.screen) ? saved.screen : "plan") : resumeScreen(saved, live);
      if (!wanted || (live && mode === "start")) {
        // Already live: onboarding is done (the "is live" screen once, then Home).
        if (saved.liveAt && !loaded.store.finished) return router.replace("/onboarding/launched");
        await finishOnboarding(true).catch(() => null);
        return router.replace("/home");
      }
      if (wanted === "building") return router.replace("/onboarding/building");
      if (wanted === "review" || wanted === "live") return router.replace(wanted === "review" ? "/onboarding/review" : "/onboarding/launched");
      const back = welcomeBack(saved, wanted);
      if (back && saved.lastActivityAt) {
        setNotice(back.step ? (back.name ? t("welcomeBack", { name: back.name, step: back.step }) : t("welcomeBackNoName", { step: back.step })) : t("welcomeBackNoStep", { name: back.name || "" }));
      }
      shownAt.current = Date.now();
      setScreen(wanted);
    })();
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (patch: Partial<RexBuildMemory>, event?: Parameters<typeof saveFlow>[1], props?: Record<string, unknown>) => {
    setFlow((current) => ({ ...current, ...patch }));
    try {
      await saveFlow(patch, event, props);
      return true;
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("error.save"));
      return false;
    }
  }, [t]);

  const go = useCallback((target: FlowScreen | null) => {
    setError(null);
    setFlash(null);
    setNotice(null);
    shownAt.current = Date.now();
    if (!target) return;
    if (target === "building") return router.replace("/onboarding/building");
    setScreen(target);
  }, []);

  const next = useCallback(async (patch: Partial<RexBuildMemory> = {}, options: { rex?: boolean } = {}) => {
    if (!screen) return;
    const target = nextScreen(screen, mode);
    const seconds = Math.round((Date.now() - shownAt.current) / 1000);
    const step = stepOf(screen);
    const record = step ? { steps: { [screen]: { usedRexChoose: Boolean(options.rex), seconds, at: new Date().toISOString() } } } : {};
    const ok = await save({ ...patch, ...record, screen: target ?? screen }, step ? "rex_step_completed" : undefined, step ? { step: screen, usedRexChoose: Boolean(options.rex), seconds } : undefined);
    if (ok) go(target);
  }, [screen, mode, save, go]);

  const rexChose = useCallback((label: string, patch: Partial<RexBuildMemory>) => {
    setFlash(label);
    setTimeout(() => void next(patch, { rex: true }), REX_CHOSE_FLASH_MS);
  }, [next]);

  if (failed && !data) return <ErrorState message={t("error.load")} onRetry={() => void reload()} />;
  if (!data || !screen) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, justifyContent: "center" }}>
        <LoadingBlock />
      </View>
    );
  }

  const previous = previousScreen(screen, mode);
  const leave = async () => {
    await save({ screen });
    router.replace("/home");
  };
  const ctx: StepCtx = {
    data,
    flow,
    mode,
    screen,
    save,
    next,
    rexChose,
    reload,
    setError,
    frame: {
      step: stepOf(screen),
      onBack: () => (previous && !(mode === "redesign" && screen === "plan") ? go(previous) : router.canGoBack() ? router.back() : router.replace("/home")),
      // Save: leave now and come back to this screen (the answers are already on the server).
      onSave: screen === "intro" ? null : () => void leave(),
      flash,
      error,
      notice,
    },
  };

  switch (screen) {
    case "intro":
      return <IntroStep ctx={ctx} />;
    case "name":
      return <NameStep ctx={ctx} />;
    case "sell":
      return <SellStep ctx={ctx} />;
    case "shop":
      return <ShopStep ctx={ctx} />;
    case "choose":
      return <ChooseStep ctx={ctx} />;
    case "plan":
      return <PlanStep ctx={ctx} />;
    case "products":
      return <ProductsStep ctx={ctx} />;
    case "categories":
      return <CategoriesStep ctx={ctx} />;
    case "style":
      return <StyleStep ctx={ctx} />;
    case "colours":
      return <ColoursStep ctx={ctx} />;
    case "banner":
      return <BannerStep ctx={ctx} />;
    case "words":
      return <WordsStep ctx={ctx} />;
    case "layout":
      return <LayoutStep ctx={ctx} />;
    case "sections":
      return <SectionsStep ctx={ctx} />;
    case "media":
      return <MediaStep ctx={ctx} />;
    case "about":
      return <AboutStep ctx={ctx} />;
    case "contact":
      return <ContactStep ctx={ctx} />;
    default:
      return null;
  }
}
