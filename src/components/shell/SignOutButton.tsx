"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SignOutDialog } from "@/components/auth/SignOutDialog";
import { portalLoginPath, portalRoleFromPath } from "@/lib/portal-routes";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * If someone presses Back after logging out and the browser restores this page from its back/forward cache,
 * leave for the login page instead of showing the old dashboard. (Portal pages are also sent no-store.)
 */
function useLeaveIfSignedOutOnRestore() {
  useEffect(() => {
    async function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      const { data } = (await getSupabaseBrowserClient()?.auth.getSession()) ?? { data: { session: null } };
      if (!data.session) window.location.replace(portalLoginPath(portalRoleFromPath(window.location.pathname)));
    }
    const listener = (event: PageTransitionEvent) => void onPageShow(event);
    window.addEventListener("pageshow", listener);
    return () => window.removeEventListener("pageshow", listener);
  }, []);
}

/** Every "Log out" in the portals goes through here, so each one asks first. */
export function SignOutButton({ label = "Sign out", iconSize = 14, variant = "full", className, beforeSignOut }: {
  label?: string;
  iconSize?: number;
  variant?: "full" | "icon" | "link";
  className?: string;
  /** Runs after the person confirms, before the session is cleared (e.g. forget local drafts). */
  beforeSignOut?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const close = useCallback(() => setConfirming(false), []);
  useLeaveIfSignedOutOnRestore();

  const dialog = <SignOutDialog open={confirming} onCancel={close} beforeSignOut={beforeSignOut} />;
  const open = () => setConfirming(true);

  if (variant === "icon") {
    return (
      <>
        <button
          type="button"
          onClick={open}
          title={label}
          aria-label={label}
          aria-haspopup="dialog"
          style={{
            width: 30, height: 30, borderRadius: 8, border: "1px solid var(--ink-150)",
            background: "var(--paper)", cursor: "pointer", color: "var(--ink-500)",
            display: "grid", placeItems: "center",
          }}
        >
          <Icon name="logout" size={14} />
        </button>
        {dialog}
      </>
    );
  }

  if (variant === "link") {
    return (
      <>
        <button type="button" onClick={open} aria-haspopup="dialog" className={className}>
          {label}
        </button>
        {dialog}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 10, border: "1px solid var(--danger-bg)",
          background: "var(--paper)", cursor: "pointer", color: "var(--danger)",
          fontFamily: "inherit", fontSize: 12.5, fontWeight: 600,
          transition: "background 0.12s",
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = "var(--danger-bg)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "var(--paper)"}
      >
        <Icon name="logout" size={iconSize} />
        {label}
      </button>
      {dialog}
    </>
  );
}
