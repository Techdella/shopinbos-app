// Sign-up forms and storefront pop-ups: reading their stored settings and deciding when a pop-up may show.
// Pure (no server imports): used by the seller editor, the public API, the storefront mount and tests.

export type PopupLayout = "modal" | "flyout" | "bar";
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
  reward: { type: "percentage" | "fixed_amount"; value: number; days: number } | null;
  afterSubmit: "message" | "redirect";
  redirectUrl: string;
}

export interface FormDesign {
  headline: string;
  body: string;
  buttonText: string;
  successMessage: string;
  imageUrl: string;
  consentText: string;
  askSmsConsent: boolean;
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
  const reward = obj(c.reward);
  const devices = Array.isArray(c.devices) ? c.devices.filter((d): d is "mobile" | "desktop" => d === "mobile" || d === "desktop") : [];
  return {
    layout: pick(c.layout, ["modal", "flyout", "bar"] as const, "modal"),
    trigger,
    delaySeconds: num(c.delaySeconds, 0, 600, 8),
    scrollPercent: num(c.scrollPercent, 5, 100, 50),
    pages: pick(c.pages, ["all", "home", "product"] as const, "all"),
    frequency: pick(c.frequency, ["once", "session", "always", "days"] as const, "once"),
    frequencyDays: num(c.frequencyDays, 1, 365, 7),
    devices: devices.length ? devices : ["mobile", "desktop"],
    reward:
      (reward.type === "percentage" || reward.type === "fixed_amount") && Number(reward.value) > 0
        ? { type: reward.type, value: Number(reward.value), days: num(reward.days, 1, 365, 14) }
        : null,
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
  config: PopupConfig,
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
