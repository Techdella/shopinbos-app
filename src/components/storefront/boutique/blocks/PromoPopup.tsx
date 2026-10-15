"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { intSetting, leadField, promoPopupDue, promoPopupTrigger, str, type PopupMemory } from "./block-logic";
import { useMediaMatch, type BlockContext } from "./shared";

const key = (slug: string, id: string) => `promo-popup:${slug}:${id}`;

function readMemory(slug: string, id: string): PopupMemory {
  try {
    const raw = JSON.parse(localStorage.getItem(key(slug, id)) ?? "{}") as { lastShownAt?: number; signedUp?: boolean };
    return {
      lastShownAt: typeof raw.lastShownAt === "number" ? raw.lastShownAt : null,
      signedUp: raw.signedUp === true,
      shownThisSession: sessionStorage.getItem(key(slug, id)) === "1",
    };
  } catch {
    // Without storage we can't cap how often it shows, so we don't show it at all.
    return { lastShownAt: null, signedUp: false, shownThisSession: true };
  }
}

function remember(slug: string, id: string, patch: { lastShownAt?: number; signedUp?: boolean }) {
  try {
    const raw = JSON.parse(localStorage.getItem(key(slug, id)) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(key(slug, id), JSON.stringify({ ...raw, ...patch }));
    sessionStorage.setItem(key(slug, id), "1");
  } catch {}
}

function SignupCard({ ctx, onClose, titleId, live }: { ctx: BlockContext; onClose?: () => void; titleId: string; live: boolean }) {
  const { copy, settings, look, store, section } = ctx;
  const t = look.tokens;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error" | "invalid">("idle");
  const [copied, setCopied] = useState(false);
  const field = str(settings.field) || "either";
  const placeholder = field === "email" ? "Your email" : field === "phone" ? "Your WhatsApp number" : "Email or WhatsApp number";
  const code = str(copy.discountCode);
  const image = str(copy.imageUrl);
  useEffect(() => {
    if (live) inputRef.current?.focus();
  }, [live]);

  const submit = async () => {
    const contact = leadField(value, field);
    if (!contact) {
      setStatus("invalid");
      return;
    }
    if (!live || !ctx.visitorKey) {
      setStatus(live ? "error" : "idle");
      return;
    }
    setStatus("sending");
    try {
      // Same subscriber API as the Newsletter section.
      const response = await fetch(`/api/public/store/${encodeURIComponent(store.slug)}/forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorKey: ctx.visitorKey, type: "newsletter", ...contact, payload: { source: "promo-popup", sectionId: section.id, page: ctx.currentPage } }),
      });
      if (!response.ok) throw new Error("failed");
      remember(store.slug, section.id, { signedUp: true });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className={`grid overflow-hidden ${image ? "sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : ""}`} style={{ background: t.paperBg, color: t.ink, borderRadius: Math.max(look.cardRadius, 10) }}>
      {image ? <div className="bq-media hidden min-h-full sm:block"><img src={image} alt="" width={400} height={500} loading="lazy" /></div> : null}
      <div className="relative p-6 sm:p-8">
        {onClose ? (
          <button type="button" onClick={onClose} className="bq-icon-btn absolute right-2 top-2" aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        ) : null}
        <h2 id={titleId} className="bq-h pr-8 text-[26px]" style={{ ...look.headingStyle, lineHeight: 1.1 }}>{str(copy.title) || "Join our list"}</h2>
        {status === "done" ? (
          <div className="mt-3" role="status">
            <p className="m-0 text-[15px]">{code ? str(copy.successText) || "You're in. Here's your code:" : "You're in. Thanks for joining."}</p>
            {code ? (
              <div className="mt-3 flex items-center gap-2">
                <span className="rounded-[10px] border-2 border-dashed px-4 py-2 font-mono text-[18px] font-bold tracking-[0.12em]" style={{ borderColor: t.accent }}>{code}</span>
                <button type="button" className="bq-btn" style={{ ...look.softButton, minHeight: 40 }} onClick={() => { void navigator.clipboard?.writeText(code).then(() => setCopied(true)).catch(() => undefined); }}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {str(copy.body) ? <p className="m-0 mt-2 text-[15px] leading-6" style={{ color: t.muted }}>{str(copy.body)}</p> : null}
            <form className="mt-5 grid gap-2" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
              <label htmlFor={inputId} className="sr-only">{placeholder}</label>
              <input
                ref={inputRef}
                id={inputId}
                value={value}
                onChange={(event) => { setValue(event.target.value); if (status === "invalid") setStatus("idle"); }}
                placeholder={placeholder}
                inputMode={field === "phone" ? "tel" : field === "email" ? "email" : "text"}
                autoComplete={field === "phone" ? "tel" : "email"}
                aria-invalid={status === "invalid" || undefined}
                className="h-12 rounded-[var(--bq-button-radius)] border bg-white px-4 text-[15px]"
                style={{ borderColor: status === "invalid" ? "#B42318" : t.border, color: "#111" }}
              />
              <button type="submit" className="bq-btn" style={look.solidButton} disabled={status === "sending"}>{status === "sending" ? "Sending…" : str(copy.buttonLabel) || "Sign me up"}</button>
              <p className="m-0 min-h-5 text-[12.5px]" role="status" style={{ color: status === "invalid" || status === "error" ? "#B42318" : t.muted }}>
                {status === "invalid" ? (field === "email" ? "Enter a valid email." : field === "phone" ? "Enter a valid WhatsApp number." : "Enter a valid email or WhatsApp number.") : status === "error" ? "That didn't go through. Please try again." : "No spam. Unsubscribe any time."}
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Sign-up pop-up (lead magnet): opens when a computer's pointer heads for the address bar, or after a delay on phones,
 * at most once a visit and once per frequency period, never again after signing up. Signs up through the store's
 * newsletter form API, then shows the seller's discount code.
 */
export function PromoPopup({ ctx }: { ctx: BlockContext }) {
  const { settings, store, section, look } = ctx;
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const isPhone = useMediaMatch("(max-width: 767px)");
  const delay = intSetting(settings.delaySeconds, 3, 120, 10);
  const frequency = intSetting(settings.frequencyDays, 1, 60, 7);
  const trigger = promoPopupTrigger(isPhone, str(settings.trigger));

  useEffect(() => {
    if (!ctx.live) return;
    if (!promoPopupDue(readMemory(store.slug, section.id), frequency)) return;
    let done = false;
    const show = () => {
      if (done) return;
      done = true;
      remember(store.slug, section.id, { lastShownAt: Date.now() });
      setOpen(true);
    };
    if (trigger === "delay") {
      const timer = window.setTimeout(show, delay * 1000);
      return () => window.clearTimeout(timer);
    }
    const onLeave = (event: MouseEvent) => {
      if (!event.relatedTarget && event.clientY <= 0) show();
    };
    // Give the page a moment before exit intent counts, so a quick mouse move on arrival doesn't open it.
    const arm = window.setTimeout(() => document.addEventListener("mouseout", onLeave), 3000);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [ctx.live, store.slug, section.id, frequency, trigger, delay]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (ctx.editor) {
    return (
      <div className="bq-wrap py-8">
        <p className="m-0 mb-3 text-[12.5px]" style={{ color: look.tokens.muted }}>
          Pop-up preview. Shoppers see it {str(settings.trigger) === "delay" ? `after ${delay} seconds` : "when they move to leave the page on a computer"}{str(settings.trigger) === "delay" ? "" : ` (after ${delay} seconds on phones)`}, at most every {frequency} {frequency === 1 ? "day" : "days"}, and never after signing up.
        </p>
        <div className="mx-auto max-w-[620px] shadow-lg" style={{ borderRadius: Math.max(look.cardRadius, 10) }}>
          <SignupCard ctx={ctx} titleId={titleId} live={false} />
        </div>
      </div>
    );
  }
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,.5)" }} onClick={() => setOpen(false)}>
      <style>{`@media (prefers-reduced-motion: no-preference){.bqb-modal{animation:bqb-modal-in .25s ease-out}}@keyframes bqb-modal-in{from{transform:translateY(12px) scale(.98);opacity:0}to{transform:none;opacity:1}}`}</style>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bqb-modal w-full max-w-[640px]" onClick={(event) => event.stopPropagation()}>
        <SignupCard ctx={ctx} titleId={titleId} live onClose={() => setOpen(false)} />
      </div>
    </div>
  );
}
