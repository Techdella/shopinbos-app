"use client";

import type React from "react";
import { storeLogoView, type LogoDisplay } from "@shared/store-logo";
import { StoreLogo } from "./StoreLogo";

/**
 * The brand in a store header: the logo (its own shape, never cropped, in the version that reads on the bar
 * behind it, see StoreLogo), the square icon, or the name, as the seller chose in Brand kit
 * (brandSettings.logoDisplay). `display` overrides the saved choice (previews).
 */
export function StoreBrandMark({
  store,
  name,
  display,
  background,
  dark,
  under,
  nameClassName,
  nameStyle,
  className,
}: {
  store: { logoUrl?: string | null; brandSettings?: unknown };
  name: string;
  display?: LogoDisplay;
  /** The colour behind the logo, so a dark bar gets the dark-background logo (StoreLogo). */
  background?: string | null;
  dark?: boolean;
  under?: string | null;
  nameClassName?: string;
  nameStyle?: React.CSSProperties;
  className?: string;
}) {
  const view = storeLogoView(store, display);
  const nameEl = <span className={`truncate ${nameClassName ?? ""}`} style={nameStyle}>{name}</span>;
  return (
    <span className={`flex min-w-0 items-center gap-2.5 ${className ?? ""}`}>
      {view.shape === "logo" ? (
        <StoreLogo
          store={store}
          background={background}
          dark={dark}
          under={under}
          alt={view.showName ? "" : name}
          className="shrink-0"
          style={{ height: view.height, width: "auto", maxWidth: view.height * 4 }}
          fallback={view.showName ? null : nameEl}
        />
      ) : view.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={view.image}
          alt={view.showName ? "" : name}
          className="shrink-0 rounded-[22%] object-cover"
          style={{ width: view.height, height: view.height }}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      {view.showName ? nameEl : null}
    </span>
  );
}
