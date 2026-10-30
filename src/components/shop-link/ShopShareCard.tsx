"use client";

import { forwardRef, useEffect, useState, type CSSProperties } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { PLUG_LIVE } from "@shared/shop-handle";

// The shop's share card: logo and name, "Shop with us on Shopinbos", a QR code of the short link, the @handle and the
// short link. Shown on Shop link & QR (/home/store/share), saved as a picture for print, and laid out as stickers
// and flyers on the print sheet. Everything is sized in em, so one card scales from screen to sticker to A5 flyer.
//
// `plug` switches the wording to "Follow us on Shopinbos Plug" / "Scan to follow". Off until Plug (the customer app)
// ships; the pilot switch will pass it (PLUG_LIVE in shared/shop-handle.ts is the default).

export type ShopCardSize = "screen" | "sticker" | "flyer";

const SIZES: Record<ShopCardSize, CSSProperties> = {
  screen: { width: 320, fontSize: 16 },
  // 3 across, 4 down on A4 (cut along the dashes).
  sticker: { width: "63mm", height: "70mm", fontSize: "7.4pt" },
  // A5, two to an A4 sheet.
  flyer: { width: "148mm", height: "205mm", fontSize: "17pt" },
};

/** A QR code image of `value` (the qrcode package, loaded only when a card is shown). */
export function useQrDataUrl(value: string, pixels = 640) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!value) return;
    let alive = true;
    void import("qrcode")
      .then((QR) => QR.toDataURL(value, { margin: 1, width: pixels, errorCorrectionLevel: "M", color: { dark: "#16141F", light: "#FFFFFF" } }))
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, pixels]);
  return src;
}

export interface ShopShareCardProps {
  name: string;
  logoUrl: string | null;
  handle: string;
  shortUrl: string;
  shortHost: string;
  size?: ShopCardSize;
  /** "Follow us on Shopinbos Plug". Off until Plug ships. */
  plug?: boolean;
  /** A QR image already made (the print sheet draws it on the server); otherwise it's drawn here. */
  qrSrc?: string;
  className?: string;
}

export const ShopShareCard = forwardRef<HTMLDivElement, ShopShareCardProps>(function ShopShareCard(
  { name, logoUrl, handle, shortUrl, shortHost, size = "screen", plug = PLUG_LIVE, qrSrc, className },
  ref,
) {
  const t = useT("shopLink");
  const drawn = useQrDataUrl(qrSrc ? "" : shortUrl);
  const qr = qrSrc ?? drawn;
  const initial = name.trim().charAt(0).toUpperCase() || "S";

  return (
    <div
      ref={ref}
      className={`shop-share-card box-border flex flex-col items-center overflow-hidden rounded-[1.1em] border border-[#E4E1EA] bg-white text-center text-[#16141F] ${className ?? ""}`}
      style={{ ...SIZES[size], padding: "1.2em 1.1em 1em", gap: "0.55em", breakInside: "avoid" }}
    >
      <div className="flex min-w-0 max-w-full items-center justify-center" style={{ gap: "0.5em" }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="shrink-0 rounded-[0.4em] object-contain" style={{ width: "2em", height: "2em" }} />
        ) : (
          <span className="grid shrink-0 place-items-center rounded-[0.4em] bg-[#16141F] font-extrabold text-white" style={{ width: "2em", height: "2em", fontSize: "1em" }}>{initial}</span>
        )}
        <span className="min-w-0 truncate font-extrabold" style={{ fontSize: "1.15em" }}>{name}</span>
      </div>
      <div className="font-bold text-[#5B5866]" style={{ fontSize: "0.85em" }}>{plug ? t("card.follow") : t("card.shopWith")}</div>
      <div className="grid place-items-center" style={{ width: "10.5em", height: "10.5em", marginTop: "0.2em" }}>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={t("qr.alt", { name })} className="block h-full w-full" style={{ imageRendering: "pixelated" }} />
        ) : (
          <span className="block h-full w-full rounded-[0.5em] bg-[#F3F1F6]" aria-hidden />
        )}
      </div>
      <div className="font-extrabold tracking-[-0.01em]" style={{ fontSize: "1.45em", lineHeight: 1.1 }}>@{handle}</div>
      <div className="max-w-full truncate font-mono text-[#5B5866]" style={{ fontSize: "0.78em" }}>{shortHost}</div>
      <div className="mt-auto font-bold uppercase text-[#5B5866]" style={{ fontSize: "0.68em", letterSpacing: "0.14em" }}>{plug ? t("card.scanFollow") : t("card.scan")}</div>
    </div>
  );
});
