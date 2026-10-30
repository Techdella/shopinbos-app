"use client";

import { useEffect, useRef, useState } from "react";
import { TemplateStorefrontSurface, type SurfaceStore } from "@/components/storefront/TemplateStorefrontSurface";
import type { StoreEditorSnapshot } from "@/lib/store-templates";
import { cx, DeviceToggle, type PreviewDevice } from "@/components/app-ui";
import { applyTokens, findPage, setCopy, setPhoto, type EdSection, type EdSnapshot } from "@shared/store-editor";
import { fetchDraft, type EditorLoad } from "./api";

// The seller's own shop drawn by the storefront's real renderer (the same TemplateStorefrontSurface shoppers and the
// web builder get), used for the live previews on the colours, banner and words screens and for the review (E2).
// The draft is the store editor's (GET /api/mobile/store-editor); the screens lay their answers on top of it in the
// browser (colours, banner photo, banner words) without saving, so the preview changes as the seller picks.

export const BANNER_KINDS = ["hero-split", "split-hero", "parallax-banner", "promo-banner", "page-header", "video-hero"];

/** The home page's banner section (the one Rex fills in), or null. */
export function bannerSection(snapshot: EdSnapshot | null | undefined): EdSection | null {
  const home = findPage(snapshot, "home");
  if (!home) return null;
  return home.sections.find((section) => BANNER_KINDS.includes(section.kind) && section.visible !== false) ?? home.sections.find((section) => BANNER_KINDS.includes(section.kind)) ?? null;
}

/** The answers so far on top of the draft: colours (theme tokens), the banner's photo and words. */
export function previewSnapshot(snapshot: EdSnapshot, choices: { tokens?: Record<string, string> | null; photo?: string | null; headline?: string | null; sub?: string | null; cta?: string | null }): EdSnapshot {
  let next = snapshot;
  if (choices.tokens) next = applyTokens(next, choices.tokens);
  const banner = bannerSection(next);
  if (banner) {
    if (choices.photo) next = setPhoto(next, "home", banner.id, choices.photo);
    if (choices.headline) next = setCopy(next, "home", banner.id, "title", choices.headline);
    if (choices.sub) next = setCopy(next, "home", banner.id, "body", choices.sub);
    if (choices.cta) next = setCopy(next, "home", banner.id, "primaryCta", choices.cta);
  }
  return next;
}

let cached: Promise<EditorLoad | null> | null = null;

/** The draft, loaded once per visit to the flow (`fresh` loads it again, e.g. after the style step put a look on it). */
export function useDraft(fresh = false) {
  const [load, setLoad] = useState<EditorLoad | null>(null);
  useEffect(() => {
    let gone = false;
    if (fresh || !cached) cached = fetchDraft().catch(() => null);
    void cached.then((value) => {
      if (!gone) setLoad(value);
    });
    return () => {
      gone = true;
    };
  }, [fresh]);
  return load;
}

/** Forgets the loaded draft (after the build, or a new look). */
export function forgetDraft() {
  cached = null;
}

const DESKTOP_WIDTH = 1280;
const PHONE_WIDTH = 390;

/**
 * The shop at real size, scaled to fit its box. `interactive` (the review): clicks reach the renderer, so a click on
 * a section selects it; otherwise it's a picture (no focus, hidden from screen readers; the screen says what it is).
 */
export function ShopSurface({
  store,
  snapshot,
  height,
  device: startDevice = "desktop",
  interactive = false,
  selectedSectionId,
  onSelectSection,
  toggle = false,
  label,
  className = "",
}: {
  store: SurfaceStore;
  snapshot: EdSnapshot;
  height: number | string;
  device?: PreviewDevice;
  interactive?: boolean;
  selectedSectionId?: string | null;
  onSelectSection?: (id: string | null) => void;
  toggle?: boolean;
  label?: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [innerHeight, setInnerHeight] = useState(0);
  const [device, setDevice] = useState<PreviewDevice>(startDevice);
  const width = device === "desktop" ? DESKTOP_WIDTH : PHONE_WIDTH;

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    // A little room for the scroll bar, so the scaled page never scrolls sideways.
    const measure = () => setScale(Math.min(1, (element.clientWidth - 2) / width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);

  // The scaled page's real height, so the box scrolls to its end and no further (a CSS scale keeps the old height).
  useEffect(() => {
    const element = inner.current;
    if (!element) return;
    const measure = () => setInnerHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scale, device]);

  const paper = String((snapshot.themeTokens as Record<string, unknown>).paperBg ?? "#FFFFFF");
  return (
    <div className={cx("relative flex flex-col gap-2", className)}>
      {toggle ? <DeviceToggle value={device} onChange={setDevice} size="sm" className="self-end" /> : null}
      <div
        ref={box}
        role={interactive ? "region" : "img"}
        aria-label={label}
        className={cx("relative w-full rounded-[18px] border border-app-line", interactive ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden")}
        style={{ height, background: paper }}
      >
        {scale !== null ? (
          <div className="relative mx-auto overflow-hidden" style={{ width: width * scale, height: innerHeight ? innerHeight * scale : undefined }}>
            <div
              ref={inner}
              aria-hidden={interactive ? undefined : true}
              inert={interactive ? undefined : true}
              className={cx("absolute left-0 top-0 origin-top-left", interactive ? "" : "pointer-events-none select-none")}
              style={{ width, transform: `scale(${scale})` }}
            >
              <TemplateStorefrontSurface
                store={store}
                snapshot={snapshot as unknown as StoreEditorSnapshot}
                storeBasePath={`/s/${store.slug}`}
                mode="editor"
                device={device}
                selectedPage="home"
                selectedSectionId={selectedSectionId ?? null}
                onSelectSection={onSelectSection}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A live preview of the draft with the screen's choices on top; nothing while the draft loads or when there's none. */
export function LivePreview({ choices, height = 360, label, fallback }: { choices: Parameters<typeof previewSnapshot>[1]; height?: number; label: string; fallback?: React.ReactNode }) {
  const load = useDraft();
  if (!load?.draft) return <>{fallback ?? null}</>;
  return <ShopSurface store={load.store as unknown as SurfaceStore} snapshot={previewSnapshot(load.draft, choices)} height={height} toggle label={label} />;
}
