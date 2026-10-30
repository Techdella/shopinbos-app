import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, PanResponder, Platform, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { requireOptionalNativeModule } from "expo";
import { AppIcon, type AppIconName } from "@/components/icons";
import { PillButton, T } from "@/components/ui";
import { buildBanner } from "@/lib/banner";
import { useT } from "@/lib/i18n";
import { pickPhotos, uploadPhoto, type PhotoSource, type PickedPhoto } from "@/lib/photos";
import { coverCrop, readPhoto, shopPhotos, type CanvasRect, type EdSection } from "@/lib/store-editor";
import { colors, radii } from "@/theme";
import { Chip, ChipRow, EditorSheet, SheetLabel } from "./parts";
import type { SheetContext } from "./sheets";

// Change a photo (design SE-05): camera, gallery, the shop's products, or Rex makes one; the photos already in the
// shop one tap away. A photo goes straight onto the page (uploaded through the web's /api/upload, then put in the
// draft), then "Drag to frame it" (SE-06) crops it on the phone to the frame the shop shows it in.

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
  onSet,
  onPickedLocal,
  onCrop,
  canCrop,
  onClose,
}: {
  ctx: SheetContext;
  section: EdSection;
  onSet: (url: string) => void;
  onPickedLocal: (picked: PickedLocal) => void;
  onCrop: () => void;
  canCrop: boolean;
  onClose: () => void;
}) {
  const t = useT("storeEditor");
  const [busy, setBusy] = useState<"upload" | "rex" | null>(null);
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

  async function rex() {
    setProblem(null);
    setBusy("rex");
    try {
      const made = await buildBanner({ prompt: t("photo.rexPrompt", { name: ctx.label(section) }), vibe: null, picture: true });
      if (made.imageUrl) onSet(made.imageUrl);
      else setProblem(made.pictureProblem ?? t("photo.failed"));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("photo.failed"));
    } finally {
      setBusy(null);
    }
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
      {busy ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator color={colors.accent} />
          <T style={{ fontSize: 14, color: colors.inkSoft }}>{busy === "rex" ? t("photo.rexMaking") : t("photo.uploading")}</T>
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
      {canCrop ? (
        <ChipRow>
          <Chip label={t("photo.crop")} icon="crop" on={false} onPress={onCrop} />
        </ChipRow>
      ) : null}
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
  const [saving, setSaving] = useState(false);
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
    if (mode === "whole" || (zoom === 1 && offset.x === 0 && offset.y === 0)) {
      onDone(null);
      return;
    }
    setSaving(true);
    try {
      onDone(await cropAndUpload(picked.photo, frame, zoom, offset));
    } catch (error) {
      onFailed(error instanceof Error ? error.message : t("photo.failed"));
    } finally {
      setSaving(false);
    }
  }

  const fill = mode === "fill";
  return (
    <>
      {/* The photo in its frame on the page. */}
      <View {...(fill ? pan.panHandlers : {})} accessibilityLabel={t("crop.tag")} style={{ position: "absolute", left: frame.x, top: frame.y, width: frame.width, height: frame.height, overflow: "hidden", borderRadius: 14, zIndex: 6, backgroundColor: "#000" }}>
        <Image
          source={{ uri: picked.photo.uri }}
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
        <View pointerEvents="none" style={{ position: "absolute", left: 8, top: 8, backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <T weight="extrabold" style={{ fontSize: 11, color: colors.onAccent }}>{t("crop.tag")}</T>
        </View>
      </View>
      <EditorSheet title={t("crop.title")} right={null} onClose={onUndo} scroll={false}>
        <ChipRow>
          <Chip label={t("crop.fill")} on={fill} onPress={() => setMode("fill")} />
          <Chip label={t("crop.whole")} on={!fill} onPress={() => setMode("whole")} />
        </ChipRow>
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
          <PillButton testID="crop-undo" title={t("crop.undo")} tone="white" size="sm" style={{ flex: 1 }} disabled={saving} onPress={onUndo} />
          <PillButton testID="crop-done" title={t("done")} size="sm" style={{ flex: 1 }} busy={saving} onPress={() => void done()} />
        </View>
      </EditorSheet>
    </>
  );
}

export const PHOTO_RADIUS = radii.card;
