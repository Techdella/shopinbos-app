// Sign-up forms and storefront pop-ups: reading their stored settings and deciding when a pop-up may show.
// Pure (no server imports): used by the seller editor, the public API, the storefront mount and tests.

import { CTA_TARGETS, POPUP_GAMES, POPUP_KINDS, readEndsAt, readLeadMagnet, kindAllows, collectsSignup, type CtaTarget, type LeadMagnet, type PopupGameKind, type PopupKind } from "./popup-kinds.ts";

export type PopupLayout = "modal" | "flyout" | "bar" | "fullscreen";
export type PopupTrigger = "immediate" | "delay" | "exit_intent" | "scroll";
export type { PopupKind, PopupGameKind, CtaTarget, LeadMagnet } from "./popup-kinds.ts";

export interface PopupConfig {
  layout: PopupLayout;
  trigger: PopupTrigger;
  delaySeconds: number;
  scrollPercent: number;
  pages: "all" | "home" | "product";
  frequency: "once" | "session" | "always" | "days";
  frequencyDays: number;
  devices: Array<"mobile" | "desktop">;
  /** What a shopper gets for signing up (kept here for pop-ups and sign-up pages alike). */
  reward: FormReward | null;
  afterSubmit: "message" | "redirect";
  redirectUrl: string;
  /** What the pop-up is for (older pop-ups are sign-up pop-ups). */
  kind: PopupKind;
  /** Game pop-ups: which game. Prizes, odds and code rules come from Marketing > Rewards. */
  game: PopupGameKind;
  /** Game pop-ups: what the shopper enters to play. */
  collect: "email" | "whatsapp" | "either";
  /** Game pop-ups: one play per person (email or WhatsApp) every this many days, checked on the server. */
  playEveryDays: number;
  /** Only show to shoppers with something in their bag (the cart reminder). */
  onlyWithCart: boolean;
  /** Lead-magnet pop-ups: the free download (never sent to the storefront before sign-up). */
  leadMagnet: LeadMagnet | null;
  /** Countdown pop-ups: when the offer ends (ISO). The pop-up stops showing after it. */
  endsAt: string | null;
  /** Free-delivery pop-ups: the order amount that gets free delivery (0: not set). */
  freeDeliveryOver: number;
}

export type RewardKind = "percentage" | "fixed_amount" | "free_shipping" | "bogo";

/**
 * The sign-up reward. "new": the seller set the amount here; with `unique` every person gets their own one-use
 * code (made at sign-up), otherwise one shared code (a Discount made when the form is saved, `discountId`).
 * "existing": one of the store's own discount codes (`discountId`), handed out as is.
 * Older forms saved { type, value, days }: that reads as "new", unique, no minimum.
 */
export interface FormReward {
  source: "new" | "existing";
  type: RewardKind;
  value: number;
  /** Code ends this many days after it is made (0 = no end). */
  days: number;
  minOrder: number;
  unique: boolean;
  discountId: string | null;
  /** The shared code (or the existing discount's code). */
  code: string;
  /** Unique codes start with this, e.g. WELCOME-7FQ2KD. */
  prefix: string;
  /** Mystery gift: shoppers only find out what it is after signing up. Only present when true. */
  mystery?: boolean;
}

/** Every look a seller can pick. The first eight are the original looks (saved pop-ups may name them). */
export const POPUP_TEMPLATE_IDS = [
  "classic",
  "split",
  "takeover",
  "corner",
  "badge",
  "minimal",
  "luxe",
  "festive",
  "naira_off",
  "free_ship",
  "mystery",
  "exit_wait",
  "detty_december",
  "sallah",
  "black_friday",
  "valentine",
  "vip_bar",
  "spin_wheel",
  "scratch_card",
  "gift_boxes",
  "spin_festive",
  "size_guide",
  "recipe_ebook",
  "lookbook",
  "new_arrivals",
  "promo_bar",
  "cart_reminder",
  "flash_sale",
  "weekend_sale",
  "free_delivery_bar",
  "free_delivery_card",
] as const;
export type PopupTemplateId = (typeof POPUP_TEMPLATE_IDS)[number];
export type PopupFont = "theme" | "modern" | "elegant" | "clean";
export type PopupImagePosition = "left" | "right" | "top" | "background" | "none";
/** A finishing touch drawn over the pop-up: stripes, a gold edge, confetti, hearts… */
export const POPUP_DECORS = ["none", "strip", "edge", "confetti", "hearts", "stars", "crescent", "flash", "ticket", "glow"] as const;
export type PopupDecor = (typeof POPUP_DECORS)[number];
/** Built-in pictures shown when the seller hasn't added their own (real photos, see POPUP_ART_PHOTOS). */
export const POPUP_ARTS = ["", "bag", "fashion", "beauty", "food", "gift", "fabric", "festive", "crescent", "hearts", "bolt", "truck", "book"] as const;
export type PopupArt = (typeof POPUP_ARTS)[number];

/**
 * The real photo behind each built-in picture: an Unsplash photo id (people, products and moments that fit the
 * template), each viewed before use. Unsplash's licence allows this and asks for images.unsplash.com links, not
 * copies. The seller's own photo always replaces it.
 */
export const POPUP_ART_PHOTOS: Record<Exclude<PopupArt, "">, { id: string; alt: string }> = {
  bag: { id: "1691480150204-66dd1eb77391", alt: "A brown leather handbag" },
  fashion: { id: "1523825036634-aab3cce05919", alt: "A woman in a pink and blue print dress" },
  beauty: { id: "1646457417455-77a66a9fcf34", alt: "A smiling woman putting cream on her face" },
  food: { id: "1665332195309-9d75071138f0", alt: "Jollof rice with grilled chicken and fish" },
  gift: { id: "1549465220-1a8b9238cd48", alt: "A pink gift box tied with a gold ribbon" },
  fabric: { id: "1787779350563-29cf5a87c6c7", alt: "A woman in a blue gown and headwrap" },
  festive: { id: "1681545303529-b6beb2e19f02", alt: "Three friends in matching ankara and gele" },
  crescent: { id: "1774870814205-f8ffee37616c", alt: "A smiling woman in a red hijab at a perfume stall" },
  hearts: { id: "1661332306744-70f9ed1a7f40", alt: "A couple in matching traditional wedding outfits" },
  bolt: { id: "1607082349566-187342175e2f", alt: "Red sale tags and a gift on a dark background" },
  truck: { id: "1617347454431-f49d7ff5c3b1", alt: "A delivery rider on a motorbike at night" },
  book: { id: "1687422808289-e721259c9eb4", alt: "A tailor sewing at his machine" },
};

/** A built-in picture's photo link, sized for a pop-up (the box crops it like a cover photo). */
export function popupArtPhotoUrl(art: PopupArt, width = 900): string | null {
  const photo = art ? POPUP_ART_PHOTOS[art] : null;
  return photo ? `https://images.unsplash.com/photo-${photo.id}?auto=format&fit=crop&w=${width}&h=${Math.round(width * 0.9)}&q=72` : null;
}
export const POPUP_ANIMATIONS = ["none", "fade", "rise", "zoom", "slide"] as const;
export type PopupAnimation = (typeof POPUP_ANIMATIONS)[number];

/** How a pop-up looks. Empty colours mean "use the store's own colours". */
export interface PopupStyle {
  template: PopupTemplateId;
  background: string;
  text: string;
  button: string;
  buttonText: string;
  radius: "square" | "soft" | "round";
  font: PopupFont;
  imagePosition: PopupImagePosition;
  size: "small" | "medium" | "large";
  /** Darkness of the page behind a centre or full-screen pop-up, 0–90 (%). */
  overlay: number;
  closeStyle: "icon" | "circle" | "text";
  /** Big badge text for the discount-badge look ("10% OFF"); empty = worked out from the reward. */
  badgeText: string;
  /**
   * 1: saved before the finer looks (drawn exactly as it always was); 2: the finer spacing, type and the extras
   * below. Everything after this line has a "looks like before" value for version 1.
   */
  version: 1 | 2;
  /** Second colour for touches (eyebrow, stripes, timer); empty = the button colour. */
  accent: string;
  decor: PopupDecor;
  /** Show the big badge (the reward in large type) even without badge words. */
  bigBadge: boolean;
  animation: PopupAnimation;
  /** Fill the picture's space (cover, cropped) or show all of it (contain). */
  imageFit: "cover" | "contain";
  /** The part of the picture to keep in view when it's cropped, 0–100 (%) across and down. */
  focusX: number;
  focusY: number;
  /** Built-in picture when there is no picture of their own ("" = none). */
  art: PopupArt;
  align: "left" | "center";
}

/** Old looks' finishing touches (they were drawn from the look's name). */
const LEGACY_DECOR: Partial<Record<PopupTemplateId, PopupDecor>> = { festive: "strip", luxe: "edge" };

/** What a form saved before styles existed looks like (so old pop-ups render exactly as before). */
export const DEFAULT_POPUP_STYLE: PopupStyle = {
  template: "classic",
  background: "",
  text: "",
  button: "",
  buttonText: "",
  radius: "round",
  font: "theme",
  imagePosition: "top",
  size: "medium",
  overlay: 50,
  closeStyle: "icon",
  badgeText: "",
  version: 1,
  accent: "",
  decor: "none",
  bigBadge: false,
  animation: "none",
  imageFit: "cover",
  focusX: 50,
  focusY: 50,
  art: "",
  align: "left",
};

/** Starter words a template brings. {amount} is the free-delivery amount. */
export interface TemplateWords {
  eyebrow: string;
  headline: string;
  body: string;
  buttonText: string;
  successMessage: string;
  badgeText?: string;
  /** No-form pop-ups: the button. */
  ctaLabel?: string;
  ctaTarget?: CtaTarget;
}

export interface PopupTemplate {
  id: PopupTemplateId;
  kind: PopupKind;
  layout: PopupLayout;
  style: PopupStyle;
  words: TemplateWords;
  /** Settings it starts with (when it shows, which game, only with a bag…). */
  config?: Partial<Pick<PopupConfig, "trigger" | "delaySeconds" | "game" | "onlyWithCart" | "collect">>;
  /** Sign-up reward it starts with (undefined: keep the current one; null: no reward). */
  reward?: { type: RewardKind; value: number; mystery?: boolean } | null;
  /** Seasonal looks, for the gallery's "Seasonal" chip. */
  seasonal?: boolean;
}

const LOOK_V2: Partial<PopupStyle> = { version: 2, animation: "rise" };

const tpl = (
  id: PopupTemplateId,
  kind: PopupKind,
  layout: PopupLayout,
  style: Partial<PopupStyle>,
  words: TemplateWords,
  extra: Pick<PopupTemplate, "config" | "reward" | "seasonal"> = {},
): PopupTemplate => ({ id, kind, layout, style: { ...DEFAULT_POPUP_STYLE, ...LOOK_V2, ...style, template: id }, words, ...extra });

const W = (eyebrow: string, headline: string, body: string, buttonText: string, successMessage = "You're in! Here's your code.", more: Partial<TemplateWords> = {}): TemplateWords => ({ eyebrow, headline, body, buttonText, successMessage, ...more });
const CTA = (eyebrow: string, headline: string, body: string, ctaLabel: string, ctaTarget: CtaTarget = "shop"): TemplateWords => ({ eyebrow, headline, body, buttonText: ctaLabel, successMessage: "", ctaLabel, ctaTarget });

/**
 * The looks a seller picks from, grouped by kind. Each sets the layout, a full style and starter words; the seller
 * can change any of it after. The first eight keep their original style values (older pop-ups saved only some of
 * them and fill the rest from here).
 */
export const POPUP_TEMPLATES: PopupTemplate[] = [
  // ── Sign-up and reward ──
  tpl("classic", "signup", "modal", { art: "bag" }, W("", "Get 10% off your first order", "Join our list for new arrivals, restocks and member-only offers.", "Unlock my 10% off"), { reward: { type: "percentage", value: 10 } }),
  tpl("split", "signup", "modal", { imagePosition: "left", size: "large", radius: "soft", closeStyle: "circle", art: "fashion", animation: "zoom" }, W("Welcome", "Take 10% off your first order", "Sign up for first dibs on new drops and private sales.", "Claim my discount"), { reward: { type: "percentage", value: 10 } }),
  tpl("takeover", "signup", "fullscreen", { imagePosition: "background", size: "large", radius: "square", overlay: 0, art: "fabric", align: "center", animation: "fade" }, W("New here?", "Welcome to the family", "Join our list and get 15% off your first order, plus first look at every new collection.", "Get my 15% off"), { reward: { type: "percentage", value: 15 } }),
  tpl("corner", "signup", "flyout", { imagePosition: "none", size: "small", radius: "soft", closeStyle: "circle", animation: "slide" }, W("", "10% off? Yes, please.", "Get a welcome code for your first order.", "Send my code"), { reward: { type: "percentage", value: 10 } }),
  tpl("badge", "signup", "modal", { imagePosition: "none", radius: "soft", font: "modern", background: "#FFF8EC", text: "#1D1A16", button: "#E4572E", buttonText: "#FFFFFF", bigBadge: true, decor: "ticket", align: "center", animation: "zoom" }, W("Welcome offer", "On your first order", "Join our list and the discount is yours. It only takes a moment.", "Claim my discount"), { reward: { type: "percentage", value: 20 } }),
  tpl("minimal", "signup", "modal", { imagePosition: "none", size: "small", radius: "square", background: "#FFFFFF", text: "#111111", button: "#111111", buttonText: "#FFFFFF", font: "clean", overlay: 30, closeStyle: "text", animation: "fade" }, W("Newsletter", "Stay in the loop", "New arrivals and offers, once a week. No spam, ever.", "Subscribe", "Thanks for subscribing!"), { reward: null }),
  tpl("luxe", "signup", "modal", { imagePosition: "left", size: "large", radius: "square", font: "elegant", background: "#14110F", text: "#F3EBDD", button: "#C8A462", buttonText: "#14110F", overlay: 70, closeStyle: "circle", decor: "edge", art: "beauty", animation: "zoom" }, W("The inner circle", "Join the private list", "Early access to new collections and invitations to private sales.", "Request access"), { reward: { type: "percentage", value: 10 } }),
  tpl("festive", "signup", "modal", { imagePosition: "top", radius: "round", font: "modern", background: "#FFF4E0", text: "#2B1608", button: "#0F7B4F", buttonText: "#FFFFFF", closeStyle: "circle", decor: "strip", art: "festive" }, W("It's party season", "Celebrate with 15% off", "Join our list for festive picks and a treat on your first order.", "Get my festive code"), { reward: { type: "percentage", value: 15 }, seasonal: true }),
  tpl("naira_off", "signup", "modal", { imagePosition: "right", size: "large", radius: "soft", font: "modern", background: "#FFF1D6", text: "#2A1A05", button: "#D9480F", buttonText: "#FFFFFF", accent: "#F2A93B", closeStyle: "circle", art: "bag", bigBadge: true }, W("Welcome gift", "off your first order", "Join our list and we'll show your code right away.", "Give me my code"), { reward: { type: "fixed_amount", value: 2000 } }),
  tpl("free_ship", "signup", "modal", { imagePosition: "left", size: "large", radius: "soft", font: "modern", background: "#E9F7F3", text: "#0E2A38", button: "#0E7C6B", buttonText: "#FFFFFF", closeStyle: "circle", art: "truck" }, W("On us", "Free delivery on your first order", "Sign up and your first delivery is free, anywhere we deliver.", "Get free delivery"), { reward: { type: "free_shipping", value: 0 } }),
  tpl("mystery", "signup", "modal", { imagePosition: "top", radius: "round", font: "modern", background: "#2B1B3D", text: "#F7EEFF", button: "#F2C14E", buttonText: "#2B1B3D", accent: "#C084FC", overlay: 70, closeStyle: "circle", decor: "stars", art: "gift", align: "center", animation: "zoom" }, W("Mystery gift", "Unlock a surprise", "Sign up to reveal a mystery reward for your first order.", "Reveal my gift", "Surprise! Here's your gift."), { reward: { type: "percentage", value: 15, mystery: true } }),
  tpl("exit_wait", "signup", "modal", { imagePosition: "none", radius: "soft", font: "modern", background: "#FFFFFF", text: "#16141F", button: "#E86A4F", buttonText: "#FFFFFF", closeStyle: "text", bigBadge: true, align: "center", animation: "zoom" }, W("Wait! Don't go yet", "Here's a little something to stay", "Finish shopping today with a welcome discount on your first order.", "Give me the discount"), { reward: { type: "percentage", value: 10 }, config: { trigger: "exit_intent" } }),
  tpl("detty_december", "signup", "modal", { imagePosition: "left", size: "large", radius: "soft", font: "modern", background: "#0B1F14", text: "#FFF7E6", button: "#E8B53A", buttonText: "#0B1F14", accent: "#E8B53A", overlay: 65, closeStyle: "circle", decor: "confetti", art: "festive" }, W("Detty December", "Your December treat: 15% off", "Owambe outfits, gifts and more. Join the list and save on your first order.", "Unwrap my 15% off"), { reward: { type: "percentage", value: 15 }, seasonal: true }),
  tpl("sallah", "signup", "modal", { imagePosition: "top", radius: "soft", font: "elegant", background: "#F6F1E4", text: "#123B2A", button: "#1E6B4A", buttonText: "#FFFFFF", accent: "#C9A24A", closeStyle: "circle", decor: "crescent", art: "crescent", align: "center" }, W("Sallah special", "Eid Mubarak! Enjoy 10% off", "Celebrate Sallah in style. Sign up for your festive discount.", "Get my Sallah discount"), { reward: { type: "percentage", value: 10 }, seasonal: true }),
  tpl("black_friday", "signup", "modal", { imagePosition: "none", radius: "square", font: "modern", background: "#0A0A0A", text: "#FFFFFF", button: "#FFD60A", buttonText: "#0A0A0A", accent: "#FFD60A", overlay: 75, closeStyle: "circle", decor: "flash", bigBadge: true, align: "center", animation: "zoom" }, W("Black Friday", "Our biggest sale of the year", "Join the list for early access and extra off your first order.", "Get early access"), { reward: { type: "percentage", value: 25 }, seasonal: true }),
  tpl("valentine", "signup", "modal", { imagePosition: "right", size: "large", radius: "round", font: "elegant", background: "#FFF0F3", text: "#5A0B24", button: "#D6336C", buttonText: "#FFFFFF", accent: "#F783AC", closeStyle: "circle", decor: "hearts", art: "hearts" }, W("Valentine's", "Gifts they'll love, 10% off", "Sign up for our Valentine's picks and a sweet discount.", "Send me love"), { reward: { type: "percentage", value: 10 }, seasonal: true }),
  tpl("vip_bar", "signup", "bar", { imagePosition: "none", radius: "round", font: "modern", background: "#0E2A38", text: "#F4F1EA", button: "#73D8C8", buttonText: "#0E2A38", animation: "slide" }, W("VIP list", "Join the VIP list for 10% off", "New drops and member-only prices, straight to your inbox.", "Join"), { reward: { type: "percentage", value: 10 } }),

  // ── Games ──
  tpl("spin_wheel", "game", "modal", { imagePosition: "none", radius: "round", font: "modern", background: "#14213D", text: "#FFFFFF", button: "#FCA311", buttonText: "#14213D", accent: "#FCA311", overlay: 65, closeStyle: "circle", decor: "confetti", align: "center", animation: "zoom" }, W("Feeling lucky?", "Spin to win a treat", "Enter your email or WhatsApp to spin. Every prize is a real discount.", "Spin the wheel", ""), { config: { game: "wheel" } }),
  tpl("scratch_card", "game", "modal", { imagePosition: "none", radius: "soft", font: "modern", background: "#FDF6EC", text: "#3B2A1A", button: "#B5651D", buttonText: "#FFFFFF", accent: "#F2A93B", closeStyle: "circle", decor: "ticket", align: "center", animation: "zoom" }, W("Scratch & win", "Scratch to reveal your surprise", "Every card hides something. Enter your details to get yours.", "Get my card", ""), { config: { game: "scratch" } }),
  tpl("gift_boxes", "game", "modal", { imagePosition: "none", radius: "round", font: "modern", background: "#FFF4F0", text: "#4A1D1D", button: "#E03E52", buttonText: "#FFFFFF", accent: "#F2A93B", closeStyle: "circle", decor: "confetti", align: "center", animation: "zoom" }, W("Mystery gift", "Pick a gift box", "One box, one prize. Enter your details, then choose a box to open.", "Let me pick", ""), { config: { game: "box" } }),
  tpl("spin_festive", "game", "modal", { imagePosition: "none", radius: "soft", font: "modern", background: "#0B1F14", text: "#FFF7E6", button: "#E8B53A", buttonText: "#0B1F14", accent: "#E4572E", overlay: 65, closeStyle: "circle", decor: "strip", align: "center", animation: "zoom" }, W("December spin", "Spin for your festive treat", "One spin per person. Win a discount for your Christmas shopping.", "Spin now", ""), { config: { game: "wheel" }, seasonal: true }),

  // ── Free downloads (lead magnets) ──
  tpl("size_guide", "lead_magnet", "modal", { imagePosition: "left", size: "large", radius: "soft", font: "modern", background: "#F4F1EA", text: "#0E2A38", button: "#0E2A38", buttonText: "#F4F1EA", accent: "#2E7E78", closeStyle: "circle", art: "book" }, W("Free download", "Get our free size guide", "Find your perfect fit before you order. We'll email you a copy too.", "Send me the guide", "Here's your guide!"), { reward: null }),
  tpl("recipe_ebook", "lead_magnet", "modal", { imagePosition: "top", radius: "round", font: "elegant", background: "#FFF8EE", text: "#3A2416", button: "#C2410C", buttonText: "#FFFFFF", accent: "#F59E0B", closeStyle: "circle", art: "food" }, W("Free e-book", "10 easy Nigerian recipes", "Jollof, egusi, puff-puff and more. Download our free recipe e-book.", "Download it free", "Enjoy your e-book!"), { reward: null }),
  tpl("lookbook", "lead_magnet", "modal", { imagePosition: "right", size: "large", radius: "square", font: "elegant", background: "#111111", text: "#F5F5F5", button: "#F5F5F5", buttonText: "#111111", overlay: 70, closeStyle: "circle", art: "fashion" }, W("Free lookbook", "This season's lookbook", "Outfit ideas from our new collection, free to download.", "Get the lookbook", "Here's your lookbook."), { reward: null }),

  // ── Announcements ──
  tpl("new_arrivals", "announcement", "modal", { imagePosition: "right", size: "large", radius: "soft", font: "modern", background: "#FFFFFF", text: "#16141F", button: "#16141F", buttonText: "#FFFFFF", closeStyle: "circle", art: "fashion" }, CTA("Just landed", "New arrivals are here", "Fresh styles added this week. Be the first to shop them.", "Shop new arrivals")),
  tpl("promo_bar", "announcement", "bar", { imagePosition: "none", radius: "round", font: "modern", background: "#F2A93B", text: "#1D1A16", button: "#1D1A16", buttonText: "#FFFFFF", animation: "slide" }, CTA("", "Pay on delivery is now available", "Order today and pay when it arrives.", "Shop now")),
  tpl("cart_reminder", "announcement", "flyout", { imagePosition: "top", radius: "soft", font: "modern", background: "#FFFFFF", text: "#16141F", button: "#2E7E78", buttonText: "#FFFFFF", closeStyle: "circle", art: "bag", animation: "slide" }, CTA("Still thinking?", "You left something in your bag", "Your items are waiting. Finish your order before they sell out.", "Finish my order", "checkout"), { config: { trigger: "exit_intent", onlyWithCart: true } }),

  // ── Countdown sales ──
  tpl("flash_sale", "countdown", "modal", { imagePosition: "none", radius: "soft", font: "modern", background: "#1A0B2E", text: "#FFFFFF", button: "#FF3D71", buttonText: "#FFFFFF", accent: "#FFD60A", overlay: 70, closeStyle: "circle", decor: "flash", align: "center", animation: "zoom" }, CTA("Flash sale", "Up to 40% off, today only", "Hurry! These prices end when the timer hits zero.", "Shop the sale")),
  tpl("weekend_sale", "countdown", "flyout", { imagePosition: "top", radius: "soft", font: "modern", background: "#FFFFFF", text: "#0E2A38", button: "#2E7E78", buttonText: "#FFFFFF", accent: "#E86A4F", closeStyle: "circle", art: "bolt", animation: "slide" }, CTA("Weekend sale", "The sale ends soon", "Grab your favourites before the timer runs out.", "Shop now")),

  // ── Free delivery ──
  tpl("free_delivery_bar", "free_delivery", "bar", { imagePosition: "none", radius: "round", font: "modern", background: "#E9F7F3", text: "#0E2A38", button: "#0E7C6B", buttonText: "#FFFFFF", accent: "#0E7C6B", animation: "slide" }, CTA("", "Free delivery on orders over {amount}", "Add a little more to your bag and delivery is on us.", "Keep shopping")),
  tpl("free_delivery_card", "free_delivery", "flyout", { imagePosition: "top", radius: "soft", font: "modern", background: "#FFFFFF", text: "#0E2A38", button: "#0E7C6B", buttonText: "#FFFFFF", accent: "#73D8C8", closeStyle: "circle", art: "truck", animation: "slide" }, CTA("Free delivery", "Spend {amount}, get free delivery", "We'll deliver your order free once your bag reaches {amount}.", "Keep shopping")),
];

export function popupTemplate(id: string): PopupTemplate {
  return POPUP_TEMPLATES.find((t) => t.id === id) ?? POPUP_TEMPLATES[0]!;
}

export function templatesForKind(kind: PopupKind): PopupTemplate[] {
  return POPUP_TEMPLATES.filter((t) => t.kind === kind);
}

/** Font stacks for the pop-up headline (the fonts are self-hosted for the whole app). */
export function popupHeadingFont(font: PopupFont, themeHeading?: string | null): string | undefined {
  switch (font) {
    case "modern":
      return "'Space Grotesk', system-ui, sans-serif";
    case "elegant":
      return "'Fraunces', Georgia, 'Times New Roman', serif";
    case "clean":
      return "'Plus Jakarta Sans', system-ui, sans-serif";
    default:
      return themeHeading || undefined;
  }
}

/** The store theme's heading style as a font stack. */
export function themeHeadingFont(headingStyle: string | null | undefined): string | undefined {
  return headingStyle === "serif" ? popupHeadingFont("elegant") : headingStyle === "grotesk" ? popupHeadingFont("modern") : undefined;
}

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (value: unknown) => (typeof value === "string" && HEX.test(value.trim()) ? value.trim().toUpperCase() : "");

export function readPopupStyle(raw: unknown): PopupStyle {
  const s = obj(raw);
  const template = pick(s.template, POPUP_TEMPLATE_IDS, "classic");
  const look = typeof s.template === "string" ? popupTemplate(template).style : DEFAULT_POPUP_STYLE;
  // Saved before the finer looks: every newer setting reads as "like before", whatever the look's new defaults.
  const version: 1 | 2 = Number(s.version) >= 2 ? 2 : 1;
  const base: PopupStyle =
    version === 2
      ? look
      : { ...look, version: 1, accent: "", decor: LEGACY_DECOR[template] ?? "none", bigBadge: template === "badge", animation: "none", imageFit: "cover", focusX: 50, focusY: 50, art: "", align: "left" };
  const has = (key: string) => key in s;
  return {
    template,
    background: has("background") ? hex(s.background) : base.background,
    text: has("text") ? hex(s.text) : base.text,
    button: has("button") ? hex(s.button) : base.button,
    buttonText: has("buttonText") ? hex(s.buttonText) : base.buttonText,
    radius: pick(s.radius, ["square", "soft", "round"] as const, base.radius),
    font: pick(s.font, ["theme", "modern", "elegant", "clean"] as const, base.font),
    imagePosition: pick(s.imagePosition, ["left", "right", "top", "background", "none"] as const, base.imagePosition),
    size: pick(s.size, ["small", "medium", "large"] as const, base.size),
    overlay: has("overlay") ? num(s.overlay, 0, 90, base.overlay) : base.overlay,
    closeStyle: pick(s.closeStyle, ["icon", "circle", "text"] as const, base.closeStyle),
    badgeText: typeof s.badgeText === "string" ? s.badgeText.trim().slice(0, 24) : "",
    version,
    accent: has("accent") ? hex(s.accent) : base.accent,
    decor: pick(s.decor, POPUP_DECORS, base.decor),
    bigBadge: typeof s.bigBadge === "boolean" ? s.bigBadge : base.bigBadge,
    animation: pick(s.animation, POPUP_ANIMATIONS, base.animation),
    imageFit: pick(s.imageFit, ["cover", "contain"] as const, base.imageFit),
    focusX: has("focusX") ? num(s.focusX, 0, 100, base.focusX) : base.focusX,
    focusY: has("focusY") ? num(s.focusY, 0, 100, base.focusY) : base.focusY,
    art: pick(s.art, POPUP_ARTS, base.art),
    align: pick(s.align, ["left", "center"] as const, base.align),
  };
}

const REWARD_KINDS = ["percentage", "fixed_amount", "free_shipping", "bogo"] as const;

/** Reads a stored sign-up reward (new or old shape); null when there is none or it makes no sense. */
export function readReward(raw: unknown): FormReward | null {
  const r = obj(raw);
  if (!Object.keys(r).length) return null;
  const source = r.source === "existing" ? "existing" : "new";
  const discountId = typeof r.discountId === "string" && r.discountId ? r.discountId.slice(0, 64) : null;
  const code = typeof r.code === "string" ? r.code.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40) : "";
  if (source === "existing") {
    if (!discountId) return null;
    return {
      source,
      type: pick(r.type, REWARD_KINDS, "percentage"),
      value: Math.max(0, Number(r.value) || 0),
      days: 0,
      minOrder: Math.max(0, Number(r.minOrder) || 0),
      unique: false,
      discountId,
      code,
      prefix: "",
      ...(r.mystery === true ? { mystery: true } : {}),
    };
  }
  const type = r.type === "fixed_amount" ? "fixed_amount" : r.type === "percentage" ? "percentage" : r.type === "free_shipping" ? "free_shipping" : null;
  const value = type === "free_shipping" ? 0 : Number(r.value);
  if (!type || (type !== "free_shipping" && !(value > 0))) return null;
  const legacy = !("source" in r);
  return {
    source,
    type,
    value: type === "percentage" ? Math.min(100, value) : value,
    // Old rewards always ended (default 14 days); new ones may run with no end (0).
    days: legacy ? num(r.days, 1, 365, 14) : num(r.days, 0, 365, 0),
    minOrder: Math.max(0, Number(r.minOrder) || 0),
    unique: legacy ? true : r.unique !== false,
    discountId,
    code,
    prefix: (typeof r.prefix === "string" ? r.prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) : "") || "WELCOME",
    ...(r.mystery === true ? { mystery: true } : {}),
  };
}

/** What shoppers see about a reward before signing up (never the code). */
export interface PopupRewardSummary {
  label: string;
  type: RewardKind;
  value: number;
  minOrder: number;
  /** A mystery gift: label and value stay hidden until they sign up. */
  mystery?: boolean;
}

/** What the storefront may know of a mystery reward before sign-up: nothing but that it is one. */
export function mysterySummary(minOrder: number): PopupRewardSummary {
  return { label: "A mystery gift", type: "percentage", value: 0, minOrder, mystery: true };
}

/** "10% off", "₦2,000 off", "Free delivery". */
export function rewardLabel(reward: Pick<FormReward, "type" | "value">, money: (n: number) => string = (n) => `₦${n.toLocaleString("en-NG")}`): string {
  switch (reward.type) {
    case "percentage":
      return `${reward.value}% off`;
    case "fixed_amount":
      return `${money(reward.value)} off`;
    case "free_shipping":
      return "Free delivery";
    default:
      return "A special offer";
  }
}

/** Big badge text: the seller's own, else "10% OFF" from the reward. */
export function badgeText(style: PopupStyle, reward: (Pick<FormReward, "type" | "value"> & { mystery?: boolean }) | null): string {
  if (style.badgeText) return style.badgeText;
  if (!reward) return "";
  if (reward.mystery) return "MYSTERY GIFT";
  if (reward.type === "percentage") return `${reward.value}% OFF`;
  if (reward.type === "fixed_amount") return `₦${reward.value.toLocaleString("en-NG")} OFF`;
  if (reward.type === "free_shipping") return "FREE DELIVERY";
  return "";
}

export interface FormDesign {
  headline: string;
  body: string;
  buttonText: string;
  successMessage: string;
  imageUrl: string;
  consentText: string;
  askSmsConsent: boolean;
  style: PopupStyle;
  /** Small line above the headline ("FREE DOWNLOAD"); empty = none. */
  eyebrow: string;
  /** Describes the picture for screen readers; empty = decorative. */
  imageAlt: string;
  /** No-form pop-ups: the button's words and where it goes. */
  ctaLabel: string;
  ctaTarget: CtaTarget;
  ctaUrl: string;
}

export interface FormField {
  key: string;
  type: "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "radio" | "birthday";
  label: string;
  required: boolean;
  options?: string[];
}

const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);
const num = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

const COLLECT = ["email", "whatsapp", "either"] as const;

export function readPopupConfig(raw: unknown): PopupConfig {
  const c = obj(raw);
  const kind = pick(c.kind, POPUP_KINDS, "signup");
  // Older pop-ups saved timing: "immediate" | "delay" | "exit_intent".
  const trigger = pick(c.trigger ?? c.timing, ["immediate", "delay", "exit_intent", "scroll"] as const, "delay");
  const reward = c.reward;
  const devices = Array.isArray(c.devices) ? c.devices.filter((d): d is "mobile" | "desktop" => d === "mobile" || d === "desktop") : [];
  return {
    layout: pick(c.layout, ["modal", "flyout", "bar", "fullscreen"] as const, "modal"),
    trigger,
    delaySeconds: num(c.delaySeconds, 0, 600, 8),
    scrollPercent: num(c.scrollPercent, 5, 100, 50),
    pages: pick(c.pages, ["all", "home", "product"] as const, "all"),
    frequency: pick(c.frequency, ["once", "session", "always", "days"] as const, "once"),
    frequencyDays: num(c.frequencyDays, 1, 365, 7),
    devices: devices.length ? devices : ["mobile", "desktop"],
    reward: readReward(reward),
    afterSubmit: c.afterSubmit === "redirect" && typeof c.redirectUrl === "string" && /^https?:\/\//.test(c.redirectUrl) ? "redirect" : "message",
    redirectUrl: typeof c.redirectUrl === "string" ? c.redirectUrl : "",
    kind,
    game: pick(c.game, POPUP_GAMES, "wheel"),
    collect: pick(c.collect, COLLECT, "either"),
    playEveryDays: num(c.playEveryDays, 1, 365, 7),
    onlyWithCart: c.onlyWithCart === true,
    leadMagnet: readLeadMagnet(c.leadMagnet),
    endsAt: readEndsAt(c.endsAt),
    freeDeliveryOver: num(c.freeDeliveryOver, 0, 100_000_000, 0),
  };
}

export function readDesign(raw: unknown, formName = ""): FormDesign {
  const d = obj(raw);
  const s = (value: unknown, fallback: string, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback);
  return {
    headline: s(d.headline, formName || "Join our list", 120),
    body: s(d.body, "Be the first to hear about new arrivals and offers.", 400),
    buttonText: s(d.buttonText, "Sign up", 40),
    successMessage: s(d.successMessage, "You're in! Thanks for joining.", 300),
    imageUrl: typeof d.imageUrl === "string" && /^https:\/\//.test(d.imageUrl) ? d.imageUrl : "",
    consentText: s(d.consentText, "I agree to get emails about offers and new arrivals. I can unsubscribe at any time.", 400),
    askSmsConsent: d.askSmsConsent === true,
    style: readPopupStyle(d.style),
    eyebrow: typeof d.eyebrow === "string" ? d.eyebrow.trim().slice(0, 40) : "",
    imageAlt: typeof d.imageAlt === "string" ? d.imageAlt.trim().slice(0, 160) : "",
    ctaLabel: s(d.ctaLabel, "Shop now", 40),
    ctaTarget: pick(d.ctaTarget, CTA_TARGETS, "shop"),
    ctaUrl: typeof d.ctaUrl === "string" ? d.ctaUrl.trim().slice(0, 1000) : "",
  };
}

const FIELD_TYPES = ["text", "email", "phone", "textarea", "select", "checkbox", "radio", "birthday"] as const;

/** Stored fields, always with a required email field first (a sign-up needs somewhere to send). */
export function readFields(raw: unknown): FormField[] {
  const list = Array.isArray(raw) ? raw : [];
  const fields: FormField[] = [];
  for (const item of list) {
    const f = obj(item);
    const key = String(f.key ?? f.id ?? "").trim().slice(0, 40);
    if (!key || fields.some((field) => field.key === key)) continue;
    fields.push({
      key,
      type: pick(f.type, FIELD_TYPES, "text"),
      label: String(f.label ?? "").slice(0, 120),
      required: f.required === true,
      ...(Array.isArray(f.options) ? { options: f.options.map(String).slice(0, 20) } : {}),
    });
  }
  const email = fields.find((field) => field.type === "email");
  if (!email) fields.unshift({ key: "email", type: "email", label: "Email", required: true });
  else email.required = true;
  return fields.slice(0, 15);
}

/** Whether the pop-up may appear on this page, device and visit, given when the visitor last saw or closed it. */
export function popupAllowed(
  config: Pick<PopupConfig, "devices" | "pages" | "frequency" | "frequencyDays"> & Partial<Pick<PopupConfig, "kind" | "endsAt" | "onlyWithCart">>,
  visit: { path: string; isMobile: boolean; lastShownAt: number | null; shownThisSession: boolean; subscribed: boolean; now?: number; cartCount?: number },
) {
  const kind = config.kind ?? "signup";
  // People already on the list don't get asked to join again; sales, games and reminders still show.
  if (visit.subscribed && collectsSignup(kind)) return false;
  if (!kindAllows({ kind, endsAt: config.endsAt ?? null, onlyWithCart: config.onlyWithCart ?? false }, visit)) return false;
  if (!config.devices.includes(visit.isMobile ? "mobile" : "desktop")) return false;
  const isProduct = /\/product\//.test(visit.path);
  const isHome = !isProduct && /^\/(s\/[^/]+\/?)?$/.test(visit.path.replace(/\/$/, "") || "/");
  if (config.pages === "product" && !isProduct) return false;
  if (config.pages === "home" && !isHome) return false;
  const now = visit.now ?? Date.now();
  switch (config.frequency) {
    case "always":
      return true;
    case "session":
      return !visit.shownThisSession;
    case "days":
      return !visit.lastShownAt || now - visit.lastShownAt > config.frequencyDays * 86_400_000;
    default:
      return !visit.lastShownAt;
  }
}
