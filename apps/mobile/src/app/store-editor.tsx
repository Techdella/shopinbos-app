import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { PillButton, T } from "@/components/ui";
import { WebButtonLabel } from "@/components/WebBadge";
import { CANVAS_SUPPORTED, StoreCanvas, type CanvasHandle } from "@/components/store-editor/Canvas";
import { Chip, Coach, FloatButton, Swatch, ToolButton, TopIcon, Toast, canvasBackground } from "@/components/store-editor/parts";
import { CropOverlay, PhotoSheet, type PickedLocal } from "@/components/store-editor/photo";
import { LiveScreen, PublishSheet, RexSheet, useScheduleWords } from "@/components/store-editor/rex-publish";
import { AddSheet, ConflictSheet, PagesSheet, ProductsSheet, SectionsSheet, ThemeSheet, type SheetContext } from "@/components/store-editor/sheets";
import { useStoreEditor } from "@/components/store-editor/useStoreEditor";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { openWeb } from "@/lib/web";
import {
  FONT_CHOICES,
  RICH_FIXED_COLORS,
  RICH_SIZE_ORDER,
  THEME_PRESETS,
  addPage,
  applyThemePreset,
  applyTokens,
  defaultInsertAfter,
  duplicateSection,
  editorSeen,
  fetchStoreEditor,
  findPage,
  findSection,
  fontChoiceOf,
  insertSection,
  isChrome,
  isProductsKind,
  kindLabelKey,
  markEditorSeen,
  moveSection,
  canMove,
  newSectionId,
  pageRows,
  photoSlot,
  readPhoto,
  removeSection,
  setCopy,
  setPhoto,
  shopPhotos,
  statusKey,
  themePresetOf,
  withNewIds,
  type CanvasOutbound,
  type CanvasRect,
  type EdSection,
  type EdSnapshot,
  type EditorBlockDef,
  type EditorLoad,
  type RexEdit,
  type RichSize,
  type ScheduledPublish,
} from "@/lib/store-editor";
import { colors, radii } from "@/theme";

// Edit shop (design SE-00…SE-16, "think Canva, think Wix mobile"): the seller's real shop on a canvas, every change
// drawn the moment it's made. The canvas is the web's own storefront renderer in a WebView
// (components/store-editor/Canvas.native.tsx → src/app/store-canvas); tapping a section outlines it with its name, a
// floating toolbar (Text, Photo, Button, Move, Copy, Delete) and "+" to drop a section in above or below. Words are
// typed right on the page. The bottom toolbar adds sections, photos, text, theme, the section list and Rex.
// Every change goes into an undo history and is autosaved to the web builder's own draft (with a version check, and
// a copy kept on the phone until the server has it); Publish shows what changed and puts it live in one tap.

type SheetKind = "add" | "photo" | "sections" | "theme" | "rex" | "publish" | "pages" | "products";

interface Selection {
  id: string;
  rect: CanvasRect | null;
  photo: CanvasRect | null;
  parts: { text: boolean; button: boolean };
}

export default function StoreEditorScreen() {
  const t = useT("storeEditor");
  const params = useLocalSearchParams<{ sheet?: string }>();
  const [load, setLoad] = useState<EditorLoad | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchIt = useCallback(() => {
    fetchStoreEditor()
      .then((data) => {
        setLoad(data);
        setError(null);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : t("load.failed")));
  }, [t]);

  // Loaded once: coming back to the editor keeps the seller's undo history.
  useEffect(() => {
    if (CANVAS_SUPPORTED) fetchIt();
  }, [fetchIt]);

  if (!CANVAS_SUPPORTED) {
    return (
      <Screen title={t("entry.edit")}>
        <EmptyState
          icon="monitor"
          title={t("webOnly.title")}
          action={
            <PillButton size="sm" onPress={() => void openWeb("/seller/store/builder")}>
              <WebButtonLabel title={t("webOnly.open")} size="sm" />
            </PillButton>
          }
        >
          <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft, textAlign: "center" }}>{t("webOnly.body")}</T>
        </EmptyState>
      </Screen>
    );
  }
  if (error && !load) {
    return (
      <Screen title={t("entry.edit")}>
        <ErrorState message={error} onRetry={() => { setError(null); fetchIt(); }} />
      </Screen>
    );
  }
  if (!load) {
    return (
      <View style={{ flex: 1, backgroundColor: canvasBackground(), justifyContent: "center" }}>
        <LoadingBlock label={t("load.opening")} />
      </View>
    );
  }
  if (!load.draft) {
    return (
      <Screen title={t("entry.edit")}>
        <EmptyState icon="image" title={t("empty.noLook")} action={<PillButton title={t("empty.pickLook")} size="sm" onPress={() => router.replace("/templates" as never)} />} />
      </Screen>
    );
  }
  const initialSheet = (["theme", "pages", "sections", "rex", "add"] as const).find((entry) => entry === params.sheet) ?? null;
  return <Editor load={load as EditorLoad & { draft: EdSnapshot }} initialSheet={initialSheet} />;
}

function Editor({ load, initialSheet }: { load: EditorLoad & { draft: EdSnapshot }; initialSheet: SheetKind | null }) {
  const t = useT("storeEditor");
  const insets = useSafeAreaInsets();
  const ed = useStoreEditor(load);
  const snapshot = ed.snapshot;
  const canvas = useRef<CanvasHandle>(null);
  const ready = useRef(false);

  const firstPage = findPage(snapshot, "home") ? "home" : pageRows(snapshot)[0]?.key ?? snapshot.pages[0]?.pageType ?? "home";
  const [page, setPage] = useState(firstPage);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [toolbarHidden, setToolbarHidden] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [typing, setTyping] = useState(false);
  const [keyboard, setKeyboard] = useState(0);
  const [sheet, setSheet] = useState<SheetKind | null>(initialSheet);
  const [addAfter, setAddAfter] = useState<string | null>(null);
  const [preview, setPreview] = useState<"mobile" | "desktop" | null>(null);
  const [toast, setToast] = useState<{ text: string; undo: boolean } | null>(null);
  const [picked, setPicked] = useState<PickedLocal | null>(null);
  const [cropping, setCropping] = useState(false);
  const [live, setLive] = useState<{ url: string | null } | null>(null);
  const [rexStart, setRexStart] = useState<string | undefined>(undefined);
  const [coach, setCoach] = useState(() => (editorSeen() ? 0 : 1));
  const [tryDock, setTryDock] = useState(false);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [canvasKey, setCanvasKey] = useState(0);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [conflictBusy, setConflictBusy] = useState(false);
  // "Schedule for later" (SE-13): shown in the top bar while it waits.
  const [scheduled, setScheduled] = useState<ScheduledPublish | null>(load.scheduled ?? null);
  const scheduleWords = useScheduleWords();
  // SE-04: the style of the words being typed (from the canvas), and the colour row.
  const [textState, setTextState] = useState<{ bold: boolean; size: RichSize; color: string | null }>({ bold: false, size: "m", color: null });
  const [colours, setColours] = useState(false);
  // What the canvas should do after it gets the next draft (select a new section, mark Rex's changes).
  const after = useRef<{ select?: { id: string; tag?: string }; marks?: { id: string; tag: string }[] } | null>(null);

  const sections = useMemo(() => findPage(snapshot, page)?.sections ?? [], [snapshot, page]);
  const label = useCallback((section: EdSection) => {
    const key = kindLabelKey(section.kind);
    return key ? t.dynamic(key, section.name) : section.name;
  }, [t]);
  const labels = useMemo(() => Object.fromEntries(sections.map((section) => [section.id, label(section)])), [sections, label]);
  const selectedSection = selected ? sections.find((section) => section.id === selected.id) ?? null : null;
  const ctx: SheetContext = { ed, page, renderer: load.renderer, load, label };

  // ─── Talking to the canvas ─────────────────────────────────────────────────

  const sendInit = useCallback(() => {
    canvas.current?.send({
      t: "init",
      store: load.store,
      snapshot: ed.snapshot,
      page,
      mode: preview ? "preview" : "edit",
      device: preview ?? "mobile",
      labels,
      words: { addAbove: t("canvas.addAbove"), addBelow: t("canvas.addBelow") },
    });
  }, [load.store, ed.snapshot, page, preview, labels, t]);

  // Every change: the new draft goes to the canvas at once (no reload).
  useEffect(() => {
    if (!ready.current) return;
    canvas.current?.send({ t: "snapshot", snapshot, labels });
    const next = after.current;
    after.current = null;
    if (next?.marks) canvas.current?.send({ t: "marks", marks: next.marks });
    if (next?.select) canvas.current?.send({ t: "select", id: next.select.id, scroll: true, tag: next.select.tag ?? null });
    else if (selected) canvas.current?.send({ t: "select", id: selected.id });
    // Only the draft and its labels; the selection follows them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, labels]);

  // Another page: the canvas shows it straight away (the draft already has every page).
  const switchPage = useCallback((key: string) => {
    setPage(key);
    setSelected(null);
    setMoveMode(false);
    if (ready.current) canvas.current?.send({ t: "page", page: key });
  }, []);

  // Preview as a customer (SE-12): the same canvas, without the editing marks; phone or computer width.
  const showPreview = useCallback((next: "mobile" | "desktop" | null) => {
    setPreview(next);
    setSelected(null);
    if (ready.current) canvas.current?.send({ t: "mode", mode: next ? "preview" : "edit", device: next ?? "mobile" });
  }, []);

  const onMessage = useCallback((message: CanvasOutbound) => {
    switch (message.t) {
      case "ready":
        ready.current = true;
        setCanvasFailed(false);
        sendInit();
        break;
      case "select":
        setSelected({ id: message.id, rect: message.rect, photo: message.photo, parts: message.parts });
        setToolbarHidden(false);
        break;
      case "rect":
        setSelected((current) => (current ? { ...current, rect: message.rect, photo: message.photo } : current));
        setToolbarHidden(message.moving);
        break;
      case "deselect":
        setSelected(null);
        setMoveMode(false);
        break;
      case "copy":
        ed.commit((current) => setCopy(current, page, message.id, message.key, message.value), `${message.id}:${message.key}`);
        break;
      case "rich":
        ed.commit((current) => setCopy(current, page, message.id, message.key, message.value, message.runs), `${message.id}:${message.key}`);
        break;
      case "textState":
        setTextState({ bold: message.bold, size: message.size, color: message.color });
        break;
      case "editing":
        setTyping(message.on);
        if (!message.on) setColours(false);
        break;
      case "add":
        setAddAfter(message.afterId);
        setSheet("add");
        break;
      case "navigate":
        if (findPage(ed.snapshot, message.page)) switchPage(message.page);
        break;
    }
  }, [sendInit, ed, page, switchPage]);

  // The keyboard while typing on the page: the text toolbar sits on top of it (Android resizes the screen itself).
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (event) => setKeyboard(Platform.OS === "ios" ? event.endCoordinates.height : 0));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Leaving the editor: save straight away.
  const flushRef = useRef(ed.flush);
  flushRef.current = ed.flush;
  useEffect(() => () => void flushRef.current(), []);

  // Last time's unsaved changes were put back.
  useEffect(() => {
    if (ed.restored) showToast(t("toast.restored"), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(text: string, undo: boolean) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 5000 : 3200);
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  function close() {
    void ed.flush();
    if (router.canGoBack()) router.back();
    else router.replace("/shop" as never);
  }

  function openAdd(afterId?: string | null) {
    setAddAfter(afterId === undefined ? defaultInsertAfter(snapshot, page, selected?.id ?? null) : afterId);
    setSheet("add");
  }

  function addBlock(block: EditorBlockDef) {
    const template = load.catalog[block.id];
    if (!template) return;
    const section = withNewIds(template, newSectionId(template.kind));
    const name = label(section);
    after.current = { select: { id: section.id, tag: t("tag.new", { name }) } };
    ed.commit((current) => insertSection(current, page, section, addAfter));
    setSheet(null);
    showToast(t("toast.added", { name }), true);
  }

  function startText(part: "text" | "button") {
    if (!selected) {
      showToast(t("toast.tapText"), false);
      return;
    }
    canvas.current?.send({ t: "editText", id: selected.id, part });
  }

  function openPhotos() {
    const target = selectedSection && photoSlot(selectedSection) ? selectedSection : sections.find((section) => section.visible !== false && photoSlot(section));
    if (!target) {
      showToast(t("toast.noPhoto"), false);
      return;
    }
    if (target.id !== selected?.id) {
      setSelected({ id: target.id, rect: null, photo: null, parts: { text: true, button: false } });
      canvas.current?.send({ t: "select", id: target.id, scroll: true });
    }
    setSheet("photo");
  }

  function duplicate() {
    if (!selectedSection) return;
    const id = newSectionId(selectedSection.kind);
    after.current = { select: { id } };
    ed.commit((current) => duplicateSection(current, page, selectedSection.id, id));
    showToast(t("toast.copied", { name: label(selectedSection) }), true);
  }

  function remove() {
    if (!selectedSection) return;
    const name = label(selectedSection);
    ed.commit((current) => removeSection(current, page, selectedSection.id));
    setSelected(null);
    canvas.current?.send({ t: "select", id: null });
    showToast(t("toast.deleted", { name }), true);
  }

  function move(direction: -1 | 1) {
    if (!selectedSection) return;
    after.current = { select: { id: selectedSection.id } };
    ed.commit((current) => moveSection(current, page, selectedSection.id, direction));
  }

  function onRexChanged(result: RexEdit, before: EdSnapshot) {
    if (!result.draft) return;
    const old = new Map((findPage(before, page)?.sections ?? []).map((section) => [section.id, JSON.stringify(section)] as const));
    const marks = (findPage(result.draft, page)?.sections ?? [])
      .filter((section) => old.get(section.id) !== JSON.stringify(section))
      .map((section) => ({ id: section.id, tag: old.has(section.id) ? t("rex.tag") : t("rex.tagNew") }));
    after.current = { marks, select: marks[0] ? { id: marks[0].id, tag: marks[0].tag } : undefined };
  }

  function clearMarks() {
    canvas.current?.send({ t: "marks", marks: [] });
  }

  // ─── The text toolbar (SE-04): bold, size and colour on the selected words (all of them when none are selected) ──

  function format(patch: { bold?: "toggle"; size?: RichSize; color?: string | null }) {
    canvas.current?.send({ t: "format", patch });
  }

  function stepSize(direction: -1 | 1) {
    const at = RICH_SIZE_ORDER.indexOf(textState.size);
    const next = RICH_SIZE_ORDER[Math.max(0, Math.min(RICH_SIZE_ORDER.length - 1, at + direction))]!;
    format({ size: next });
  }

  function finishCoach() {
    markEditorSeen();
    setCoach(0);
    setTryDock(true);
  }

  // ─── Layout ────────────────────────────────────────────────────────────────

  const previewing = preview !== null;
  const toolbarHeight = 64 + Math.max(insets.bottom, 10);
  const status = statusKey(ed.status, ed.edited);
  const statusColor = ed.status === "offline" ? colors.warnInk : ed.status === "conflict" ? colors.danger : ed.status === "saving" ? colors.inkSoft : colors.success;
  const pageTitle = findPage(snapshot, page)?.title ?? t("pages.title");
  const chrome = selectedSection ? isChrome(selectedSection.kind) : false;
  const productsSection = selectedSection && isProductsKind(selectedSection.kind);

  // The floating toolbar under the section (above it when there's no room; pinned to the bottom for tall ones).
  const TOOLBAR_H = 60;
  const floatTop = (() => {
    const rect = selected?.rect;
    if (!rect || !frame.height) return null;
    if (rect.y > frame.height - 20 || rect.y + rect.height < 20) return null;
    const below = rect.y + rect.height + 10;
    if (below + TOOLBAR_H <= frame.height - 8) return Math.max(8, below);
    const above = rect.y - TOOLBAR_H - 10;
    if (above >= 8) return above;
    return frame.height - TOOLBAR_H - 12;
  })();
  const showFloat = !previewing && !typing && !cropping && sheet === null && selectedSection && floatTop !== null && !toolbarHidden;

  const themeColours = useMemo(() => {
    const tokens = snapshot.themeTokens as Record<string, unknown>;
    const pick = (key: string, fallback: string) => (typeof tokens[key] === "string" && /^#[0-9a-f]{3,8}$/i.test(tokens[key] as string) ? (tokens[key] as string) : fallback);
    return { "theme:accent": pick("accent", "#FF6A2B"), "theme:ink": pick("ink", "#16141F"), "theme:muted": pick("muted", "#6B6779"), "theme:cta": pick("ctaBg", pick("accent", "#FF6A2B")) } as Record<string, string>;
  }, [snapshot.themeTokens]);
  const resolveColour = (color: string) => themeColours[color] ?? color;

  const tryPhotos = useMemo(() => shopPhotos(snapshot, load.store.storeProducts.flatMap((product) => product.images.slice(0, 1)), 4), [snapshot, load.store.storeProducts]);
  const heroSection = sections.find((section) => photoSlot(section));
  const reviewsTemplate = load.catalog.reviews;
  const reviewsOnPage = reviewsTemplate ? sections.find((section) => section.kind === reviewsTemplate.kind) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: previewing ? colors.inkFill : canvasBackground() }}>
      {/* Top bar (SE-02): Close, Undo, Redo, the page and its save status, Preview, Publish. Preview (SE-12) has its own. */}
      {previewing ? (
        <View style={{ paddingTop: insets.top, backgroundColor: colors.inkFill }}>
          <View style={{ height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 }}>
            <Pressable testID="preview-back" accessibilityRole="button" onPress={() => showPreview(null)} style={{ height: 40, borderRadius: radii.pill, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.12)" }}>
              <AppIcon name="arrowLeft" size={17} color="#FFFFFF" strokeWidth={2.2} />
              <T weight="bold" style={{ fontSize: 13.5, color: "#FFFFFF" }}>{t("preview.back")}</T>
            </Pressable>
            <View accessibilityRole="radiogroup" style={{ flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radii.pill, padding: 3 }}>
              {(["mobile", "desktop"] as const).map((device) => {
                const on = preview === device;
                return (
                  <Pressable key={device} testID={`preview-${device}`} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => showPreview(device)} style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: on ? "#FFFFFF" : "transparent" }}>
                    <AppIcon name={device === "mobile" ? "mobile" : "monitor"} size={15} color={on ? colors.ink : "#FFFFFF"} />
                    <T weight="bold" style={{ fontSize: 12.5, color: on ? "#16141F" : "#FFFFFF" }}>{device === "mobile" ? t("preview.phone") : t("preview.computer")}</T>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      ) : (
        <View style={{ paddingTop: insets.top, backgroundColor: canvasBackground(), zIndex: 20 }}>
          <View style={{ height: 56, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10 }}>
            <TopIcon testID="editor-close" icon="x" label={t("close")} onPress={close} />
            <TopIcon testID="editor-undo" icon="undo" label={t("undo")} ghost disabled={!ed.canUndo} onPress={() => { ed.undo(); clearMarks(); }} />
            <TopIcon testID="editor-redo" icon="redo" label={t("redo")} ghost disabled={!ed.canRedo} onPress={ed.redo} />
            <Pressable testID="editor-page" accessibilityRole="button" accessibilityLabel={t("pagePicker", { page: pageTitle })} onPress={() => setSheet("pages")} style={{ flex: 1, alignItems: "center", minHeight: 44, justifyContent: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, maxWidth: "100%" }}>
                <T weight="extrabold" numberOfLines={1} style={{ fontSize: 15, flexShrink: 1 }}>{pageTitle}</T>
                <AppIcon name="chevronDown" size={15} color={colors.ink} strokeWidth={2.2} />
              </View>
              {scheduled && ed.status !== "saving" && ed.status !== "offline" && ed.status !== "conflict" ? (
                <View testID="editor-scheduled" style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityLiveRegion="polite">
                  <AppIcon name="clock" size={12} color={colors.warnInk} />
                  <T weight="semibold" numberOfLines={1} style={{ fontSize: 11.5, color: colors.warnInk }}>{t("schedule.badge", { when: scheduleWords(scheduled.runAt) })}</T>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }} accessibilityLiveRegion="polite">
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
                  <T weight="semibold" numberOfLines={1} style={{ fontSize: 11.5, color: statusColor }}>{t(status)}</T>
                </View>
              )}
            </Pressable>
            <TopIcon testID="editor-preview" icon="eye" label={t("preview")} ghost onPress={() => showPreview("mobile")} />
            <Pressable testID="editor-publish" accessibilityRole="button" onPress={() => setSheet("publish")} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: colors.accent, justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
              <T weight="extrabold" style={{ fontSize: 14, color: colors.onAccent }}>{t("publish")}</T>
            </Pressable>
          </View>
        </View>
      )}

      {/* The canvas: the real shop. */}
      <View style={{ flex: 1, paddingHorizontal: previewing ? 0 : 14, paddingTop: previewing ? 0 : 6 }}>
        <View
          onLayout={(event) => setFrame({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
          style={{ flex: 1, borderTopLeftRadius: previewing ? 0 : 18, borderTopRightRadius: previewing ? 0 : 18, overflow: "hidden", backgroundColor: "#FFFFFF", ...(previewing ? {} : { boxShadow: "0px 10px 30px -14px rgba(22,20,31,0.25)" }) }}
        >
          <StoreCanvas
            key={canvasKey}
            ref={canvas}
            testID="editor-canvas"
            accessibilityLabel={t("canvas.label")}
            onMessage={onMessage}
            onFailed={() => setCanvasFailed(true)}
            style={{ flex: 1 }}
          />
          {canvasFailed ? (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: 24 }}>
              <ErrorState message={t("canvas.failed")} onRetry={() => { ready.current = false; setCanvasFailed(false); setCanvasKey((key) => key + 1); }} />
            </View>
          ) : null}

          {/* SE-03: the quick actions for the tapped section. */}
          {showFloat && selectedSection ? (
            <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: floatTop!, alignItems: "center", zIndex: 10 }}>
              <View accessibilityRole="toolbar" accessibilityLabel={t("act.label", { name: label(selectedSection) })} style={{ flexDirection: "row", gap: 2, backgroundColor: colors.inkFill, borderRadius: 16, padding: 6, boxShadow: "0px 16px 30px -12px rgba(0,0,0,0.5)" }}>
                {moveMode ? (
                  <>
                    <FloatButton testID="float-up" icon="arrowUp" label={t("act.up")} disabled={!canMove(snapshot, page, selectedSection.id, -1)} onPress={() => move(-1)} />
                    <FloatButton testID="float-down" icon="arrowDown" label={t("act.down")} disabled={!canMove(snapshot, page, selectedSection.id, 1)} onPress={() => move(1)} />
                    <FloatButton testID="float-move-done" icon="check" label={t("done")} onPress={() => setMoveMode(false)} />
                  </>
                ) : (
                  <>
                    <FloatButton testID="float-text" icon="type" label={t("act.text")} disabled={!selected?.parts.text} onPress={() => startText("text")} />
                    {productsSection ? (
                      <FloatButton testID="float-products" icon="grid" label={t("act.products")} onPress={() => setSheet("products")} />
                    ) : (
                      <FloatButton testID="float-photo" icon="image" label={t("act.photo")} disabled={!photoSlot(selectedSection)} onPress={() => setSheet("photo")} />
                    )}
                    <FloatButton testID="float-button" icon="button" label={t("act.button")} disabled={!selected?.parts.button} onPress={() => startText("button")} />
                    <FloatButton testID="float-move" icon="arrowUp" label={t("act.move")} disabled={chrome} onPress={() => setMoveMode(true)} />
                    <FloatButton testID="float-copy" icon="copy" label={t("act.copy")} disabled={chrome} onPress={duplicate} />
                    <FloatButton testID="float-delete" icon="trash" label={t("act.delete")} disabled={chrome} danger onPress={remove} />
                  </>
                )}
              </View>
            </View>
          ) : null}

          {/* SE-06: the picked photo in its frame, to drag into place. */}
          {cropping && picked && selected?.photo && selectedSection ? (
            <CropOverlay
              picked={picked}
              frame={selected.photo}
              onUndo={() => { ed.undo(); setCropping(false); setPicked(null); }}
              onFailed={(message) => showToast(message, false)}
              onDone={(url) => {
                if (url) ed.commit((current) => setPhoto(current, page, selectedSection.id, url), `photo:${selectedSection.id}`);
                setCropping(false);
              }}
            />
          ) : null}

          {previewing ? (
            <View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 12, alignItems: "center" }}>
              <View style={{ backgroundColor: colors.inkFill, borderRadius: radii.pill, paddingVertical: 12, paddingHorizontal: 20 }}>
                <T weight="extrabold" style={{ fontSize: 14, color: "#FFFFFF" }}>{t("preview.note")}</T>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {/* SE-04: the colour row over the text toolbar (the shop's own colours first, then a few more). */}
      {typing && !previewing && colours ? (
        <View testID="text-colours" style={{ position: "absolute", left: 0, right: 0, bottom: keyboard + 52, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 8, zIndex: 23 }}>
          <ChipRowColours
            current={textState.color}
            theme={themeColours}
            label={(key) => t.dynamic(key, key)}
            onPick={(color) => {
              format({ color });
              setColours(false);
            }}
          />
        </View>
      ) : null}

      {/* SE-04: typing on the page. */}
      {typing && !previewing ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: keyboard, height: 52, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: colors.line, zIndex: 23 }}>
          <Pressable
            testID="text-font"
            accessibilityRole="button"
            accessibilityLabel={t("text.font")}
            onPress={() => {
              const now = fontChoiceOf(snapshot.themeTokens);
              const index = FONT_CHOICES.findIndex((entry) => entry.id === now);
              const next = FONT_CHOICES[(index + 1) % FONT_CHOICES.length]!;
              ed.commit((current) => applyTokens(current, next.tokens), "font");
              showToast(t("toast.font", { name: t.dynamic(next.label, next.id) }), false);
            }}
            style={{ height: 38, minWidth: 38, borderRadius: 10, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.grayTint }}
          >
            <T weight="extrabold" style={{ fontSize: 15 }}>Aa</T>
          </Pressable>
          <Pressable testID="text-bold" accessibilityRole="button" accessibilityLabel={t("text.bold")} accessibilityState={{ selected: textState.bold }} onPress={() => format({ bold: "toggle" })} style={{ height: 38, width: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: textState.bold ? colors.inkFill : "transparent" }}>
            <AppIcon name="bold" size={18} color={textState.bold ? "#FFFFFF" : colors.ink} strokeWidth={2.4} />
          </Pressable>
          <Pressable testID="text-colour" accessibilityRole="button" accessibilityLabel={t("text.colour")} accessibilityState={{ expanded: colours }} onPress={() => setColours(!colours)} style={{ height: 38, width: 38, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.ink, backgroundColor: textState.color ? resolveColour(textState.color) : "transparent" }} />
          </Pressable>
          <View accessibilityRole="adjustable" accessibilityLabel={t("text.size")} accessibilityValue={{ text: t(`text.size.${textState.size}`) }} style={{ flexDirection: "row", alignItems: "center" }}>
            <Pressable testID="text-smaller" accessibilityRole="button" accessibilityLabel={t("text.smaller")} disabled={textState.size === "s"} onPress={() => stepSize(-1)} hitSlop={4} style={{ height: 38, width: 26, alignItems: "center", justifyContent: "center", opacity: textState.size === "s" ? 0.35 : 1 }}>
              <T weight="extrabold" style={{ fontSize: 17 }}>−</T>
            </Pressable>
            <T weight="extrabold" style={{ fontSize: 13.5, minWidth: 24, textAlign: "center" }}>{textState.size.toUpperCase()}</T>
            <Pressable testID="text-bigger" accessibilityRole="button" accessibilityLabel={t("text.bigger")} disabled={textState.size === "xl"} onPress={() => stepSize(1)} hitSlop={4} style={{ height: 38, width: 26, alignItems: "center", justifyContent: "center", opacity: textState.size === "xl" ? 0.35 : 1 }}>
              <T weight="extrabold" style={{ fontSize: 17 }}>+</T>
            </Pressable>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable
            testID="text-rewrite"
            accessibilityRole="button"
            onPress={() => {
              canvas.current?.send({ t: "blur" });
              setRexStart(t("text.rewritePrompt"));
              setSheet("rex");
            }}
            style={{ height: 38, borderRadius: 10, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.mintTint }}
          >
            <AppIcon name="sparkle" size={15} color={colors.forest} />
            <T weight="extrabold" style={{ fontSize: 13, color: colors.forest }}>{t("text.rewrite")}</T>
          </Pressable>
          <Pressable testID="text-done" accessibilityRole="button" onPress={() => canvas.current?.send({ t: "blur" })} style={{ height: 38, borderRadius: 10, paddingHorizontal: 12, justifyContent: "center", backgroundColor: colors.accent }}>
            <T weight="extrabold" style={{ fontSize: 13, color: colors.onAccent }}>{t("done")}</T>
          </Pressable>
        </View>
      ) : null}

      {/* SE-00: the first time, a "Try it" dock — a colour, a photo or a section in one tap. */}
      {!previewing && !typing && tryDock ? (
        <View testID="editor-try" style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 14, paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 12) + 12, gap: 12, boxShadow: "0px -20px 40px -20px rgba(0,0,0,0.3)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <T weight="semibold" style={{ flex: 1, fontSize: 12.5, color: colors.inkSoft }}>{t("try.hint")}</T>
            <Pressable testID="try-close" accessibilityRole="button" onPress={() => setTryDock(false)} style={{ height: 34, borderRadius: radii.pill, paddingHorizontal: 14, justifyContent: "center", backgroundColor: colors.inkFill }}>
              <T weight="bold" style={{ fontSize: 13, color: "#FFFFFF" }}>{t("done")}</T>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <T weight="bold" style={{ width: 56, fontSize: 12, color: colors.inkSoft }}>{t("try.colour")}</T>
            {THEME_PRESETS.map((preset) => (
              <Pressable key={preset.id} accessibilityRole="radio" accessibilityState={{ checked: themePresetOf(snapshot.themeTokens)?.id === preset.id }} accessibilityLabel={t.dynamic(preset.label, preset.id)} onPress={() => ed.commit((current) => applyThemePreset(current, preset.id), "theme")}>
                <Swatch colours={preset.swatch.slice(0, 2)} on={themePresetOf(snapshot.themeTokens)?.id === preset.id} size={40} />
              </Pressable>
            ))}
          </View>
          {heroSection && tryPhotos.length ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <T weight="bold" style={{ width: 56, fontSize: 12, color: colors.inkSoft }}>{t("try.photo")}</T>
              {tryPhotos.map((url) => {
                const on = readPhoto(heroSection) === url;
                return (
                  <Pressable key={url} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={t("photo.use")} onPress={() => { after.current = { select: { id: heroSection.id } }; ed.commit((current) => setPhoto(current, page, heroSection.id, url), `photo:${heroSection.id}`); }}>
                    <Image source={{ uri: url }} style={{ width: 52, height: 52, borderRadius: 12, borderWidth: on ? 3 : 0, borderColor: colors.accent }} contentFit="cover" />
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {reviewsTemplate ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <T weight="bold" style={{ width: 56, fontSize: 12, color: colors.inkSoft }}>{t("try.section")}</T>
              <Chip
                label={t("kind.reviews")}
                icon={reviewsOnPage ? "check" : "plus"}
                on={Boolean(reviewsOnPage)}
                onPress={() => {
                  if (reviewsOnPage) {
                    ed.commit((current) => removeSection(current, page, reviewsOnPage.id));
                    return;
                  }
                  const section = withNewIds(reviewsTemplate, newSectionId(reviewsTemplate.kind));
                  after.current = { select: { id: section.id, tag: t("tag.new", { name: label(section) }) } };
                  ed.commit((current) => insertSection(current, page, section, heroSection?.id ?? defaultInsertAfter(current, page, null)));
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* SE-02: the bottom toolbar. */}
      {!previewing && !typing && !tryDock ? (
        <View style={{ height: toolbarHeight, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: 6, flexDirection: "row", backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, zIndex: 20 }}>
          <ToolButton testID="tool-add" icon="plus" label={t("tool.add")} primary onPress={() => openAdd()} />
          <ToolButton testID="tool-text" icon="type" label={t("tool.text")} onPress={() => startText("text")} />
          <ToolButton testID="tool-photos" icon="image" label={t("tool.photos")} on={sheet === "photo"} onPress={openPhotos} />
          <ToolButton testID="tool-theme" icon="palette" label={t("tool.theme")} on={sheet === "theme"} onPress={() => setSheet("theme")} />
          <ToolButton testID="tool-sections" icon="layers" label={t("tool.sections")} on={sheet === "sections"} onPress={() => setSheet("sections")} />
          <ToolButton testID="tool-rex" icon="sparkle" label={t("tool.rex")} on={sheet === "rex"} onPress={() => { setRexStart(undefined); setSheet("rex"); }} />
        </View>
      ) : null}

      {toast && !previewing ? (
        <Toast text={toast.text} bottom={(typing ? 60 + keyboard : toolbarHeight) + 16} action={toast.undo ? t("toast.undo") : undefined} onAction={() => { ed.undo(); setToast(null); }} />
      ) : null}

      {/* SE-02: three coach marks, once ("Tap anything to change it" with the toolbar pointer, saving, publishing). */}
      {coach === 1 && !previewing ? (
        <>
          <Coach title={t("coach.tap.title")} body={t("coach.tap.body")} step={t("coach.step", { n: 1, total: 3 })} action={t("coach.gotIt")} onAction={() => setCoach(2)} style={{ left: 30, right: 30, top: "42%" }} />
          <Coach tone="accent" body={t("coach.add")} style={{ left: 12, bottom: toolbarHeight + 8 }} />
        </>
      ) : null}
      {coach === 2 && !previewing ? (
        <Coach title={t("coach.save.title")} body={t("coach.save.body")} step={t("coach.step", { n: 2, total: 3 })} action={t("coach.gotIt")} onAction={() => setCoach(3)} style={{ left: 12, right: 60, top: insets.top + 64 }} />
      ) : null}
      {coach === 3 && !previewing ? (
        <Coach title={t("coach.publish.title")} body={t("coach.publish.body")} step={t("coach.step", { n: 3, total: 3 })} action={t("coach.gotIt")} onAction={finishCoach} style={{ right: 12, left: 60, top: insets.top + 64 }} />
      ) : null}

      {/* The sheets. */}
      {sheet === "add" ? <AddSheet ctx={ctx} afterId={addAfter} onAdd={addBlock} onClose={() => setSheet(null)} /> : null}
      {sheet === "photo" && selectedSection ? (
        <PhotoSheet
          ctx={ctx}
          section={selectedSection}
          frame={selected?.photo}
          onEdited={() => setPicked(null)}
          canCrop={Boolean(picked && selected?.photo)}
          onCrop={() => { setSheet(null); setCropping(true); }}
          onSet={(url) => ed.commit((current) => setPhoto(current, page, selectedSection.id, url), `photo:${selectedSection.id}`)}
          onPickedLocal={(local) => {
            setPicked(local);
            // Already in place on the page: now drag it to frame it.
            if (selected?.photo) {
              setSheet(null);
              setCropping(true);
            }
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "sections" ? <SectionsSheet ctx={ctx} onAdd={() => openAdd()} onClose={() => setSheet(null)} /> : null}
      {sheet === "theme" ? <ThemeSheet ctx={ctx} onClose={() => setSheet(null)} /> : null}
      {sheet === "products" && selectedSection ? <ProductsSheet ctx={ctx} section={findSection(snapshot, page, selectedSection.id) ?? selectedSection} onClose={() => setSheet(null)} /> : null}
      {sheet === "rex" ? (
        <RexSheet
          ctx={ctx}
          section={selectedSection}
          initial={rexStart}
          onChanged={onRexChanged}
          onKeep={() => { clearMarks(); setSheet(null); }}
          onUndoAll={() => { ed.undo(); clearMarks(); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "pages" ? (
        <PagesSheet
          ctx={ctx}
          onPick={(key) => { switchPage(key); setSheet(null); }}
          onAddBlank={(title) => {
            if (!load.pageBody) return;
            const added = addPage(snapshot, title, load.pageBody, load.store.name);
            ed.commit(added.snapshot);
            switchPage(added.key);
            setSheet(null);
            showToast(t("toast.pageAdded", { name: title.trim() }), true);
          }}
          onRex={() => { setRexStart(t("pages.rexPrompt")); setSheet("rex"); }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "publish" ? (
        <PublishSheet
          ctx={ctx}
          scheduled={scheduled}
          onScheduled={(next, message) => {
            setScheduled(next);
            setSheet(null);
            showToast(message, false);
          }}
          onPublished={(url) => {
            // Publishing now replaces a publish scheduled for later (the server cancels it).
            setScheduled(null);
            setSheet(null);
            setLive({ url: url ?? load.store.storefrontUrl });
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {ed.status === "conflict" ? (
        <ConflictSheet
          busy={conflictBusy}
          onChoose={(keep) => {
            setConflictBusy(true);
            ed.resolveConflict(keep)
              .catch((error) => showToast(error instanceof ApiError ? error.message : t("load.failed"), false))
              .finally(() => setConflictBusy(false));
          }}
        />
      ) : null}

      {live ? <LiveScreen url={live.url} onClose={close} onKeepEditing={() => setLive(null)} /> : null}
    </View>
  );
}

/** The text toolbar's colours (SE-04): the shop's theme colours, a few fixed ones, and "Own colour" (none). */
function ChipRowColours({ current, theme, label, onPick }: { current: string | null; theme: Record<string, string>; label: (key: string) => string; onPick: (color: string | null) => void }) {
  const entries: { id: string; hex: string; name: string }[] = [
    ...Object.entries(theme).map(([id, hex]) => ({ id, hex, name: label(`text.colour.${id.slice(6)}`) })),
    ...RICH_FIXED_COLORS.map((hex) => ({ id: hex, hex, name: hex })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 10, paddingHorizontal: 12, alignItems: "center" }}>
      <Pressable testID="text-colour-none" accessibilityRole="button" accessibilityLabel={label("text.colour.none")} accessibilityState={{ selected: !current }} onPress={() => onPick(null)} style={{ height: 34, paddingHorizontal: 12, borderRadius: radii.pill, justifyContent: "center", backgroundColor: !current ? colors.inkFill : colors.grayTint }}>
        <T weight="bold" style={{ fontSize: 12.5, color: !current ? "#FFFFFF" : colors.ink }}>{label("text.colour.none")}</T>
      </Pressable>
      {entries.map((entry) => {
        const on = current === entry.id;
        return (
          <Pressable key={entry.id} testID={`text-colour-${entry.id}`} accessibilityRole="button" accessibilityLabel={entry.name} accessibilityState={{ selected: on }} onPress={() => onPick(entry.id)} style={{ width: 34, height: 34, borderRadius: 17, borderWidth: on ? 3 : 1, borderColor: on ? colors.accent : colors.line, backgroundColor: entry.hex }} />
        );
      })}
    </ScrollView>
  );
}
