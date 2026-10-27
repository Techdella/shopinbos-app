"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { PillButton } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { ACTIVITY_PATH } from "@/lib/auth/idle";
import { isSignedInPage } from "@/lib/auth/route-access";
import { signOutOfShopinbos } from "./sign-out";

// Signs a portal tab out after a while with nobody using it (the server enforces the same limit, src/lib/auth/idle.ts).
// Clicks, keys, scrolling and touches in any tab of the app count (shared through localStorage); while there is some,
// a heartbeat at most once a minute keeps the server's "last active" in step. A minute before the end a dialog asks
// "Still there?"; then the tab signs out and opens the login with ?reason=idle, so nothing is left on screen.

const LAST_INPUT_KEY = "shopinbos:last-input";
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
const PING_EVERY_MS = 60_000;
const WARN_MS = 60_000;
/** The server can be up to two minutes behind (ping and cookie both move at most once a minute): finish before it. */
const SERVER_LAG_MS = 2 * 60_000;

function readShared() {
  try {
    return Number(localStorage.getItem(LAST_INPUT_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(at: number) {
  try {
    localStorage.setItem(LAST_INPUT_KEY, String(at));
  } catch {
    // Storage blocked: this tab still keeps its own clock.
  }
}

/** Mounted on every page (ClientLayout); runs only on signed-in portal pages. */
export function IdleSignOut() {
  const pathname = usePathname() ?? "/";
  return isSignedInPage(pathname) ? <IdleWatch /> : null;
}

function IdleWatch() {
  const t = useT("common");
  const titleId = useId();
  const [idleMs, setIdleMs] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastInput = useRef(Date.now());
  const lastPing = useRef(0);
  const signingOut = useRef(false);

  async function ping() {
    lastPing.current = Date.now();
    const response = await fetch(ACTIVITY_PATH, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    if (!response) return; // offline: try again on the next input
    if (response.status === 401) return signOut();
    const body = (await response.json().catch(() => null)) as { data?: { idleMs?: number } } | null;
    const ms = Number(body?.data?.idleMs);
    if (Number.isFinite(ms) && ms >= 0) setIdleMs(ms);
  }

  async function signOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    await signOutOfShopinbos({ reason: "idle" });
  }

  function noteInput() {
    const now = Date.now();
    lastInput.current = now;
    writeShared(now);
    if (now - lastPing.current >= PING_EVERY_MS) void ping();
  }

  useEffect(() => {
    void ping();
    // The page loading is activity; a passive listener per event keeps scrolling smooth.
    lastInput.current = Date.now();
    writeShared(lastInput.current);
    const onInput = () => noteInput();
    for (const name of EVENTS) window.addEventListener(name, onInput, { passive: true, capture: true });
    return () => {
      for (const name of EVENTS) window.removeEventListener(name, onInput, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!idleMs) return;
    const deadline = Math.max(idleMs - SERVER_LAG_MS, idleMs / 2);
    const tick = () => {
      const last = Math.max(lastInput.current, readShared());
      const left = deadline - (Date.now() - last);
      if (left <= 0) {
        setSecondsLeft(0);
        void signOut();
      } else {
        setSecondsLeft(left <= WARN_MS ? Math.ceil(left / 1000) : null);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idleMs]);

  if (secondsLeft === null || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/40 p-0 font-app text-app-ink sm:items-center sm:p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="w-full rounded-t-[22px] bg-white px-5 pb-6 pt-5 shadow-[0_30px_60px_-30px_rgba(22,20,31,0.5)] sm:max-w-[420px] sm:rounded-[22px] sm:p-6">
        <h2 id={titleId} className="m-0 text-[20px] font-extrabold tracking-[-0.3px]">{t("idle.title")}</h2>
        <p className="mb-0 mt-2 text-[14.5px] leading-[1.55] text-app-ink-soft" aria-live="polite">
          {t("idle.body", { seconds: String(secondsLeft) })}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <PillButton tone="white" size="md" onClick={() => void signOut()}>{t("idle.signOut")}</PillButton>
          <PillButton size="md" autoFocus onClick={() => { lastPing.current = 0; noteInput(); setSecondsLeft(null); }}>{t("idle.stay")}</PillButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
