"use client";

import { AppFrame } from "@/components/shell/AppFrame";
import { ErrorSceneFor, NotFoundScene, PORTALS, type PortalKey } from "./AppErrorPages";

// Kept apart from AppErrorPages so the site-wide pages (and global-error) don't pull in the app frame.

/** A portal's 404 or error, inside its app frame so the sidebar stays put (admin has no frame, like its pages). */
export function PortalNotFound({ portal }: { portal: PortalKey }) {
  if (portal === "admin") return <NotFoundScene portal="admin" />;
  return (
    <AppFrame role={portal} chipMode="rail" searchPlaceholder={PORTALS[portal].search}>
      <NotFoundScene portal={portal} embedded />
    </AppFrame>
  );
}

export function PortalError({ portal, error, retry }: { portal: PortalKey; error: Error & { digest?: string }; retry: () => void }) {
  if (portal === "admin") return <ErrorSceneFor portal="admin" error={error} retry={retry} />;
  return (
    <AppFrame role={portal} chipMode="rail" searchPlaceholder={PORTALS[portal].search}>
      <ErrorSceneFor portal={portal} error={error} retry={retry} embedded />
    </AppFrame>
  );
}
