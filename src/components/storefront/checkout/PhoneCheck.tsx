"use client";

// The checkout phone check for delivery partners (spec §6.1: the rider needs "a verified phone number"). When the
// chosen delivery option books a delivery partner (hasPartnerParcels), the shopper gets a 6-digit code by WhatsApp or
// SMS, types it in, and the order carries the phoneToken the server gave back (checked by the checkout API). Used by
// the checkout page and payment links. Server side: src/app/api/public/store/[slug]/checkout/phone-code and
// phone-verify, src/lib/commerce/phone-verify(.server).ts.
//
// - The store says once whether it asks at all (GET phone-code: false when it can't send codes, e.g. dev without
//   SMS keys; checkout then skips the check too).
// - The token is per phone: changing the number clears the tick. It is kept in sessionStorage per store and phone,
//   so a reload doesn't ask again (the server's token lasts 24 hours).

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ShopperTheme } from "@/components/storefront/shopper/theme";

const ERROR = "#B42318";
const OK = "#067647";
const CODE_LENGTH = 6;

export const PHONE_CHECK_MESSAGE = "Verify your phone number so the delivery partner can reach you.";

/** The phone in E.164, with the same rules as the server (src/lib/sms/pure.ts e164): "0803…" → "+234803…". */
export function phoneCheckKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (!raw.startsWith("+") && digits.length === 11 && digits.startsWith("0")) digits = `234${digits.slice(1)}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

const storageKey = (storeSlug: string, phone: string) => `shopinbos:phone-check:${storeSlug}:${phone}`;

function readSaved(storeSlug: string, phone: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(storeSlug, phone));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown };
    if (typeof saved.token !== "string" || typeof saved.expiresAt !== "number" || saved.expiresAt < Date.now() + 60_000) return null;
    return saved.token;
  } catch {
    return null;
  }
}

function writeSaved(storeSlug: string, phone: string, value: { token: string; expiresAt: number } | null) {
  try {
    if (value) window.sessionStorage.setItem(storageKey(storeSlug, phone), JSON.stringify(value));
    else window.sessionStorage.removeItem(storageKey(storeSlug, phone));
  } catch {}
}

interface Sent {
  phone: string;
  challenge: string;
  channel: "whatsapp" | "sms";
  /** When "Resend" opens again (ms). */
  resendAt: number;
}

export interface PhoneCheckState {
  /** The check applies now: a partner option is chosen and the store asks for it. */
  active: boolean;
  verified: boolean;
  /** Send with the order (only when active and verified). */
  phoneToken: string | undefined;
  /** What stops the order, or null. */
  blocker: string | null;
  phone: string | null;
  sent: Sent | null;
  code: string;
  busy: "send" | "verify" | null;
  error: string | null;
  secondsLeft: number;
  setCode: (value: string) => void;
  send: (via?: "sms") => void;
  verify: (code?: string) => void;
  /** Shows a message in the box (e.g. when the order is blocked). */
  showError: (message: string) => void;
  /** The server refused the token: forget it and ask again. */
  forget: () => void;
}

/**
 * State for the phone check. `enabled`: the store uses delivery partners and this is the live store (not a preview).
 * `needed`: the chosen option books a partner (hasPartnerParcels).
 */
export function usePhoneCheck({ storeSlug, phone: rawPhone, enabled, needed }: { storeSlug: string; phone: string; enabled: boolean; needed: boolean }): PhoneCheckState {
  const phone = phoneCheckKey(rawPhone);
  const [required, setRequired] = useState<boolean | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCodeValue] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  // Does this store ask at all? Once per page.
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/checkout/phone-code`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (live && typeof json?.data?.required === "boolean") setRequired(json.data.required);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, storeSlug]);

  // A number verified earlier in this tab (reload, back from payment) counts again.
  useEffect(() => {
    if (!enabled || !phone) return;
    const saved = readSaved(storeSlug, phone);
    if (saved) setTokens((prev) => (prev[phone] === saved ? prev : { ...prev, [phone]: saved }));
  }, [enabled, storeSlug, phone]);

  // A different number: the code sent to the old one no longer applies.
  const activeSent = sent && sent.phone === phone ? sent : null;
  useEffect(() => {
    setCodeValue("");
    setError(null);
  }, [phone]);

  // The resend countdown.
  useEffect(() => {
    if (!activeSent) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activeSent]);

  const token = phone ? tokens[phone] : undefined;
  // Until the store answers, assume it asks (the server decides anyway).
  const active = enabled && needed && required !== false;
  const verified = Boolean(token);

  const send = useCallback((via?: "sms") => {
    if (!phone) {
      setError("Enter your phone number first.");
      return;
    }
    setBusy("send");
    setError(null);
    fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/checkout/phone-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, via }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) return setError(json?.error?.message ?? "We couldn't send a code. Try again.");
        if (json?.data?.required === false) return setRequired(false);
        const resendAfter = typeof json?.data?.resendAfter === "number" ? json.data.resendAfter : 45;
        setSent({ phone, challenge: String(json?.data?.challenge ?? ""), channel: json?.data?.channel === "whatsapp" ? "whatsapp" : "sms", resendAt: Date.now() + resendAfter * 1000 });
        setCodeValue("");
        window.requestAnimationFrame(() => document.getElementById("phone-check-code")?.focus());
      })
      .catch(() => setError("Network error. Check your connection and try again."))
      .finally(() => setBusy(null));
  }, [phone, storeSlug]);

  const verify = useCallback((typed?: string) => {
    const value = (typed ?? code).replace(/\D/g, "");
    if (!phone || !activeSent) return;
    if (value.length !== CODE_LENGTH) {
      setError("Enter the 6-digit code we sent you.");
      return;
    }
    setBusy("verify");
    setError(null);
    fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/checkout/phone-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code: value, challenge: activeSent.challenge }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || typeof json?.data?.phoneToken !== "string") {
          if (json?.error?.code === "CODE_EXPIRED") setSent(null);
          setCodeValue("");
          return setError(json?.error?.message ?? "We couldn't check the code. Try again.");
        }
        const phoneToken = json.data.phoneToken as string;
        setTokens((prev) => ({ ...prev, [phone]: phoneToken }));
        writeSaved(storeSlug, phone, { token: phoneToken, expiresAt: Number(json.data.expiresAt) || Date.now() + 60 * 60_000 });
        setSent(null);
        setCodeValue("");
      })
      .catch(() => setError("Network error. Check your connection and try again."))
      .finally(() => setBusy(null));
  }, [code, phone, activeSent, storeSlug]);

  const setCode = useCallback((value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCodeValue(digits);
    setError(null);
    // All 6 digits typed (or pasted, or filled from the SMS): check straight away.
    if (digits.length === CODE_LENGTH && busy === null) verify(digits);
  }, [busy, verify]);

  const forget = useCallback(() => {
    if (!phone) return;
    setTokens((prev) => {
      const next = { ...prev };
      delete next[phone];
      return next;
    });
    writeSaved(storeSlug, phone, null);
  }, [phone, storeSlug]);

  return {
    active,
    verified,
    phoneToken: active && token ? token : undefined,
    blocker: active && !verified ? PHONE_CHECK_MESSAGE : null,
    phone,
    sent: activeSent,
    code,
    busy,
    error,
    secondsLeft: activeSent ? Math.max(0, Math.ceil((activeSent.resendAt - now) / 1000)) : 0,
    setCode,
    send,
    verify,
    showError: setError,
    forget,
  };
}

/** The box under the delivery options: Verify → code → verified tick. Renders nothing when the check doesn't apply. */
export function PhoneCheck({ theme, check, id = "co-phone-check" }: { theme: ShopperTheme; check: PhoneCheckState; id?: string }) {
  if (!check.active) return null;
  const button = "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold disabled:cursor-not-allowed disabled:opacity-50";
  const link = "min-h-11 text-[14px] font-semibold underline underline-offset-4 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60";
  return (
    <div id={id} tabIndex={-1} className="mt-3 grid gap-2.5 rounded-[16px] border px-4 py-3.5" style={{ borderColor: check.error ? ERROR : theme.border, background: theme.surface }}>
      <p className="m-0 flex items-center gap-2 text-[15px] font-semibold"><Icon name="phone" size={15} /> Your phone number for the rider</p>
      {check.verified && check.phone ? (
        <p className="m-0 flex items-center gap-2 text-[14px]" style={{ color: OK }} aria-live="polite">
          <Icon name="check" size={15} /> {check.phone} is verified.
        </p>
      ) : !check.phone ? (
        <p className="m-0 text-[14px]" style={{ color: theme.muted }}>Add your phone number, then verify it so the delivery partner can reach you.</p>
      ) : check.sent ? (
        <>
          <p className="m-0 text-[14px]" style={{ color: theme.muted }} aria-live="polite">
            We sent a 6-digit code {check.sent.channel === "whatsapp" ? "on WhatsApp" : "by SMS"} to {check.phone}. Enter it here.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="phone-check-code"
              value={check.code}
              onChange={(event) => check.setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              aria-label="6-digit code"
              aria-invalid={Boolean(check.error)}
              placeholder="123456"
              className="h-12 w-[150px] rounded-[14px] border bg-white px-4 text-center font-mono text-[18px] tracking-[0.3em] outline-none"
              style={{ borderColor: check.error ? ERROR : theme.border }}
            />
            <button type="button" className={button} style={{ background: theme.cta, color: theme.ctaText, borderRadius: theme.buttonRadius }} disabled={check.busy !== null} onClick={() => check.verify()}>
              {check.busy === "verify" ? "Checking…" : "Confirm"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ color: theme.ink }}>
            <button type="button" className={link} disabled={check.busy !== null || check.secondsLeft > 0} onClick={() => check.send()}>
              {check.secondsLeft > 0 ? `Resend code in ${check.secondsLeft}s` : "Resend code"}
            </button>
            {check.sent.channel === "whatsapp" ? (
              <button type="button" className={link} disabled={check.busy !== null || check.secondsLeft > 0} onClick={() => check.send("sms")}>Send by SMS instead</button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 min-w-0 flex-1 text-[14px]" style={{ color: theme.muted }}>
            <span className="font-semibold" style={{ color: theme.ink }}>{check.phone}</span>
            <span className="block">We&apos;ll send a code to check this number.</span>
          </p>
          <button type="button" className={button} style={{ background: theme.cta, color: theme.ctaText, borderRadius: theme.buttonRadius }} disabled={check.busy !== null} onClick={() => check.send()}>
            {check.busy === "send" ? "Sending…" : "Verify"}
          </button>
        </div>
      )}
      {check.error ? <p role="alert" className="m-0 flex items-start gap-1.5 text-[13.5px]" style={{ color: ERROR }}><Icon name="warn" size={14} className="mt-0.5 shrink-0" /> {check.error}</p> : null}
    </div>
  );
}
