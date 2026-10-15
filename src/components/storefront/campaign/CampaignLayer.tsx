"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { Icon } from "@/components/ui/Icon";
import { primeServerClock, useServerNow } from "@/hooks/useServerClock";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { fillCampaignText } from "@/lib/store-campaigns/blocks";
import { PREVIEW_AT_PARAM, PREVIEW_PARAM, PREVIEW_TOKEN_PARAM } from "@/lib/store-campaigns/preview-params";
import type { StorefrontCampaignView } from "@/lib/store-campaigns/storefront.server";
import { CampaignContext, useCampaignClock, type CampaignContextValue } from "./CampaignContext";
import { CampaignCountdown } from "./CampaignCountdown";
import { disableCampaignTracking, exitPreview, rememberPreview, trackCampaignEvent, trackCampaignVisit } from "./tracking";

// The storefront's seasonal campaign layer (mounted by the store layouts): the preview bar, the campaign announcement
// bar (one at a time; the store's own bar steps aside while it shows), the optional floating countdown, and the
// context product cards and campaign sections read. Stores with no live campaign never mount it.

function linkFor(basePath: string, link: string) {
  if (!link) return "";
  return link.startsWith("/") ? getPublicStorefrontPath(basePath, link) : link;
}

function AnnouncementBar({ value }: { value: CampaignContextValue }) {
  const t = useT("campaigns");
  const bar = value.view.announcement!;
  const campaign = value.view.campaigns.find((entry) => entry.id === bar.campaignId);
  const messages = bar.settings.messages;
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  const dismissKey = `sib-campaign-bar:${bar.campaignId}`;

  useEffect(() => {
    try {
      if (bar.settings.dismissible && sessionStorage.getItem(dismissKey) === "1") setHidden(true);
    } catch {}
    trackCampaignEvent(value.slug, { campaignId: bar.campaignId, blockId: bar.blockId, event: "block_view" });
  }, [bar.campaignId, bar.blockId, bar.settings.dismissible, dismissKey, value.slug]);

  useEffect(() => {
    if (messages.length < 2 || paused) return;
    const timer = window.setInterval(() => setIndex((at) => (at + 1) % messages.length), bar.settings.rotateSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [messages.length, bar.settings.rotateSeconds, paused]);

  if (hidden || !messages.length) return null;
  const message = messages[index % messages.length]!;
  const { background, text } = bar.colors;
  const countdown = campaign?.countdown;
  const parts = fillCampaignText(message.text, { discountCode: campaign?.discountCode });
  const href = linkFor(value.basePath, message.link);
  const click = () => trackCampaignEvent(value.slug, { campaignId: bar.campaignId, blockId: bar.blockId, event: "block_click" });
  const words = parts.map((part, at) =>
    part.kind === "text" ? (
      <span key={at}>{part.value}</span>
    ) : (
      <CampaignCountdown
        key={at}
        target={countdown?.target ?? null}
        timeZone={campaign?.timezone}
        look={{ style: countdown?.settings.style === "boxed" ? "boxed" : "inline", format: countdown?.settings.format ?? "dhms", color: text, boxBackground: "rgba(255,255,255,.14)", size: "sm" }}
        expiry={countdown?.settings.expiry ?? "hide"}
        expiredText={countdown?.settings.expiredText}
        replace={countdown?.settings.replaceText ? { text: countdown.settings.replaceText, href: linkFor(value.basePath, countdown.settings.replaceLink) } : null}
        className="mx-1 align-middle"
      />
    ),
  );

  return (
    <div
      role="region"
      aria-label={t("bar.aria")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{ background, color: text, position: bar.settings.sticky ? "sticky" : "relative", top: 0, zIndex: 40 }}
      className="sib-campaign-bar"
    >
      <div className="mx-auto flex max-w-[1320px] items-center justify-center gap-3 px-10 py-2.5 text-center text-[13px] font-semibold leading-snug">
        <p className="m-0 min-w-0" aria-live="off">
          {href && !message.linkLabel ? (
            <Link href={href} onClick={click} style={{ color: "inherit", textDecoration: "none" }}>{words}</Link>
          ) : (
            words
          )}
          {href && message.linkLabel ? (
            <Link href={href} onClick={click} className="ml-2 underline underline-offset-2" style={{ color: "inherit" }}>{message.linkLabel}</Link>
          ) : null}
        </p>
        {messages.length > 1 ? <span className="sr-only">{t("bar.rotating", { n: index + 1, total: messages.length })}</span> : null}
        {bar.settings.dismissible ? (
          <button
            type="button"
            onClick={() => {
              setHidden(true);
              try {
                sessionStorage.setItem(dismissKey, "1");
              } catch {}
            }}
            aria-label={t("bar.close")}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border-0 bg-transparent"
            style={{ color: text, cursor: "pointer" }}
          >
            <Icon name="x" size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FloatingCountdown({ value }: { value: CampaignContextValue }) {
  const t = useT("campaigns");
  const campaign = value.view.campaigns.find((entry) => entry.countdown.settings.display === "floating" && entry.countdown.target !== null);
  const [closed, setClosed] = useState(false);
  if (!campaign || closed) return null;
  const settings = campaign.countdown.settings;
  return (
    <div className="fixed bottom-24 left-3 z-40 flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold shadow-lg md:bottom-5" style={{ background: "#111111", color: "#FFFFFF" }} role="complementary" aria-label={campaign.name}>
      <span>{settings.label || t("floating.label")}</span>
      <CampaignCountdown target={campaign.countdown.target} timeZone={campaign.timezone} look={{ style: "inline", format: settings.format, color: "#FFFFFF" }} expiry={settings.expiry} expiredText={settings.expiredText} />
      <button type="button" onClick={() => setClosed(true)} aria-label={t("bar.close")} className="grid h-6 w-6 place-items-center rounded-full border-0 bg-white/10" style={{ color: "#fff", cursor: "pointer" }}>
        <Icon name="x" size={11} />
      </button>
    </div>
  );
}

function PreviewBar({ value }: { value: CampaignContextValue }) {
  const t = useT("campaigns");
  const preview = value.view.preview!;
  const now = useCampaignClock(useServerNow());
  return (
    <div role="status" className="sib-campaign-preview flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[13px] font-semibold" style={{ background: "#6B4F8A", color: "#FFFFFF", position: "relative", zIndex: 41 }}>
      <span>{t("preview.bar", { name: preview.name })}</span>
      {preview.at && now > 0 ? <span className="opacity-80">{t("preview.at", { time: new Date(now).toLocaleString() })}</span> : null}
      <button type="button" onClick={exitPreview} className="rounded-full border border-white/50 bg-transparent px-3 py-1 text-[12.5px] font-bold" style={{ color: "#fff", cursor: "pointer" }}>
        {t("preview.exit")}
      </button>
    </div>
  );
}

export function CampaignLayer({ view, slug, basePath, children }: { view: StorefrontCampaignView; slug: string; basePath: string; children: ReactNode }) {
  // Rendered once per page load: the server's clock seeds the shared clock straight away.
  const [renderedAt] = useState(() => Date.now());
  const shiftMs = view.preview?.at ? view.preview.at - view.serverNow : 0;
  const value = useMemo<CampaignContextValue>(() => ({ view, slug, basePath, shiftMs }), [view, slug, basePath, shiftMs]);

  useEffect(() => {
    primeServerClock(view.serverNow, { endpoint: "/api/public/time", renderedAt });
  }, [view.serverNow, renderedAt]);

  useEffect(() => {
    if (view.preview) {
      disableCampaignTracking();
      const params = new URLSearchParams(window.location.search);
      const token = params.get(PREVIEW_TOKEN_PARAM);
      if (params.get(PREVIEW_PARAM) && token) rememberPreview(token, params.get(PREVIEW_AT_PARAM));
      return;
    }
    for (const campaign of view.campaigns) trackCampaignVisit(slug, campaign.id);
  }, [view.preview, view.campaigns, slug]);

  const bar = view.announcement;
  return (
    <CampaignContext.Provider value={value}>
      {view.preview ? <PreviewBar value={value} /> : null}
      {bar && bar.settings.messages.length ? <AnnouncementBar value={value} /> : null}
      {children}
      <FloatingCountdown value={value} />
    </CampaignContext.Provider>
  );
}
