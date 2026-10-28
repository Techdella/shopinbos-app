"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { QrCode } from "@/components/payment-links/QrCode";
import type { HandoffPurpose } from "@/lib/kyc/handoff-shared";

// "Do it on your phone" for the selfie and ID photo screens (delivery partner and supplier sign-up): a QR code for a
// 20-minute phone link (/verify/phone/[token], src/lib/kyc/handoff.ts), then the screen checks every 3 seconds and
// moves on by itself once the phone has sent it. On a computer the QR code comes first, with this computer's camera
// as the other way; on a phone the screen's own camera comes first, and the code shows only if that camera fails.

const POLL_MS = 3000;

/** A phone or tablet: a touch screen as the main pointer. */
function useTouchDevice() {
  const [touch, setTouch] = useState<boolean | null>(null);
  useEffect(() => {
    setTouch(typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  }, []);
  return touch;
}

/** The QR card: makes the link, shows it, and waits for the phone. */
export function PhoneHandoffCard({ purpose, createUrl, arrived, onArrived, note }: {
  purpose: HandoffPurpose;
  /** POST endpoint answering { data: { url, expiresAt } }. */
  createUrl: string;
  /** True once the phone's selfie or ID photo has reached the server. */
  arrived: () => Promise<boolean>;
  onArrived: () => void;
  note?: string;
}) {
  const t = useT("handoff");
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [copied, setCopied] = useState(false);
  const arrivedRef = useRef(arrived);
  const onArrivedRef = useRef(onArrived);
  arrivedRef.current = arrived;
  onArrivedRef.current = onArrived;

  const make = useCallback(async () => {
    setFailed(false);
    setExpired(false);
    const response = await fetch(createUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose }) }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { data?: { url?: string; expiresAt?: string } } | null;
    if (!response?.ok || !body?.data?.url) return setFailed(true);
    setLink({ url: body.data.url, expiresAt: Date.parse(body.data.expiresAt ?? "") || Date.now() + 20 * 60_000 });
  }, [createUrl, purpose]);

  useEffect(() => {
    void make();
  }, [make]);

  // Wait for the phone while the code is valid.
  useEffect(() => {
    if (!link || expired) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      if (Date.now() >= link.expiresAt) {
        setExpired(true);
        return;
      }
      void arrivedRef.current().then((done) => {
        if (done && !stopped) {
          stopped = true;
          window.clearInterval(timer);
          onArrivedRef.current();
        }
      }).catch(() => null);
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [link, expired]);

  return (
    <div className="grid gap-3 rounded-[22px] border-2 border-app-ink bg-white p-5">
      <div className="flex items-center gap-2 text-[18px] font-extrabold"><Icon name="phone" size={20} /> {t("card.title")}</div>
      {note && <p className="m-0 text-[14.5px] font-bold text-app-danger">{note}</p>}
      <p className="m-0 text-[15px] leading-[1.5] text-app-ink-soft">{purpose === "id" ? t("card.subId") : t("card.subSelfie")}</p>
      {failed ? (
        <p className="m-0 text-[14.5px] font-bold text-app-danger" role="alert">{t("card.failed")}</p>
      ) : expired ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14.5px] font-bold">{t("card.expired")}</span>
          <PillButton tone="white" size="md" onClick={() => void make()}>{t("card.newCode")}</PillButton>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          {link ? <QrCode value={link.url} label={t("card.qrLabel")} size={176} /> : <span className="block h-[176px] w-[176px] animate-pulse rounded-[12px] bg-app-canvas" aria-hidden />}
          <div className="grid min-w-0 flex-1 gap-2">
            <span className="text-[13.5px] text-app-ink-soft">{t("card.orLink")}</span>
            {link && <span className="break-all font-mono text-[12.5px]">{link.url}</span>}
            {link && (
              <PillButton
                tone="white"
                size="sm"
                className="justify-self-start"
                onClick={() => void navigator.clipboard?.writeText(link.url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }).catch(() => null)}
              >
                {copied ? t("card.copied") : t("card.copy")}
              </PillButton>
            )}
            <span className="inline-flex items-center gap-2 text-[14px] font-bold text-app-ink-soft"><span className="h-2 w-2 animate-pulse rounded-full bg-app-accent" aria-hidden /> {t("card.waiting")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The selfie or ID photo screen's two ways: the QR card (phone) and `children` (this device's camera). `cameraFailed`
 * (this device's face check or camera didn't start) brings the QR card up with a note.
 */
export function PhoneOrThisDevice({ purpose, createUrl, arrived, onArrived, cameraFailed = false, children }: {
  purpose: HandoffPurpose;
  createUrl: string;
  arrived: () => Promise<boolean>;
  onArrived: () => void;
  cameraFailed?: boolean;
  children: ReactNode;
}) {
  const t = useT("handoff");
  const touch = useTouchDevice();
  const [usePhone, setUsePhone] = useState<boolean | null>(null);
  const phoneFirst = usePhone ?? (touch === null ? null : !touch);
  useEffect(() => {
    if (cameraFailed) setUsePhone(true);
  }, [cameraFailed]);
  if (phoneFirst === null) return null;

  const card = <PhoneHandoffCard purpose={purpose} createUrl={createUrl} arrived={arrived} onArrived={onArrived} note={cameraFailed ? t("card.cameraFailed") : undefined} />;
  // On a phone the camera here comes first; a failed one adds the code (for another phone) below it.
  if (touch) {
    return (
      <div className="grid gap-3">
        {children}
        {cameraFailed && card}
      </div>
    );
  }
  if (phoneFirst) {
    return (
      <div className="grid gap-3">
        {card}
        <button type="button" className="justify-self-start text-[14.5px] font-bold underline" onClick={() => setUsePhone(false)}>{t("card.useComputer")}</button>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {children}
      <button type="button" className="justify-self-start text-[14.5px] font-bold underline" onClick={() => setUsePhone(true)}>{t("card.usePhone")}</button>
    </div>
  );
}
