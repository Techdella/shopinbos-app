"use client";

import { useEffect, useRef } from "react";

// Loads the real widget script into this page, exactly as it runs on another site.
export function WidgetPreview({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || host.shadowRoot) return;
    const script = document.createElement("script");
    // Same-origin path so the app's content security policy allows it.
    script.src = new URL(src).pathname;
    script.async = true;
    host.after(script);
    return () => script.remove();
  }, [src]);
  return <div ref={ref} data-shopinbos-reviews="" className="min-h-[120px]" />;
}
