"use client";

import type React from "react";
import { storeLogoView, type LogoDisplay } from "@shared/store-logo";

/**
 * The brand in a store header: the logo (its own shape, never cropped), the square icon, or the name, as the
 * seller chose in Brand kit (brandSettings.logoDisplay). `display` overrides the saved choice (previews).
 */
export function StoreBrandMark({
  store,
  name,
  display,
  nameClassName,
  nameStyle,
  className,
}: {
  store: { logoUrl?: string | null; brandSettings?: unknown };
  name: string;
  display?: LogoDisplay;
  nameClassName?: string;
  nameStyle?: React.CSSProperties;
  className?: string;
}) {
  const view = storeLogoView(store, display);
  return (
    <span className={`flex min-w-0 items-center gap-2.5 ${className ?? ""}`}>
      {view.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={view.image}
          alt={view.showName ? "" : name}
          height={view.height}
          className={view.shape === "icon" ? "shrink-0 rounded-[22%] object-cover" : "shrink-0 object-contain"}
          style={view.shape === "icon" ? { width: view.height, height: view.height } : { height: view.height, width: "auto", maxWidth: view.height * 4 }}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      {view.showName ? <span className={`truncate ${nameClassName ?? ""}`} style={nameStyle}>{name}</span> : null}
    </span>
  );
}
