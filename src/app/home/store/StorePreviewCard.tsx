"use client";

import { useEffect, useRef, useState } from "react";
import { TemplateStorefrontSurface, type SurfaceStore } from "@/components/storefront/TemplateStorefrontSurface";
import type { StoreEditorSnapshot } from "@/lib/store-templates";
import { useT } from "@/components/i18n/I18nProvider";
import { useEditorT } from "@/components/builder/editor/i18n";

// The store's real home page, drawn by the same renderer shoppers get, at desktop width and scaled down to
// fit the card. It's a picture: no clicks, no focus, hidden from screen readers (the card says what it is).
// An iframe of the storefront isn't used because the app sends X-Frame-Options: DENY.

const RENDER_WIDTH = 1280;

export function StorePreviewCard({
  store,
  snapshot,
  href,
  label,
}: {
  store: SurfaceStore;
  snapshot: StoreEditorSnapshot;
  href: string;
  label: string;
}) {
  const t = useT("store");
  // Drawn in editor mode: any canvas hints (empty images, sample labels) in the seller's language.
  const { editorText } = useEditorT();
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setScale(box.clientWidth / RENDER_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="group relative block overflow-hidden rounded-[22px] border border-app-line bg-white no-underline outline-none focus-visible:ring-2 focus-visible:ring-app-ink"
    >
      <div ref={boxRef} className="relative h-[240px] w-full overflow-hidden sm:h-[340px] xl:h-[390px]" style={{ background: snapshot.themeTokens.paperBg }}>
        {scale !== null && (
          <div
            aria-hidden
            inert
            className="pointer-events-none absolute left-0 top-0 origin-top-left select-none"
            style={{ width: RENDER_WIDTH, transform: `scale(${scale})` }}
          >
            <TemplateStorefrontSurface store={store} snapshot={snapshot} mode="editor" device="desktop" selectedPage="home" editorText={editorText} />
          </div>
        )}
      </div>
      <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center rounded-full bg-white/95 px-3 py-1.5 text-[12.5px] font-extrabold text-app-ink opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
        {t("preview.open")}
      </span>
    </a>
  );
}
