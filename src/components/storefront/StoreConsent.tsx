"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useStoreBrand } from "@/components/errors/StoreBrandContext";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { readStoredConsent, saveConsent } from "@/lib/storefront/consent-browser";
import { COOKIE_SETTINGS_EVENT, COOKIE_SETTINGS_HASH, bannerText, googleConsentScript, googleConsentState, type ConsentChoice, type StoreConsentConfig } from "@/lib/storefront/consent";
import type { TrackingScript } from "@/lib/storefront/integrations";
import { TAGS_READY_EVENT, setTagState, tagPageView } from "@/lib/storefront/tag-events";

// The seller's tags on a live store page, and the cookie banner in front of them (src/lib/storefront/consent.ts).
//
// With a banner (the default once a store has GA4, Tag Manager, Meta or TikTok): nothing third-party loads until
// the shopper chooses. Accepting Analytics loads GA4 / Tag Manager with Consent Mode v2 set to the choice;
// accepting Marketing loads the pixels. Taking a consent back tells loaded tags (Consent Mode update, fbq consent
// revoke, ttq.revokeConsent) and stops every event from here. "Cookie settings" in the store footer, or any link
// to #cookie-settings, opens the banner again. The banner sits at the bottom of the screen and never blocks the
// page. Without a banner (the seller turned it off) the tags load as soon as the page is ready.
//
// Also: Meta PageView and TikTok page() for page changes the store makes without a full load (product pages,
// /shop filters, the template's own pages), and window.__sibTags for the funnel events (tag-events.ts).

interface Props {
  slug: string;
  scripts: TrackingScript[];
  /** Null: no banner, load everything. */
  config: StoreConsentConfig | null;
  currency: string;
}

type Category = "analytics" | "marketing";

function inject(script: TrackingScript) {
  const id = `sib-tag-${script.id}`;
  if (document.getElementById(id)) return;
  const el = document.createElement("script");
  el.id = id;
  if (script.src) {
    el.src = script.src;
    el.async = true;
  } else {
    el.text = script.inline ?? "";
  }
  document.head.appendChild(el);
}

type TagWindow = Window & { gtag?: (...args: unknown[]) => void; fbq?: (...args: unknown[]) => void; ttq?: Record<string, ((...args: unknown[]) => void) | undefined> };

export function StoreConsent({ slug, scripts, config, currency }: Props) {
  const brand = useStoreBrand();
  const basePath = brand?.basePath ?? "";
  const theme = brand?.theme;
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState({ analytics: false, marketing: false });
  const [status, setStatus] = useState("");
  const loaded = useRef<Record<Category, boolean>>({ analytics: false, marketing: false });
  const revoked = useRef<Record<Category, boolean>>({ analytics: false, marketing: false });
  const returnFocus = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // In-store page changes, for the pixels (their own code counted the page they loaded on).
  const pathname = usePathname();
  const search = useSearchParams();
  const pageKey = `${pathname}?${search?.toString() ?? ""}`;
  const pageKeyRef = useRef(pageKey);
  pageKeyRef.current = pageKey;
  const marketingPage = useRef<string | null>(null);

  const has = useCallback((category: Category) => scripts.some((script) => script.category === category), [scripts]);

  const apply = useCallback(
    (next: Pick<ConsentChoice, "analytics" | "marketing">) => {
      const w = window as TagWindow;
      const googleLoaded = loaded.current.analytics;
      // Analytics: Consent Mode first (banner stores only), then GA4 / Tag Manager.
      if (next.analytics && has("analytics") && !loaded.current.analytics) {
        if (config) inject({ id: "google-consent", category: "analytics", inline: googleConsentScript(next) });
        for (const script of scripts) if (script.category === "analytics") inject(script);
        loaded.current.analytics = true;
      } else if (googleLoaded && w.gtag) {
        try {
          w.gtag("consent", "update", googleConsentState(next));
        } catch {}
      }
      // Marketing: the pixels (their snippets send the PageView for this page).
      if (next.marketing && has("marketing") && !loaded.current.marketing) {
        for (const script of scripts) if (script.category === "marketing") inject(script);
        loaded.current.marketing = true;
        marketingPage.current = pageKeyRef.current;
      } else if (loaded.current.marketing) {
        try {
          if (!next.marketing && !revoked.current.marketing) {
            w.fbq?.("consent", "revoke");
            w.ttq?.revokeConsent?.();
            revoked.current.marketing = true;
          } else if (next.marketing && revoked.current.marketing) {
            w.fbq?.("consent", "grant");
            w.ttq?.grantConsent?.();
            revoked.current.marketing = false;
          }
        } catch {}
      }
      const tool = (id: string) => scripts.some((script) => script.id === id);
      setTagState({
        analytics: next.analytics && loaded.current.analytics,
        marketing: next.marketing && loaded.current.marketing,
        ga: tool("ga4-init"),
        gtm: tool("gtm-init"),
        meta: tool("meta-pixel"),
        tiktok: tool("tiktok-pixel"),
        currency,
      });
      window.dispatchEvent(new Event(TAGS_READY_EVENT));
    },
    [config, currency, has, scripts],
  );

  // First load: no banner → everything; a saved choice → that; else ask.
  useEffect(() => {
    if (!config) {
      apply({ analytics: true, marketing: true });
      return;
    }
    const stored = readStoredConsent(slug);
    if (stored) {
      setChoice(stored);
      apply(stored);
    } else {
      setTagState({ analytics: false, marketing: false, ga: false, gtm: false, meta: false, tiktok: false, currency });
      setOpen(true);
    }
    return () => setTagState(null);
  }, [apply, config, currency, slug]);

  useEffect(() => {
    if (marketingPage.current == null || marketingPage.current === pageKey) return;
    marketingPage.current = pageKey;
    tagPageView();
  }, [pageKey]);

  const reopen = useCallback(() => {
    if (!config) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const current = readStoredConsent(slug);
    setDraft({ analytics: current?.analytics ?? false, marketing: current?.marketing ?? false });
    setCustom(true);
    setStatus("");
    setOpen(true);
    window.setTimeout(() => headingRef.current?.focus(), 0);
  }, [config, slug]);

  // "Cookie settings" (footer) and links to #cookie-settings.
  useEffect(() => {
    if (!config) return;
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || !link.getAttribute("href")?.endsWith(COOKIE_SETTINGS_HASH)) return;
      event.preventDefault();
      reopen();
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    document.addEventListener("click", onClick);
    if (window.location.hash === COOKIE_SETTINGS_HASH) reopen();
    return () => {
      window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
      document.removeEventListener("click", onClick);
    };
  }, [config, reopen]);

  const close = useCallback(() => {
    setOpen(false);
    setCustom(false);
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target?.isConnected) target.focus();
  }, []);

  const decide = (next: { analytics: boolean; marketing: boolean }) => {
    const saved: ConsentChoice = { ...next, at: Math.floor(Date.now() / 1000) };
    saveConsent(slug, saved, basePath);
    setChoice(saved);
    apply(saved);
    setStatus(bannerText("saved"));
    close();
  };

  if (!config) return null;
  const live = <p role="status" aria-live="polite" className="sr-only">{status}</p>;
  if (!open) return live;

  const ink = theme?.ink ?? "#16141F";
  const muted = theme?.muted ?? "#6E6E68";
  const border = theme?.border ?? "#E6E1D8";
  const surface = theme?.surface ?? "#FFFFFF";
  const cta = theme?.cta ?? "#16141F";
  const ctaText = theme?.ctaText ?? "#FFFFFF";
  const buttonRadius = theme?.buttonRadius ?? 999;
  const button = "inline-flex min-h-[44px] flex-1 basis-[140px] items-center justify-center px-4 text-[14px] font-semibold leading-tight transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  const solid = { background: cta, color: ctaText, borderRadius: buttonRadius, outlineColor: ink };
  const outline = { background: "transparent", color: ink, border: `1px solid ${border}`, borderRadius: buttonRadius, outlineColor: ink };
  const tools = config.categories;
  const rows: Array<{ key: Category; label: string; hint: string }> = [
    ...(tools.analytics.length ? [{ key: "analytics" as const, label: bannerText("analytics"), hint: bannerText("analyticsHint", { tools: tools.analytics.join(", ") }) }] : []),
    ...(tools.marketing.length ? [{ key: "marketing" as const, label: bannerText("marketing"), hint: bannerText("marketingHint", { tools: tools.marketing.join(", ") }) }] : []),
  ];

  return (
    <>
      {live}
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={(event) => {
          if (event.key === "Escape" && choice) close();
        }}
        className="fixed inset-x-3 z-[58] mx-auto max-h-[min(78vh,560px)] max-w-[560px] overflow-y-auto border p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)] sm:p-5"
        style={{ bottom: "calc(12px + env(safe-area-inset-bottom))", background: surface, color: ink, borderColor: border, borderRadius: Math.min(theme?.radius ?? 18, 22), fontFamily: theme?.body }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="m-0 text-[16px] font-semibold leading-snug outline-none" style={{ fontFamily: theme?.heading }}>
            {bannerText("title")}
          </h2>
          {choice ? (
            <button type="button" onClick={close} aria-label={bannerText("close")} className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[20px] leading-none hover:opacity-70" style={{ color: muted }}>
              <span aria-hidden>×</span>
            </button>
          ) : null}
        </div>
        <p id={bodyId} className="mb-0 mt-1.5 text-[13.5px] leading-[1.5]" style={{ color: muted }}>
          {config.message || bannerText(!tools.marketing.length ? "bodyAnalytics" : !tools.analytics.length ? "bodyMarketing" : "body")}
          {config.policy ? (
            <>
              {" "}
              <a href={getPublicStorefrontPath(basePath, config.policy.path)} className="font-semibold underline underline-offset-2" style={{ color: ink }}>
                {bannerText("policy", { title: config.policy.title })}
              </a>
            </>
          ) : null}
        </p>

        {custom ? (
          <fieldset className="m-0 mt-3 grid gap-2 border-0 p-0">
            <legend className="sr-only">{bannerText("customise")}</legend>
            <div className="flex items-start gap-3 rounded-[12px] border px-3 py-2.5" style={{ borderColor: border }}>
              <input type="checkbox" id={`${titleId}-essential`} checked disabled className="mt-1 h-4 w-4 shrink-0" style={{ accentColor: cta }} aria-describedby={`${titleId}-essential-hint`} />
              <label htmlFor={`${titleId}-essential`} className="grid gap-0.5 text-[13.5px]">
                <span className="font-semibold">{bannerText("essential")} <span className="font-normal" style={{ color: muted }}>· {bannerText("alwaysOn")}</span></span>
                <span id={`${titleId}-essential-hint`} style={{ color: muted }}>{bannerText("essentialHint")}</span>
              </label>
            </div>
            {rows.map((row) => (
              <div key={row.key} className="flex items-start gap-3 rounded-[12px] border px-3 py-2.5" style={{ borderColor: border }}>
                <input
                  type="checkbox"
                  id={`${titleId}-${row.key}`}
                  checked={draft[row.key]}
                  onChange={(event) => setDraft((current) => ({ ...current, [row.key]: event.target.checked }))}
                  className="mt-1 h-4 w-4 shrink-0"
                  style={{ accentColor: cta }}
                  aria-describedby={`${titleId}-${row.key}-hint`}
                />
                <label htmlFor={`${titleId}-${row.key}`} className="grid gap-0.5 text-[13.5px]">
                  <span className="font-semibold">{row.label}</span>
                  <span id={`${titleId}-${row.key}-hint`} style={{ color: muted }}>{row.hint}</span>
                </label>
              </div>
            ))}
          </fieldset>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {/* Accepting and refusing look the same and take one tap each. */}
          <button type="button" className={button} style={solid} onClick={() => decide({ analytics: true, marketing: true })}>
            {bannerText("acceptAll")}
          </button>
          <button type="button" className={button} style={solid} onClick={() => decide({ analytics: false, marketing: false })}>
            {bannerText("rejectAll")}
          </button>
          {custom ? (
            <button type="button" className={button} style={outline} onClick={() => decide({ analytics: draft.analytics && rows.some((row) => row.key === "analytics"), marketing: draft.marketing && rows.some((row) => row.key === "marketing") })}>
              {bannerText("save")}
            </button>
          ) : (
            <button
              type="button"
              className={button}
              style={outline}
              onClick={() => {
                setDraft({ analytics: choice?.analytics ?? false, marketing: choice?.marketing ?? false });
                setCustom(true);
              }}
            >
              {bannerText("customise")}
            </button>
          )}
        </div>
      </section>
    </>
  );
}
