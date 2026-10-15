"use client";

import type React from "react";
import { freeDeliveryPromise, type StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import { str, tickerSeconds } from "./block-logic";
import { ItemLink, itemLink, useReducedMotion, type BlockContext } from "./shared";

/** A message's words: {store} becomes the store name; empty delivery and payment messages come from the settings. */
export function tickerMessage(item: Record<string, unknown>, storeName: string, shopper: StorefrontShopperInfo) {
  const written = str(item.text).split("{store}").join(storeName);
  if (written) return written;
  if (item.source === "delivery") return freeDeliveryPromise(shopper.delivery) ?? "";
  if (item.source === "payment") {
    if (shopper.payOnDelivery) return "Pay on delivery available";
    return shopper.paymentLabels.length ? `Pay by ${shopper.paymentLabels.join(", ").toLowerCase()}` : "";
  }
  return "";
}

/** Announcement ticker: messages scroll across a slim strip, pause on hover or focus, and stay still for reduced motion. */
export function TickerBar({ ctx }: { ctx: BlockContext }) {
  const { items, settings, look, store, shopper } = ctx;
  const reduced = useReducedMotion();
  const t = look.tokens;
  let messages = items.map((item) => ({ text: tickerMessage(item, store.name, shopper), link: itemLink(item) })).filter((message) => message.text);
  if (!messages.length) {
    if (!ctx.editor) return null;
    messages = [{ text: `Welcome to ${store.name}`, link: null }, { text: "Add messages in the panel on the right", link: null }];
  }
  const tone = str(settings.tone);
  const colours: React.CSSProperties = tone === "accent"
    ? { background: t.accent, color: look.onAccent }
    : tone === "light"
      ? { background: t.cardBg, color: t.ink, borderBottom: `1px solid ${t.border}` }
      : { ...look.announcement, fontSize: undefined };
  // Each half of the track is wide enough to fill a wide screen; the second half is a silent copy for the loop.
  const characters = messages.reduce((sum, message) => sum + message.text.length + 6, 0);
  const repeats = Math.max(1, Math.ceil(140 / characters));
  const half = Array.from({ length: repeats }, () => messages).flat();
  const seconds = tickerSeconds(characters * repeats, str(settings.speed));
  const run = (copy: number) => half.map((message, index) => (
    <li key={`${copy}-${index}`} className="flex shrink-0 items-center gap-6 pr-6" aria-hidden={copy > 0 || index >= messages.length ? true : undefined}>
      {copy === 0 && index < messages.length
        ? <ItemLink ctx={ctx} link={message.link} className="whitespace-nowrap underline-offset-4 hover:underline">{message.text}</ItemLink>
        : <span className="whitespace-nowrap">{message.text}</span>}
      <span aria-hidden className="opacity-60">✦</span>
    </li>
  ));
  return (
    <section aria-label="Announcements" style={colours}>
      <style>{`@keyframes bqb-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}.bqb-ticker{animation:bqb-ticker var(--bqb-ticker-s,30s) linear infinite}.bqb-ticker-wrap:hover .bqb-ticker,.bqb-ticker-wrap:focus-within .bqb-ticker{animation-play-state:paused}@media (prefers-reduced-motion: reduce){.bqb-ticker{animation:none}}`}</style>
      {reduced ? (
        <ul className="bq-wrap m-0 flex list-none flex-wrap items-center justify-center gap-x-6 gap-y-1 py-2.5 text-[13px] font-medium">
          {messages.map((message, index) => (
            <li key={index}><ItemLink ctx={ctx} link={message.link}>{message.text}</ItemLink></li>
          ))}
        </ul>
      ) : (
        <div className="bqb-ticker-wrap overflow-hidden py-2.5 text-[13px] font-medium">
          <ul className="bqb-ticker m-0 flex w-max list-none p-0" style={{ "--bqb-ticker-s": `${seconds}s` } as React.CSSProperties}>
            {run(0)}
            {run(1)}
          </ul>
        </div>
      )}
    </section>
  );
}
