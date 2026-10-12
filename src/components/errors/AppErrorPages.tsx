"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_ERROR_LINES, APP_GLOBAL_ERROR_LINES, APP_NOT_FOUND_LINES, APP_UPDATE_LINES } from "./copy";
import { APP_PALETTE, ErrorScene, type SceneAction } from "./ErrorScene";
import { PeggySearchingScene, RexAndPeggyScene, RexFixingScene } from "./MascotScenes";
import { reloadPage, useDeployRecovery } from "./useDeployRecovery";

// The app's own 404 and error pages: site-wide, and one per portal (seller, supplier, logistics, admin)
// with that portal's way home and accent (PortalErrorPages wraps those in the app frame). Peggy searches on
// 404s, Rex fixes on errors, and both turn up when the whole app falls over (global-error). An error caused by
// a new deployment (old chunks or server actions gone) reloads the page once instead of showing the error.

export type PortalKey = "seller" | "supplier" | "logistics_partner" | "admin";

export const PORTALS: Record<PortalKey, { label: string; home: string; homeLabel: string; accent: string; search: string; peggy: boolean }> = {
  seller: { label: "Seller", home: "/home", homeLabel: "Go to my dashboard", accent: "#73D8C8", search: "Search products, orders, suppliers...", peggy: true },
  supplier: { label: "Supplier", home: "/supplier", homeLabel: "Go to supplier home", accent: "#2E7E78", search: "Search products, orders, buyers...", peggy: false },
  logistics_partner: { label: "Logistics", home: "/logistics", homeLabel: "Go to logistics home", accent: "#F2A93B", search: "Search bookings, sellers, couriers...", peggy: false },
  admin: { label: "Admin", home: "/admin/dashboard", homeLabel: "Go to admin dashboard", accent: "#6B4F8A", search: "Search...", peggy: false },
};

function useBack(fallback: string) {
  const router = useRouter();
  return () => {
    if (window.history.length > 1) router.back();
    else router.push(fallback);
  };
}

export function NotFoundScene({ portal, embedded }: { portal?: PortalKey; embedded?: boolean }) {
  const config = portal ? PORTALS[portal] : null;
  const home = config?.home ?? "/";
  const back = useBack(home);
  const actions: SceneAction[] = [
    { label: config?.homeLabel ?? "Go home", href: home, icon: "home", primary: true },
    { label: "Go back", onClick: back, icon: "arrowLeft" },
  ];
  if (!config || config.peggy) actions.push({ label: "Ask Peggy", href: "/home/peggy", icon: "sparkle" });
  return (
    <ErrorScene
      embedded={embedded}
      sceneAccent={config?.accent ?? "#73D8C8"}
      eyebrow={config ? `404 · ${config.label} workspace` : "404 · Page not found"}
      title="We couldn't find that page"
      lines={APP_NOT_FOUND_LINES}
      body="The link may be old or mistyped, or the page has moved. Nothing is lost: your store, orders and money are exactly where you left them."
      actions={actions}
      illustration={<PeggySearchingScene />}
      backdrop="404"
    />
  );
}

export function ErrorSceneFor({ error, retry, portal, embedded, global = false }: { error: Error & { digest?: string }; retry: () => void; portal?: PortalKey; embedded?: boolean; global?: boolean }) {
  const config = portal ? PORTALS[portal] : null;
  const { reloading, stale } = useDeployRecovery(error);
  useEffect(() => {
    console.error(error);
  }, [error]);
  const sceneAccent = config?.accent ?? "#73D8C8";
  const homeHref = config?.home ?? "/";

  if (reloading) {
    return (
      <ErrorScene
        embedded={embedded}
        sceneAccent={sceneAccent}
        eyebrow="Update · New version"
        title="Shopinbos just got an update — reloading…"
        lines={APP_UPDATE_LINES}
        body="We shipped something new while this tab was open. Fetching the fresh version now; your work is safe."
        actions={[{ label: "Reload now", onClick: reloadPage, icon: "refresh", primary: true }]}
        illustration={<RexFixingScene />}
      />
    );
  }

  // Still stale after the one automatic reload: "Try again" reloads the page, since re-rendering can't fetch
  // a build that's gone.
  const actions: SceneAction[] = [
    { label: "Try again", onClick: stale ? reloadPage : retry, icon: "refresh", primary: true },
    // global-error replaces the root layout, so leave with a full page load.
    { label: config?.homeLabel ?? "Go home", href: homeHref, icon: "home", external: global },
  ];
  if (!config || config.peggy) actions.push({ label: "Ask Peggy", href: "/home/peggy", icon: "sparkle", external: global });
  return (
    <ErrorScene
      embedded={embedded}
      palette={{ ...APP_PALETTE, warm: "#E86A4F" }}
      sceneAccent={sceneAccent}
      eyebrow={config ? `Error · ${config.label} workspace` : "Error · Something went wrong"}
      title="This page didn't load"
      lines={global ? APP_GLOBAL_ERROR_LINES : APP_ERROR_LINES}
      body={
        <>
          Something on our side failed while loading this page. Your data is safe. Try again in a moment; if it keeps happening, send us the reference below so we can find it fast.
        </>
      }
      actions={actions}
      digest={error.digest}
      illustration={global ? <RexAndPeggyScene /> : <RexFixingScene />}
    />
  );
}

/** Site-wide 404 (app/not-found.tsx). */
export function AppNotFound() {
  return <NotFoundScene />;
}

/** Site-wide error boundary (app/error.tsx). */
export function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorSceneFor error={error} retry={retry} />;
}

/** When the root layout itself failed (app/global-error.tsx): Rex is fixing, Peggy is looking. */
export function GlobalAppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorSceneFor error={error} retry={retry} global />;
}
