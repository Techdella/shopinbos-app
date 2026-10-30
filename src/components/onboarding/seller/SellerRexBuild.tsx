"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import {
  REX_CHOSE_FLASH_MS,
  isFlowScreen,
  nextScreen,
  previousScreen,
  resumeScreen,
  stepOf,
  welcomeBack,
  type EntryIntent,
  type FlowMode,
  type FlowScreen,
  type RexBuildMemory,
} from "@shared/seller-onboarding";
import { fetchOnboarding, finishOnboarding, pauseOnboarding, redeemInvite, saveFlow, track, type LoadedState } from "./api";
import { ChooseStep, IntroStep, NameStep, SellStep, ShopStep } from "./basics";
import { CategoriesStep, PlanStep, ProductsStep } from "./products";
import { BannerStep, ColoursStep, LayoutStep, SectionsStep, StyleStep, WordsStep } from "./design";
import { AboutStep, ContactStep, MediaStep } from "./pages";
import { BuildingScreen, LiveScreen, ReviewScreen } from "./finish";
import type { StepCtx } from "./context";

// Seller onboarding on the WEB: "Rex builds your shop (step by step)", one question per screen (spec "Seller
// Onboarding Flow", design RB-01…RB-16), the same flow as the phone (apps/mobile/src/app/onboarding/**). The order,
// rules, Rex's picks, go-live blockers and resume point are shared/seller-onboarding.ts; the server side is the
// phone's own (src/app/api/mobile/onboarding/**, src/lib/onboarding/rex-build.server.ts), reached here with the
// session cookie. Every answer is saved as it's given in Store.brandSettings.onboardingMemory.rexBuild, so a seller
// who starts on the phone and carries on here (or the other way round) reopens on the same screen with "Welcome back,
// Ada. Let's finish your shop: Step 3 of 5." Shop basics (B1–B4), how to build (C1: Rex, or the web builder with a
// starter template), Rex's five steps (D0–D4c), then the build (E1), the review (E2) and "is live" (E3), after which
// Home shows three tips and "Get your shop ready". ?redesign=1 runs the design steps again into the draft.

type Screen = FlowScreen;

export function SellerRexBuild({ initial, entry, redesign, startScreen, continuation }: {
  initial: LoadedState;
  /** What the link into the app carried (?intent=add_product&productSlug=…, ?ref=, ?invite=, ?source=). */
  entry: EntryIntent;
  redesign: boolean;
  /** ?screen= (the review's "Fix it", a link back in). */
  startScreen?: string | null;
  /** Where a seller whose shop is already live goes (Home, or what the website link meant to do). */
  continuation: string;
}) {
  const t = useT("rexBuild");
  const router = useRouter();
  const mode: FlowMode = redesign ? "redesign" : "start";
  const [data, setData] = useState<LoadedState>(initial);
  const [flow, setFlow] = useState<RexBuildMemory>(initial.flow ?? {});
  const [screen, setScreen] = useState<Screen | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [live, setLive] = useState<{ url: string; pages: number | null } | null>(null);
  const shownAt = useRef(Date.now());
  const started = useRef(false);

  const reload = useCallback(async () => {
    try {
      const next = await fetchOnboarding();
      if (!next.store) return null;
      setData(next as LoadedState);
      return next as LoadedState;
    } catch {
      return null;
    }
  }, []);

  // First load: where to pick up, what the link carried, and the welcome back line.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      let saved = initial.flow ?? {};
      const patch: Partial<RexBuildMemory> = {};
      if (!saved.startedAt) {
        patch.startedAt = new Date().toISOString();
        patch.source = entry.source ?? (entry.intent ? "website" : entry.ref ? "referral" : entry.invite ? "pilot_invite" : "web");
        track("onboarding_started", { source: patch.source, intent: entry.intent ?? null });
      }
      if (entry.intent && entry.productSlug && !saved.intent) patch.intent = { kind: entry.intent, productSlug: entry.productSlug, addedProductId: null };
      if (entry.ref && !saved.referralCode) patch.referralCode = entry.ref;
      // A pilot invite from the WhatsApp test link: redeemed quietly (FeatureInvite), never asked about.
      if (entry.invite && !saved.pilotInvite) {
        patch.pilotInvite = entry.invite;
        void redeemInvite(entry.invite).catch(() => null);
      }
      if (mode === "redesign" && saved.mode !== "redesign") Object.assign(patch, { mode: "redesign", screen: "plan", builtAt: null, liveAt: saved.liveAt ?? null });
      if (mode === "start" && saved.mode === "redesign") patch.mode = "start";
      if (Object.keys(patch).length) {
        saved = { ...saved, ...patch };
        void saveFlow(patch).catch(() => null);
      }
      setFlow(saved);

      const isLive = initial.store.live;
      const wanted: Screen | null = isFlowScreen(startScreen)
        ? startScreen
        : mode === "redesign"
          ? saved.screen && saved.mode === "redesign" && stepOf(saved.screen) ? saved.screen : "plan"
          : resumeScreen(saved, isLive);
      if (!wanted || (isLive && mode === "start" && wanted !== "live")) {
        // Already live: onboarding is done (the "is live" screen once, then Home).
        if (saved.liveAt && !initial.store.finished) return setScreen("live");
        await finishOnboarding(true).catch(() => null);
        return router.replace(continuation);
      }
      const back = welcomeBack(saved, wanted);
      if (back && saved.lastActivityAt && wanted !== "building" && wanted !== "review") {
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

  const go = useCallback((target: Screen | null) => {
    setError(null);
    setFlash(null);
    setNotice(null);
    shownAt.current = Date.now();
    if (!target) return;
    setScreen(target);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
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

  /** Save & exit: the answers are already on the server; Home opens and offers "Finish your shop". */
  const leave = useCallback(async () => {
    if (screen) await save({ screen });
    if (!data.store.live) await pauseOnboarding().catch(() => null);
    router.push("/home");
  }, [screen, save, data.store.live, router]);

  if (!screen) {
    return (
      <div className="grid min-h-dvh place-items-center bg-app-canvas text-app-ink-soft">
        <Spinner />
      </div>
    );
  }

  if (screen === "building") {
    return (
      <BuildingScreen
        onDone={() => {
          void reload();
          setFlow((current) => ({ ...current, builtAt: new Date().toISOString(), screen: "review" }));
          go("review");
        }}
      />
    );
  }
  if (screen === "review") {
    return (
      <ReviewScreen
        data={data}
        flow={flow}
        onBack={() => go(mode === "redesign" ? "about" : "contact")}
        onSaveExit={() => void leave()}
        onFix={(target) => go(target)}
        onNoDraft={() => go("building")}
        onLive={(result) => {
          setLive(result);
          setFlow((current) => ({ ...current, liveAt: new Date().toISOString(), screen: "live" }));
          void reload();
          go("live");
        }}
      />
    );
  }
  if (screen === "live") return <LiveScreen data={data} flow={flow} url={live?.url} pages={live?.pages} />;

  const previous = previousScreen(screen, mode);
  const ctx: StepCtx = {
    data,
    flow,
    mode,
    screen,
    save,
    next,
    rexChose,
    go,
    reload,
    setError,
    frame: {
      step: stepOf(screen),
      onBack: () => (previous && !(mode === "redesign" && screen === "plan") ? go(previous) : void leave()),
      // Save & exit: leave now and come back to this screen (here or on the phone).
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
