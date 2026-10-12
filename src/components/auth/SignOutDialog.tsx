"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PillButton, Spinner } from "@/components/app-ui";
import { signOutOfShopinbos } from "./sign-out";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * "Log out of Shopinbos?" confirmation. An alertdialog: focus starts on Cancel (the safe choice), Tab stays
 * inside, Escape or a click outside cancels, and focus goes back to the button that opened it.
 */
export function SignOutDialog({
  open,
  onCancel,
  scope = "local",
  beforeSignOut,
}: {
  open: boolean;
  onCancel: () => void;
  scope?: "local" | "global";
  beforeSignOut?: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const global = scope === "global";

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelButton.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  async function confirm() {
    setBusy(true);
    beforeSignOut?.();
    await signOutOfShopinbos({ scope });
  }

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40 p-0 font-app text-app-ink sm:items-center sm:p-4" onMouseDown={(event) => {
        // Keep the click from reaching menus underneath (they close on outside clicks and would unmount us).
        event.stopPropagation();
        if (!busy) onCancel();
      }}>
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full rounded-t-[22px] bg-white px-5 pb-6 pt-5 shadow-[0_30px_60px_-30px_rgba(22,20,31,0.5)] sm:max-w-[420px] sm:rounded-[22px] sm:p-6"
      >
        <h2 id={titleId} className="m-0 text-[20px] font-extrabold tracking-[-0.3px]">
          {global ? "Log out of all devices?" : "Log out of Shopinbos?"}
        </h2>
        <p id={bodyId} className="mb-0 mt-2 text-[14.5px] leading-[1.55] text-app-ink-soft">
          {global
            ? "This logs you out here and on every phone, tablet and computer signed in to your account. You'll need your code or password to get back in."
            : "You'll need your code or password to get back in."}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <PillButton ref={cancelButton} tone="white" size="md" onClick={onCancel} disabled={busy}>
            Cancel
          </PillButton>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-app-danger px-5 text-[15px] font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? <Spinner /> : global ? "Log out everywhere" : "Log out"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
