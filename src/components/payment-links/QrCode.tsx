"use client";

import { useEffect, useState } from "react";

/** A QR code for a link, drawn in the browser (qrcode package, loaded only when shown). */
export function QrCode({ value, label, size = 168 }: { value: string; label: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import("qrcode")
      .then((QR) => QR.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: "M" }))
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (!src) return <span className="block rounded-[12px] bg-app-canvas" style={{ width: size, height: size }} aria-hidden />;
  return (
    <a href={src} download="qr-code.png" className="inline-block" title={label}>
      <img src={src} alt={label} width={size} height={size} className="rounded-[12px] border border-app-line bg-white" />
    </a>
  );
}
