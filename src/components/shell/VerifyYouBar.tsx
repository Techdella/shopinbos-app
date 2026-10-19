"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShellCounts } from "./useShellCounts";

// "Let's verify you": a strip under the seller's top bar until their ID passes the Shopinbos Wallet check (NIN or
// BVN). Optional for sellers: "Later" hides it for a few days on this browser. Suppliers and delivery partners get
// the business-verification strip instead (AnnouncementBanner), which can't be hidden.

const HIDE_KEY = "shopinbos:verify-bar-hidden-until";
const HIDE_DAYS = 3;

export function VerifyYouBar() {
  const counts = useShellCounts();
  const pathname = usePathname();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(Number(window.localStorage.getItem(HIDE_KEY) ?? 0) > Date.now());
    } catch {
      setHidden(false);
    }
  }, []);

  const check = counts?.idCheck;
  if (!check || check.verified || !check.checksReady || hidden || pathname?.startsWith("/home/wallet")) return null;

  function later() {
    setHidden(true);
    try {
      window.localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 24 * 60 * 60_000));
    } catch {
      // Private mode: it just comes back on the next page.
    }
  }

  return (
    <div role="region" aria-label="Verify your ID" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-app-line bg-app-mint px-4 py-2.5 text-[13.5px]">
      <span className="text-center">
        <strong>Let&apos;s verify you.</strong> Check your NIN or BVN in a minute so customers can pay you by card, straight to your bank.
      </span>
      <span className="flex items-center gap-2">
        <Link href="/home/wallet" className="inline-flex min-h-[32px] items-center rounded-full bg-app-ink px-3.5 text-[13px] font-extrabold text-white">Verify now</Link>
        <button type="button" onClick={later} className="min-h-[32px] rounded-full px-2 text-[13px] font-bold text-app-ink-soft hover:text-app-ink">Later</button>
      </span>
    </div>
  );
}
