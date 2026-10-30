import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, PanResponder, Platform, Pressable, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { requireOptionalNativeModule } from "expo";
import { AppIcon, type AppIconName } from "@/components/icons";
import { PillButton, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { pickPhotos, uploadPhoto, type PhotoSource, type PickedPhoto } from "@/lib/photos";
import { RexStillWorking } from "@/lib/rex-jobs";
import { brightenPhoto, brightenPreview, coverCrop, cutOutPhoto, makeRexPhoto, readPhoto, sectionCopy, shopPhotos, type CanvasRect, type EdSection } from "@/lib/store-editor";
import { colors, fonts, radii } from "@/theme";
import { Chip, ChipRow, EditorSheet, SheetLabel } from "./parts";
import type { SheetContext } from "./sheets";

// Change a photo (design SE-05): camera, gallery, the shop's products, or Rex makes one; the photos already in the
// shop one tap away. A photo goes straight onto the page (uploaded through the web's /api/upload, then put in the
// draft), then "Drag to frame it" (SE-06) crops it on the phone to the frame the shop shows it in.
// Photo tools (POST /api/mobile/store-editor/photo, each a NEW picture, so Undo always gets the old one back):
//   Brighten           made on our server (sharp) from the photo as it was before any brightening; free.
//   Remove background  OpenAI's image edit with a transparent background (a Rex job: one picture use).
//   Make with Rex      one picture for this spot from the section and the shop, plus what the seller adds (a Rex
//                      job: one picture use; no banner words).

/** The words to show when a photo tool or Rex can't finish (credits, offline, still working). */
function toolProblem(error: unknown, fallback: string) {
  if (error instanceof RexStillWorking) return error.message;
  if (error instanceof ApiError || error instanceof Error) return error.message || fallback;
  return fallback;
}

/** The frame's shape, for the picture Rex makes. */
function shapeOf(frame: CanvasRect | null | undefined): "wide" | "tall" | "square" {
  if (!frame || !frame.width || !frame.height) return "wide";
  const ratio = frame.width / frame.height;
  return ratio > 1.2 ? "wide" : ratio < 0.85 ? "tall" : "square";
}

export interface PickedLocal {
  photo: PickedPhoto;
  /** The URL that's on the page now (the whole photo). */
  url: string;
}

const OPTION_TONES: Record<string, { bg: string; fg: string }> = {
  camera: { bg: "#16141F", fg: "#FFFFFF" },
  gallery: { bg: "#F0EEF5", fg: "#16141F" },
  products: { bg: "#FFEDE4", fg: "#B23E0A" },
  rex: { bg: "#E2F6F1", fg: "#0C4A44" },
};

export function PhotoSheet({
  ctx,
  section,
  frame,
  onSet,
  onPickedLocal,
  onEdited,
  onCrop,
  canCrop,
  onClose,
}: {
  ctx: SheetContext;
  section: EdSection;
  /** Where the photo shows on the page (its shape decides the shape of Rex's picture). */
  frame?: CanvasRect | null;
  onSet: (url: string) => void;
  onPickedLocal: (picked: PickedLocal) => void;
  /** A tool changed the photo on the page (the picked one can't be cropped any more). */
  onEdited?: () => void;
  onCrop: () => void;
  canCrop: boolean;
  onClose: () => void;
}) {
  const t = useT("storeEditor");
  const [busy, setBusy] = useState<"upload" | "rex" | "brighten" | "cutout" | null>(null);
  // Brighten works from the photo as it was before (`base`); the tools' own Undo steps back through `undo`.
  const [base, setBase] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [undo, setUndo] = useState<{ url: string; level: number; base: string | null }[]>([]);
  const [rexAsk, setRexAsk] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showProducts, setShowProducts] = useState(false);
  const current = readPhoto(section);
  const productImages = useMemo(() => ctx.load.store.storeProducts.flatMap((product) => product.images.slice(0, 2)), [ctx.load.store.storeProducts]);
  const recent = useMemo(() => shopPhotos(ctx.ed.snapshot, productImages, 12), [ctx.ed.snapshot, productImages]);
  const grid = showProducts ? productImages.slice(0, 24) : recent;

  async function pick(source: PhotoSource) {
    setProblem(null);
    const picked = await pickPhotos(source, 1).catch(() => [] as PickedPhoto[]);
    if (picked === "denied") {
      setProblem(t("photo.denied"));
      return;
    }
    const photo = picked[0];
    if (!photo) return;
    setBusy("upload");
    try {
      const url = await uploadPhoto(photo, "store-banners");
      onSet(url);
      onPickedLocal({ photo, url });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("photo.failed"));
    } finally {
      setBusy(null);
    }
  }

  /** Puts a tool's picture on the page, remembering what was there for the tools' Undo. */
  function applyTool(url: string, next: { level: number; base: string | null }) {
    setUndo((stack) => [...stack.slice(-9), { url: current, level, base }]);
    setLevel(next.level);
    setBase(next.base);
    onSet(url);
    onEdited?.();
  }

  async function rex() {
    if (rexAsk === null) {
      setRexAsk("");
      return;
    }
    setProblem(null);
    setBusy("rex");
    try {
      const copy = sectionCopy(section);
      const words = [copy.title, copy.body].filter((value) => typeof value === "string" && value.trim()).join(". ");
      const url = await makeRexPhoto({ label: ctx.label(section), words, ask: rexAsk, shape: shapeOf(frame) });
      applyTool(url, { level: 0, base: null });
      setRexAsk(null);
    } catch (error) {
      setProblem(toolProblem(error, t("photo.failed")));
    } finally {
      setBusy(null);
    }
  }

  async function brighten() {
    if (!current) return;
    const original = base ?? current;
    const next = (level + 1) % 4;
    setProblem(null);
    if (next === 0) {
      applyTool(original, { level: 0, base: null });
      return;
    }
    setBusy("brighten");
    try {
      applyTool(await brightenPhoto(original, next), { level: next, base: original });
    } catch (error) {
      setProblem(toolProblem(error, t("photo.failed")));
    } finally {
      setBusy(null);
    }
  }

  async function cutout() {
    if (!current) return;
    setProblem(null);
    setBusy("cutout");
    try {
      applyTool(await cutOutPhoto(current), { level: 0, base: null });
    } catch (error) {
      setProblem(toolProblem(error, t("photo.failed")));
    } finally {
      setBusy(null);
    }
  }

  function undoTool() {
    const last = undo[undo.length - 1];
    if (!last) return;
    setUndo((stack) => stack.slice(0, -1));
    setLevel(last.level);
    setBase(last.base);
    onSet(last.url);
  }

  const option = (id: string, icon: AppIconName, label: string, onPress: () => void) => (
    <Pressable key={id} testID={`photo-${id}`} accessibilityRole="button" accessibilityLabel={label} disabled={Boolean(busy)} onPress={onPress} style={({ pressed }) => ({ alignItems: "center", gap: 7, width: 72, opacity: pressed || busy ? 0.7 : 1 })}>
      <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: OPTION_TONES[id]!.bg }}>
        <AppIcon name={icon} size={24} color={OPTION_TONES[id]!.fg} strokeWidth={2} />
      </View>
      <T weight="semibold" numberOfLines={2} style={{ fontSize: 12, textAlign: "center" }}>{label}</T>
    </Pressable>
  );

  return (
    <EditorSheet testID="editor-photo-sheet" title={t("photo.title")} onClose={onClose} height={460}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {option("camera", "camera", t("photo.camera"), () => void pick("camera"))}
        {option("gallery", "image", t("photo.gallery"), () => void pick("library"))}
        {option("products", "tag", t("photo.products"), () => setShowProducts(!showProducts))}
        {option("rex", "sparkle", t("photo.rex"), () => void rex())}
      </View>
      {rexAsk !== null ? (
        <View testID="photo-rex-ask" style={{ gap: 8 }}>
          <T style={{ fontSize: 13, color: colors.inkSoft }}>{t("photo.rexHint", { name: ctx.label(section) })}</T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radii.pill, paddingVertical: 4, paddingRight: 4, paddingLeft: 14, borderWidth: 1.5, borderColor: colors.line }}>
            <TextInput
              testID="photo-rex-input"
              value={rexAsk}
              onChangeText={setRexAsk}
              placeholder={t("photo.rexPlaceholder")}
              placeholderTextColor={colors.inkFaint}
              accessibilityLabel={t("photo.rexPlaceholder")}
              editable={!busy}
              maxLength={300}
              returnKeyType="go"
              onSubmitEditing={() => void rex()}
              style={{ flex: 1, fontFamily: fonts.regular, fontSize: 14.5, color: colors.ink, paddingVertical: 8 }}
            />
            <PillButton testID="photo-rex-make" title={t("photo.rexMake")} size="sm" icon="sparkle" busy={busy === "rex"} disabled={Boolean(busy)} onPress={() => void rex()} />
          </View>
          <T style={{ fontSize: 12, color: colors.inkSoft }}>{t("photo.rexCost")}</T>
        </View>
      ) : null}
      {busy ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator color={colors.accent} />
          <T style={{ fontSize: 14, color: colors.inkSoft }}>{busy === "rex" ? t("photo.rexMaking") : busy === "brighten" ? t("photo.brightening") : busy === "cutout" ? t("photo.cutting") : t("photo.uploading")}</T>
        </View>
      ) : null}
      {problem ? <T style={{ fontSize: 14, color: colors.danger }}>{problem}</T> : null}
      <SheetLabel>{showProducts ? t("photo.productPhotos") : t("photo.recent")}</SheetLabel>
      {grid.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {grid.map((url) => (
            <Pressable key={url} accessibilityRole="button" accessibilityLabel={t("photo.use")} accessibilityState={{ selected: url === current }} onPress={() => onSet(url)} style={{ width: "23%", flexGrow: 1, maxWidth: "24%" }}>
              <Image source={{ uri: url }} style={{ width: "100%", height: 76, borderRadius: 12, borderWidth: url === current ? 3 : 0, borderColor: colors.accent }} contentFit="cover" />
            </Pressable>
          ))}
        </View>
      ) : (
        <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("photo.none")}</T>
      )}
      <ChipRow>
        {canCrop ? <Chip testID="photo-crop" label={t("photo.crop")} icon="crop" on={false} onPress={onCrop} /> : null}
        {current ? <Chip testID="photo-cutout" label={t("photo.removeBg")} icon="scissors" on={false} onPress={() => (busy ? undefined : void cutout())} /> : null}
        {current ? <Chip testID="photo-brighten" label={level ? t("photo.brightenLevel", { level }) : t("photo.brighten")} icon="sun" on={level > 0} onPress={() => (busy ? undefined : void brighten())} /> : null}
        {undo.length ? <Chip testID="photo-tool-undo" label={t("photo.undoEdit")} icon="undo" on={false} onPress={() => (busy ? undefined : undoTool())} /> : null}
      </ChipRow>
    </EditorSheet>
  );
}

// ─── Drag to frame it (SE-06) ────────────────────────────────────────────────

type Manipulator = typeof import("expo-image-manipulator");

async function manipulator(): Promise<Manipulator | null> {
  if (Platform.OS === "web" || !requireOptionalNativeModule("ExpoImageManipulator")) return null;
  return import("expo-image-manipulator").catch(() => null);
}

/** Crops the picked photo to what shows in the frame and uploads it. The new URL, or null when it couldn't. */
async function cropAndUpload(photo: PickedPhoto, frame: { width: number; height: number }, zoom: number, offset: { x: number; y: number }) {
  const tools = await manipulator();
  if (!tools || !photo.width || !photo.height) return null;
  const crop = coverCrop({ width: photo.width, height: photo.height }, frame, zoom, offset);
  const context = tools.ImageManipulator.manipulate(photo.uri);
  context.crop({ originX: crop.originX, originY: crop.originY, width: crop.width, height: crop.height });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.85, format: tools.SaveFormat.JPEG });
  return uploadPhoto({ uri: saved.uri, width: saved.width, height: saved.height, mimeType: "image/jpeg", fileName: "framed.jpg" }, "store-banners");
}

/**
 * The picked photo over its place on the page, inside the frame the shop shows it in (grid lines and a move handle).
 * The seller drags it and zooms; Done crops it to exactly what shows and puts that on the page.
 */
export function CropOverlay({ picked, frame, onDone, onUndo, onFailed }: { picked: PickedLocal; frame: CanvasRect; onDone: (url: string | null) => void; onUndo: () => void; onFailed: (message: string) => void }) {
  const t = useT("storeEditor");
  const [mode, setMode] = useState<"fill" | "whole">("fill");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState<null | "crop" | "brighten" | "cutout">(null);
  // Applied on Done, after the crop: Brighten (0-3) and Remove background.
  const [bright, setBright] = useState(0);
  const [cut, setCut] = useState(false);
  // Brighten's true look before Done: the server's own steps on a small copy (a data: URL per level, asked a moment
  // after the last tap and kept, so tapping round the levels again is instant). Until it's back, the photo as picked.
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    if (!bright || previews[bright]) {
      setPreviewing(false);
      return;
    }
    let stale = false;
    setPreviewing(true);
    const timer = setTimeout(() => {
      brightenPreview(picked.url, bright)
        .then((preview) => {
          if (!stale && preview) setPreviews((now) => ({ ...now, [bright]: preview }));
        })
        .catch(() => undefined)
        .finally(() => {
          if (!stale) setPreviewing(false);
        });
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [bright, picked.url, previews]);
  const shownUri = (bright && previews[bright]) || picked.photo.uri;
  const photo = { width: picked.photo.width || frame.width, height: picked.photo.height || frame.height };
  const crop = coverCrop(photo, frame, zoom, offset);
  const cover = Math.max(frame.width / photo.width, frame.height / photo.height) * zoom;
  const shown = { width: photo.width * cover, height: photo.height * cover };
  const start = useRef({ x: 0, y: 0 });
  const live = useRef({ zoom, offset });
  useLayoutEffect(() => {
    live.current = { zoom, offset };
  }, [zoom, offset]);

  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start.current = live.current.offset;
      },
      onPanResponderMove: (_event, gesture) => {
        setOffset(coverCrop(photo, frame, live.current.zoom, { x: start.current.x + gesture.dx, y: start.current.y + gesture.dy }).offset);
      },
    }),
  );

  const trackWidth = useRef(1);
  const [zoomPan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const next = 1 + Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth.current)) * 2;
        setZoom(next);
      },
      onPanResponderMove: (event) => {
        const next = 1 + Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth.current)) * 2;
        setZoom(next);
      },
    }),
  );

  async function done() {
    const uncropped = mode === "whole" || (zoom === 1 && offset.x === 0 && offset.y === 0);
    if (uncropped && !bright && !cut) {
      onDone(null);
      return;
    }
    try {
      setSaving("crop");
      let url = (uncropped ? null : await cropAndUpload(picked.photo, frame, zoom, offset)) ?? picked.url;
      if (bright) {
        setSaving("brighten");
        url = await brightenPhoto(url, bright);
      }
      if (cut) {
        setSaving("cutout");
        url = await cutOutPhoto(url);
      }
      onDone(url === picked.url ? null : url);
    } catch (error) {
      onFailed(toolProblem(error, t("photo.failed")));
    } finally {
      setSaving(null);
    }
  }

  const fill = mode === "fill";
  return (
    <>
      {/* The photo in its frame on the page. */}
      <View {...(fill ? pan.panHandlers : {})} accessibilityLabel={t("crop.tag")} style={{ position: "absolute", left: frame.x, top: frame.y, width: frame.width, height: frame.height, overflow: "hidden", borderRadius: 14, zIndex: 6, backgroundColor: "#000" }}>
        <Image
          source={{ uri: shownUri }}
          transition={120}
          contentFit={fill ? "cover" : "contain"}
          style={
            fill
              ? { position: "absolute", width: shown.width, height: shown.height, left: (frame.width - shown.width) / 2 + crop.offset.x, top: (frame.height - shown.height) / 2 + crop.offset.y }
              : { width: "100%", height: "100%" }
          }
        />
        {fill ? (
          <>
            {[1, 2].map((n) => <View key={`v${n}`} pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: `${(n * 100) / 3}%`, width: 1, backgroundColor: "rgba(255,255,255,0.45)" }} />)}
            {[1, 2].map((n) => <View key={`h${n}`} pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: `${(n * 100) / 3}%`, height: 1, backgroundColor: "rgba(255,255,255,0.45)" }} />)}
            <View pointerEvents="none" style={{ position: "absolute", left: frame.width / 2 - 28, top: frame.height / 2 - 28, width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="move" size={22} color="#FFFFFF" />
            </View>
          </>
        ) : null}
        {previewing && !saving ? (
          <View pointerEvents="none" style={{ position: "absolute", right: 8, top: 8, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(22,20,31,0.75)", borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
            <ActivityIndicator color="#FFFFFF" size="small" />
            <T weight="bold" style={{ fontSize: 11.5, color: "#FFFFFF" }}>{t("photo.brightening")}</T>
          </View>
        ) : null}
        <View pointerEvents="none" style={{ position: "absolute", left: 8, top: 8, backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <T weight="extrabold" style={{ fontSize: 11, color: colors.onAccent }}>{t("crop.tag")}</T>
        </View>
        {saving ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 10, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(22,20,31,0.8)", borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <T weight="bold" style={{ fontSize: 12.5, color: "#FFFFFF" }}>{saving === "brighten" ? t("photo.brightening") : saving === "cutout" ? t("photo.cutting") : t("photo.uploading")}</T>
            </View>
          </View>
        ) : null}
      </View>
      <EditorSheet title={t("crop.title")} right={null} onClose={onUndo} scroll={false}>
        <ChipRow>
          <Chip label={t("crop.fill")} on={fill} onPress={() => setMode("fill")} />
          <Chip label={t("crop.whole")} on={!fill} onPress={() => setMode("whole")} />
          <Chip testID="crop-brighten" label={bright ? t("photo.brightenLevel", { level: bright }) : t("photo.brighten")} icon="sun" on={bright > 0} onPress={() => setBright((now) => (now + 1) % 4)} />
          <Chip testID="crop-cutout" label={t("crop.removeBg")} icon="scissors" on={cut} onPress={() => setCut(!cut)} />
        </ChipRow>
        {cut ? <T style={{ fontSize: 12.5, color: colors.inkSoft }}>{t("crop.removeBgNote")}</T> : null}
        {fill ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <T weight="bold" style={{ fontSize: 13 }}>{t("crop.zoom")}</T>
            <View
              {...zoomPan.panHandlers}
              accessibilityRole="adjustable"
              accessibilityLabel={t("crop.zoom")}
              accessibilityValue={{ min: 100, max: 300, now: Math.round(zoom * 100) }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(event) => setZoom((now) => Math.max(1, Math.min(3, now + (event.nativeEvent.actionName === "increment" ? 0.25 : -0.25))))}
              onLayout={(event) => {
                trackWidth.current = Math.max(1, event.nativeEvent.layout.width);
              }}
              style={{ flex: 1, height: 30, justifyContent: "center" }}
            >
              <View pointerEvents="none" style={{ height: 6, borderRadius: 9, backgroundColor: colors.grayTint }}>
                <View style={{ width: `${((zoom - 1) / 2) * 100}%`, height: 6, borderRadius: 9, backgroundColor: colors.inkFill }} />
              </View>
              <View pointerEvents="none" style={{ position: "absolute", left: `${((zoom - 1) / 2) * 100}%`, marginLeft: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink }} />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <PillButton testID="crop-undo" title={t("crop.undo")} tone="white" size="sm" style={{ flex: 1 }} disabled={Boolean(saving)} onPress={onUndo} />
          <PillButton testID="crop-done" title={t("done")} size="sm" style={{ flex: 1 }} busy={Boolean(saving)} onPress={() => void done()} />
        </View>
      </EditorSheet>
    </>
  );
}

export const PHOTO_RADIUS = radii.card;
