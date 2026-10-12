"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Mascot } from "@/components/app-ui";

const DISMISS_KEY = "shopinbos-store-not-built-dismissed";

export function StoreNotBuiltGuard() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "true";
    } catch {
      // Storage blocked: show the prompt; dismissing still works for this visit.
    }
    setShow(!dismissed);
  }, []);

  useEffect(() => {
    if (!show) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [show]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {
      // ignore
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-app-ink/45 p-4 font-app text-app-ink backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="store-not-built-title" className="w-full max-w-[460px] rounded-[26px] bg-white px-6 py-7 text-center shadow-[0_24px_60px_-20px_rgba(22,20,31,0.35)]">
        <Mascot name="rex" className="mx-auto h-20 w-20" alt="Rex" />
        <h2 id="store-not-built-title" className="m-0 mt-4 text-[22px] font-extrabold tracking-[-0.4px]">Your store isn&apos;t built yet</h2>
        <p className="mb-0 mt-2 text-[14.5px] leading-[1.55] text-app-ink-soft">
          There&apos;s no logo, products or pages yet. Tell me what you sell and I&apos;ll build it with you, step by step.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/builder" className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-app-accent px-6 text-[15px] font-extrabold text-white no-underline hover:brightness-95">
            Build it with Rex
          </Link>
          <Link href="/builder/templates" className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-app-line bg-white px-6 text-[15px] font-extrabold text-app-ink no-underline hover:border-app-line-strong">
            Choose how your shop looks
          </Link>
        </div>
        <button type="button" onClick={dismiss} className="mt-3 min-h-[40px] px-3 text-[13.5px] font-bold text-app-ink-soft hover:text-app-ink">
          I&apos;ll do it later
        </button>
      </div>
    </div>
  );
}
