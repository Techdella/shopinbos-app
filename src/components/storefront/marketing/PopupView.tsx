"use client";

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { DEFAULT_POPUP_STYLE, badgeText, popupHeadingFont, rewardLabel, type FormDesign, type FormField, type PopupLayout, type PopupRewardSummary } from "@/lib/marketing/forms";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { SignupForm, SignupSuccess, type SignupColors, type SignupResult, type SignupShape } from "./SignupForm";

// The one pop-up renderer: the storefront shows it for real, and the seller's editor and template gallery show
// it as a preview (positioned inside a box instead of the window, nothing sent). Layout follows the width of the
// window (or the preview box) through container queries, so the phone preview is what phones get.
// Live: a centre or full-screen pop-up traps focus and stops the page scrolling; Esc closes every kind.

export interface RenderablePopup {
  id: string;
  fields: FormField[];
  design: FormDesign;
  layout: PopupLayout;
  reward: PopupRewardSummary | null;
  afterSubmit: "message" | "redirect";
  redirectUrl: string;
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

/** "#RRGGBB" + alpha → rgba(); anything else is returned as is. */
export function withAlpha(color: string, alpha: number) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  if (!m) return color;
  return `rgba(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}, ${alpha})`;
}

/** "Get 10% off your first order." */
export function rewardLine(reward: PopupRewardSummary | null, currency = "NGN") {
  if (!reward) return null;
  const label = reward.label || rewardLabel(reward);
  const min = reward.minOrder > 0 ? ` On orders over ${formatStoreMoney(reward.minOrder, currency)}.` : "";
  if (reward.type === "percentage" || reward.type === "fixed_amount") return `Get ${label.toLowerCase()} your first order.${min}`;
  return `${label} on your first order.${min}`;
}

const SAMPLE_RESULT: SignupResult = {
  code: "WELCOME-7FQ2KD",
  message: "",
  alreadySubscribed: false,
  reward: { label: "10% off", expiresAt: null, minOrder: 0, again: false },
};

export function PopupView({
  popup,
  storeSlug,
  colors,
  result,
  onResult,
  onClose,
  preview = false,
  currency = "NGN",
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
  const style = design.style ?? DEFAULT_POPUP_STYLE; // a response cached from before styles existed
  const modal = layout === "modal" || layout === "fullscreen";

  useEffect(() => {
    if (preview) return;
    const previous = document.activeElement as HTMLElement | null;
    if (modal) panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
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
    preview === "success"
      ? {
          ...SAMPLE_RESULT,
          message: design.successMessage,
          code: popup.reward ? SAMPLE_RESULT.code : null,
          reward: popup.reward ? { label: popup.reward.label, expiresAt: null, minOrder: popup.reward.minOrder, again: false } : null,
        }
      : result;
  const bg = style.background || colors.paper;
  const ink = style.text || colors.ink;
  const button = style.button || colors.accent;
  const buttonText = style.buttonText || colors.accentText;
  const formColors: SignupColors = { ink, paper: bg, accent: button, accentText: buttonText, heading: colors.heading };
  const radius = RADIUS[style.radius];
  const shape: SignupShape = { input: radius.input, button: radius.button };
  const headingFont = popupHeadingFont(style.font, colors.heading);
  const position = preview ? "absolute" : "fixed";

  // A picture only where there is one (the preview shows where it would go).
  const hasImage = Boolean(design.imageUrl) || Boolean(preview);
  const imagePosition = layout === "bar" || !hasImage ? "none" : style.imagePosition;
  const split = imagePosition === "left" && (layout === "modal" || layout === "fullscreen");
  const imageUrl = design.imageUrl ? design.imageUrl.replace(/"/g, "%22") : "";
  const placeholder = `linear-gradient(135deg, ${withAlpha(button, 0.35)}, ${withAlpha(ink, 0.18)})`;
  const backgroundImage =
    imagePosition === "background" ? `linear-gradient(${withAlpha(bg, 0.82)}, ${withAlpha(bg, 0.82)}), ${imageUrl ? `url("${imageUrl}")` : placeholder}` : undefined;

  const image = (className: string, imgStyle?: CSSProperties) =>
    imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" className={`${className} object-cover`} style={imgStyle} />
    ) : (
      <div aria-hidden className={className} style={{ ...imgStyle, background: placeholder }} />
    );

  const badge = style.template === "badge" || style.badgeText ? badgeText(style, popup.reward) : "";
  const line = rewardLine(popup.reward, currency);
  const big = layout === "fullscreen";

  const closeButton =
    style.closeStyle === "text" ? null : (
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

  const content = (
    <div className={big ? "w-full max-w-[480px]" : undefined}>
      {imagePosition === "top" ? image(`mb-4 w-full ${big ? "h-56" : "h-40"}`, { borderRadius: radius.input + 4 }) : null}
      {badge ? (
        <div className="mb-2 font-black uppercase leading-none tracking-[-0.02em]" style={{ color: button, fontFamily: headingFont, fontSize: big ? "clamp(48px, 9cqi, 88px)" : "clamp(40px, 11cqi, 60px)" }}>
          {badge}
        </div>
      ) : null}
      <h2
        id={titleId}
        className={`m-0 pr-10 font-bold leading-tight ${big ? "text-[28px] @2xl:text-[38px]" : "text-[22px]"}`}
        style={{ fontFamily: headingFont, letterSpacing: style.template === "luxe" ? "0.01em" : undefined }}
      >
        {design.headline}
      </h2>
      {!shown ? (
        <>
          <p id={descId} className="mb-4 mt-2 text-[14.5px] leading-[1.5] opacity-80">
            {design.body}
            {line ? <strong className="block pt-1 opacity-100">{line}</strong> : null}
          </p>
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
              if (popup.afterSubmit === "redirect" && popup.redirectUrl && !next.code) window.location.assign(popup.redirectUrl);
            }}
          />
        </>
      ) : (
        <div className="mt-3">
          <SignupSuccess result={shown} colors={formColors} shape={shape} onShop={onClose} currency={currency} />
        </div>
      )}
      {style.closeStyle === "text" ? (
        <div className="mt-2 text-center">
          <button type="button" onClick={onClose} className="min-h-[40px] px-3 text-[13.5px] underline underline-offset-4 opacity-75 hover:opacity-100">
            No thanks
          </button>
        </div>
      ) : null}
    </div>
  );

  const decor: ReactNode = style.template === "festive" ? <div aria-hidden className="absolute inset-x-0 top-0 h-2.5" style={{ background: FESTIVE_STRIP }} /> : null;
  const luxeEdge = style.template === "luxe" ? `, inset 0 0 0 1px ${withAlpha(button, 0.45)}` : "";
  const panelBase: CSSProperties = { background: bg, color: ink, backgroundImage, backgroundSize: "cover", backgroundPosition: "center" };
  const dialogProps = {
    ref: panelRef,
    role: "dialog" as const,
    "aria-modal": modal && !preview ? true : undefined,
    "aria-labelledby": titleId,
    "aria-describedby": shown ? undefined : descId,
  };

  if (layout === "bar") {
    return (
      <div className={`${position} inset-0 z-[60] @container pointer-events-none`}>
        <div {...dialogProps} className="pointer-events-auto absolute inset-x-0 bottom-0 max-h-[85%] overflow-y-auto border-t px-4 pb-6 pt-5 shadow-[0_-12px_40px_rgba(0,0,0,0.18)] @xl:px-6" style={{ ...panelBase, borderColor: withAlpha(ink, 0.13) }}>
          {decor}
          <div className="relative mx-auto max-w-[720px]">
            {closeButton}
            {content}
          </div>
        </div>
      </div>
    );
  }

  if (layout === "flyout") {
    return (
      <div className={`${position} inset-0 z-[60] @container pointer-events-none`}>
        <div
          {...dialogProps}
          className="pointer-events-auto absolute bottom-4 right-4 max-h-[85%] overflow-y-auto p-5"
          style={{ ...panelBase, width: `min(${WIDTH.flyout[style.size]}px, calc(100% - 32px))`, borderRadius: radius.panel, boxShadow: `0 20px 60px rgba(0,0,0,0.25)${luxeEdge}` }}
        >
          {decor}
          <div className="relative">
            {closeButton}
            {content}
          </div>
        </div>
      </div>
    );
  }

  const overlay = { background: `rgba(0, 0, 0, ${style.overlay / 100})` };

  if (layout === "fullscreen") {
    return (
      <div className={`${position} inset-0 z-[60] @container`} style={overlay}>
        <div {...dialogProps} className="absolute inset-0 overflow-y-auto" style={panelBase}>
          {decor}
          {closeButton}
          {split ? (
            <div className="grid min-h-full @2xl:grid-cols-2">
              {image("h-48 w-full @2xl:h-full")}
              <div className="grid place-items-center p-6 @2xl:p-12">{content}</div>
            </div>
          ) : (
            <div className="grid min-h-full place-items-center p-6 pt-16 @2xl:p-12">{content}</div>
          )}
        </div>
      </div>
    );
  }

  // Centre pop-up (optionally with the picture on the left: on top on phones).
  const width = split ? WIDTH.split[style.size] : WIDTH.modal[style.size];
  return (
    <div className={`${position} inset-0 z-[60] grid place-items-center p-4 @container`} style={overlay} onClick={(event) => !preview && event.target === event.currentTarget && onClose()}>
      <div
        {...dialogProps}
        className={`relative w-full overflow-y-auto ${split ? "" : "p-6"}`}
        style={{ ...panelBase, maxWidth: width, maxHeight: preview ? "92%" : "90dvh", borderRadius: radius.panel, boxShadow: `0 30px 80px rgba(0,0,0,0.3)${luxeEdge}` }}
      >
        {decor}
        {closeButton}
        {split ? (
          <div className="grid @2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            {image("h-36 w-full @2xl:h-full @2xl:min-h-[380px]")}
            <div className="p-6 @2xl:p-8">{content}</div>
          </div>
        ) : (
          <div className={style.template === "festive" ? "pt-2" : undefined}>{content}</div>
        )}
      </div>
    </div>
  );
}
