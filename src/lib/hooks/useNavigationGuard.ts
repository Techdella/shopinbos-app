"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface NavigationGuardOptions {
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Page/component name for the dialog message */
  pageName?: string;
}

interface NavigationGuardReturn {
  /** Open the confirm dialog */
  showDialog: boolean;
  /** Dialog configuration */
  dialogConfig: {
    title: string;
    message: string;
    variant: "warning" | "danger" | "info";
  };
  /** Proceed with the pending navigation */
  proceed: () => void;
  /** Cancel the pending navigation */
  cancel: () => void;
}

export function useNavigationGuard({ isDirty, pageName = "this page" }: NavigationGuardOptions): NavigationGuardReturn {
  const router = useRouter();
  const [showDialog, setShowDialog] = useState(false);
  const pendingNav = useRef<(() => void) | null>(null);

  // ── Browser-level guard (refresh / close tab) ──
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ── Intercept router.push / router.replace ──
  const guardNavigation = useCallback(
    (navigate: () => void) => {
      if (!isDirty) {
        navigate();
        return;
      }
      pendingNav.current = navigate;
      setShowDialog(true);
    },
    [isDirty],
  );

  const proceed = useCallback(() => {
    setShowDialog(false);
    pendingNav.current?.();
    pendingNav.current = null;
  }, []);

  const cancel = useCallback(() => {
    setShowDialog(false);
    pendingNav.current = null;
  }, []);

  return {
    showDialog,
    dialogConfig: {
      title: "Unsaved changes",
      message: `You have unsaved changes in ${pageName}. Are you sure you want to leave? Your changes will be lost.`,
      variant: "warning",
    },
    proceed,
    cancel,
  };
}
