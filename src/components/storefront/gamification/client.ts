// Browser-side helpers shared by the games: theme colours, the code a shopper won (kept on this device so the
// bag and checkout can offer it), applying it to the bag, and the pop-up's "already shown / played" memory.
// Every storage access is wrapped: private windows and blocked storage just mean nothing is remembered.

import { rememberBagDiscount } from "@/components/storefront/shopper/checkout-storage";

export interface GameColors {
  ink: string;
  muted: string;
  border: string;
  /** Page background. */
  paper: string;
  /** Raised panels. */
  card: string;
  cta: string;
  ctaText: string;
  accent: string;
  heading: string;
  radius: number;
}

export interface WonCode {
  code: string;
  label: string;
  expiresAt: string | null;
  minOrder: number;
  gift: { productId: string; name: string; price: number } | null;
  /** Where it came from: a game prize (default) or a sign-up reward from a pop-up or sign-up page. */
  source?: "game" | "signup";
}

const wonKey = (slug: string) => `sib-game-won:${slug}`;
const shownKey = (slug: string, game: string) => `sib-game:${slug}:${game}:shown`;
const playedKey = (slug: string, game: string) => `sib-game:${slug}:${game}:played`;

export function readWonCode(slug: string): WonCode | null {
  try {
    const raw = localStorage.getItem(wonKey(slug));
    if (!raw) return null;
    const value = JSON.parse(raw) as WonCode;
    if (!value?.code || (value.expiresAt && Date.parse(value.expiresAt) < Date.now())) {
      localStorage.removeItem(wonKey(slug));
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/** Keeps the prize on this device and puts the code on the bag (the bag and checkout apply it). */
export function rememberWonCode(slug: string, won: WonCode) {
  try {
    localStorage.setItem(wonKey(slug), JSON.stringify(won));
  } catch {}
  rememberBagDiscount(slug, won.code);
}

export function forgetWonCode(slug: string) {
  try {
    localStorage.removeItem(wonKey(slug));
  } catch {}
}

export function popupMemory(slug: string, game: string) {
  try {
    const shown = Number(localStorage.getItem(shownKey(slug, game)));
    return {
      lastShownAt: Number.isFinite(shown) && shown > 0 ? shown : null,
      played: localStorage.getItem(playedKey(slug, game)) === "1",
      shownThisSession: sessionStorage.getItem(shownKey(slug, game)) === "1",
    };
  } catch {
    return { lastShownAt: null, played: false, shownThisSession: false };
  }
}

export function markShown(slug: string, game: string) {
  try {
    localStorage.setItem(shownKey(slug, game), String(Date.now()));
    sessionStorage.setItem(shownKey(slug, game), "1");
  } catch {}
}

export function markPlayed(slug: string, game: string) {
  try {
    localStorage.setItem(playedKey(slug, game), "1");
  } catch {}
}

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Readable text on a fill: dark ink or white, by the fill's brightness. */
export function textOn(fill: string, dark = "#16141F") {
  const hex = fill.trim().replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return dark;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.45 ? dark : "#FFFFFF";
}

/** The bag, checkout and order pages' theme as game colours. */
export function shopperGameColors(theme: { ink: string; muted: string; border: string; paper: string; surface: string; cta: string; ctaText: string; accent: string; heading: string; radius: number }): GameColors {
  return { ink: theme.ink, muted: theme.muted, border: theme.border, paper: theme.surface, card: theme.paper, cta: theme.cta, ctaText: theme.ctaText, accent: theme.accent, heading: theme.heading, radius: theme.radius };
}
