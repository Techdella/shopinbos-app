"use client";

import { useEffect, useState } from "react";
import { acceptCountdown } from "@shared/supplier-pickup";

// "Accept in 2h 14m", ticking. In the last 30 minutes it turns amber with "Accept soon or the shop will be told"
// (shared/supplier-pickup.ts has the words). Server-rendered with the same text, so nothing jumps on load.

export function AcceptCountdown({ acceptBy, big = false, now: initialNow }: { acceptBy: string | null; big?: boolean; now?: number }) {
  const [now, setNow] = useState(initialNow ?? Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const countdown = acceptCountdown(acceptBy, now);
  if (!countdown) return null;
  const tone = countdown.soon ? "bg-[#FDF0D9] text-[#7A4D06] border-[#F2A93B]" : "bg-app-canvas text-app-ink border-app-line";
  return (
    <div className="grid gap-1" role="timer" aria-live="polite">
      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 font-extrabold ${big ? "min-h-[40px] text-[16px]" : "min-h-[30px] text-[13.5px]"} ${tone}`}>
        <svg aria-hidden="true" width={big ? 18 : 15} height={big ? 18 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></svg>
        {countdown.text}
      </span>
      {countdown.warning && <span className={`font-bold text-[#7A4D06] ${big ? "text-[14.5px]" : "text-[12.5px]"}`}>{countdown.warning}</span>}
    </div>
  );
}
