"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { DeviceToggle, PillButton, Segmented, Toggle, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { BoutiqueStorefront } from "@/components/storefront/boutique/BoutiqueStorefront";
import { BOUTIQUE_FONT_CLASS } from "@/components/storefront/boutique/fonts";
import { BOUTIQUE_THEME_TOKENS, isBoutiqueTheme } from "@/lib/store-templates/boutique-themes";
import { themeLibraryEntry } from "@/lib/store-templates/theme-library";
import { previewData, type PreviewOwnStore } from "./preview-store";

// Real theme previews: the storefront renderer itself, at desktop width, scaled down onto the card (thumbnails)
// or into a dialog (live preview). Thumbnails mount only when near the viewport and are inert.

export const PREVIEW_DESKTOP_WIDTH = 1280;
const PHONE_WIDTH = 390;
const noop = () => undefined;

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** True once the element has come within `margin` of the viewport (and stays true). */
function useSeen(ref: React.RefObject<HTMLElement | null>, margin = "400px") {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setSeen(true);
        observer.disconnect();
      }
    }, { rootMargin: margin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, margin, seen]);
  return seen;
}

/** The theme's home page at 1280px wide, scaled to fill a 4:5 card. Decorative: the card's text says what it is. */
export function ThemeThumbnail({ themeId, own, className }: { themeId: string; own?: PreviewOwnStore | null; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const seen = useSeen(box);
  const width = useWidth(box);
  const data = useMemo(() => (seen ? previewData(themeId, own) : null), [seen, themeId, own]);
  const scale = width ? width / PREVIEW_DESKTOP_WIDTH : 0;
  const paper = isBoutiqueTheme(themeId) ? BOUTIQUE_THEME_TOKENS[themeId].paperBg : "#F3F3F3";
  return (
    <div ref={box} aria-hidden className={cx("relative aspect-[4/5] w-full overflow-hidden", className)} style={{ background: paper }}>
      {data && scale ? (
        <div
          inert
          className="pointer-events-none absolute left-0 top-0 origin-top-left select-none"
          style={{ width: PREVIEW_DESKTOP_WIDTH, height: (width * 1.25) / scale, transform: `scale(${scale})`, overflow: "hidden" }}
        >
          <BoutiqueStorefront
            themeId={data.themeId}
            store={data.store}
            snapshot={data.snapshot}
            mode="editor"
            device="desktop"
            currentPage="home"
            onNavigate={noop}
            cartCount={0}
            wishlistProductIds={[]}
            demo
          />
        </div>
      ) : (
        <div className="absolute inset-0 animate-pulse" style={{ background: `linear-gradient(180deg, ${paper}, rgba(0,0,0,.04))` }} />
      )}
    </div>
  );
}

/** Renders `children` at a fixed design width, scaled down to fit the available width; the height follows the content. */
function ScaledFrame({ width, children }: { width: number; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const available = useWidth(outer);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const node = inner.current;
    if (!node) return;
    setHeight(node.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const scale = available ? Math.min(1, available / width) : 1;
  return (
    <div ref={outer} className="w-full">
      <div className="relative mx-auto overflow-hidden rounded-[14px] bg-white shadow-[0_10px_40px_rgba(22,20,31,.14)]" style={{ width: width * scale, height: height * scale || undefined }}>
        <div ref={inner} className="absolute left-0 top-0 origin-top-left" style={{ width, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

type PreviewPage = "home" | "product";

export interface ThemePreviewDialogProps {
  themeId: string;
  onClose: () => void;
  /** The seller's store when it has enough products with photos for "Show with my products". */
  own?: PreviewOwnStore | null;
  useOwn: boolean;
  onUseOwnChange: (value: boolean) => void;
  isCurrent: boolean;
  busy: boolean;
  onUse: () => void;
}

/** Larger live preview: desktop or phone, home or product page, sample or own products. */
export function ThemePreviewDialog({ themeId, onClose, own, useOwn, onUseOwnChange, isCurrent, busy, onUse }: ThemePreviewDialogProps) {
  const theme = themeLibraryEntry(themeId);
  const [device, setDevice] = useState<"desktop" | "mobile">(() => (typeof window !== "undefined" && window.innerWidth < 760 ? "mobile" : "desktop"));
  const [page, setPage] = useState<string>("home");
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const data = useMemo(() => previewData(themeId, useOwn && own ? own : null), [themeId, useOwn, own]);
  const titleId = `theme-preview-${themeId}`;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter((node) => node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [onClose]);

  const navigate = useCallback((next: string) => {
    setPage(next);
    body.current?.scrollTo({ top: 0 });
  }, []);

  if (!theme || !data) return null;
  const segmentPage: PreviewPage = page === "product" ? "product" : "home";

  const storefront = (
    <BoutiqueStorefront
      key={`${themeId}-${device}-${data.sample ? "sample" : "own"}`}
      themeId={data.themeId}
      store={data.store}
      snapshot={data.snapshot}
      mode="editor"
      device={device}
      currentPage={page}
      onNavigate={navigate}
      cartCount={0}
      wishlistProductIds={[]}
      demo
    />
  );

  return (
    <div className="fixed inset-0 z-[600] flex items-stretch justify-center bg-[rgba(22,20,31,.45)] p-0 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} className={cx("flex min-h-0 w-full max-w-[1500px] flex-col overflow-hidden bg-white font-app text-app-ink sm:rounded-[22px]", BOUTIQUE_FONT_CLASS)}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-app-line px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 truncate text-[20px] font-extrabold leading-tight">{theme.name}</h2>
            <p className="m-0 truncate text-[13px] text-app-ink-soft">{theme.meaning} · {theme.categoryLabel}</p>
          </div>
          <DeviceToggle value={device} onChange={(value) => { setDevice(value); body.current?.scrollTo({ top: 0 }); }} />
          <Segmented<PreviewPage>
            className="border border-app-line"
            options={[{ value: "home", label: "Home" }, { value: "product", label: "Product" }]}
            value={segmentPage}
            onChange={navigate}
          />
          <div className="flex items-center gap-2">
            {isCurrent ? (
              <span className="px-2 text-[14px] font-extrabold">Your current look</span>
            ) : (
              <PillButton tone="ink" size="sm" busy={busy} disabled={busy} onClick={onUse}>Use {theme.name}</PillButton>
            )}
            <button ref={closeButton} type="button" onClick={onClose} aria-label="Close preview" className="grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white hover:border-app-line-strong">
              <Icon name="x" size={17} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-line bg-app-canvas px-4 py-2 text-[13px] sm:px-5">
          <p className="m-0 text-app-ink-soft">
            {data.sample
              ? "Sample products and pictures, to show the layout. Your own products, photos and settings replace them."
              : "Your own products in this theme. Nothing changes on your store until you use it and publish."}
          </p>
          {own ? (
            <label className="flex items-center gap-2 font-semibold">
              Show with my products
              <Toggle on={useOwn} onChange={onUseOwnChange} label="Show with my products" />
            </label>
          ) : null}
        </div>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto bg-app-canvas p-3 sm:p-6">
          {device === "desktop" ? (
            <ScaledFrame width={PREVIEW_DESKTOP_WIDTH}>{storefront}</ScaledFrame>
          ) : (
            <div className="mx-auto overflow-hidden rounded-[34px] border-[8px] border-[#16141F] bg-white shadow-[0_10px_40px_rgba(22,20,31,.18)]" style={{ width: PHONE_WIDTH + 16, maxWidth: "100%" }}>
              <div className="h-[min(760px,calc(100dvh-220px))] overflow-y-auto">{storefront}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
