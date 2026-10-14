"use client";

// The dark green panel beside the sign-up / sign-in forms on wide screens (Prototype 10): the promise, three cards
// that show a day on Shopinbos (an order, Peggy answering on WhatsApp, a rider on the way) drifting gently, the
// channels, and a mascot sticker (Rex cheering on sign-up, Peggy waving on sign-in). Hidden on phones.

import type { CSSProperties } from "react";
import { Icon } from "@/components/ui/Icon";
import { Mascot } from "@/components/brand/Mascot";
import { useT } from "@/components/i18n/I18nProvider";
import "./auth-showcase.css";

const tilt = (deg: number, delay: number) => ({ "--sb-tilt": `${deg}deg`, "--sb-delay": `${delay}s` }) as CSSProperties;

export function AuthShowcasePanel({ who = "rex" }: { who?: "rex" | "peggy" }) {
  const t = useT("auth");
  return (
    <aside
      aria-label={t("panel.aria")}
      className="relative hidden overflow-hidden rounded-[28px] p-14 text-white lg:flex lg:flex-col"
      style={{ background: "radial-gradient(circle at 78% 30%, rgba(115,216,200,0.20), transparent 42%), linear-gradient(160deg, #11524B 0%, #0E4A44 45%, #0A3B36 100%)" }}
    >
      <div className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-[#73D8C8]">Shopinbos</div>
      <p className="m-0 mt-3 max-w-[460px] text-[44px] font-extrabold leading-[1.02] tracking-[-1.4px]">{t("panel.headline")}</p>

      <div className="relative mt-14 flex flex-1 flex-col gap-10" aria-hidden>
        <div className="sb-auth-float flex w-[290px] items-center gap-3 rounded-[16px] bg-white px-4 py-3.5 text-app-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)]" style={tilt(1, 0)}>
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-app-success-tint text-app-success"><Icon name="bag" size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] text-app-ink-soft">{t("panel.newOrder")}</span>
            <span className="block text-[18px] font-extrabold">₦18,500</span>
          </span>
          <span className="rounded-full bg-app-success-tint px-2.5 py-1 text-[12px] font-bold text-app-success">{t("panel.paid")}</span>
        </div>
        <div className="sb-auth-float ml-16 w-[330px] rounded-[16px] bg-white px-4 py-3.5 text-app-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)]" style={tilt(-0.5, 1.4)}>
          <span className="flex items-center gap-2 text-[13.5px] font-bold text-[#0E4A44]">
            <Mascot who="peggy" size={22} still decorative />
            {t("panel.peggyReplied")}
          </span>
          <span className="mt-2 block text-[14px] leading-[1.5]">“{t("panel.peggyQuote")}”</span>
        </div>
        <div className="sb-auth-float flex w-[250px] items-center gap-3 rounded-[16px] bg-white px-4 py-3.5 text-app-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)]" style={tilt(0.5, 2.6)}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-app-peach text-app-accent"><Icon name="truck" size={17} /></span>
          <span className="min-w-0">
            <span className="block text-[14.5px] font-bold">{t("panel.rider")}</span>
            <span className="block text-[12.5px] text-app-ink-soft">{t("panel.arrives")}</span>
          </span>
        </div>
      </div>

      <div className="relative mt-10 flex items-end justify-between gap-6">
        <ul className="m-0 flex max-w-[300px] list-none flex-wrap gap-2.5 p-0" aria-label={t("panel.channels")}>
          {["WhatsApp", "Instagram", "TikTok", t("panel.cod")].map((chip) => (
            <li key={chip} className="rounded-full border border-white/20 bg-white/[0.06] px-3.5 py-1.5 text-[14px] font-bold">{chip}</li>
          ))}
        </ul>
        {/* Rex cheering (sign-up) or Peggy waving (sign-in): the animated WebP sticker at this size. */}
        <Mascot who={who} mood={who === "rex" ? "celebrate" : "wave"} size={190} decorative className="-mb-6 -mr-6" />
      </div>
    </aside>
  );
}
