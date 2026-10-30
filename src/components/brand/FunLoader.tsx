"use client";

import { useEffect, useState } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { useT } from "@/components/i18n/I18nProvider";
import { cx } from "@/components/app-ui/cx";
import { FUN_LOADING_STEP_MS, funLoadingIndex, funLoadingKeys, type FunLoadingKind } from "@shared/fun-loading";

// While Rex works on a logo, a video, a picture or a connection: Rex at work, a friendly line that changes every
// few seconds ("Rex is cooking your logo…", "Wait small…") and three bouncing dots. Lines in shared/fun-loading.ts;
// the phone app's twin is apps/mobile/src/components/FunLoader.tsx.

export function FunLoader({ kind = "general", size = "md", className }: { kind?: FunLoadingKind; size?: "sm" | "md"; className?: string }) {
  const t = useT("common");
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTicks((value) => value + 1), FUN_LOADING_STEP_MS);
    return () => window.clearInterval(timer);
  }, []);
  const keys = funLoadingKeys(kind);
  const line = t(keys[funLoadingIndex(kind, ticks)] as Parameters<typeof t>[0]);
  const small = size === "sm";
  return (
    <div role="status" aria-live="polite" className={cx("flex items-center gap-3", small ? "" : "rounded-[20px] border border-app-line bg-white p-4", className)}>
      <Mascot who="rex" mood="working" size={small ? 40 : 56} decorative />
      <div className="min-w-0">
        <p key={line} className={cx("fun-line m-0 font-bold text-app-ink", small ? "text-[14px]" : "text-[15.5px]")}>{line}</p>
        <span aria-hidden className="mt-1.5 flex gap-1">
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="fun-dot h-1.5 w-1.5 rounded-full bg-app-forest" style={{ animationDelay: `${dot * 0.15}s` }} />
          ))}
        </span>
      </div>
    </div>
  );
}
