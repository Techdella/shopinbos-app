import { useCallback, useEffect, useRef, useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useT } from "@/lib/i18n";
import { fetchStoreEditor, kindLabelKey, type CanvasOutbound, type EdSnapshot, type EditorStore } from "@/lib/store-editor";
import { CANVAS_SUPPORTED, StoreCanvas, type CanvasHandle } from "./Canvas";
import { StorePreview } from "./StorePreview";

// The seller's shop drawn by the real storefront renderer (the store editor's canvas, src/app/store-canvas), as a
// standalone piece other screens can show: Rex's onboarding Review screen, for one. Stable props:
//   draft         the snapshot to draw (e.g. the draft Rex just built). Left out: the shop's saved draft is loaded.
//   store         the store data the canvas draws products from (GET /api/mobile/store-editor `store`). Left out:
//                 loaded together with the draft.
//   page          which page ("home" by default).
//   onSectionTap  called with a section's id when the seller taps it (the section gets the orange outline). Left
//                 out: the preview is look-only (customer view, no outlines).
// Changing `draft` redraws at once without reloading. The web build of the app shows the live shop's address
// instead (no WebView there).

export interface ShopPreviewProps {
  draft?: EdSnapshot | null;
  store?: EditorStore | null;
  page?: string;
  onSectionTap?: (sectionId: string) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ShopPreview({ draft, store, page = "home", onSectionTap, style, testID }: ShopPreviewProps) {
  const t = useT("storeEditor");
  const canvas = useRef<CanvasHandle>(null);
  const ready = useRef(false);
  const [loaded, setLoaded] = useState<{ store: EditorStore; draft: EdSnapshot | null } | null>(null);
  const shownStore = store ?? loaded?.store ?? null;
  const shownDraft = draft ?? loaded?.draft ?? null;
  const editing = Boolean(onSectionTap);

  useEffect(() => {
    if (!CANVAS_SUPPORTED || (store && draft)) return;
    let cancelled = false;
    fetchStoreEditor()
      .then((data) => {
        if (!cancelled) setLoaded({ store: data.store, draft: data.draft });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [store, draft]);

  const labels = useCallback((snapshot: EdSnapshot) => {
    const sections = snapshot.pages.find((entry) => entry.pageType === page)?.sections ?? [];
    return Object.fromEntries(sections.map((section) => {
      const key = kindLabelKey(section.kind);
      return [section.id, key ? t.dynamic(key, section.name) : section.name];
    }));
  }, [page, t]);

  const init = useCallback(() => {
    if (!shownStore || !shownDraft) return;
    canvas.current?.send({
      t: "init",
      store: shownStore,
      snapshot: shownDraft,
      page,
      mode: editing ? "edit" : "preview",
      device: "mobile",
      labels: labels(shownDraft),
      words: { addAbove: t("canvas.addAbove"), addBelow: t("canvas.addBelow") },
    });
  }, [shownStore, shownDraft, page, editing, labels, t]);

  // A new draft (or page) redraws in place.
  useEffect(() => {
    if (ready.current) init();
  }, [init]);

  const onMessage = useCallback((message: CanvasOutbound) => {
    if (message.t === "ready") {
      ready.current = true;
      init();
    } else if (message.t === "select") {
      onSectionTap?.(message.id);
    }
  }, [init, onSectionTap]);

  if (!CANVAS_SUPPORTED) {
    const url = shownStore?.storefrontUrl ?? null;
    return url ? <StorePreview url={url} style={style} accessibilityLabel={t("entry.preview")} /> : <View style={style} testID={testID} />;
  }
  return <StoreCanvas ref={canvas} testID={testID} accessibilityLabel={t("entry.preview")} onMessage={onMessage} style={style} />;
}
