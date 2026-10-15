"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DEFAULT_POPUP_STYLE, badgeText, popupHeadingFont, rewardLabel, type FormDesign, type FormField, type PopupGameKind, type PopupKind, type PopupLayout, type PopupRewardSummary, type PopupStyle } from "@/lib/marketing/forms";
import { countdownParts, ctaHref, fillWords } from "@/lib/marketing/popup-kinds";
import { freeDeliveryProgress } from "@shared/cart-checkout";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { SignupForm, SignupSuccess, type SignupColors, type SignupResult, type SignupShape } from "./SignupForm";
import { PopupArt, mix } from "./PopupArt";
import { PopupGame, type PopupPrizes } from "./PopupGame";

// The one pop-up renderer: the storefront shows it for real, and the seller's editor and template gallery show
// it as a preview (positioned inside a box instead of the window, nothing sent). Layout follows the width of the
// window (or the preview box) through container queries, so the phone preview is what phones get.
// Live: a centre or full-screen pop-up traps focus and stops the page scrolling; Esc closes every kind.
//
// Looks saved before the finer templates (style.version 1) are drawn exactly as they always were; version 2 adds
// the finer spacing and type, pictures on the right, built-in art, finishing touches and entrance motion
// (none with reduced motion). Kinds: sign-up and free-download pop-ups show the sign-up form; game pop-ups the
// game; announcements, countdown sales and free-delivery pop-ups a button.

export interface RenderablePopup {
  id: string;
  fields: FormField[];
  design: FormDesign;
  layout: PopupLayout;
  reward: PopupRewardSummary | null;
  afterSubmit: "message" | "redirect";
  redirectUrl: string;
  /** What it is for (older callers: a sign-up pop-up). */
  kind?: PopupKind;
  /** Game pop-ups: the game and the store's prizes (labels and odds only). */
  game?: { game: PopupGameKind; collect: "email" | "whatsapp" | "either"; playEveryDays: number; prizes: PopupPrizes } | null;
  /** Free-download pop-ups: what they get (the link itself only comes back after sign-up). */
  leadMagnetName?: string | null;
  /** Countdown pop-ups: when the offer ends. */
  endsAt?: string | null;
  /** Free-delivery pop-ups: the amount that gets free delivery. */
  freeDeliveryOver?: number;
}

const RADIUS = {
  square: { panel: 6, input: 6, button: 8 },
  soft: { panel: 16, input: 10, button: 14 },
  round: { panel: 24, input: 12, button: 999 },
} as const;

const WIDTH = {
  modal: { small: 360, medium: 440, large: 520 },
  split: { small: 600, medium: 720, large: 840 },
  flyout: { small: 340, medium: 380, large: 440 },
} as const;

const FESTIVE_STRIP = "repeating-linear-gradient(135deg, #E4572E 0 14px, #F2A93B 14px 28px, #0F7B4F 28px 42px, #2E86AB 42px 56px)";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Entrance motion (version 2 looks). Reduced motion: none at all.
const MOTION_CSS = `@keyframes sib-pop-fade{from{opacity:0}to{opacity:1}}
@keyframes sib-pop-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes sib-pop-zoom{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
@keyframes sib-pop-slide{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:none}}
.sib-pop-in-fade{animation:sib-pop-fade .24s ease-out both}
.sib-pop-in-rise{animation:sib-pop-rise .38s cubic-bezier(.2,.8,.2,1) both}
.sib-pop-in-zoom{animation:sib-pop-zoom .32s cubic-bezier(.2,.8,.25,1.08) both}
.sib-pop-in-slide{animation:sib-pop-slide .42s cubic-bezier(.2,.8,.2,1) both}
.sib-pop-veil{animation:sib-pop-fade .22s ease-out both}
@media (prefers-reduced-motion: reduce){.sib-pop-in-fade,.sib-pop-in-rise,.sib-pop-in-zoom,.sib-pop-in-slide,.sib-pop-veil{animation:none}}`;

/** "#RRGGBB" + alpha → rgba(); anything else is returned as is. */
export function withAlpha(color: string, alpha: number) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  if (!m) return color;
  return `rgba(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}, ${alpha})`;
}

/** "Get 10% off your first order." */
export function rewardLine(reward: PopupRewardSummary | null, currency = "NGN") {
  if (!reward) return null;
  const min = reward.minOrder > 0 ? ` On orders over ${formatStoreMoney(reward.minOrder, currency)}.` : "";
  if (reward.mystery) return `Sign up to unlock a mystery gift for your first order.${min}`;
  const label = reward.label || rewardLabel(reward);
  if (reward.type === "percentage" || reward.type === "fixed_amount") return `Get ${label.toLowerCase()} your first order.${min}`;
  return `${label} on your first order.${min}`;
}

const SAMPLE_RESULT: SignupResult = {
  code: "WELCOME-7FQ2KD",
  message: "",
  alreadySubscribed: false,
  reward: { label: "10% off", expiresAt: null, minOrder: 0, again: false },
};

/** A sample end time for previews of a countdown with no end set yet (2 days, 5 hours, 30 minutes away). */
const SAMPLE_ENDS_IN = (2 * 86_400 + 5 * 3_600 + 30 * 60) * 1000;

export function PopupView({
  popup,
  storeSlug,
  colors,
  result,
  onResult,
  onClose,
  preview = false,
  currency = "NGN",
  basePath = "",
  cartSubtotal = 0,
  onCta,
  motion = true,
}: {
  popup: RenderablePopup;
  storeSlug: string;
  colors: SignupColors;
  result: SignupResult | null;
  onResult: (result: SignupResult) => void;
  onClose: () => void;
  /** Seller preview: "form" or "success" state, drawn inside the nearest positioned box. */
  preview?: false | "form" | "success";
  currency?: string;
  /** The store's own address ("/s/slug", or "" on its own domain), for the button's store links. */
  basePath?: string;
  /** What's in the shopper's bag now (free-delivery progress). */
  cartSubtotal?: number;
  /** A no-form pop-up's button was used (counted like a sign-up). */
  onCta?: () => void;
  /** Entrance motion (off for the gallery's small previews). */
  motion?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const { layout, design } = popup;
  const style: PopupStyle = design.style ?? DEFAULT_POPUP_STYLE; // a response cached from before styles existed
  const fine = style.version >= 2;
  const kind: PopupKind = popup.kind ?? "signup";
  const modal = layout === "modal" || layout === "fullscreen";

  useEffect(() => {
    if (preview) return;
    const previous = document.activeElement as HTMLElement | null;
    if (modal) panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close]), a[href]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !modal || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (!panelRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    if (modal) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      if (modal) {
        document.body.style.overflow = overflow;
        previous?.focus?.();
      }
    };
  }, [modal, preview]);

  const shown: SignupResult | null =
    preview === "success" && (kind === "signup" || kind === "lead_magnet")
      ? {
          ...SAMPLE_RESULT,
          message: design.successMessage,
          code: popup.reward ? SAMPLE_RESULT.code : null,
          reward: popup.reward ? { label: popup.reward.label, expiresAt: null, minOrder: popup.reward.minOrder, again: false } : null,
          download: kind === "lead_magnet" ? { url: "#", name: popup.leadMagnetName || "Your free download", emailed: true } : null,
        }
      : result;
  const bg = style.background || colors.paper;
  const ink = style.text || colors.ink;
  const button = style.button || colors.accent;
  const buttonText = style.buttonText || colors.accentText;
  const accent = style.accent || button;
  const formColors: SignupColors = { ink, paper: bg, accent: button, accentText: buttonText, heading: colors.heading };
  const radius = RADIUS[style.radius];
  const shape: SignupShape = { input: radius.input, button: radius.button };
  const headingFont = popupHeadingFont(style.font, colors.heading);
  const position = preview ? "absolute" : "fixed";
  const animate = fine && motion && style.animation !== "none";
  const enter = animate ? `sib-pop-in-${style.animation}` : "";
  const veil = animate ? "sib-pop-veil" : "";

  // ── Picture ──
  // Version 1: a picture only where there is one (the preview shows where it would go). Version 2 also uses the
  // look's built-in art when the seller hasn't added a picture.
  const ownImage = Boolean(design.imageUrl);
  const art = fine && !ownImage ? style.art : "";
  const hasImage = ownImage || Boolean(art) || Boolean(preview);
  const wanted = layout === "bar" || !hasImage ? "none" : style.imagePosition;
  // Corner flyouts have no room beside the words: their picture goes on top.
  const imagePosition = layout === "flyout" && (wanted === "left" || wanted === "right") ? "top" : wanted;
  const split = (imagePosition === "left" || imagePosition === "right") && (layout === "modal" || layout === "fullscreen");
  const imageUrl = design.imageUrl ? design.imageUrl.replace(/"/g, "%22") : "";
  const placeholder = `linear-gradient(135deg, ${withAlpha(button, 0.35)}, ${withAlpha(ink, 0.18)})`;
  const focus = `${style.focusX}% ${style.focusY}%`;
  const backgroundImage =
    imagePosition === "background" && (!fine || ownImage || !art)
      ? `linear-gradient(${withAlpha(bg, 0.82)}, ${withAlpha(bg, 0.82)}), ${imageUrl ? `url("${imageUrl}")` : placeholder}`
      : undefined;
  const artColors = { bg: /^#[0-9a-f]{6}$/i.test(bg) ? bg : "#FFFFFF", ink: /^#[0-9a-f]{6}$/i.test(ink) ? ink : "#16141F", button: /^#[0-9a-f]{6}$/i.test(button) ? button : "#16141F", accent: /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#F2A93B" };

  const image = (className: string, imgStyle?: CSSProperties) =>
    imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={design.imageAlt || ""}
        className={`${className} ${fine && style.imageFit === "contain" ? "object-contain" : "object-cover"}`}
        style={{ ...imgStyle, ...(fine ? { objectPosition: focus, background: style.imageFit === "contain" ? withAlpha(ink, 0.05) : undefined } : {}) }}
      />
    ) : art ? (
      <PopupArt art={art} colors={artColors} className={`${className} block`} style={imgStyle} />
    ) : (
      <div aria-hidden className={className} style={{ ...imgStyle, background: placeholder }} />
    );

  const badge = style.bigBadge || style.badgeText ? badgeText(style, popup.reward) : "";
  const line = kind === "signup" ? rewardLine(popup.reward, currency) : null;
  const big = layout === "fullscreen";
  const center = fine && style.align === "center";
  const amount = popup.freeDeliveryOver ? formatStoreMoney(popup.freeDeliveryOver, currency) : "";
  const words = (text: string) => (kind === "free_delivery" ? fillWords(text, { amount }) : text);

  const closeButton =
    style.closeStyle === "text" ? null : fine ? (
      <button
        type="button"
        data-close
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={
          style.closeStyle === "circle"
            ? { color: ink, background: withAlpha(bg, 0.92), boxShadow: `0 1px 2px rgba(0,0,0,0.08), 0 0 0 1px ${withAlpha(ink, 0.12)}`, backdropFilter: "blur(6px)" }
            : { color: ink, background: "transparent" }
        }
      >
        <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    ) : (
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full text-[22px] leading-none opacity-80 hover:opacity-100 focus-visible:outline focus-visible:outline-2"
        style={style.closeStyle === "circle" ? { color: ink, background: withAlpha(bg, 0.92), boxShadow: `0 0 0 1px ${withAlpha(ink, 0.15)}` } : { color: ink }}
      >
        ×
      </button>
    );

  const noThanks =
    style.closeStyle === "text" ? (
      <div className="mt-2 text-center">
        <button type="button" onClick={onClose} className="min-h-[40px] px-3 text-[13.5px] underline underline-offset-4 opacity-75 hover:opacity-100">
          No thanks
        </button>
      </div>
    ) : null;

  // ── The button of a no-form pop-up ──
  const href = preview ? null : ctaHref(design.ctaTarget, design.ctaUrl, basePath);
  const ctaStyle: CSSProperties = { background: button, color: buttonText, borderRadius: radius.button };
  const ctaClass = `inline-flex min-h-[48px] w-full items-center justify-center gap-2 px-6 text-[15px] font-bold no-underline transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${layout === "bar" ? "@2xl:w-auto" : ""}`;
  const arrow = (
    <svg aria-hidden viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
  const cta = href ? (
    <a href={href} className={ctaClass} style={ctaStyle} onClick={() => onCta?.()} {...(/^https:\/\//.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {design.ctaLabel}
      {arrow}
    </a>
  ) : (
    <button
      type="button"
      className={ctaClass}
      style={ctaStyle}
      onClick={() => {
        if (preview) return;
        onCta?.();
        onClose();
      }}
    >
      {design.ctaLabel}
      {arrow}
    </button>
  );

  const eyebrow = fine && design.eyebrow ? (
    <p className="m-0 mb-2 text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ color: button }}>
      {words(design.eyebrow)}
    </p>
  ) : null;

  const headingClass = fine
    ? `m-0 font-bold leading-[1.1] tracking-[-0.02em] ${big ? "text-[30px] @2xl:text-[46px]" : layout === "bar" ? "text-[18px] @2xl:text-[20px]" : layout === "flyout" ? "text-[20px]" : "text-[25px] @md:text-[29px]"} ${center ? "px-8" : "pr-10"}`
    : `m-0 pr-10 font-bold leading-tight ${big ? "text-[28px] @2xl:text-[38px]" : "text-[22px]"}`;
  const bodyClass = fine ? `mb-5 mt-2.5 leading-[1.55] opacity-[0.8] ${layout === "bar" || layout === "flyout" ? "text-[14px]" : "text-[15px]"}` : "mb-4 mt-2 text-[14.5px] leading-[1.5] opacity-80";

  let action: ReactNode;
  if (kind === "game" && popup.game) {
    action = (
      <PopupGame
        formId={popup.id}
        storeSlug={storeSlug}
        game={popup.game.game}
        collect={popup.game.collect}
        playEveryDays={popup.game.playEveryDays}
        prizes={popup.game.prizes}
        colors={{ ink: artColors.ink, paper: artColors.bg, button: artColors.button, buttonText: /^#[0-9a-f]{6}$/i.test(buttonText) ? buttonText : "#FFFFFF", accent: artColors.accent, heading: headingFont }}
        inputRadius={radius.input}
        buttonRadius={radius.button}
        buttonText={design.buttonText}
        consentText=""
        currency={currency}
        preview={Boolean(preview)}
        showResult={preview === "success"}
        compact={layout === "flyout" || layout === "bar"}
        onClose={onClose}
      />
    );
  } else if (kind === "announcement" || kind === "countdown" || kind === "free_delivery") {
    action = (
      <div className="grid gap-3">
        {kind === "countdown" ? <Countdown endsAt={popup.endsAt ?? null} preview={Boolean(preview)} ink={ink} accent={accent} radius={radius.input} center={center || layout === "bar"} /> : null}
        {kind === "free_delivery" && popup.freeDeliveryOver ? <DeliveryProgress over={popup.freeDeliveryOver} subtotal={preview ? popup.freeDeliveryOver * 0.6 : cartSubtotal} currency={currency} ink={ink} accent={button} /> : null}
        {cta}
      </div>
    );
  } else {
    action = (
      <SignupForm
        storeSlug={storeSlug}
        formId={popup.id}
        fields={popup.fields}
        design={design}
        colors={formColors}
        shape={shape}
        preview={Boolean(preview)}
        compact={layout === "flyout" || layout === "bar"}
        onDone={(next) => {
          onResult(next);
          if (popup.afterSubmit === "redirect" && popup.redirectUrl && !next.code && !next.download) window.location.assign(popup.redirectUrl);
        }}
      />
    );
  }

  const freeChip =
    kind === "lead_magnet" && popup.leadMagnetName ? (
      <span className="mb-3 inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold" style={{ background: withAlpha(button, 0.12), color: ink }}>
        <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" /></svg>
        <span className="truncate">Free: {popup.leadMagnetName}</span>
      </span>
    ) : null;

  const barRow = fine && layout === "bar";
  const content = (
    <div className={`${big ? `w-full ${fine ? "max-w-[520px]" : "max-w-[480px]"}` : ""} ${center ? "text-center" : ""} relative z-[1]`}>
      {imagePosition === "top" ? image(`${fine ? "mb-5" : "mb-4"} w-full ${big ? "h-56" : layout === "flyout" ? "h-32" : fine ? "h-44" : "h-40"}`, { borderRadius: radius.input + 4 }) : null}
      <div className={barRow ? "grid gap-3 @2xl:grid-cols-[minmax(0,1fr)_auto] @2xl:items-center @2xl:gap-6" : undefined}>
        <div className="min-w-0">
          {eyebrow}
          {badge ? (
            <div
              className={`mb-2 font-black uppercase leading-none tracking-[-0.02em] ${center ? "px-6" : ""}`}
              style={{ color: button, fontFamily: headingFont, fontSize: big ? "clamp(48px, 9cqi, 88px)" : "clamp(40px, 11cqi, 60px)" }}
            >
              {badge}
            </div>
          ) : null}
          <h2 id={titleId} className={headingClass} style={{ fontFamily: headingFont, letterSpacing: style.template === "luxe" && !fine ? "0.01em" : undefined }}>
            {words(design.headline)}
          </h2>
          {!shown ? (
            <p id={descId} className={barRow ? `${bodyClass} @2xl:mb-0` : bodyClass}>
              {words(design.body)}
              {line ? <strong className="block pt-1 opacity-100">{line}</strong> : null}
            </p>
          ) : null}
          {!shown ? freeChip : null}
        </div>
        {!shown ? <div className={barRow && kind !== "signup" && kind !== "lead_magnet" && kind !== "game" ? "@2xl:min-w-[220px]" : barRow ? "@2xl:col-span-2" : undefined}>{action}</div> : null}
      </div>
      {shown ? (
        <div className="mt-3">
          <SignupSuccess result={shown} colors={formColors} shape={shape} onShop={onClose} currency={currency} />
        </div>
      ) : null}
      {noThanks}
    </div>
  );

  const decor = <Decor style={style} fine={fine} button={button} accent={accent} ink={ink} bg={bg} layout={layout} radius={radius.panel} />;
  const luxeEdge = style.decor === "edge" ? `, inset 0 0 0 1px ${withAlpha(button, 0.45)}` : "";
  const panelBase: CSSProperties = { background: bg, color: ink, backgroundImage, backgroundSize: "cover", backgroundPosition: fine ? focus : "center" };
  const artLayer =
    imagePosition === "background" && fine && art && !ownImage ? (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}>
        <PopupArt art={art} colors={artColors} className="h-full w-full" />
        <div className="absolute inset-0" style={{ background: withAlpha(bg, 0.84) }} />
      </div>
    ) : null;
  const dialogProps = {
    ref: panelRef,
    role: "dialog" as const,
    "aria-modal": modal && !preview ? true : undefined,
    "aria-labelledby": titleId,
    "aria-describedby": shown ? undefined : descId,
  };
  const motionStyle = animate ? <style>{MOTION_CSS}</style> : null;

  if (layout === "bar") {
    return (
      <div className={`${position} inset-0 z-[60] @container pointer-events-none`}>
        {motionStyle}
        <div
          {...dialogProps}
          className={`pointer-events-auto absolute inset-x-0 bottom-0 max-h-[85%] overflow-y-auto border-t ${fine ? "px-4 pb-5 pt-5 @xl:px-8" : "px-4 pb-6 pt-5 @xl:px-6"} shadow-[0_-12px_40px_rgba(0,0,0,0.18)] ${enter}`}
          style={{ ...panelBase, borderColor: withAlpha(ink, 0.13), paddingBottom: fine ? "max(20px, env(safe-area-inset-bottom))" : undefined }}
        >
          {decor}
          <div className={`relative mx-auto ${fine ? "max-w-[960px]" : "max-w-[720px]"}`}>
            {closeButton}
            {content}
          </div>
        </div>
      </div>
    );
  }

  if (layout === "flyout") {
    const width = WIDTH.flyout[style.size];
    return (
      <div className={`${position} inset-0 z-[60] @container pointer-events-none`}>
        {motionStyle}
        <div
          {...dialogProps}
          className={
            fine
              ? `pointer-events-auto absolute inset-x-4 bottom-4 max-h-[85%] overflow-y-auto p-5 @xl:inset-x-auto @xl:bottom-5 @xl:right-5 @xl:w-[var(--sib-w)] @xl:p-6 ${enter}`
              : "pointer-events-auto absolute bottom-4 right-4 max-h-[85%] overflow-y-auto p-5"
          }
          style={{
            ...panelBase,
            ...(fine ? { ["--sib-w" as string]: `${width}px` } : { width: `min(${width}px, calc(100% - 32px))` }),
            borderRadius: radius.panel,
            boxShadow: fine ? `0 24px 64px rgba(0,0,0,0.22), 0 0 0 1px ${withAlpha(ink, 0.06)}${luxeEdge}` : `0 20px 60px rgba(0,0,0,0.25)${luxeEdge}`,
          }}
        >
          {decor}
          {artLayer}
          <div className="relative">
            {closeButton}
            {content}
          </div>
        </div>
      </div>
    );
  }

  const overlay = { background: `rgba(0, 0, 0, ${style.overlay / 100})` };
  const splitImage = (className: string) => image(className);

  if (layout === "fullscreen") {
    return (
      <div className={`${position} inset-0 z-[60] @container ${veil}`} style={overlay}>
        {motionStyle}
        <div {...dialogProps} className={`absolute inset-0 overflow-y-auto ${enter}`} style={panelBase}>
          {decor}
          {artLayer}
          {closeButton}
          {split ? (
            <div className="grid min-h-full @2xl:grid-cols-2">
              <div className={imagePosition === "right" ? "@2xl:order-2" : undefined}>{splitImage("h-48 w-full @2xl:h-full")}</div>
              <div className={`grid place-items-center ${fine ? "p-6 pt-8 @2xl:p-14" : "p-6 @2xl:p-12"}`}>{content}</div>
            </div>
          ) : (
            <div className={`grid min-h-full place-items-center ${fine ? "p-6 pt-16 @2xl:p-14" : "p-6 pt-16 @2xl:p-12"}`}>{content}</div>
          )}
        </div>
      </div>
    );
  }

  // Centre pop-up (optionally with the picture on the left or right: on top on phones).
  const width = split ? WIDTH.split[style.size] : WIDTH.modal[style.size];
  return (
    <div className={`${position} inset-0 z-[60] grid place-items-center p-4 @container ${veil}`} style={overlay} onClick={(event) => !preview && event.target === event.currentTarget && onClose()}>
      {motionStyle}
      <div
        {...dialogProps}
        className={`relative w-full overflow-y-auto ${split ? "" : fine ? "p-6 @md:p-8" : "p-6"} ${enter}`}
        style={{
          ...panelBase,
          maxWidth: width,
          maxHeight: preview ? "92%" : "90dvh",
          borderRadius: radius.panel,
          boxShadow: fine ? `0 32px 90px rgba(0,0,0,0.32), 0 0 0 1px ${withAlpha(ink, 0.06)}${luxeEdge}` : `0 30px 80px rgba(0,0,0,0.3)${luxeEdge}`,
        }}
      >
        {decor}
        {artLayer}
        {closeButton}
        {split ? (
          <div className={fine ? "grid @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : "grid @2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"}>
            <div className={`relative ${imagePosition === "right" ? "@2xl:order-2" : ""}`}>{splitImage(fine ? "h-40 w-full @md:h-48 @2xl:absolute @2xl:inset-0 @2xl:h-full" : "h-36 w-full @2xl:h-full @2xl:min-h-[380px]")}</div>
            <div className={fine ? "p-6 @md:p-8 @2xl:min-h-[420px] @2xl:content-center @2xl:p-10" : "p-6 @2xl:p-8"}>{content}</div>
          </div>
        ) : (
          <div className={style.decor === "strip" ? "pt-2" : undefined}>{content}</div>
        )}
      </div>
    </div>
  );
}

// ─── Finishing touches ────────────────────────────────────────────────────────

function Decor({ style, fine, button, accent, ink, bg, layout, radius }: { style: PopupStyle; fine: boolean; button: string; accent: string; ink: string; bg: string; layout: PopupLayout; radius: number }) {
  const hex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
  switch (style.decor) {
    case "strip":
      return <div aria-hidden className="absolute inset-x-0 top-0 z-[2] h-2.5" style={{ background: fine && hex(button) && hex(accent) ? `repeating-linear-gradient(135deg, ${button} 0 14px, ${accent} 14px 28px, ${hex(bg) ? mix(bg, "#FFFFFF", 0.6) : "#FFFFFF"} 28px 42px)` : FESTIVE_STRIP, borderTopLeftRadius: layout === "bar" ? 0 : radius, borderTopRightRadius: layout === "bar" ? 0 : radius }} />;
    case "edge":
      // Version 1 drew only the thin gold line (the box shadow); version 2 adds an inner frame.
      return fine ? <div aria-hidden className="pointer-events-none absolute inset-2.5 z-[2] border" style={{ borderColor: withAlpha(button, 0.4), borderRadius: Math.max(0, radius - 6) }} /> : null;
    case "ticket":
      return <div aria-hidden className="pointer-events-none absolute inset-2.5 z-0 border-2 border-dashed" style={{ borderColor: withAlpha(accent, 0.55), borderRadius: Math.max(0, radius - 6) }} />;
    case "flash":
      return <div aria-hidden className="absolute inset-x-0 top-0 z-[2] h-2" style={{ background: `repeating-linear-gradient(-45deg, ${accent} 0 10px, transparent 10px 20px)`, borderTopLeftRadius: radius, borderTopRightRadius: radius }} />;
    case "glow":
      return <div aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{ background: `radial-gradient(circle at 50% 0%, ${withAlpha(accent, 0.35)}, transparent 62%)`, borderRadius: radius }} />;
    case "confetti":
    case "hearts":
    case "stars":
    case "crescent":
      return layout === "bar" ? null : <Scatter kind={style.decor} button={button} accent={accent} ink={ink} />;
    default:
      return null;
  }
}

// Small shapes around the edges (never behind the words' middle), in the pop-up's colours.
const SPOTS: Array<[number, number, number, number]> = [
  [4, 6, 1, 20],
  [14, 3, 0.7, -30],
  [88, 5, 0.9, 40],
  [95, 16, 0.6, 10],
  [3, 42, 0.6, -15],
  [96, 52, 0.8, 25],
  [6, 88, 0.8, 35],
  [92, 92, 0.9, -20],
  [80, 3, 0.55, 60],
];

function Scatter({ kind, button, accent, ink }: { kind: "confetti" | "hearts" | "stars" | "crescent"; button: string; accent: string; ink: string }) {
  const colors = [accent, button, withAlpha(ink, 0.35)];
  if (kind === "crescent") {
    return (
      <svg aria-hidden className="pointer-events-none absolute right-12 top-3 z-0 h-16 w-16 opacity-70" viewBox="0 0 64 64">
        <path d="M40 8a24 24 0 1 0 16 40A20 20 0 1 1 40 8z" fill={accent} />
        <path d="M50 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill={accent} />
      </svg>
    );
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden" style={{ borderRadius: "inherit" }}>
      {SPOTS.map(([x, y, s, r], i) => {
        const color = colors[i % colors.length]!;
        const size = 14 * s;
        const common: CSSProperties = { position: "absolute", left: `${x}%`, top: `${y}%`, width: size, height: size, transform: `translate(-50%, -50%) rotate(${r}deg)`, opacity: 0.85 };
        if (kind === "hearts") {
          return (
            <svg key={i} viewBox="0 0 24 24" style={common}>
              <path d="M12 21C5 16 2 12.5 2 8.5 2 5.5 4.3 3.5 7 3.5c2 0 3.6 1 5 2.8 1.4-1.8 3-2.8 5-2.8 2.7 0 5 2 5 5 0 4-3 7.5-10 12.5z" fill={color} />
            </svg>
          );
        }
        if (kind === "stars") {
          return (
            <svg key={i} viewBox="0 0 24 24" style={common}>
              <path d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5z" fill={color} />
            </svg>
          );
        }
        return <span key={i} style={{ ...common, height: i % 2 ? size * 0.45 : size, borderRadius: i % 3 === 0 ? 999 : 2, background: color }} />;
      })}
    </div>
  );
}

// ─── Countdown and free-delivery progress ─────────────────────────────────────

function Countdown({ endsAt, preview, ink, accent, radius, center }: { endsAt: string | null; preview: boolean; ink: string; accent: string; radius: number; center: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const reference = now ?? 0;
  const target = endsAt ?? (preview ? new Date(reference + SAMPLE_ENDS_IN).toISOString() : null);
  const parts = now === null ? { days: 0, hours: 0, minutes: 0, seconds: 0, ended: false } : countdownParts(target, reference);
  if (parts.ended && !preview) return <p className="m-0 text-[14px] font-bold">This offer has ended.</p>;
  const cells: Array<[number, string]> = [
    [parts.days, "days"],
    [parts.hours, "hrs"],
    [parts.minutes, "mins"],
    [parts.seconds, "secs"],
  ];
  const spoken = `${parts.days} days, ${parts.hours} hours and ${parts.minutes} minutes left`;
  return (
    <div className={`flex gap-2 ${center ? "justify-center" : ""}`} role="timer" aria-label={spoken}>
      {cells.map(([value, label]) => (
        <div key={label} aria-hidden className="grid min-w-[56px] justify-items-center px-2 py-2" style={{ background: withAlpha(ink, 0.07), borderRadius: radius, boxShadow: `inset 0 -3px 0 ${withAlpha(accent, 0.9)}` }}>
          <span className="font-mono text-[24px] font-bold tabular-nums leading-none" style={{ color: ink }}>{String(value).padStart(2, "0")}</span>
          <span className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.12em] opacity-70">{label}</span>
        </div>
      ))}
    </div>
  );
}

function DeliveryProgress({ over, subtotal, currency, ink, accent }: { over: number; subtotal: number; currency: string; ink: string; accent: string }) {
  const state = freeDeliveryProgress(subtotal, over);
  if (!state) return null;
  const money = (n: number) => formatStoreMoney(n, currency);
  return (
    <div className="grid gap-1.5">
      <div className="h-2.5 overflow-hidden rounded-full" style={{ background: withAlpha(ink, 0.1) }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent} aria-label="Progress to free delivery">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(4, state.percent)}%`, background: accent }} />
      </div>
      <p className="m-0 text-[13.5px] font-semibold">
        {state.reached ? "Your bag gets free delivery!" : subtotal > 0 ? `You're ${money(state.remaining)} away from free delivery.` : `Free delivery once your bag reaches ${money(over)}.`}
      </p>
    </div>
  );
}
