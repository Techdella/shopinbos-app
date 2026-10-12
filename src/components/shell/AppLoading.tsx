"use client";

import { useEffect, useState } from "react";
import { Mascot } from "@/components/app-ui";
import type { Role } from "@/lib/nav";
import { cachedIdentity } from "./useShellCounts";

// Loading screen for every signed-in page (prototype "Web app loading"): the shell drawn as soft skeletons,
// an orange progress line under the top bar, and a mint card that says what's being opened. After 8 seconds,
// or straight away when the browser is offline, it says so and offers to try again.

const STEPS: Record<Role, string[]> = {
  seller: ["Checking new orders", "Getting your brief ready", "Almost there"],
  supplier: ["Checking new orders", "Getting your quote requests", "Almost there"],
  logistics_partner: ["Checking new jobs", "Seeing which riders are out", "Almost there"],
  admin: ["Checking the review queues", "Almost there"],
};

const FALLBACK_NAME: Record<Role, string> = {
  seller: "your shop",
  supplier: "your business",
  logistics_partner: "your company",
  admin: "the admin console",
};

const HOME: Record<Role, string> = { seller: "/home", supplier: "/supplier/dashboard", logistics_partner: "/logistics/dashboard", admin: "/admin/dashboard" };

const SLOW_AFTER_MS = 8000;

function Bar({ className = "", tone = "line" }: { className?: string; tone?: "line" | "mint" }) {
  return <span aria-hidden className={`block rounded-full ${tone === "mint" ? "bg-[#BFE8DE]" : "bg-[#E8E6F0]"} ${className}`} />;
}

const CHART = [42, 58, 36, 70, 52, 64, 46, 82, 62, 72, 56];

export function AppLoading({ role = "seller" }: { role?: Role }) {
  const [name, setName] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(false);
  const [offline, setOffline] = useState(false);
  const steps = STEPS[role];

  useEffect(() => {
    setName(cachedIdentity().businessName ?? null);
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stepper = reduce ? undefined : window.setInterval(() => setStep((current) => Math.min(current + 1, steps.length - 1)), 1600);
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      window.location.reload();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.clearInterval(stepper);
      window.clearTimeout(timer);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [steps.length]);

  const opening = `Opening ${name || FALLBACK_NAME[role]}`;
  const stuck = slow || offline;

  return (
    <div className="app-scope flex h-dvh w-full overflow-hidden bg-app-canvas font-app text-app-ink" role="status" aria-live="polite" aria-busy={!stuck}>
      <span className="sr-only">{stuck ? (offline ? "You're offline." : "This is taking longer than usual.") : `${opening}…`}</span>

      {/* Menu */}
      <aside aria-hidden className="hidden w-[244px] shrink-0 flex-col border-r border-app-line bg-white px-3.5 pb-4 pt-5 lg:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/app/wordmark-dark.png" alt="" className="mb-5 ml-2.5 block h-auto w-[150px]" />
        <div className="mb-5 flex h-[52px] items-center gap-2.5 rounded-[14px] border border-app-line px-3">
          <span className="h-8 w-8 rounded-[10px] bg-[#E8E6F0]" />
          <Bar className="h-2.5 w-[110px]" />
        </div>
        {[[56, 72, 46, 64], [62, 54], [72, 84, 60]].map((group, groupIndex) => (
          <div key={groupIndex} className="mb-5 grid gap-[18px] px-2.5">
            {groupIndex > 0 && <Bar className="h-2 w-[70px]" />}
            {group.map((width, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="h-5 w-5 rounded-[6px] bg-[#E8E6F0]" />
                <span className="block h-2.5 rounded-full bg-[#E8E6F0]" style={{ width }} />
              </div>
            ))}
          </div>
        ))}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar with the progress line */}
        <header className="relative flex h-16 shrink-0 items-center gap-4 border-b border-app-line bg-white px-4 sm:px-7">
          <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] overflow-hidden">
            <span className={`app-loading-line block h-full w-1/3 rounded-full bg-app-accent ${stuck ? "opacity-0" : ""}`} />
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/app/wordmark-dark.png" alt="" className="block h-auto w-[120px] lg:hidden" />
          <Bar className="hidden h-3 w-[120px] lg:block" />
          <span aria-hidden className="hidden h-10 max-w-[340px] flex-1 rounded-full bg-[#ECEAF2] md:block" />
          <div className="ml-auto flex items-center gap-3">
            {role === "seller" && (
              <span className="hidden h-[42px] items-center gap-2 rounded-full bg-app-mint pl-1.5 pr-4 text-[14px] font-extrabold text-app-forest sm:flex">
                <Mascot name="peggy" className="h-8 w-8" alt="" /> Ask Peggy
              </span>
            )}
            <span aria-hidden className="h-[42px] w-[42px] rounded-full bg-[#ECEAF2]" />
            <span aria-hidden className="h-[42px] w-[42px] rounded-full bg-[#ECEAF2]" />
          </div>
        </header>

        <div className="flex-1 overflow-hidden px-4 py-6 sm:px-7">
          {stuck ? (
            <div className="mx-auto mt-6 grid max-w-[520px] justify-items-center gap-4 text-center">
              {offline && (
                <p className="m-0 w-full rounded-[14px] bg-[#FFF3DC] px-4 py-3 text-left text-[14px] font-bold text-[#8A5A00]">
                  You’re offline. Check your Wi-Fi or data and this page will open when you’re back.
                </p>
              )}
              <Mascot name={role === "seller" ? "peggy" : "rex"} mood="oops" className="h-20 w-20" alt="" />
              <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.02em]">{offline ? "You’re offline" : "Your network is slow"}</h1>
              <p className="m-0 text-[15px] leading-[1.6] text-app-ink-soft">
                {offline
                  ? "Nothing is lost. Anything you already saved is safe on Shopinbos."
                  : "We’re still trying to open this page. It usually comes through in a few more seconds."}
              </p>
              <div className="mt-2 grid w-full gap-2.5 sm:w-auto sm:grid-flow-col">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-app-ink px-6 text-[15px] font-extrabold text-white hover:brightness-110"
                >
                  Try again
                </button>
                <a href={HOME[role]} className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-app-line bg-white px-6 text-[15px] font-extrabold text-app-ink no-underline hover:border-app-line-strong">
                  Go to your home page
                </a>
              </div>
            </div>
          ) : (
            <div aria-hidden className="grid gap-5">
              <div className="grid gap-3">
                <Bar className="h-3 w-[180px]" />
                <span className="block h-9 w-full max-w-[360px] rounded-[14px] bg-[#E8E6F0]" />
              </div>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {[120, 60, 90, 50].map((width, index) => (
                  <div key={index} className="grid gap-3 rounded-[22px] border border-app-line bg-white p-5">
                    <Bar className="h-2.5 w-[80px]" />
                    <span className="block h-7 rounded-[10px] bg-[#E8E6F0]" style={{ width }} />
                  </div>
                ))}
              </div>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,375px)]">
                <div className="rounded-[22px] border border-app-line bg-white p-5">
                  <div className="mb-6 flex items-center justify-between gap-4">
                    <Bar className="h-2.5 w-[140px]" />
                    <span className="hidden h-8 w-[180px] rounded-full bg-[#E8E6F0] sm:block" />
                  </div>
                  <div className="flex h-[200px] items-end gap-2 sm:gap-3">
                    {CHART.map((height, index) => (
                      <span
                        key={index}
                        className={`app-loading-pulse block flex-1 rounded-[10px] ${index === CHART.length - 1 ? "bg-app-peach" : "bg-[#E8E6F0]"} ${index > 6 && index < CHART.length - 1 ? "hidden sm:block" : ""}`}
                        style={{ height: `${height}%`, animationDelay: `${index * 90}ms` }}
                      />
                    ))}
                  </div>
                </div>
                <div className="rounded-[22px] bg-app-mint p-5">
                  <div className="mb-5 flex items-center gap-2.5">
                    <Mascot name={role === "seller" ? "peggy" : "rex"} mood="working" className="h-8 w-8" alt="" />
                    <span className="min-w-0 truncate text-[15px] font-bold text-app-forest">{opening}</span>
                  </div>
                  <p className="m-0 mb-4 min-h-[20px] text-[13.5px] font-semibold text-app-forest/80">{steps[step]}…</p>
                  <div className="grid gap-4">
                    {[0, 1, 2].map((row) => (
                      <div key={row} className="flex items-center gap-3">
                        <span className="h-11 w-11 shrink-0 rounded-[12px] bg-[#BFE8DE]" />
                        <div className="grid flex-1 gap-2">
                          <Bar tone="mint" className="h-2.5 w-[88%]" />
                          <Bar tone="mint" className="h-2.5 w-[55%]" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
