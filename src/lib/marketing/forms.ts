// Sign-up forms and storefront pop-ups: reading their stored settings and deciding when a pop-up may show.
// Pure (no server imports): used by the seller editor, the public API, the storefront mount and tests.

export type PopupLayout = "modal" | "flyout" | "bar" | "fullscreen";
export type PopupTrigger = "immediate" | "delay" | "exit_intent" | "scroll";

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
}

export type PopupTemplateId = "classic" | "split" | "takeover" | "corner" | "badge" | "minimal" | "luxe" | "festive";
export type PopupFont = "theme" | "modern" | "elegant" | "clean";
export type PopupImagePosition = "left" | "top" | "background" | "none";

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
}

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
};

export interface PopupTemplate {
  id: PopupTemplateId;
  layout: PopupLayout;
  style: PopupStyle;
}

const tpl = (id: PopupTemplateId, layout: PopupLayout, style: Partial<PopupStyle>): PopupTemplate => ({ id, layout, style: { ...DEFAULT_POPUP_STYLE, ...style, template: id } });

/** The looks a seller picks from. Each sets the layout and a full style; the seller can change any of it after. */
export const POPUP_TEMPLATES: PopupTemplate[] = [
  tpl("classic", "modal", {}),
  tpl("split", "modal", { imagePosition: "left", size: "large", radius: "soft", closeStyle: "circle" }),
  tpl("takeover", "fullscreen", { imagePosition: "background", size: "large", radius: "square", overlay: 0 }),
  tpl("corner", "flyout", { imagePosition: "none", size: "small", radius: "soft", closeStyle: "circle" }),
  tpl("badge", "modal", { imagePosition: "none", radius: "soft", font: "modern", background: "#FFF8EC", text: "#1D1A16", button: "#E4572E", buttonText: "#FFFFFF" }),
  tpl("minimal", "modal", { imagePosition: "none", size: "small", radius: "square", background: "#FFFFFF", text: "#111111", button: "#111111", buttonText: "#FFFFFF", font: "clean", overlay: 30, closeStyle: "text" }),
  tpl("luxe", "modal", { imagePosition: "left", size: "large", radius: "square", font: "elegant", background: "#14110F", text: "#F3EBDD", button: "#C8A462", buttonText: "#14110F", overlay: 70, closeStyle: "circle" }),
  tpl("festive", "modal", { imagePosition: "top", radius: "round", font: "modern", background: "#FFF4E0", text: "#2B1608", button: "#0F7B4F", buttonText: "#FFFFFF", closeStyle: "circle" }),
];

export function popupTemplate(id: string): PopupTemplate {
  return POPUP_TEMPLATES.find((t) => t.id === id) ?? POPUP_TEMPLATES[0]!;
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
  const base = typeof s.template === "string" ? popupTemplate(s.template).style : DEFAULT_POPUP_STYLE;
  const has = (key: string) => key in s;
  return {
    template: pick(s.template, POPUP_TEMPLATES.map((t) => t.id), "classic"),
    background: has("background") ? hex(s.background) : base.background,
    text: has("text") ? hex(s.text) : base.text,
    button: has("button") ? hex(s.button) : base.button,
    buttonText: has("buttonText") ? hex(s.buttonText) : base.buttonText,
    radius: pick(s.radius, ["square", "soft", "round"] as const, base.radius),
    font: pick(s.font, ["theme", "modern", "elegant", "clean"] as const, base.font),
    imagePosition: pick(s.imagePosition, ["left", "top", "background", "none"] as const, base.imagePosition),
    size: pick(s.size, ["small", "medium", "large"] as const, base.size),
    overlay: has("overlay") ? num(s.overlay, 0, 90, base.overlay) : base.overlay,
    closeStyle: pick(s.closeStyle, ["icon", "circle", "text"] as const, base.closeStyle),
    badgeText: typeof s.badgeText === "string" ? s.badgeText.trim().slice(0, 24) : "",
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
    };
  }
  const type = r.type === "fixed_amount" ? "fixed_amount" : r.type === "percentage" ? "percentage" : null;
  const value = Number(r.value);
  if (!type || !(value > 0)) return null;
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
  };
}

/** What shoppers see about a reward before signing up (never the code). */
export interface PopupRewardSummary {
  label: string;
  type: RewardKind;
  value: number;
  minOrder: number;
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
export function badgeText(style: PopupStyle, reward: Pick<FormReward, "type" | "value"> | null): string {
  if (style.badgeText) return style.badgeText;
  if (!reward) return "";
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

export function readPopupConfig(raw: unknown): PopupConfig {
  const c = obj(raw);
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
  config: Pick<PopupConfig, "devices" | "pages" | "frequency" | "frequencyDays">,
  visit: { path: string; isMobile: boolean; lastShownAt: number | null; shownThisSession: boolean; subscribed: boolean; now?: number },
) {
  if (visit.subscribed) return false;
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
