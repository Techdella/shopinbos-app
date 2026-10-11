"use client";

import { useEffect, useRef, useState } from "react";
import { TemplateStorefrontSurface, type SurfaceStore } from "@/components/storefront/TemplateStorefrontSurface";
import { Mascot } from "@/components/app-ui";
import type { StoreEditorSnapshot } from "@/lib/store-templates";
import type { StorePageStatus } from "@/lib/store-health";

const DESKTOP_WIDTH = 1200;
const PHONE_WIDTH = 390;

/** Read-only DRAFT storefront, rendered by the same surface the advanced builder uses. */
export function RexPreview({
  store,
  draft,
  page,
  device,
  busy,
  onWrite,
}: {
  store: SurfaceStore;
  draft: StoreEditorSnapshot;
  page: StorePageStatus;
  device: "desktop" | "mobile";
  busy: boolean;
  onWrite: (page: StorePageStatus) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const frameWidth = device === "mobile" ? PHONE_WIDTH : Math.max(DESKTOP_WIDTH, width);
  const zoom = width > 0 ? Math.min(1, width / frameWidth) : 1;

  const offer = page.state !== "written" ? (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[18px] bg-app-peach px-4 py-3">
      <Mascot name="rex" alt="" className="h-9 w-9 shrink-0" />
      <p className="m-0 min-w-0 flex-1 basis-[220px] text-[13.5px] leading-[1.45]">
        {page.state === "missing"
          ? `Your store doesn't have ${page.label === "Home" ? "a homepage" : `a ${page.label} page`} yet. I can write it from what I know about your store.`
          : `Your ${page.label} page is still empty. I can write it from what I know about your store.`}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => onWrite(page)}
        className="min-h-[40px] shrink-0 rounded-full bg-app-ink px-4 text-[13px] font-bold text-white disabled:opacity-50"
      >
        Write it
      </button>
    </div>
  ) : null;

  return (
    <div ref={boxRef} className="w-full min-w-0">
      {offer}
      {page.pageType ? (
        <div
          className="mx-auto overflow-hidden border border-app-line bg-white shadow-[0_18px_50px_rgba(22,20,31,0.08)]"
          style={{ width: frameWidth * zoom, borderRadius: device === "mobile" ? 28 : 6 }}
        >
          {/* The preview isn't clickable: Rex makes the changes. inert keeps it out of the tab order too. */}
          <div inert style={{ width: frameWidth, zoom }} className="pointer-events-none select-none">
            <TemplateStorefrontSurface
              store={store}
              snapshot={draft}
              storeBasePath={`/s/${store.slug}`}
              mode="editor"
              device={device}
              selectedPage={page.pageType}
              onSelectPage={() => undefined}
              cartCount={0}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
