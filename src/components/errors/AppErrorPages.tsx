"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_ERROR_LINES, APP_NOT_FOUND_LINES } from "./copy";
import { APP_PALETTE, ErrorScene, type SceneAction } from "./ErrorScene";
import { OkadaScene, RexRepairScene } from "./Illustrations";

// The app's own 404 and error pages: site-wide, and one per portal (seller, supplier, logistics, admin)
// with that portal's way home and accent (PortalErrorPages wraps those in the app frame).

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
      illustration={<OkadaScene />}
      backdrop="404"
    />
  );
}

export function ErrorSceneFor({ error, retry, portal, embedded }: { error: Error & { digest?: string }; retry: () => void; portal?: PortalKey; embedded?: boolean }) {
  const config = portal ? PORTALS[portal] : null;
  useEffect(() => {
    console.error(error);
  }, [error]);
  const actions: SceneAction[] = [
    { label: "Try again", onClick: retry, icon: "refresh", primary: true },
    { label: config?.homeLabel ?? "Go home", href: config?.home ?? "/", icon: "home" },
  ];
  if (!config || config.peggy) actions.push({ label: "Ask Peggy", href: "/home/peggy", icon: "sparkle" });
  return (
    <ErrorScene
      embedded={embedded}
      palette={{ ...APP_PALETTE, warm: "#E86A4F" }}
      sceneAccent={config?.accent ?? "#73D8C8"}
      eyebrow={config ? `Error · ${config.label} workspace` : "Error · Something went wrong"}
      title="This page didn't load"
      lines={APP_ERROR_LINES}
      body={
        <>
          Something on our side failed while loading this page. Your data is safe. Try again in a moment; if it keeps happening, send us the reference below so we can find it fast.
        </>
      }
      actions={actions}
      digest={error.digest}
      illustration={<RexRepairScene />}
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
