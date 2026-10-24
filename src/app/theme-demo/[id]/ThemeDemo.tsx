"use client";

import { useCallback, useMemo, useState } from "react";
import { BoutiqueStorefront } from "@/components/storefront/boutique/BoutiqueStorefront";
import { BOUTIQUE_FONT_CLASS } from "@/components/storefront/boutique/fonts";
import { previewData } from "@/components/builder/theme-preview/preview-store";

/** One theme's sample store at phone width, the same render as the web gallery's live preview (mobile view). */
export function ThemeDemo({ themeId }: { themeId: string }) {
  const data = useMemo(() => previewData(themeId, null), [themeId]);
  const [page, setPage] = useState("home");
  const navigate = useCallback((next: string) => {
    setPage(next);
    window.scrollTo({ top: 0 });
  }, []);
  if (!data) return null;
  return (
    <div className={BOUTIQUE_FONT_CLASS}>
      <BoutiqueStorefront
        themeId={data.themeId}
        store={data.store}
        snapshot={data.snapshot}
        mode="editor"
        device="mobile"
        currentPage={page}
        onNavigate={navigate}
        cartCount={0}
        wishlistProductIds={[]}
        demo
      />
    </div>
  );
}
