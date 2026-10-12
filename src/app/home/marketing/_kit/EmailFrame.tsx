"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { DeviceToggle } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";

// Emails drawn in a sandboxed iframe (no scripts): the full-size preview with a computer/phone switch, and the
// scaled-down thumbnail the template gallery uses. Both show the real HTML the email will have.

/** Where a clicked link in the preview would go, or null when it hasn't been set yet. */
function linkTarget(href: string | null) {
  const value = (href ?? "").trim();
  if (!value || value === "#" || value.includes("{{") || /^javascript:/i.test(value) || /example\.(com|org)/i.test(value)) return null;
  if (/^mailto:/i.test(value)) return value.slice(7).split("?")[0] || null;
  try {
    const url = new URL(value);
    return url.host + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return null;
  }
}

export function EmailFrame({ html, device, className, title = "Email preview" }: { html: string; device: "desktop" | "mobile"; className?: string; title?: string }) {
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Clicking a button in the preview would load that site inside the frame, and most sites refuse to be framed
  // ("This content is blocked"). Links stay put instead, with a short note about where the button goes.
  // allow-same-origin (without allow-scripts) lets us listen for those clicks; the email itself still can't run code.
  function onLoad(event: SyntheticEvent<HTMLIFrameElement>) {
    const doc = event.currentTarget.contentDocument;
    if (!doc) return;
    doc.addEventListener("click", (click) => {
      const link = (click.target as Element | null)?.closest?.("a");
      if (!link) return;
      click.preventDefault();
      const target = linkTarget(link.getAttribute("href"));
      setNote(target ? `This button opens ${target} in the sent email. Links don't open in previews.` : "Add your link first, then this button will take customers there.");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setNote(null), 4000);
    });
    doc.addEventListener("submit", (submit) => submit.preventDefault());
  }

  return (
    <div className={cx("relative overflow-hidden rounded-[18px] border border-app-line bg-app-canvas", className)}>
      <iframe title={title} sandbox="allow-same-origin" srcDoc={html} onLoad={onLoad} className={cx("mx-auto block h-[640px] border-0 bg-white transition-all", device === "mobile" ? "w-[375px] max-w-full" : "w-full")} />
      <div aria-live="polite" className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
        {note ? <p className="m-0 max-w-[460px] rounded-full bg-app-ink px-4 py-2 text-center text-[13px] font-semibold text-white shadow-lg">{note}</p> : null}
      </div>
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
    <div ref={box} aria-label={`Preview of ${label}`} role="img" className={cx("relative w-full overflow-hidden bg-app-canvas", className)} style={{ aspectRatio: `1 / ${ratio}` }}>
      {visible && scale > 0 ? (
        <iframe
          title={`${label} thumbnail`}
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
