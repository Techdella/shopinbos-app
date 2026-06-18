"use client";

import { useCallback } from "react";
import { toPng } from "html-to-image";

export function ReviewCardExport({ reviewId }: { reviewId: string }) {
  const handleExport = useCallback(async () => {
    const el = document.getElementById(`review-${reviewId}`);
    if (!el) return;
    try {
      const dataUrl = await toPng(el, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        style: { padding: "0", margin: "0" },
      });
      const link = document.createElement("a");
      link.download = `review-${reviewId}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // fallback
    }
  }, [reviewId]);

  return (
    <button type="button" onClick={handleExport} className="dbtn dBtn-ghost dBtn-xs">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 3, verticalAlign: "middle" }}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21,15 16,10 5,21" />
      </svg>
      Export image
    </button>
  );
}
