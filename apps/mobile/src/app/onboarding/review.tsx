import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Sheet } from "@/components/Sheet";
import { Chip, Notice, PillButton, T } from "@/components/ui";
import { AppIcon } from "@/components/icons";
import { RexFrame, RexSays } from "@/components/rex-build/Frame";
import { CANVAS_SUPPORTED, StoreCanvas, type CanvasHandle } from "@/components/store-editor/Canvas";
import { useStoreEditor } from "@/components/store-editor/useStoreEditor";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import {
  applyTokens,
  askRexToEdit,
  fetchStoreEditor,
  findPage,
  kindLabelKey,
  readPhoto,
  setCopy,
  setPhoto,
  type CanvasOutbound,
  type EdSection,
  type EdSnapshot,
  type EditorLoad,
} from "@/lib/store-editor";
import {
  bannerCandidates,
  brighterPalette,
  fetchBlockers,
  fetchOnboarding,
  goLive,
  nextBanner,
  nextWords,
  saveFlow,
  styleTokens,
  track,
  type GoLiveBlocker,
  type OnboardingState,
} from "@/lib/seller-onboarding";
import { colors, fonts, radii, surfaceCard } from "@/theme";

// E2 "Your shop is ready! 🎉 Scroll through. Tap anything you'd like me to change." (design RB-15). The whole shop on
// the store editor's own canvas (components/store-editor/Canvas: the real storefront renderer with the draft), driven
// by the editor's own state (useStoreEditor: undo history, autosave to the same draft, version checks). The quick
// chips change the draft in place at once (a different banner photo, brighter colours, other words); tapping a section
// asks Rex to change just that (POST /api/mobile/store-editor/rex, the editor's "Ask Rex"). "I love it, go live"
// checks the blockers, then publishes the draft (POST /api/mobile/onboarding/go-live → publishStoreDraft, the
// editor's publish path).

const BANNER_KINDS = ["hero-split", "split-hero", "parallax-banner", "promo-banner", "page-header", "video-hero"];

export default function Review() {
  const t = useT("m_rexBuild");
  const [load, setLoad] = useState<EditorLoad | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [failed, setFailed] = useState(false);

  const fetchIt = useCallback(() => {
    setFailed(false);
    Promise.all([fetchStoreEditor(), fetchOnboarding()])
      .then(([editor, onboarding]) => {
        if (!editor.draft) return router.replace("/onboarding/building");
        setLoad(editor);
        setState(onboarding);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => fetchIt(), [fetchIt]);

  if (failed) return <ErrorState message={t("error.load")} onRetry={fetchIt} />;
  if (!load || !state) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, justifyContent: "center" }}>
        <LoadingBlock />
      </View>
    );
  }
  return <ReviewScreen load={load as EditorLoad & { draft: EdSnapshot }} state={state} />;
}

function ReviewScreen({ load, state }: { load: EditorLoad & { draft: EdSnapshot }; state: OnboardingState }) {
  const t = useT("m_rexBuild");
  const te = useT("storeEditor", "common");
  const ed = useStoreEditor(load);
  const canvas = useRef<CanvasHandle>(null);
  const ready = useRef(false);
  const [flow, setFlow] = useState(state.flow);
  const [asking, setAsking] = useState<EdSection | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"rex" | "live" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<GoLiveBlocker[]>([]);
  const redesign = flow.mode === "redesign";

  const sections = useMemo(() => findPage(ed.snapshot, "home")?.sections ?? [], [ed.snapshot]);
  const label = useCallback((section: EdSection) => {
    const key = kindLabelKey(section.kind);
    return key ? te.dynamic(key, section.name) : section.name;
  }, [te]);
  const labels = useMemo(() => Object.fromEntries(sections.map((section) => [section.id, label(section)])), [sections, label]);

  // The canvas gets the draft at start, then every change (no reload).
  const onMessage = useCallback((incoming: CanvasOutbound) => {
    if (incoming.t === "ready") {
      ready.current = true;
      canvas.current?.send({ t: "init", store: load.store, snapshot: ed.snapshot, page: "home", mode: "edit", device: "mobile", labels, words: { addAbove: te("canvas.addAbove"), addBelow: te("canvas.addBelow") } });
    } else if (incoming.t === "select") {
      const section = sections.find((entry) => entry.id === incoming.id) ?? null;
      setAsking(section);
      setMessage("");
    } else if (incoming.t === "copy") {
      ed.commit((current) => setCopy(current, "home", incoming.id, incoming.key, incoming.value), `${incoming.id}:${incoming.key}`);
    } else if (incoming.t === "add") {
      Alert.alert(t("review.addInEditor"), undefined, [
        { text: te("cancel"), style: "cancel" },
        { text: t("review.openEditor"), onPress: () => void ed.flush().then(() => router.push({ pathname: "/store-editor", params: { sheet: "add" } })) },
      ]);
    }
  }, [load.store, ed, labels, sections, te, t]);

  useEffect(() => {
    if (ready.current) canvas.current?.send({ t: "snapshot", snapshot: ed.snapshot, labels });
  }, [ed.snapshot, labels]);

  useEffect(() => {
    if (ed.status !== "conflict") return;
    setNote(t("review.conflict"));
    void ed.resolveConflict("theirs");
  }, [ed, ed.status, t]);

  const banner = sections.find((section) => BANNER_KINDS.includes(section.kind));
  const photos = (state.products ?? []).map((product) => product.image).filter((url): url is string => Boolean(url));
  const libraryUrls = (state.library ?? []).filter((photo) => photo.category !== "mine").map((photo) => photo.url);
  const bannerOptions = useMemo(() => {
    const list = bannerCandidates(photos, libraryUrls, 6);
    return flow.banner?.url && !list.some((item) => item.url === flow.banner!.url) ? [{ url: flow.banner.url, source: flow.banner.source }, ...list] : list;
    // The photos only change when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chip(kind: "banner" | "colours" | "words") {
    track("review_change_requested", { chip: kind });
    if (kind === "banner" && banner) {
      const next = nextBanner(bannerOptions, readPhoto(banner));
      if (!next) return;
      ed.commit((current) => setPhoto(current, "home", banner.id, next.url));
      setFlow((current) => ({ ...current, banner: { url: next.url, source: next.source } }));
      void saveFlow({ banner: { url: next.url, source: next.source } }).catch(() => null);
    }
    if (kind === "colours") {
      const palette = brighterPalette(flow.palette, flow.style);
      ed.commit((current) => applyTokens(current, styleTokens(flow.style, palette.id)));
      setFlow((current) => ({ ...current, palette: palette.id }));
      void saveFlow({ palette: palette.id }).catch(() => null);
    }
    if (kind === "words" && banner) {
      const next = nextWords(flow.words?.options ?? [], flow.words?.headline);
      if (!next) {
        setAsking(banner);
        setMessage(t("review.askShorter"));
        return;
      }
      ed.commit((current) => {
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
      const base = await ed.flush();
      const result = await askRexToEdit({ message: text.trim(), section: label(asking), page: "Home", baseVersion: base ?? ed.version() });
      if (result.draft) ed.adoptSaved(result.draft, result.version, true);
      setNote(result.reply || t("review.changed"));
      setAsking(null);
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : t("error.save"));
    } finally {
      setBusy(null);
    }
  }

  async function launch() {
    setBusy("live");
    setNote(null);
    try {
      await ed.flush();
      const { blockers: open } = await fetchBlockers();
      if (open.length) {
        setBlockers(open);
        return;
      }
      const result = await goLive();
      if (!result.live) return setBlockers(result.blockers);
      router.replace({ pathname: "/onboarding/launched", params: { url: result.url, pages: String(result.pages ?? "") } });
    } catch (error) {
      const reason = error instanceof ApiError || error instanceof Error ? error.message : "";
      setNote(t("review.publishFailed", { reason }));
    } finally {
      setBusy(null);
    }
  }

  const fixScreen: Record<GoLiveBlocker, string> = { product: "products", name: "shop", whatsapp: "contact" };

  return (
    <RexFrame
      step={5}
      scroll={false}
      onBack={() => (router.canGoBack() ? router.back() : router.replace({ pathname: "/onboarding", params: { screen: redesign ? "about" : "contact", ...(redesign ? { redesign: "1" } : {}) } }))}
      onSave={() => void ed.flush().then(() => router.replace("/home"))}
      primary={{ title: redesign ? t("review.useDesign") : t("review.golive"), icon: "check", busy: busy === "live", disabled: busy === "rex", onPress: () => void launch(), testID: "review-golive" }}
      footerExtra={
        <>
          {blockers.length ? (
            <View style={{ backgroundColor: colors.warnTint, borderRadius: 18, padding: 14, gap: 8 }}>
              <T weight="bold" style={{ color: colors.warnInk, fontSize: 15 }}>{t("review.blockers")}</T>
              {blockers.map((blocker) => (
                <View key={blocker} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T style={{ flex: 1, color: colors.warnInk, fontSize: 14.5 }}>{t(`review.blocker.${blocker}`)}</T>
                  <PillButton size="sm" tone="white" title={t("review.fix")} onPress={() => router.push({ pathname: "/onboarding", params: { screen: fixScreen[blocker] } })} />
                </View>
              ))}
            </View>
          ) : null}
          {note ? <Notice tone="info">{note}</Notice> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip label={t("review.chip.banner")} on={false} onPress={() => chip("banner")} disabled={!banner} />
            <Chip label={t("review.chip.colours")} on={false} onPress={() => chip("colours")} />
            <Chip label={t("review.chip.words")} on={false} onPress={() => chip("words")} disabled={!banner} />
          </View>
        </>
      }
    >
      <RexSays title={t("review.title")} sub={t("review.sub")} />
      <View style={{ flex: 1, minHeight: 280, marginTop: 4, marginBottom: 8, backgroundColor: colors.grayTint, borderRadius: 26, padding: 10 }}>
        {CANVAS_SUPPORTED ? (
          <StoreCanvas ref={canvas} testID="review-canvas" accessibilityLabel={te("canvas.label")} onMessage={onMessage} style={{ flex: 1, borderRadius: 18 }} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
            <T style={{ textAlign: "center", color: colors.inkSoft }}>{t("review.noPreview")}</T>
          </View>
        )}
      </View>

      <Sheet visible={Boolean(asking)} onClose={() => setAsking(null)} title={t("review.askTitle", { name: asking ? label(asking) : "" })}>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[t("review.askBolder"), t("review.askShorter"), t("review.askPhoto")].map((idea) => (
              <Chip key={idea} label={idea} on={message === idea} onPress={() => setMessage(idea)} />
            ))}
          </View>
          <View style={{ ...surfaceCard(20), flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14 }}>
            <AppIcon name="sparkle" size={18} color={colors.forest} />
            <TextInput value={message} onChangeText={setMessage} placeholder={t("review.askPlaceholder")} placeholderTextColor={colors.inkFaint} maxLength={500} accessibilityLabel={t("review.askPlaceholder")} style={{ flex: 1, minHeight: 52, fontSize: 16, fontFamily: fonts.regular, color: colors.ink }} />
          </View>
          <PillButton tone="accent" title={t("review.askSend")} busy={busy === "rex"} disabled={!message.trim()} onPress={() => void askRex(message)} />
          <Pressable accessibilityRole="button" onPress={() => void ed.flush().then(() => router.push("/store-editor"))} style={{ alignItems: "center", minHeight: 44, justifyContent: "center", borderRadius: radii.pill }}>
            <T weight="bold" style={{ color: colors.forest }}>{t("review.openEditor")}</T>
          </Pressable>
        </View>
      </Sheet>
    </RexFrame>
  );
}
