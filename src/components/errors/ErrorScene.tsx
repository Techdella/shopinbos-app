"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type React from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { formatDigest, nextLineIndex, randomLineIndex } from "./copy";
import "./errors.css";

// The shared layout of every 404, error and "not open yet" page: an animated scene, a witty line that can be
// swapped, a plain explanation, clear next steps, and the error reference for support. Fixed-size scene
// and stacked quips keep the page from shifting as things load or change.

export interface ScenePalette {
  /** Page background. */
  page: string;
  /** Main text and outlines. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** Brand colour in the scene and the primary button. */
  accent: string;
  /** Text on the primary button. */
  accentText: string;
  /** Second scene colour (parcels, sparks). */
  warm: string;
  /** Light fill inside the scene and on cards. */
  paper: string;
  /** Hairlines and the secondary button border. */
  line: string;
  /** Heading and body fonts (CSS font-family values). Defaults to the app's display font. */
  heading?: string;
  body?: string;
}

/** Shopinbos navy / mint / cream. */
export const APP_PALETTE: ScenePalette = {
  page: "#FAF7F1",
  ink: "#0E2A38",
  muted: "#5B5B55",
  accent: "#0E2A38",
  accentText: "#F4F1EA",
  warm: "#F2A93B",
  paper: "#F4F1EA",
  line: "rgba(14,42,56,0.14)",
};

/** The scene's own words. App pages pass them in the person's language; storefront pages keep the English ones. */
export interface SceneLabels {
  another: string;
  /** "Ref {ref}" with the short reference filled in. */
  ref: (short: string) => string;
  copy: string;
  copied: string;
  copyRef: string;
  refCopied: string;
}

export const ENGLISH_SCENE_LABELS: SceneLabels = {
  another: "Tell me another",
  ref: (short) => `Ref ${short}`,
  copy: "Copy",
  copied: "Copied",
  copyRef: "Copy error reference for support",
  refCopied: "Reference copied",
};

export type SceneAction =
  | { label: string; href: string; icon?: IconName; primary?: boolean; external?: boolean }
  | { label: string; onClick: () => void; icon?: IconName; primary?: boolean };

export function ErrorScene({
  palette = APP_PALETTE,
  sceneAccent = "#73D8C8",
  eyebrow,
  title,
  lines,
  body,
  actions,
  digest,
  illustration,
  backdrop,
  embedded = false,
  brand,
  footer,
  labels = ENGLISH_SCENE_LABELS,
}: {
  palette?: ScenePalette;
  /** Colour of the scene's main shape (defaults to mint on app pages). */
  sceneAccent?: string;
  eyebrow: string;
  title: string;
  lines: readonly string[];
  body: React.ReactNode;
  actions: SceneAction[];
  digest?: string | null;
  illustration: React.ReactNode;
  /** Big faint text behind the scene ("404"). */
  backdrop?: string;
  /** Inside an app frame: no full-height page or background of its own. */
  embedded?: boolean;
  brand?: React.ReactNode;
  footer?: React.ReactNode;
  labels?: SceneLabels;
}) {
  const style = {
    background: embedded ? undefined : palette.page,
    color: palette.ink,
    fontFamily: palette.body,
    ["--sx-ink" as string]: palette.ink,
    ["--sx-accent" as string]: sceneAccent,
    ["--sx-warm" as string]: palette.warm,
    ["--sx-paper" as string]: palette.paper,
  } as React.CSSProperties;
  // App frames already have a <main>; a page of its own gets one.
  const Wrapper = embedded ? "section" : "main";

  return (
    <div className={`${embedded ? "min-h-full" : "min-h-dvh"} flex w-full flex-col items-center px-4 py-10 sm:py-16`} style={style}>
      {brand ? <div className="mb-6 flex w-full max-w-[560px] justify-center">{brand}</div> : null}
      <Wrapper className="my-auto flex w-full max-w-[560px] flex-col items-center text-center" aria-labelledby="sbx-title">
        <div className="sbx-scene relative aspect-[8/5] w-full max-w-[340px]">
          {backdrop ? (
            <span aria-hidden className="pointer-events-none absolute inset-0 grid select-none place-items-center text-[120px] font-bold leading-none tracking-[-0.06em] sm:text-[150px]" style={{ color: palette.ink, opacity: 0.05, fontFamily: palette.heading ?? "var(--font-display)" }}>
              {backdrop}
            </span>
          ) : null}
          <div className="relative h-full w-full">{illustration}</div>
        </div>

        <p className="mt-6 font-mono text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: palette.muted }}>{eyebrow}</p>
        <h1 id="sbx-title" className="mt-2 text-[28px] font-medium leading-[1.1] tracking-[-0.025em] sm:text-[34px]" style={{ fontFamily: palette.heading ?? "var(--font-display)" }}>
          {title}
        </h1>
        <Quip lines={lines} palette={palette} another={labels.another} />
        <div className="mt-3 max-w-[46ch] text-[15px] leading-6" style={{ color: palette.muted }}>{body}</div>

        {actions.length ? (
          <div className="mt-7 flex w-full flex-col items-stretch justify-center gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            {actions.map((action) => <ActionButton key={action.label} action={action} palette={palette} />)}
          </div>
        ) : null}

        {digest ? <DigestChip digest={digest} palette={palette} labels={labels} /> : null}
        {footer ? <div className="mt-6 text-[13.5px]" style={{ color: palette.muted }}>{footer}</div> : null}
      </Wrapper>
    </div>
  );
}

/** One witty line; a random one after load and another on request. Lines share one grid cell, so swapping never moves the page. */
function Quip({ lines, palette, another }: { lines: readonly string[]; palette: ScenePalette; another: string }) {
  const [index, setIndex] = useState(0);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    setIndex(randomLineIndex(lines.length, Math.random()));
  }, [lines.length]);
  if (lines.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col items-center gap-1">
      <p className="m-0 grid max-w-[44ch] text-[17px] italic leading-snug sm:text-[18px]" aria-live={asked ? "polite" : "off"} style={{ fontFamily: palette.heading ?? "var(--font-accent)" }}>
        {lines.map((line, i) => (
          <span key={line} className="sbx-quip [grid-area:1/1]" aria-hidden={i !== index} style={{ opacity: i === index ? 1 : 0, transform: i === index ? "none" : "translateY(4px)" }}>
            {line}
          </span>
        ))}
      </p>
      {lines.length > 1 ? (
        <button
          type="button"
          onClick={() => {
            setAsked(true);
            setIndex((current) => nextLineIndex(current, lines.length));
          }}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: palette.muted, outlineColor: palette.ink }}
        >
          <Icon name="refresh" size={12} /> {another}
        </button>
      ) : null}
    </div>
  );
}

function ActionButton({ action, palette }: { action: SceneAction; palette: ScenePalette }) {
  const className =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold no-underline transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  const style: React.CSSProperties = action.primary
    ? { background: palette.accent, color: palette.accentText, outlineColor: palette.ink }
    : { background: "transparent", color: palette.ink, border: `1px solid ${palette.line}`, outlineColor: palette.ink };
  const content = (
    <>
      {action.icon ? <Icon name={action.icon} size={16} /> : null}
      {action.label}
    </>
  );
  if ("href" in action) {
    // Plain <a> for links that may leave the current app shell (a storefront, a different portal, global-error).
    return action.external ? (
      <a href={action.href} className={className} style={style}>{content}</a>
    ) : (
      <Link href={action.href} className={className} style={style}>{content}</Link>
    );
  }
  return <button type="button" onClick={action.onClick} className={className} style={style}>{content}</button>;
}

function DigestChip({ digest, palette, labels }: { digest: string; palette: ScenePalette; labels: SceneLabels }) {
  const [copied, setCopied] = useState(false);
  const short = formatDigest(digest);
  if (!short) return null;
  return (
    <div className="mt-6 inline-flex max-w-full items-center gap-2 rounded-full border py-1 pl-3.5 pr-1 font-mono text-[12px]" style={{ borderColor: palette.line, color: palette.muted, background: palette.paper }}>
      <span className="truncate">{labels.ref(short)}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(digest).then(() => setCopied(true), () => setCopied(false));
        }}
        className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 font-sans text-[12px] font-semibold focus-visible:outline focus-visible:outline-2"
        style={{ color: palette.ink, outlineColor: palette.ink }}
        aria-label={copied ? labels.refCopied : labels.copyRef}
      >
        <Icon name={copied ? "check" : "copy"} size={13} /> {copied ? labels.copied : labels.copy}
      </button>
    </div>
  );
}
