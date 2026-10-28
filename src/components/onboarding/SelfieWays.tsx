"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { QrCode } from "@/components/payment-links/QrCode";
import { PLAY_STORE_WEB_URL } from "@shared/app-release";

// The selfie step on a computer (the 2026 "Web onboarding, verify identity" design): "Continue on my phone" or "Use
// this computer's camera". There is no separate hand-off service: the QR code (and the WhatsApp link) simply open this
// same sign-up page on the phone, where the person signs in with the same account and takes the selfie with the
// phone's camera. Meanwhile this page re-reads the sign-up state every few seconds (`check`, the same GET the page
// already uses) and moves on by itself once the selfie has arrived. On a phone or tablet only the camera is shown.

const POLL_MS = 5000;

export function SelfieWays({ phonePath, check, onArrived, children }: {
  /** Same-site path of this sign-up page, opened on the phone (e.g. "/logistics/verification?step=selfie"). */
  phonePath: string;
  /** True once a selfie sent from another device is in. */
  check: () => Promise<boolean>;
  onArrived: () => void;
  /** The camera capture, as on the phone. */
  children: ReactNode;
}) {
  const t = useT("verification");
  const [desktop, setDesktop] = useState(false);
  const [mode, setMode] = useState<"phone" | "camera">("phone");
  const [url, setUrl] = useState("");
  const latest = useRef({ check, onArrived });
  useEffect(() => {
    latest.current = { check, onArrived };
  });

  useEffect(() => {
    const wide = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
    const update = () => setDesktop(wide.matches);
    update();
    setUrl(new URL(phonePath, window.location.origin).toString());
    wide.addEventListener("change", update);
    return () => wide.removeEventListener("change", update);
  }, [phonePath]);

  const waiting = desktop && mode === "phone";
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      void latest.current.check().then((arrived) => {
        if (arrived && !stopped) {
          stopped = true;
          window.clearInterval(timer);
          latest.current.onArrived();
        }
      }, () => undefined);
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [waiting]);

  if (!desktop) {
    return (
      <div className="grid gap-3">
        {children}
        <a href={PLAY_STORE_WEB_URL} target="_blank" rel="noopener noreferrer" className="justify-self-start text-[14px] font-bold text-app-ink underline underline-offset-4">
          {t("phone.app")}
        </a>
      </div>
    );
  }

  const option = (key: "phone" | "camera", title: string, sub: string, badge?: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === key}
      onClick={() => setMode(key)}
      className={cx(
        "flex flex-1 basis-[240px] flex-col gap-2.5 rounded-[24px] border-2 p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ink focus-visible:ring-offset-2",
        mode === key ? "border-app-forest bg-app-mint" : "border-app-line bg-white hover:border-app-line-strong",
      )}
    >
      {badge && <span className="self-start rounded-full bg-[#FFE27A] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.05em] text-app-ink">{badge}</span>}
      <span className="text-[19px] font-extrabold">{title}</span>
      <span className="text-[14px] leading-[1.45] text-app-ink-soft">{sub}</span>
    </button>
  );

  return (
    <div className="grid gap-5">
      <div role="radiogroup" aria-label={t("phone.choose")} className="flex flex-wrap gap-4">
        {option("phone", t("phone.option"), t("phone.optionSub"), t("phone.easiest"))}
        {option("camera", t("phone.computer"), t("phone.computerSub"))}
      </div>
      {mode === "phone" ? (
        <div className="flex flex-wrap items-center gap-7 rounded-[28px] bg-app-canvas p-6">
          {url ? <QrCode value={url} label={t("phone.qr")} size={184} /> : <span className="block h-[184px] w-[184px] rounded-[12px] bg-white" aria-hidden />}
          <div className="grid min-w-[240px] flex-1 gap-2.5">
            <b className="text-[21px] font-extrabold">{t("phone.scanTitle")}</b>
            <span className="text-[15px] leading-[1.5] text-app-ink-soft">{t("phone.scanSub")}</span>
            <span className="inline-flex items-center gap-2 text-[14px] font-bold text-app-forest" role="status">
              <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-app-success shadow-[0_0_0_5px_var(--color-app-success-tint)]" />
              {t("phone.waiting")}
            </span>
            <span className="flex flex-wrap gap-x-5 gap-y-2">
              <a href={`https://wa.me/?text=${encodeURIComponent(t("phone.whatsappText", { url }))}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-app-forest underline underline-offset-4">
                <Icon name="whatsapp" size={16} /> {t("phone.whatsapp")}
              </a>
              <a href={PLAY_STORE_WEB_URL} target="_blank" rel="noopener noreferrer" className="text-[14px] font-bold text-app-ink underline underline-offset-4">
                {t("phone.app")}
              </a>
            </span>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
