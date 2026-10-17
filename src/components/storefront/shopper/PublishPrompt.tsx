"use client";

import { useEffect, useState } from "react";

// On the owner's preview of a store that isn't live: a small card asking them to publish it. "Not now" hides it
// for this visit (session storage), so browsing the preview stays easy.

const DISMISS_KEY = "sib-publish-prompt-dismissed";

export function PublishPrompt({ href }: { href: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Private mode: show it.
    }
    if (dismissed) return;
    const timer = window.setTimeout(() => setShow(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to remember.
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="publish-prompt-title"
      className="fixed inset-x-3 bottom-3 z-[1001] mx-auto max-w-[420px] rounded-[20px] bg-[#0E2A38] p-4 font-app text-[#F4F1EA] shadow-[0_20px_40px_-16px_rgba(14,42,56,0.55)] sm:bottom-5"
      style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      <p id="publish-prompt-title" className="m-0 text-[16px] font-bold leading-snug">Your store isn&apos;t live yet</p>
      <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-[#F4F1EA]/80">
        This is a preview only you can see. Publish it so customers can find your store and buy.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={href}
          className="inline-flex min-h-[44px] items-center rounded-full bg-[#73D8C8] px-5 text-[14px] font-bold text-[#0E2A38] no-underline hover:bg-[#B5EBE2]"
        >
          Publish your store
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex min-h-[44px] items-center rounded-full px-4 text-[14px] font-semibold text-[#F4F1EA]/85 hover:text-[#F4F1EA]"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
