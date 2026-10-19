"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/hooks/useCart";
import { readRememberedStoreVisitor } from "@/hooks/useStoreVisitor";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { GIFT_BOXES, boxReveal } from "@/lib/gamification/logic";
import type { PopupGameKind } from "@/lib/marketing/forms";
import { copyText, markPlayed, prefersReducedMotion, rememberWonCode, type GameColors, type WonCode } from "@/components/storefront/gamification/client";
import { ScratchCard } from "@/components/storefront/gamification/ScratchCard";
import { Confetti, Wheel, spinTarget } from "@/components/storefront/gamification/Wheel";
import { mix } from "./PopupArt";

// The game inside a game pop-up: spin the wheel, scratch a card or pick a gift box, in the pop-up's own look.
// It uses the store's game engine: the shopper enters their email or WhatsApp number, the server draws the
// prize (POST /game/play with the pop-up's id), checks the one-play-per-person limit and makes a one-use code;
// the page only animates to the result. The code is kept on this device and put on the bag for checkout.
// In the seller's previews nothing is sent: a pretend prize is drawn here.

export interface PopupPrizes {
  slices: Array<{ id: string; label: string }>;
  /** Each prize's chance in whole percent (shown under "Prizes and chances"). */
  odds: number[];
  codeDays: number;
  minOrder: number;
}

export interface PopupGameColors {
  ink: string;
  paper: string;
  button: string;
  buttonText: string;
  accent: string;
  heading?: string;
}

interface Outcome {
  index: number;
  label: string;
  won: boolean;
  code: string | null;
  expiresAt: string | null;
  minOrder: number;
  gift: WonCode["gift"];
  message: string;
}

type Phase = "form" | "pick" | "playing" | "card" | "result";

const SPIN_MS = 4600;
const BOX_MS = 900;

function visitorKey(slug: string) {
  try {
    return localStorage.getItem(`visitor:${slug}`) ?? undefined;
  } catch {
    return undefined;
  }
}

const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export function PopupGame({
  formId,
  storeSlug,
  game,
  collect,
  playEveryDays,
  prizes,
  colors,
  inputRadius,
  buttonRadius,
  buttonText,
  consentText,
  currency = "NGN",
  preview = false,
  showResult = false,
  compact = false,
  onClose,
  onPhase,
}: {
  formId: string;
  storeSlug: string;
  game: PopupGameKind;
  collect: "email" | "whatsapp" | "either";
  playEveryDays: number;
  prizes: PopupPrizes;
  colors: PopupGameColors;
  inputRadius: number;
  buttonRadius: number;
  buttonText: string;
  consentText: string;
  currency?: string;
  /** Seller preview: looks real, sends nothing, draws a pretend prize. */
  preview?: boolean;
  /** Seller preview of the "after" state. */
  showResult?: boolean;
  compact?: boolean;
  onClose: () => void;
  /** Tells the pop-up when the result is showing (it swaps its headline). */
  onPhase?: (phase: "playing" | "result") => void;
}) {
  const uid = useId();
  const cart = useCart(storeSlug);
  const slices = prizes.slices.length ? prizes.slices : [{ id: "p", label: "A treat" }];
  const reduced = useMemo(() => (typeof window === "undefined" ? false : prefersReducedMotion()), []);
  const demoOutcome = useMemo<Outcome>(() => {
    const index = Math.max(0, slices.findIndex((slice) => !/try again/i.test(slice.label)));
    return { index, label: slices[index]!.label, won: true, code: `${game === "scratch" ? "SCRATCH" : game === "box" ? "BOX" : "SPIN"}-PREVIEW`, expiresAt: null, minOrder: prizes.minOrder, gift: null, message: `You won ${slices[index]!.label.toLowerCase()}!` };
  }, [slices, game, prizes.minOrder]);

  const [phase, setPhase] = useState<Phase>(showResult ? "result" : "form");
  const [contact, setContact] = useState(() => (typeof window === "undefined" || preview ? "" : readRememberedStoreVisitor(storeSlug).email ?? ""));
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(showResult ? demoOutcome : null);
  const [chosen, setChosen] = useState<number | null>(showResult && game === "box" ? 1 : null);
  const [copied, setCopied] = useState(false);
  const [giftAdded, setGiftAdded] = useState(false);
  const [announce, setAnnounce] = useState("");
  const seed = useRef(Math.floor(Math.random() * 1_000_000));

  const ink = colors.ink;
  const gameColors: GameColors = {
    ink,
    muted: ink,
    border: isHex(ink) && isHex(colors.paper) ? mix(colors.paper, ink, 0.14) : "rgba(0,0,0,0.12)",
    paper: colors.paper,
    card: isHex(colors.paper) ? mix(colors.paper, "#FFFFFF", 0.82) : "#FFFFFF",
    cta: colors.button,
    ctaText: colors.buttonText,
    accent: colors.accent,
    heading: colors.heading ?? "inherit",
    radius: Math.min(buttonRadius, 18),
  };
  const contactLabel = collect === "email" ? "Your email" : collect === "whatsapp" ? "Your WhatsApp number" : "Email or WhatsApp number";
  const consent = consentText || `Send me ${collect === "whatsapp" ? "WhatsApp messages" : collect === "email" ? "emails" : "messages"} about offers and new arrivals. I can stop any time.`;
  const money = (n: number) => formatStoreMoney(n, currency);
  const reveal = outcome && chosen !== null ? boxReveal(outcome.index, chosen, GIFT_BOXES, slices.length, seed.current) : null;

  function check(): string | null {
    const value = contact.trim();
    if (preview) return null;
    if (!value) return collect === "whatsapp" ? "Enter your WhatsApp number." : collect === "email" ? "Enter your email." : "Enter your email or WhatsApp number.";
    if (collect === "email" && !value.includes("@")) return "Enter a valid email address.";
    if (collect === "whatsapp" && value.includes("@")) return "Enter a WhatsApp number, like 0803 123 4567.";
    return null;
  }

  async function draw(): Promise<Outcome | null> {
    if (preview) {
      const index = Math.floor(Math.random() * slices.length);
      const won = !/try again/i.test(slices[index]!.label);
      return { ...demoOutcome, index, label: slices[index]!.label, won, code: won ? demoOutcome.code : null, message: won ? `You won ${slices[index]!.label.toLowerCase()}! (Preview: no real code is made.)` : "So close! No prize this time. (Preview)" };
    }
    const value = contact.trim();
    const isEmail = value.includes("@");
    try {
      const res = await fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/game/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, formId, ...(isEmail ? { email: value } : { phone: value }), visitorKey: visitorKey(storeSlug), consent: { marketing, text: marketing ? consent : undefined } }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) {
        setError(json?.error?.message ?? "Something went wrong. Try again.");
        return null;
      }
      const next = json.data as Outcome;
      markPlayed(storeSlug, `popup-${formId}`);
      // Saved before any animation, so closing early never loses the prize.
      if (next.code) rememberWonCode(storeSlug, { code: next.code, label: next.label, expiresAt: next.expiresAt, minOrder: next.minOrder, gift: next.gift });
      return next;
    } catch {
      setError("Check your connection and try again.");
      return null;
    }
  }

  function finish(next: Outcome) {
    setPhase("result");
    onPhase?.("result");
    setAnnounce(next.code ? `${next.message} Your code is ${next.code.split("").join(" ")}.` : next.message);
  }

  async function start() {
    setError("");
    const problem = check();
    if (problem) return setError(problem);
    if (game === "box") {
      setPhase("pick");
      setAnnounce("Choose a gift box to open.");
      return;
    }
    setBusy(true);
    const next = await draw();
    setBusy(false);
    if (!next) return;
    setOutcome(next);
    onPhase?.("playing");
    if (game === "scratch") {
      setPhase("card");
      setAnnounce("Your card is ready. Scratch it or choose Reveal.");
      return;
    }
    setPhase("playing");
    setAnnounce("Spinning…");
    setRotation((current) => spinTarget(current, next.index, slices.length, reduced ? 0 : 5, (Math.random() - 0.5) * 2));
    window.setTimeout(() => finish(next), (reduced ? 0 : SPIN_MS) + 150);
  }

  async function open(box: number) {
    if (busy || chosen !== null) return;
    setError("");
    setBusy(true);
    const next = await draw();
    setBusy(false);
    if (!next) return;
    setOutcome(next);
    setChosen(box);
    setPhase("playing");
    onPhase?.("playing");
    setAnnounce("Opening your box…");
    window.setTimeout(() => finish(next), reduced ? 0 : BOX_MS);
  }

  async function copy() {
    if (!outcome?.code) return;
    const done = preview ? true : await copyText(outcome.code);
    setCopied(done);
    setAnnounce(done ? "Code copied." : "Couldn't copy. Select the code and copy it yourself.");
  }

  function addGift() {
    if (!outcome?.gift || preview) return;
    cart.add({ productId: outcome.gift.productId, name: outcome.gift.name, price: outcome.gift.price });
    setGiftAdded(true);
    setAnnounce(`${outcome.gift.name} added to your bag.`);
  }

  const button = { background: colors.button, color: colors.buttonText, borderRadius: buttonRadius };
  const line = isHex(ink) ? `${ink}33` : "rgba(0,0,0,0.2)";
  const won = phase === "result" && Boolean(outcome?.won);
  const expires = outcome?.expiresAt ? new Date(outcome.expiresAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" }) : null;
  const wheelSize = compact ? 200 : 240;

  const stage =
    game === "wheel" ? (
      <Wheel slices={slices} colors={gameColors} rotation={rotation} durationMs={phase === "playing" && !reduced ? SPIN_MS : 0} highlight={phase === "result" && outcome ? outcome.index : -1} size={wheelSize} />
    ) : game === "scratch" ? (
      phase === "card" || (phase === "result" && outcome) ? (
        <ScratchCard colors={gameColors} onRevealed={() => outcome && finish(outcome)} disabled={phase === "result"} width={compact ? 260 : 300} height={compact ? 150 : 170}>
          <span>
            <span className="block text-[13px] font-semibold opacity-80">{outcome?.won ? "You found" : "This time"}</span>
            <span className="block text-[26px] font-extrabold leading-tight">{outcome?.won ? outcome.label : "No prize"}</span>
          </span>
        </ScratchCard>
      ) : (
        <div className="grid aspect-[300/170] w-[300px] max-w-full place-items-center text-[15px] font-semibold" style={{ background: `repeating-linear-gradient(135deg, ${colors.button} 0 18px, ${mix(colors.button, "#FFFFFF", 0.12)} 18px 36px)`, color: colors.buttonText, borderRadius: Math.min(buttonRadius, 18) }} aria-hidden>
          <span className="flex items-center gap-2"><Icon name="sparkle" size={18} /> Scratch &amp; win</span>
        </div>
      )
    ) : (
      <div className="grid w-full max-w-[360px] grid-cols-3 gap-3" role={phase === "pick" ? "group" : undefined} aria-label={phase === "pick" ? "Gift boxes" : undefined}>
        {Array.from({ length: GIFT_BOXES }, (_, box) => {
          const isOpen = chosen === box || (phase === "result" && reveal !== null);
          const content = reveal ? slices[reveal[box]!]?.label : null;
          return (
            <button
              key={box}
              type="button"
              onClick={() => void open(box)}
              disabled={phase !== "pick" || busy}
              aria-label={phase === "pick" ? `Open gift box ${box + 1}` : content ? `Box ${box + 1}: ${content}` : `Gift box ${box + 1}`}
              className="sib-box group grid justify-items-center gap-1.5 rounded-[14px] p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default"
              data-open={isOpen ? "" : undefined}
              data-chosen={chosen === box ? "" : undefined}
            >
              <GiftBox colors={colors} open={isOpen} chosen={chosen === box} wiggle={phase === "pick" && !reduced} delay={box * 0.15} />
              <span className="min-h-[34px] text-center text-[12.5px] font-bold leading-tight" style={{ opacity: content ? (chosen === box ? 1 : 0.6) : 0.85 }}>
                {content ?? (phase === "pick" ? "Tap to open" : "")}
              </span>
            </button>
          );
        })}
      </div>
    );

  return (
    <div className="relative grid gap-3">
      {game === "box" ? <style>{"@keyframes sib-box-wiggle{0%,80%,100%{transform:rotate(0)}85%{transform:rotate(-5deg)}90%{transform:rotate(5deg)}95%{transform:rotate(-3deg)}}"}</style> : null}
      {won && !reduced && !preview ? <Confetti colors={[colors.button, colors.accent, "#F2A93B", "#73D8C8", "#E86A4F"]} pieces={50} /> : null}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      <div className="grid place-items-center py-1">{stage}</div>

      {phase === "form" ? (
        <form className="grid gap-2.5" noValidate onSubmit={(event) => { event.preventDefault(); void start(); }}>
          <label className="grid gap-1 text-[13px] font-semibold" htmlFor={`${uid}-contact`}>
            {contactLabel}
          </label>
          <input
            id={`${uid}-contact`}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            type={collect === "email" ? "email" : collect === "whatsapp" ? "tel" : "text"}
            inputMode={collect === "whatsapp" ? "tel" : collect === "email" ? "email" : "text"}
            autoComplete={collect === "whatsapp" ? "tel" : "email"}
            placeholder={collect === "whatsapp" ? "0803 123 4567" : collect === "email" ? "you@example.com" : "you@example.com or 0803…"}
            className="h-12 w-full min-w-0 border bg-white px-4 text-[15px] text-[#16141F] outline-none focus:ring-2"
            style={{ borderColor: line, borderRadius: inputRadius, ["--tw-ring-color" as string]: colors.button }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${uid}-error` : undefined}
          />
          <label className="flex items-start gap-2.5 text-[12.5px] leading-[1.45] opacity-90">
            <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} className="mt-0.5 h-[18px] w-[18px] shrink-0" style={{ accentColor: colors.button }} />
            <span>{consent}</span>
          </label>
          {error ? <p id={`${uid}-error`} role="alert" className="m-0 text-[13px] font-semibold text-[#B42318]">{error}</p> : null}
          <button type="submit" disabled={busy} className="min-h-[48px] px-6 text-[15px] font-bold transition hover:brightness-110 disabled:opacity-60" style={button}>
            {busy ? "One moment…" : buttonText}
          </button>
          <details className="text-[12.5px] opacity-80">
            <summary className="cursor-pointer py-1 font-medium">Prizes and chances</summary>
            <ul className="m-0 mt-1 grid list-none gap-0.5 p-0">
              {slices.map((slice, index) => (
                <li key={slice.id} className="flex justify-between gap-3"><span>{slice.label}</span><span className="tabular-nums">{prizes.odds[index] ?? 0}%</span></li>
              ))}
            </ul>
            <p className="m-0 mt-1.5">
              One play per person every {playEveryDays === 1 ? "day" : `${playEveryDays} days`}. Codes work once{prizes.minOrder ? ` on orders over ${money(prizes.minOrder)}` : ""} and last {prizes.codeDays} days.
            </p>
          </details>
        </form>
      ) : null}

      {phase === "pick" ? (
        <div className="grid gap-1 text-center">
          <p className="m-0 text-[14px] font-semibold">{busy ? "Opening…" : "Choose a box. One of them is yours."}</p>
          {error ? <p role="alert" className="m-0 text-[13px] font-semibold text-[#B42318]">{error}</p> : null}
        </div>
      ) : null}

      {phase === "playing" && game === "wheel" ? <p className="m-0 text-center text-[14px] font-medium opacity-80">Good luck…</p> : null}

      {phase === "result" && outcome ? (
        <div className="grid gap-3 text-center" role="status">
          <p className="m-0 text-[15px] leading-6">{outcome.message}</p>
          {outcome.code ? (
            <>
              <div className="flex flex-wrap items-center justify-center gap-2 border-2 border-dashed px-3 py-2.5" style={{ borderColor: colors.button, borderRadius: inputRadius + 4 }}>
                <code className="min-w-0 select-all break-all font-mono text-[20px] font-bold tracking-[0.08em]">{outcome.code}</code>
                <button type="button" onClick={() => void copy()} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 border px-4 text-[13.5px] font-semibold" style={{ borderColor: line, borderRadius: buttonRadius }}>
                  <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy code"}
                </button>
              </div>
              <p className="m-0 text-[13px] opacity-80">
                {preview
                  ? "Shoppers get a real one-use code here, already added to their bag."
                  : `Added to your bag: it comes off at checkout${expires ? `. Use it by ${expires}` : ""}${outcome.minOrder ? ` on orders over ${money(outcome.minOrder)}` : ""}.`}
              </p>
              {outcome.gift ? (
                <button type="button" onClick={addGift} disabled={giftAdded} className="inline-flex min-h-11 items-center justify-center gap-2 border px-5 text-[14.5px] font-semibold disabled:opacity-70" style={{ borderColor: ink, borderRadius: buttonRadius }}>
                  <Icon name={giftAdded ? "check" : "bag"} size={15} /> {giftAdded ? "Gift in your bag" : `Add ${outcome.gift.name} to your bag`}
                </button>
              ) : null}
            </>
          ) : null}
          <button type="button" onClick={onClose} className="min-h-[48px] px-6 text-[15px] font-bold" style={button}>
            {outcome.won ? "Start shopping" : "Close"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A gift box drawn in the pop-up's colours; the lid lifts off when it opens (no motion with reduced motion). */
function GiftBox({ colors, open, chosen, wiggle, delay }: { colors: PopupGameColors; open: boolean; chosen: boolean; wiggle: boolean; delay: number }) {
  const body = chosen || !open ? colors.button : isHex(colors.button) ? mix(colors.button, "#FFFFFF", 0.45) : colors.button;
  const ribbon = colors.accent;
  return (
    <svg viewBox="0 0 100 100" className="h-auto w-full max-w-[96px]" aria-hidden style={{ animation: wiggle ? `sib-box-wiggle 2.4s ${delay}s ease-in-out infinite` : undefined }}>
      <ellipse cx="50" cy="94" rx="34" ry="4" fill="#000" opacity="0.12" />
      <rect x="18" y="44" width="64" height="48" rx="5" fill={body} />
      <rect x="45" y="44" width="10" height="48" fill={ribbon} />
      <g style={{ transform: open ? "translate(0px, -16px) rotate(-14deg)" : undefined, transformOrigin: "20px 40px", transition: "transform 450ms cubic-bezier(.2,.8,.3,1.2)" }}>
        <rect x="13" y="32" width="74" height="16" rx="4" fill={body} />
        <rect x="13" y="32" width="74" height="5" rx="2.5" fill="#FFFFFF" opacity="0.2" />
        <rect x="45" y="32" width="10" height="16" fill={ribbon} />
        <path d="M50 32c-10-2-20-12-12-18 6-4 11 6 12 18zM50 32c10-2 20-12 12-18-6-4-11 6-12 18z" fill={ribbon} />
      </g>
      {open && chosen ? <path d="M50 8l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill={ribbon} /> : null}
    </svg>
  );
}
