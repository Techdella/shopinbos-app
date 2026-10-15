"use client";

import type React from "react";
import { useProductBadges } from "./CampaignContext";

// Seasonal campaign badges on a product photo ("BF Deal", "-40%"): at most two, by campaign priority, in the corner
// the seller picked. `offsetTop` keeps them clear of a sold-out label or the wishlist heart in the same corner.

export function CampaignBadges({ productId, offsetLeft = 0, offsetRight = 0, size = "sm" }: { productId: string | null | undefined; offsetLeft?: number; offsetRight?: number; size?: "sm" | "md" }) {
  const badges = useProductBadges(productId);
  if (!badges.length) return null;
  const corner = (position: "top-left" | "top-right", list: typeof badges) => {
    if (!list.length) return null;
    const style: React.CSSProperties = {
      position: "absolute",
      top: (position === "top-left" ? offsetLeft : offsetRight) + 10,
      [position === "top-left" ? "left" : "right"]: 10,
      display: "flex",
      flexDirection: "column",
      alignItems: position === "top-left" ? "flex-start" : "flex-end",
      gap: 4,
      zIndex: 2,
      pointerEvents: "none",
    };
    return (
      <span style={style}>
        {list.map((badge) => (
          <span
            key={`${badge.campaignId}:${badge.blockId}`}
            style={{
              background: badge.background || "#111111",
              color: badge.textColor || "#FFFFFF",
              borderRadius: 999,
              padding: size === "md" ? "5px 12px" : "3px 9px",
              fontSize: size === "md" ? 13 : 11,
              fontWeight: 700,
              letterSpacing: "0.02em",
              lineHeight: 1.3,
              boxShadow: "0 1px 2px rgba(0,0,0,.12)",
            }}
          >
            {badge.text}
          </span>
        ))}
      </span>
    );
  };
  return (
    <>
      {corner("top-left", badges.filter((badge) => badge.position === "top-left"))}
      {corner("top-right", badges.filter((badge) => badge.position === "top-right"))}
    </>
  );
}
