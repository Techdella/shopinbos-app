"use client";

/* eslint-disable @next/next/no-img-element -- the seller's own banner and product photos. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx, Notice, PillButton, Spinner } from "@/components/app-ui";
import { Confetti, DancingRex } from "@/components/brand/Celebrate";
import { useT } from "@/components/i18n/I18nProvider";
import { RexRequestError, useRexResume } from "@/lib/ai/rex-jobs-client";
import type { SurfaceStore } from "@/components/storefront/TemplateStorefrontSurface";
import { applyTokens, findPage, kindLabelKey, readPhoto, setCopy, setPhoto, type EdSection, type EdSnapshot } from "@shared/store-editor";
import {
  BUILD_TICKS,
  bannerCandidates,
  brighterPalette,
  buildProgress,
  nextBanner,
  nextWords,
  styleTokens,
  themeFor,
  type FlowScreen,
  type GoLiveBlocker,
  type RexBuildMemory,
} from "@shared/seller-onboarding";
import {
  OnboardingRequestError,
  applyTheme,
  askRexToEdit,
  buildShop,
  fetchBlockers,
  fetchDraft,
  fetchOnboarding,
  finishOnboarding,
  goLive,
  markShared,
  notifyWhenBuilt,
  saveDraft,
  saveFlow,
  track,
  type EditorLoad,
  type LoadedState,
} from "./api";
import { RexFrame, RexHead, RexSays } from "./Frame";
import { Chip, Dialog } from "./parts";
import { bannerSection, forgetDraft, ShopSurface } from "./preview";

// The end of the guided build on the web: E1 "Watch the magic" (RB-14), E2 the review (RB-15) and E3 "is live"
// (RB-16), the phone's onboarding/building.tsx, review.tsx and launched.tsx. The build is a Rex job on the server
// (POST /api/mobile/onboarding/build), so closing the tab loses nothing: Peggy tells the seller when it's ready. The
// review draws the real shop (the storefront renderer, ./preview.tsx) from the store editor's draft; quick chips
// change it in place and save it (with the editor's version check), clicking a section asks Rex to change just that,
// and "I love it, go live" publishes through the same publishStoreDraft as the builder's Publish.

const TICK_MS = 450;

/** E1 "Watch the magic ✨ Your shop is building". */
export function BuildingScreen({ onDone }: { onDone: () => void }) {
  const t = useT("rexBuild");
  const [state, setState] = useState<LoadedState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [shownTicks, setShownTicks] = useState(0);
  const [problem, setProblem] = useState<"failed" | "waiting" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const startedAt = useRef(Date.now());
  const doneRef = useRef(false);
  doneRef.current = done;

  // The build itself (again on "Try again").
  useEffect(() => {
    let live = true;
    setProblem(null);
    startedAt.current = Date.now();
    void (async () => {
      const loaded = await fetchOnboarding().catch(() => null);
      if (!live) return;
      if (loaded?.store) setState(loaded as LoadedState);
      try {
        // The draft needs a look first (a seller who skipped the style step's save, or an older shop).
        if (loaded?.store && !loaded.store.themeId && !loaded.flow.themeId) {
          const themeId = themeFor(loaded.flow.categories);
          await applyTheme(themeId).catch(() => null);
          await saveFlow({ themeId }).catch(() => null);
        }
        await saveFlow({ screen: "building" }).catch(() => null);
        await buildShop();
        forgetDraft();
        if (live) setDone(true);
      } catch (error) {
        if (live) setProblem(error instanceof RexRequestError && error.code === "REX_PENDING" ? "waiting" : "failed");
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt]);

  // A build that finished while the seller was away (or is still going): picked up here.
  useRexResume(["store_build"], () => {
    forgetDraft();
    setDone(true);
  }, problem === "waiting");

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
      const leave = setTimeout(onDone, 700);
      return () => clearTimeout(leave);
    }
    const tick = setTimeout(() => setShownTicks((current) => current + 1), TICK_MS);
    return () => clearTimeout(tick);
  }, [done, shownTicks, timed.ticked, onDone]);

  // Leaving the tab mid-build: Peggy tells them when it's ready.
  useEffect(() => {
    const away = () => {
      if (document.visibilityState === "hidden" && !doneRef.current) notifyWhenBuilt(true);
    };
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", away);
    return () => {
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("pagehide", away);
    };
  }, []);

  const percent = done ? Math.max(timed.percent, Math.round((shownTicks / BUILD_TICKS.length) * 100)) : timed.percent;
  const flow = state?.flow;
  const products = state?.products ?? [];
  const groups = state?.collections?.filter((collection) => collection.productIds.length).length ?? 0;
  const tickLabel = (key: (typeof BUILD_TICKS)[number]) =>
    key === "products" ? (products.length ? t("building.tick.products", { products: products.length, collections: Math.max(1, groups) }) : t("building.tick.productsNone")) : t.dynamic(`building.tick.${key}`, key);

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-[#0F5A52] to-[#0B3B37] font-app text-app-ink">
      <div className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-6 px-4 pb-0 pt-8 sm:px-6 lg:flex-row lg:items-start lg:gap-8 lg:pb-10">
        <div className="flex flex-col items-center gap-3.5 text-center lg:w-[46%] lg:items-start lg:text-left">
          <RexHead size={86} />
          <h1 className="m-0 whitespace-pre-line text-[27px] font-extrabold leading-[1.15] text-white sm:text-[32px]">{`${t("building.title")}\n${t("building.title2")}`}</h1>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.18]">
            <span className="block h-full rounded-full bg-app-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
          <p className="m-0 text-[15px] text-white/85">{percent >= 90 ? t("building.almost", { percent }) : t("building.progress", { percent, seconds: timed.secondsLeft })}</p>

          <ul className="m-0 mt-2 flex w-full list-none flex-col gap-3 rounded-[24px] bg-white p-5 text-left">
            {BUILD_TICKS.map((key, index) => {
              const ticked = index < shownTicks;
              const now = index === shownTicks && !problem;
              return (
                <li key={key} className="flex min-h-[28px] items-center gap-3.5">
                  {ticked ? (
                    <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-app-success text-white"><Icon name="check" size={14} strokeWidth={2.8} /></span>
                  ) : now ? (
                    <span className="grid w-[26px] shrink-0 place-items-center text-app-accent"><Spinner /></span>
                  ) : (
                    <span className="w-[26px] shrink-0" />
                  )}
                  <span className={cx("text-[16.5px]", now ? "font-extrabold" : "", ticked || now ? "text-app-ink" : "text-app-ink-faint")}>{now ? `${tickLabel(key)}…` : tickLabel(key)}</span>
                </li>
              );
            })}
            {problem ? (
              <li className="flex flex-col gap-2.5">
                <p className={cx("m-0 text-[14.5px] leading-[1.4]", problem === "failed" ? "text-app-danger" : "text-app-ink-soft")}>{problem === "failed" ? t("building.failed") : t("building.stillWorkingWeb")}</p>
                <PillButton tone="orange" onClick={() => setAttempt((value) => value + 1)}>{t("retry")}</PillButton>
              </li>
            ) : (
              <li className="text-center text-[14px] text-app-ink-soft">{t("building.leaveWeb")}</li>
            )}
          </ul>
        </div>

        {/* The shop drawing itself: the banner, then the products, then the rest. */}
        <div aria-hidden className="flex flex-1 flex-col gap-2.5 rounded-t-[24px] bg-white p-3 lg:rounded-[24px]">
          <span className="truncate text-[15px] font-extrabold">{state?.store?.name ?? ""}</span>
          <span className={cx("relative block h-[180px] overflow-hidden rounded-[16px] bg-[#EEF4F2] transition-opacity duration-500", shownTicks >= 2 ? "opacity-100" : "opacity-25")}>
            {flow?.banner?.url ? <img src={flow.banner.url} alt="" className="h-full w-full object-cover" /> : null}
            {flow?.words?.headline ? <span className="absolute inset-x-3.5 bottom-3 truncate font-serif text-[22px] italic text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]">{flow.words.headline}</span> : null}
          </span>
          <span className={cx("grid grid-cols-2 gap-2 transition-opacity duration-500", shownTicks >= 3 ? "opacity-100" : "opacity-20")}>
            {[0, 1].map((index) => (
              <span key={index} className="block h-[96px] overflow-hidden rounded-[12px] bg-[#F2F0EC]">
                {products[index]?.image ? <img src={products[index]!.image!} alt="" className="h-full w-full object-cover" /> : null}
              </span>
            ))}
          </span>
          <span className={cx("block h-[60px] rounded-[12px] bg-[#F2F0EC] transition-opacity duration-500", shownTicks >= 4 ? "opacity-100" : "opacity-20")} />
        </div>
      </div>
    </div>
  );
}

/** E2 "Your shop is ready! 🎉" The real shop; quick changes; click a section → Rex changes it; go live. */
export function ReviewScreen({ data, flow: startFlow, onBack, onSaveExit, onFix, onLive, onNoDraft }: {
  data: LoadedState;
  /** No draft to review yet (nothing built): the build runs first. */
  onNoDraft: () => void;
  flow: RexBuildMemory;
  onBack: () => void;
  onSaveExit: () => void;
  onFix: (screen: FlowScreen) => void;
  onLive: (result: { url: string; pages: number | null }) => void;
}) {
  const t = useT("rexBuild");
  const te = useT("storeEditor", "common");
  const [load, setLoad] = useState<EditorLoad | null>(null);
  const [failed, setFailed] = useState(false);
  const [snapshot, setSnapshot] = useState<EdSnapshot | null>(null);
  const latest = useRef<EdSnapshot | null>(null);
  const version = useRef<string | null>(null);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const [flow, setFlow] = useState(startFlow);
  const [asking, setAsking] = useState<EdSection | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"rex" | "live" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<GoLiveBlocker[]>([]);
  const redesign = flow.mode === "redesign";

  const fetchIt = useCallback(() => {
    setFailed(false);
    fetchDraft()
      .then((editor) => {
        if (!editor.draft) return onNoDraft();
        setLoad(editor);
        setSnapshot(editor.draft);
        latest.current = editor.draft;
        version.current = editor.version;
      })
      .catch(() => setFailed(true));
    // Loaded when the screen opens (and again after a conflict).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    fetchIt();
  }, [fetchIt]);

  const sections = useMemo(() => findPage(snapshot, "home")?.sections ?? [], [snapshot]);
  const label = useCallback((section: EdSection) => {
    const key = kindLabelKey(section.kind);
    return key ? te.dynamic(key, section.name) : section.name;
  }, [te]);

  /** A change on the page: shown at once, then saved to the draft (one save at a time, with the version check). */
  function commit(change: (current: EdSnapshot) => EdSnapshot) {
    const current = latest.current;
    if (!current) return;
    const next = change(current);
    latest.current = next;
    setSnapshot(next);
    saving.current = saving.current.then(async () => {
      try {
        const saved = await saveDraft(next, version.current);
        version.current = saved.version;
      } catch (error) {
        if (error instanceof OnboardingRequestError && error.status === 409) {
          setNote(t("review.conflict"));
          fetchIt();
        } else {
          setNote(error instanceof Error && error.message ? error.message : t("error.save"));
        }
      }
    });
  }
  const flush = () => saving.current;

  const banner = bannerSection(snapshot);
  const bannerOptions = useMemo(() => {
    const photos = (data.products ?? []).map((product) => product.image).filter((url): url is string => Boolean(url));
    const libraryUrls = (data.library ?? []).filter((photo) => photo.category !== "mine").map((photo) => photo.url);
    const list = bannerCandidates(photos, libraryUrls, 6);
    return startFlow.banner?.url && !list.some((item) => item.url === startFlow.banner!.url) ? [{ url: startFlow.banner.url, source: startFlow.banner.source }, ...list] : list;
  }, [data.products, data.library, startFlow.banner]);

  function chip(kind: "banner" | "colours" | "words") {
    track("review_change_requested", { chip: kind });
    if (kind === "banner" && banner) {
      const next = nextBanner(bannerOptions, readPhoto(banner));
      if (!next) return;
      commit((current) => setPhoto(current, "home", banner.id, next.url));
      setFlow((current) => ({ ...current, banner: { url: next.url, source: next.source } }));
      void saveFlow({ banner: { url: next.url, source: next.source } }).catch(() => null);
    }
    if (kind === "colours") {
      const palette = brighterPalette(flow.palette, flow.style);
      commit((current) => applyTokens(current, styleTokens(flow.style, palette.id)));
      setFlow((current) => ({ ...current, palette: palette.id, paletteTokens: null }));
      void saveFlow({ palette: palette.id, paletteTokens: null }).catch(() => null);
    }
    if (kind === "words" && banner) {
      const next = nextWords(flow.words?.options ?? [], flow.words?.headline);
      if (!next) {
        setAsking(banner);
        setMessage(t("review.askShorter"));
        return;
      }
      commit((current) => {
        let draft = setCopy(current, "home", banner.id, "title", next.headline);
        if (next.sub) draft = setCopy(draft, "home", banner.id, "body", next.sub);
        if (next.cta) draft = setCopy(draft, "home", banner.id, "primaryCta", next.cta);
        return draft;
      });
      const words = { ...next, options: flow.words?.options };
      setFlow((current) => ({ ...current, words }));
      void saveFlow({ words }).catch(() => null);
    }
  }

  async function askRex(text: string) {
    if (!asking || !text.trim()) return;
    setBusy("rex");
    setNote(t("review.changing"));
    track("review_change_requested", { section: asking.kind });
    try {
      await flush();
      const result = await askRexToEdit({ message: text.trim(), section: label(asking), page: "Home", baseVersion: version.current });
      if (result.draft) {
        setSnapshot(result.draft);
        latest.current = result.draft;
        version.current = result.version;
      }
      setNote(result.reply || t("review.changed"));
      setAsking(null);
    } catch (error) {
      if (error instanceof OnboardingRequestError && error.status === 409) {
        setNote(t("review.conflict"));
        fetchIt();
      } else {
        setNote(error instanceof Error && error.message ? error.message : t("error.save"));
      }
    } finally {
      setBusy(null);
    }
  }

  async function launch() {
    setBusy("live");
    setNote(null);
    try {
      await flush();
      const { blockers: open } = await fetchBlockers();
      if (open.length) {
        setBlockers(open);
        return;
      }
      const result = await goLive();
      if (!result.live) return setBlockers(result.blockers);
      onLive({ url: result.url, pages: result.pages });
    } catch (error) {
      setNote(t("review.publishFailed", { reason: error instanceof Error ? error.message : "" }));
    } finally {
      setBusy(null);
    }
  }

  const fixScreen: Record<GoLiveBlocker, FlowScreen> = { product: "products", name: "shop", whatsapp: "contact" };

  return (
    <RexFrame
      step={5}
      full
      onBack={onBack}
      onSave={() => void flush().then(onSaveExit)}
      primary={{ title: redesign ? t("review.useDesign") : t("review.golive"), icon: "check", busy: busy === "live", disabled: busy === "rex" || !snapshot, onPress: () => void launch(), testId: "review-golive" }}
      footerExtra={
        <>
          {blockers.length ? (
            <div className="flex flex-col gap-2 rounded-[18px] bg-app-warn-tint p-3.5 text-app-warn">
              <span className="text-[15px] font-bold">{t("review.blockers")}</span>
              {blockers.map((blocker) => (
                <span key={blocker} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-[14.5px]">{t.dynamic(`review.blocker.${blocker}`, blocker)}</span>
                  <PillButton size="sm" tone="white" onClick={() => onFix(fixScreen[blocker])}>{t("review.fix")}</PillButton>
                </span>
              ))}
            </div>
          ) : null}
          {note ? <Notice tone="info">{note}</Notice> : null}
          <div className="flex flex-wrap justify-center gap-2">
            <Chip testId="review-chip-banner" label={t("review.chip.banner")} on={false} onPress={() => chip("banner")} disabled={!banner} />
            <Chip testId="review-chip-colours" label={t("review.chip.colours")} on={false} onPress={() => chip("colours")} disabled={!snapshot} />
            <Chip testId="review-chip-words" label={t("review.chip.words")} on={false} onPress={() => chip("words")} disabled={!banner} />
          </div>
        </>
      }
    >
      <RexSays title={t("review.title")} sub={`${t("review.sub")} ${t("review.click")}`} />
      {failed ? (
        <div className="flex flex-col items-start gap-3">
          <Notice>{t("error.load")}</Notice>
          <PillButton tone="white" size="md" onClick={fetchIt}>{t("retry")}</PillButton>
        </div>
      ) : load && snapshot ? (
        <ShopSurface
          store={load.store as unknown as SurfaceStore}
          snapshot={snapshot}
          height="min(70dvh, 760px)"
          interactive
          toggle
          label={te("canvas.label")}
          selectedSectionId={asking?.id ?? null}
          onSelectSection={(id) => {
            const section = sections.find((entry) => entry.id === id) ?? null;
            setAsking(section);
            setMessage("");
          }}
        />
      ) : (
        <div className="flex h-[360px] items-center justify-center gap-2 rounded-[18px] bg-white text-app-ink-soft">
          <Spinner />
          {t("review.loading")}
        </div>
      )}

      <Dialog open={Boolean(asking)} onClose={() => setAsking(null)} title={t("review.askTitle", { name: asking ? label(asking) : "" })}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void askRex(message);
          }}
        >
          <div className="flex flex-wrap gap-2">
            {[t("review.askBolder"), t("review.askShorter"), t("review.askPhoto")].map((idea) => (
              <Chip key={idea} label={idea} on={message === idea} onPress={() => setMessage(idea)} />
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-[20px] border border-app-line bg-white px-3.5">
            <Icon name="sparkle" size={18} className="shrink-0 text-app-forest" />
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("review.askPlaceholder")} maxLength={500} aria-label={t("review.askPlaceholder")} className="min-h-[52px] min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-app-ink-faint" />
          </label>
          <PillButton type="submit" tone="orange" busy={busy === "rex"} disabled={!message.trim()}>{t("review.askSend")}</PillButton>
          <a href="/builder" className="inline-flex min-h-[44px] items-center justify-center rounded-full font-bold text-app-forest no-underline hover:bg-app-mint">{t("review.openEditor")}</a>
        </form>
      </Dialog>
    </RexFrame>
  );
}

/** E3 "Ada's Hair is live! Rex built 4 pages for you." Confetti, the link, share, edit, ask Rex, then Home. */
export function LiveScreen({ data, flow, url: liveUrl, pages: livePages }: { data: LoadedState; flow: RexBuildMemory; url?: string | null; pages?: number | null }) {
  const t = useT("rexBuild");
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [load, setLoad] = useState<EditorLoad | null>(null);
  const name = data.store.name;
  const url = liveUrl || data.store.url;
  const host = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const pages = livePages || flow.builtPages || 0;
  const redesign = flow.mode === "redesign";
  const shareText = t("live.shareText", { name, url });

  useEffect(() => {
    void fetchDraft().then(setLoad).catch(() => null);
  }, []);

  function shared(channel: string) {
    track("share_tapped", { channel });
    void markShared().catch(() => null);
  }

  /** WhatsApp Status from a phone browser's share sheet; on a computer, WhatsApp with the words ready to send. */
  async function shareStatus() {
    shared("whatsapp_status");
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: name, text: shareText });
        return;
      } catch {
        // Closed the share sheet: nothing else to do.
        return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      shared("copy");
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // No clipboard: the link is on screen to copy by hand.
    }
  }

  /** Onboarding is done: Home with the three tips (F1–F3) and "Get your shop ready", or the builder / Rex. */
  async function leave(next: string) {
    setLeaving(true);
    await finishOnboarding(true).catch(() => null);
    router.replace(next);
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-app-canvas font-app text-app-ink">
      <Confetti />
      <main className="relative mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:items-center lg:gap-10">
        <div className="flex flex-col items-center gap-3 text-center lg:w-[44%] lg:items-start lg:text-left">
          <DancingRex size={150} />
          <h1 className="m-0 text-[32px] font-extrabold leading-[1.1] tracking-[-0.6px] sm:text-[40px]">{t("live.title", { name })}</h1>
          <p className="m-0 text-[16px] leading-[1.45] text-app-ink-soft">
            {redesign ? t("live.redesigned") : pages === 1 ? t("live.subOne") : t("live.sub", { count: pages || 4 })}{" "}
            <a href={url} target="_blank" rel="noopener noreferrer" className="break-all font-extrabold text-app-ink">{host}</a>
          </p>
          <div className="mt-2 flex w-full flex-col gap-2.5">
            <PillButton tone="orange" onClick={() => void shareStatus()} data-testid="live-status">
              <Icon name="whatsapp" size={18} />
              {t("live.status")}
            </PillButton>
            <div className="grid grid-cols-2 gap-2.5">
              <PillButton tone="white" size="md" onClick={() => void copy()} data-testid="live-copy">
                <Icon name={copied ? "check" : "copy"} size={16} />
                {copied ? t("live.copied") : t("live.copy")}
              </PillButton>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" onClick={() => shared("whatsapp")} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-app-line bg-white px-4 text-[14px] font-bold text-app-ink no-underline hover:border-app-line-strong sm:min-h-[48px] sm:text-[15px]">
                <Icon name="send" size={16} />
                {t("live.whatsapp")}
              </a>
              <PillButton tone="white" size="md" disabled={leaving} onClick={() => void leave("/builder")} data-testid="live-edit">
                <Icon name="palette" size={16} />
                {t("live.edit")}
              </PillButton>
              <PillButton tone="white" size="md" disabled={leaving} onClick={() => void leave("/builder/rex")} data-testid="live-ask">
                <Icon name="sparkle" size={16} />
                {t("live.ask")}
              </PillButton>
            </div>
            <button type="button" disabled={leaving} onClick={() => void leave("/home?tour=quick")} data-testid="live-home" className="min-h-[44px] self-center rounded-full px-4 text-[15px] font-bold text-app-forest hover:bg-app-mint lg:self-start">
              {t("live.home")}
            </button>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {load?.draft ? (
            <ShopSurface store={load.store as unknown as SurfaceStore} snapshot={load.draft} height={460} label={name} toggle />
          ) : (
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex h-[300px] items-center justify-center rounded-[28px] border border-app-line bg-white font-bold text-app-ink no-underline">{t("live.open")}</a>
          )}
        </div>
      </main>
    </div>
  );
}
