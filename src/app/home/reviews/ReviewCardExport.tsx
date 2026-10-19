"use client";

import { useCallback, useState } from "react";
import { toPng } from "html-to-image";
import { Icon } from "@/components/ui/Icon";
import { pillButton } from "@/components/seller-core";
import { useT } from "@/components/i18n/I18nProvider";

export function ReviewCardExport({ reviewId }: { reviewId: string }) {
  const t = useT("reviews");
  const [busy, setBusy] = useState(false);
  const handleExport = useCallback(async () => {
    const el = document.getElementById(`review-${reviewId}`);
    if (!el) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(el, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        style: { padding: "0", margin: "0" },
        // Leave the buttons out of the shareable image.
        filter: (node) => !(node instanceof HTMLElement && node.dataset.exportSkip === "true"),
      });
      const link = document.createElement("a");
      link.download = `review-${reviewId}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // fallback
    } finally {
      setBusy(false);
    }
  }, [reviewId]);

  return (
    <button type="button" onClick={handleExport} disabled={busy} className={pillButton.white}>
      <Icon name="image" size={14} />
      {busy ? t("export.saving") : t("export.save")}
    </button>
  );
}
