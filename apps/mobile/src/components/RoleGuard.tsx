import { useEffect } from "react";
import { router, usePathname, useRootNavigationState } from "expo-router";
import { canVisit, homeFor } from "@/lib/partner-pure";
import { useRole } from "@/lib/role";

/**
 * Keeps each account inside its own part of the app: sellers in the seller tabs and screens, suppliers under
 * /supplier, delivery partners under /logistics. A deep link or a stale screen from another role is replaced
 * by that role's home (or the welcome screen when signed out). The Riders app (/rider) uses its own link.
 */
export function RoleGuard() {
  const pathname = usePathname();
  const ready = Boolean(useRootNavigationState()?.key);
  const { role, signedIn, resolving } = useRole();

  useEffect(() => {
    if (!ready || resolving || canVisit(role, pathname)) return;
    router.replace((signedIn ? homeFor(role) : "/welcome") as never);
  }, [ready, resolving, role, signedIn, pathname]);

  return null;
}
