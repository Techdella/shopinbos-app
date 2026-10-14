"use client";

import { useEffect, useRef, useState } from "react";
import { DeviceToggle } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { useT } from "@/components/i18n/I18nProvider";

// Emails drawn in a sandboxed iframe (no scripts, no same-origin): the full-size preview with a computer/phone
// switch, and the scaled-down thumbnail the template gallery uses. Both show the real HTML the email will have.

export function EmailFrame({ html, device, className, title }: { html: string; device: "desktop" | "mobile"; className?: string; title?: string }) {
  const t = useT("emailBuilder");
  return (
    <div className={cx("overflow-hidden rounded-[18px] border border-app-line bg-app-canvas", className)}>
      <iframe title={title ?? t("preview.title")} sandbox="" srcDoc={html} className={cx("mx-auto block h-[640px] border-0 bg-white transition-all", device === "mobile" ? "w-[375px] max-w-full" : "w-full")} />
    </div>
  );
}

export function DeviceSwitch({ value, onChange }: { value: "desktop" | "mobile"; onChange: (value: "desktop" | "mobile") => void }) {
  return <DeviceToggle value={value} onChange={onChange} />;
}

/**
 * The email at 600px wide, scaled to fit its box (4:5 unless a ratio is given). The HTML is only loaded once the card scrolls into view,
 * so a gallery of twenty templates doesn't build twenty documents up front.
 */
export function EmailThumbnail({ html, label, className, ratio = 1.25 }: { html: string; label: string; className?: string; /** Height ÷ width of the box (1.25 = 4:5). */ ratio?: number }) {
  const t = useT("emailBuilder");
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const resize = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 600));
    resize.observe(node);
    const seen = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        seen.disconnect();
      }
    }, { rootMargin: "200px" });
    seen.observe(node);
    return () => {
      resize.disconnect();
      seen.disconnect();
    };
  }, []);

  return (
    <div ref={box} aria-label={t("preview.of", { label })} role="img" className={cx("relative w-full overflow-hidden bg-app-canvas", className)} style={{ aspectRatio: `1 / ${ratio}` }}>
      {visible && scale > 0 ? (
        <iframe
          title={t("preview.thumbnail", { label })}
          sandbox=""
          srcDoc={html}
          tabIndex={-1}
          aria-hidden
          loading="lazy"
          scrolling="no"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white"
          style={{ width: 600, height: Math.ceil(600 * ratio), transform: `scale(${scale})` }}
        />
      ) : null}
    </div>
  );
}
