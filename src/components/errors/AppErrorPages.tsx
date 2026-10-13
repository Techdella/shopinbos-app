"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_ERROR_LINES, APP_GLOBAL_ERROR_LINES, APP_NOT_FOUND_LINES, APP_UPDATE_LINES } from "./copy";
import { APP_PALETTE, ErrorScene, type SceneAction, type SceneLabels } from "./ErrorScene";
import { useT } from "@/components/i18n/I18nProvider";
import { isLocale, LOCALE_COOKIE, type Locale } from "@shared/i18n";
import { tFor } from "@shared/i18n/catalog";
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

// ─── Words in the person's language ("errors" catalog) ────────────────────────

function cookieLocale(): Locale {
  try {
    const value = document.cookie.split("; ").find((part) => part.startsWith(`${LOCALE_COOKIE}=`))?.slice(LOCALE_COOKIE.length + 1);
    return isLocale(value) ? value : "en";
  } catch {
    return "en";
  }
}

/**
 * The "errors" words. global-error replaces the root layout, so the language provider (and its messages) may be
 * missing: then the words come straight from the catalog in the language cookie (English on the first paint).
 */
function useErrorsT() {
  const provided = useT("errors", "common");
  const [fallbackLocale, setFallbackLocale] = useState<Locale>("en");
  const missing = !provided.has("goHome");
  useEffect(() => {
    if (missing) setFallbackLocale(cookieLocale());
  }, [missing]);
  return useMemo(() => (missing ? tFor(fallbackLocale, "errors", "common") : provided), [missing, fallbackLocale, provided]);
}

type ErrorsT = ReturnType<typeof useErrorsT>;

function sceneLabels(t: ErrorsT): SceneLabels {
  return {
    another: t("scene.another"),
    ref: (short) => t("scene.ref", { ref: short }),
    copy: t("scene.copy"),
    copied: t("scene.copied"),
    copyRef: t("scene.copyRef"),
    refCopied: t("scene.refCopied"),
  };
}

/** A copy.ts pool in the person's language (same order as the "quip.<pool>.<n>" keys). */
function quips(t: ErrorsT, pool: "notFound" | "error" | "global" | "update", lines: readonly string[]) {
  return lines.map((line, index) => t.dynamic(`quip.${pool}.${index + 1}`, line));
}

/** Portal name, way home and search hint; admin screens stay English. */
function portalWords(t: ErrorsT, portal: PortalKey | undefined) {
  if (!portal) return null;
  const config = PORTALS[portal];
  if (portal === "admin") return { label: config.label, homeLabel: config.homeLabel, search: config.search };
  return { label: t(`portal.${portal}` as const), homeLabel: t(`home.${portal}` as const), search: t(`search.${portal}` as const) };
}

/** The search hint for a portal's app frame, in the person's language. */
export function usePortalSearchHint(portal: PortalKey) {
  return portalWords(useErrorsT(), portal)?.search ?? PORTALS[portal].search;
}

function useBack(fallback: string) {
  const router = useRouter();
  return () => {
    if (window.history.length > 1) router.back();
    else router.push(fallback);
  };
}

export function NotFoundScene({ portal, embedded }: { portal?: PortalKey; embedded?: boolean }) {
  const config = portal ? PORTALS[portal] : null;
  const t = useErrorsT();
  const words = portalWords(t, portal);
  const home = config?.home ?? "/";
  const back = useBack(home);
  const actions: SceneAction[] = [
    { label: words?.homeLabel ?? t("goHome"), href: home, icon: "home", primary: true },
    { label: t("goBack"), onClick: back, icon: "arrowLeft" },
  ];
  if (!config || config.peggy) actions.push({ label: t("askPeggy"), href: "/home/peggy", icon: "sparkle" });
  return (
    <ErrorScene
      embedded={embedded}
      sceneAccent={config?.accent ?? "#73D8C8"}
      eyebrow={words ? t("notFound.eyebrowPortal", { portal: words.label }) : t("notFound.eyebrow")}
      title={t("notFound.title")}
      lines={quips(t, "notFound", APP_NOT_FOUND_LINES)}
      body={t("notFound.body")}
      labels={sceneLabels(t)}
      actions={actions}
      illustration={<PeggySearchingScene />}
      backdrop="404"
    />
  );
}

export function ErrorSceneFor({ error, retry, portal, embedded, global = false }: { error: Error & { digest?: string }; retry: () => void; portal?: PortalKey; embedded?: boolean; global?: boolean }) {
  const config = portal ? PORTALS[portal] : null;
  const t = useErrorsT();
  const words = portalWords(t, portal);
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
        eyebrow={t("update.eyebrow")}
        // "Shopinbos just got an update — reloading…" in English (errors catalog).
        title={t("update.title")}
        lines={quips(t, "update", APP_UPDATE_LINES)}
        body={t("update.body")}
        labels={sceneLabels(t)}
        actions={[{ label: t("reloadNow"), onClick: reloadPage, icon: "refresh", primary: true }]}
        illustration={<RexFixingScene />}
      />
    );
  }

  // Still stale after the one automatic reload: "Try again" reloads the page, since re-rendering can't fetch
  // a build that's gone.
  const actions: SceneAction[] = [
    { label: t("tryAgain"), onClick: stale ? reloadPage : retry, icon: "refresh", primary: true },
    // global-error replaces the root layout, so leave with a full page load.
    { label: words?.homeLabel ?? t("goHome"), href: homeHref, icon: "home", external: global },
  ];
  if (!config || config.peggy) actions.push({ label: t("askPeggy"), href: "/home/peggy", icon: "sparkle", external: global });
  return (
    <ErrorScene
      embedded={embedded}
      palette={{ ...APP_PALETTE, warm: "#E86A4F" }}
      sceneAccent={sceneAccent}
      eyebrow={words ? t("error.eyebrowPortal", { portal: words.label }) : t("error.eyebrow")}
      title={t("error.title")}
      lines={global ? quips(t, "global", APP_GLOBAL_ERROR_LINES) : quips(t, "error", APP_ERROR_LINES)}
      body={t("error.body")}
      labels={sceneLabels(t)}
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

/** global-error's <title>, in the person's language. */
export function GlobalErrorTitle() {
  const t = useErrorsT();
  return <title>{`${t("error.pageTitle")} | Shopinbos`}</title>;
}

/** When the root layout itself failed (app/global-error.tsx): Rex is fixing, Peggy is looking. */
export function GlobalAppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorSceneFor error={error} retry={retry} global />;
}
