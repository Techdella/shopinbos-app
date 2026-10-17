"use client";

import Link from "next/link";
import type React from "react";
import { useT, useLocale } from "@/components/i18n/I18nProvider";
import { useServerNow } from "@/hooks/useServerClock";
import { clockDigits, timeParts, wordsUnit, type CountdownFormat } from "@/lib/store-campaigns/status";
import type { CountdownSettings } from "@/lib/store-campaigns/blocks";
import { useCampaignClock } from "./CampaignContext";

// The one storefront countdown (announcement bar, floating timer, campaign sections, campaign pop-ups use the
// pop-up's own). Ticks from the shared server clock, so every timer on the page agrees with the seller backend.
// Screen readers get one label with the end date instead of a number that changes every second (aria-live off).

export interface CountdownLook {
  /** Digit boxes, words, or plain digits. */
  style: CountdownSettings["style"];
  format: CountdownFormat;
  color?: string;
  boxBackground?: string;
  boxBorder?: string;
  size?: "sm" | "md" | "lg";
}

export function formatEndLabel(target: number, locale: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat(locale === "en" || locale === "pcm" ? "en-NG" : `${locale}-NG`, { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(target));
  } catch {
    return new Date(target).toUTCString();
  }
}

export function CampaignCountdown({
  target,
  look,
  timeZone = "Africa/Lagos",
  expiry = "hide",
  expiredText = "",
  replace,
  className,
}: {
  target: number | null;
  look: CountdownLook;
  timeZone?: string;
  expiry?: CountdownSettings["expiry"];
  expiredText?: string;
  replace?: { text: string; href: string } | null;
  className?: string;
}) {
  const t = useT("campaigns");
  const locale = useLocale();
  const now = useCampaignClock(useServerNow());
  if (target === null) return null;
  const left = target - now;
  const label = t("countdown.endsLabel", { date: formatEndLabel(target, locale, timeZone) });
  // Server render and the first paint show dashes, so the page never flashes the wrong time.
  if (now > 0 && left <= 0) {
    if (expiry === "message" && expiredText) return <span className={className}>{expiredText}</span>;
    if (expiry === "replace" && replace?.text && replace.href) {
      return <Link href={replace.href} className={className} style={{ color: "inherit", textDecoration: "underline" }}>{replace.text}</Link>;
    }
    return null;
  }
  const parts = now > 0 ? timeParts(left) : null;

  if (look.format === "words") {
    const unit = parts ? wordsUnit(left) : null;
    return (
      <span role="timer" aria-live="off" aria-label={label} className={className} style={{ color: look.color, fontVariantNumeric: "tabular-nums" }}>
        {unit ? (unit.unit === "days" ? t("countdown.left.days", { count: unit.count }) : unit.unit === "hours" ? t("countdown.left.hours", { count: unit.count }) : t("countdown.left.minutes", { count: unit.count })) : "…"}
      </span>
    );
  }

  if (look.style === "boxed") {
    const units: Array<[string, number | null]> = look.format === "hms"
      ? [[t("countdown.unit.hours"), parts?.totalHours ?? null], [t("countdown.unit.minutes"), parts?.minutes ?? null], [t("countdown.unit.seconds"), parts?.seconds ?? null]]
      : [[t("countdown.unit.days"), parts?.days ?? null], [t("countdown.unit.hours"), parts?.hours ?? null], [t("countdown.unit.minutes"), parts?.minutes ?? null], [t("countdown.unit.seconds"), parts?.seconds ?? null]];
    const big = look.size === "lg";
    const small = look.size === "sm";
    const box: React.CSSProperties = {
      minWidth: big ? 64 : small ? 30 : 46,
      padding: big ? "10px 8px" : small ? "2px 4px" : "6px 6px",
      borderRadius: big ? 12 : 8,
      background: look.boxBackground ?? "rgba(0,0,0,.25)",
      border: look.boxBorder ? `1px solid ${look.boxBorder}` : undefined,
      color: look.color,
      fontSize: big ? 34 : small ? 13 : 22,
      fontWeight: 700,
      lineHeight: 1.1,
      fontVariantNumeric: "tabular-nums",
      textAlign: "center",
    };
    return (
      <span role="timer" aria-live="off" aria-label={label} className={className} style={{ display: "inline-flex", gap: small ? 4 : 8, alignItems: "flex-start" }}>
        {units.map(([name, value]) => (
          <span key={name} aria-hidden style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={box}>{value === null ? "--" : String(value).padStart(2, "0")}</span>
            {small ? null : <span style={{ fontSize: big ? 11 : 9.5, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.75, color: look.color }}>{name}</span>}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={label}
      className={className}
      style={{ color: look.color, fontVariantNumeric: "tabular-nums", fontWeight: look.style === "minimal" ? 500 : 700, fontSize: look.size === "lg" ? 28 : undefined, letterSpacing: "0.02em" }}
    >
      {parts ? clockDigits(left, look.format) : look.format === "hms" ? "--:--:--" : "--:--:--:--"}
    </span>
  );
}
