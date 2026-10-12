"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/hooks/useCart";
import { readRememberedStoreVisitor } from "@/hooks/useStoreVisitor";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { pickWeighted, sliceLabel, sliceOdds, totalTickets, type GameKind, type GamificationConfig } from "@/lib/gamification/logic";
import { copyText, markPlayed, prefersReducedMotion, rememberWonCode, textOn, type GameColors, type WonCode } from "./client";
import { ScratchCard } from "./ScratchCard";
import { Confetti, Wheel, spinTarget } from "./Wheel";

// The game window: contact details (email or WhatsApp, with an unticked "send me offers" choice), then the
// spin or the scratch, then the prize with its code, "Copy code", and the code already put on the bag.
// The server decides the prize before anything moves; the wheel only animates to it. Loaded on demand
// (React.lazy) the first time a game opens, so stores pay nothing for it until then.

export interface GameDialogProps {
  game: GameKind;
  storeSlug: string;
  currency: string;
  config: GamificationConfig;
  colors: GameColors;
  onClose: () => void;
  /** Builder and seller previews: no server, a pretend prize, nothing saved. */
  demo?: boolean;
  orderId?: string;
  headline?: string;
  body?: string;
  visitorKey?: string;
  giftNames?: Record<string, string>;
  /** Called once the server has drawn a prize (not in previews). */
  onPlayed?: () => void;
}

interface Result {
  index: number;
  label: string;
  won: boolean;
  code: string | null;
  expiresAt: string | null;
  minOrder: number;
  gift: WonCode["gift"];
  message: string;
}

type Phase = "form" | "playing" | "card" | "result";

const SPIN_MS = 4600;

export default function GameDialog({ game, storeSlug, currency, config, colors, onClose, demo = false, orderId, headline, body, visitorKey, giftNames = {}, onPlayed }: GameDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const cart = useCart(storeSlug);
  const settings = game === "scratch" ? config.scratch : config.wheel;
  const isScratch = game === "scratch";
  const slices = useMemo(() => config.prizes.slices.map((slice) => ({ id: slice.id, label: slice.kind === "free_gift" && slice.productId && giftNames[slice.productId] && !slice.label ? `Free ${giftNames[slice.productId]}` : sliceLabel(slice, (n) => formatStoreMoney(n, currency)) })), [config.prizes.slices, currency, giftNames]);
  const odds = useMemo(() => sliceOdds(config.prizes.slices), [config.prizes.slices]);

  const [phase, setPhase] = useState<Phase>("form");
  const [contact, setContact] = useState(() => (typeof window === "undefined" ? "" : readRememberedStoreVisitor(storeSlug).email ?? ""));
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [giftAdded, setGiftAdded] = useState(false);
  const [announce, setAnnounce] = useState("");
  const reduced = useMemo(() => (typeof window === "undefined" ? false : prefersReducedMotion()), []);

  const collect = game === "post_purchase" ? null : settings.collect;
  const contactLabel = collect === "email" ? "Your email" : collect === "whatsapp" ? "Your WhatsApp number" : "Email or WhatsApp number";
  const consentText = `Send me ${collect === "whatsapp" ? "WhatsApp messages" : collect === "email" ? "emails" : "messages"} about offers and new arrivals. I can stop any time.`;
  const title = headline || (game === "post_purchase" ? config.postPurchase.headline : settings.headline);
  const intro = body ?? (game === "post_purchase" ? "Thanks for your order. One free spin for a treat on your next one." : settings.body);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("input, button:not([data-close])")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>("button, a[href], input, summary")].filter((el) => !el.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  function demoResult(): Result {
    const weights = config.prizes.slices.map((slice) => slice.weight);
    const total = totalTickets(weights);
    const index = Math.max(0, pickWeighted(weights, Math.floor(Math.random() * Math.max(1, total))));
    const slice = config.prizes.slices[index]!;
    const won = slice.kind !== "try_again";
    return { index, label: slices[index]!.label, won, code: won ? `${game === "scratch" ? "SCRATCH" : game === "post_purchase" ? "NEXT" : "SPIN"}-PREVIEW` : null, expiresAt: null, minOrder: config.prizes.minOrder, gift: null, message: won ? `You won ${slices[index]!.label.toLowerCase()}! (Preview: no real code is made.)` : "So close! No prize this time. (Preview)" };
  }

  async function play() {
    setError("");
    const value = contact.trim();
    const isEmail = value.includes("@");
    if (collect && !value) {
      setError(collect === "whatsapp" ? "Enter your WhatsApp number." : collect === "email" ? "Enter your email." : "Enter your email or WhatsApp number.");
      return;
    }
    if (collect === "email" && !isEmail) return setError("Enter a valid email address.");
    if (collect === "whatsapp" && isEmail) return setError("Enter a WhatsApp number, like 0803 123 4567.");
    setBusy(true);
    let next: Result;
    if (demo) {
      next = demoResult();
    } else {
      try {
        const res = await fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/game/play`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game,
            ...(collect ? (isEmail ? { email: value } : { phone: value }) : {}),
            orderId,
            visitorKey,
            consent: { marketing, text: marketing ? consentText : undefined },
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.data) {
          setBusy(false);
          setError(json?.error?.message ?? "Something went wrong. Try again.");
          return;
        }
        next = json.data as Result;
      } catch {
        setBusy(false);
        setError("Check your connection and try again.");
        return;
      }
      markPlayed(storeSlug, game);
      onPlayed?.();
      // Saved before any animation, so closing early never loses the prize.
      if (next.code) rememberWonCode(storeSlug, { code: next.code, label: next.label, expiresAt: next.expiresAt, minOrder: next.minOrder, gift: next.gift });
    }
    setBusy(false);
    setResult(next);
    if (isScratch) {
      setPhase("card");
      setAnnounce("Your card is ready. Scratch it or choose Reveal.");
      return;
    }
    setPhase("playing");
    setAnnounce("Spinning…");
    const duration = reduced ? 0 : SPIN_MS;
    setRotation((current) => spinTarget(current, next.index, slices.length, reduced ? 0 : 5, (Math.random() - 0.5) * 2));
    window.setTimeout(() => finish(next), duration + 150);
  }

  function finish(next: Result) {
    setPhase("result");
    setAnnounce(next.code ? `${next.message} Your code is ${next.code.split("").join(" ")}.` : next.message);
  }

  async function copy() {
    if (!result?.code) return;
    const done = await copyText(result.code);
    setCopied(done);
    setAnnounce(done ? "Code copied." : "Couldn't copy. Select the code and copy it yourself.");
  }

  function addGift() {
    if (!result?.gift) return;
    cart.add({ productId: result.gift.productId, name: result.gift.name, price: result.gift.price });
    setGiftAdded(true);
    setAnnounce(`${result.gift.name} added to your bag.`);
  }

  const money = (n: number) => formatStoreMoney(n, currency);
  const won = phase === "result" && Boolean(result?.won);
  const expires = result?.expiresAt ? new Date(result.expiresAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" }) : null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-black/50 sm:place-items-center sm:p-4" role="presentation" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[94vh] w-full overflow-y-auto rounded-t-[24px] px-5 pb-6 pt-5 shadow-2xl sm:max-w-[440px] sm:rounded-[24px] sm:p-6"
        style={{ background: colors.paper, color: colors.ink, paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
      >
        {won && !reduced ? <Confetti colors={[colors.cta, colors.accent, "#F2A93B", "#73D8C8", "#E86A4F"]} /> : null}
        <button type="button" data-close onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full focus-visible:outline focus-visible:outline-2" style={{ background: colors.border }}>
          <Icon name="x" size={16} />
        </button>
        <p className="sr-only" role="status" aria-live="polite">{announce}</p>

        <h2 id={titleId} className="m-0 pr-12 text-[22px] font-bold leading-tight" style={{ fontFamily: colors.heading }}>
          {phase === "result" ? (result?.won ? "You won!" : "So close!") : title}
        </h2>
        {phase !== "result" && intro ? <p className="mb-0 mt-1.5 text-[14.5px] leading-6" style={{ color: colors.muted }}>{intro}</p> : null}
        {demo ? <p className="mb-0 mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ background: colors.border }}>Preview: no real codes</p> : null}

        {/* The game area keeps one size through every phase, so nothing jumps. */}
        <div className="mt-4 grid min-h-[300px] place-items-center">
          {isScratch ? (
            phase === "card" || (phase === "result" && result) ? (
              <ScratchCard colors={colors} onRevealed={() => result && finish(result)} disabled={phase === "result"}>
                <span>
                  <span className="block text-[13px] font-semibold opacity-80">{result?.won ? "You found" : "This time"}</span>
                  <span className="block text-[26px] font-extrabold leading-tight">{result?.won ? result.label : "No prize"}</span>
                </span>
              </ScratchCard>
            ) : (
              <div className="grid h-[170px] w-[300px] max-w-full place-items-center rounded-[18px] text-[15px] font-semibold" style={{ background: colors.cta, color: textOn(colors.cta) }} aria-hidden>
                <span className="flex items-center gap-2"><Icon name="sparkle" size={18} /> Mystery reward</span>
              </div>
            )
          ) : (
            <Wheel slices={slices} colors={colors} rotation={rotation} durationMs={phase === "playing" && !reduced ? SPIN_MS : 0} highlight={phase === "result" && result ? result.index : -1} size={260} />
          )}
        </div>

        {phase === "form" ? (
          <form className="mt-4 grid gap-3" noValidate onSubmit={(event) => { event.preventDefault(); void play(); }}>
            {collect ? (
              <>
                <label className="grid gap-1.5 text-[13.5px] font-semibold">
                  {contactLabel}
                  <input
                    value={contact}
                    onChange={(event) => setContact(event.target.value)}
                    type={collect === "email" ? "email" : collect === "whatsapp" ? "tel" : "text"}
                    inputMode={collect === "whatsapp" ? "tel" : collect === "email" ? "email" : "text"}
                    autoComplete={collect === "whatsapp" ? "tel" : "email"}
                    placeholder={collect === "whatsapp" ? "0803 123 4567" : collect === "email" ? "you@example.com" : "you@example.com or 0803…"}
                    className="h-12 rounded-full border bg-white px-4 text-[15px] font-normal outline-none focus-visible:outline focus-visible:outline-2"
                    style={{ borderColor: colors.border, color: "#16141F" }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${titleId}-error` : undefined}
                  />
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-5" style={{ color: colors.muted }}>
                  <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" style={{ accentColor: colors.cta }} />
                  {consentText}
                </label>
              </>
            ) : null}
            {error ? <p id={`${titleId}-error`} role="alert" className="m-0 text-[13.5px]" style={{ color: "#B42318" }}>{error}</p> : null}
            <button type="submit" disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[16px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60" style={{ background: colors.cta, color: colors.ctaText }}>
              {busy ? "One moment…" : isScratch ? "Get my card" : "Spin the wheel"}
            </button>
            <details className="text-[12.5px]" style={{ color: colors.muted }}>
              <summary className="cursor-pointer py-1 font-medium">Prizes and chances</summary>
              <ul className="m-0 mt-1 grid list-none gap-0.5 p-0">
                {slices.map((slice, index) => (
                  <li key={slice.id} className="flex justify-between gap-3"><span>{slice.label}</span><span className="tabular-nums">{odds[index]}%</span></li>
                ))}
              </ul>
              <p className="m-0 mt-1.5">{game === "post_purchase" ? "One spin per order." : `One play per person every ${settings.frequencyDays === 1 ? "day" : `${settings.frequencyDays} days`}.`} Codes work once{config.prizes.minOrder ? ` on orders over ${money(config.prizes.minOrder)}` : ""} and last {config.prizes.codeDays} days.</p>
            </details>
          </form>
        ) : null}

        {phase === "playing" ? <p className="mt-4 text-center text-[14px] font-medium" style={{ color: colors.muted }}>Good luck…</p> : null}

        {phase === "result" && result ? (
          <div className="mt-4 grid gap-3 text-center">
            <p className="m-0 text-[15px] leading-6">{result.message}</p>
            {result.code ? (
              <>
                <div className="flex items-center justify-between gap-2 rounded-[16px] border-2 border-dashed px-4 py-3" style={{ borderColor: colors.cta }}>
                  <span className="min-w-0 select-all truncate font-mono text-[20px] font-bold tracking-[0.08em]">{result.code}</span>
                  <button type="button" onClick={() => void copy()} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold focus-visible:outline focus-visible:outline-2" style={{ background: colors.border }}>
                    <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy code"}
                  </button>
                </div>
                <p className="m-0 text-[13px]" style={{ color: colors.muted }}>
                  {demo
                    ? "Shoppers get a real one-use code here, already added to their bag."
                    : game === "post_purchase"
                      ? `Saved for your next order on this device${expires ? `. Use it by ${expires}` : ""}.`
                      : `Added to your bag: it comes off at checkout${expires ? `. Use it by ${expires}` : ""}${result.minOrder ? ` on orders over ${money(result.minOrder)}` : ""}.`}
                </p>
                {result.gift ? (
                  <button type="button" onClick={addGift} disabled={giftAdded} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-[14.5px] font-semibold focus-visible:outline focus-visible:outline-2 disabled:opacity-70" style={{ borderColor: colors.ink }}>
                    <Icon name={giftAdded ? "check" : "bag"} size={15} /> {giftAdded ? "Gift in your bag" : `Add ${result.gift.name} to your bag`}
                  </button>
                ) : null}
              </>
            ) : null}
            <button type="button" onClick={onClose} className="inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[16px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: colors.cta, color: colors.ctaText }}>
              {result.won ? (game === "post_purchase" ? "Done" : "Start shopping") : "Close"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
