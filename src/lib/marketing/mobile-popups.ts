// Pop-ups on the phone (apps/mobile/src/app/marketing/popups.tsx and popup/[id].tsx, boards M-Popups and
// M-PopupEdit): a stored form as the phone gets it and the starting point for a new sign-up pop-up. The phone
// sends a form back whole to POST or PATCH /api/app/marketing/forms (apps/mobile/src/lib/popups-pure.ts popupBody),
// changing only the headline, the offer, whether it asks for a WhatsApp number and when it shows; everything else
// (the look, games, downloads, countdowns) stays as the web editor saved it. Pure: no server imports, so
// tests/mobile-grow.test.mjs runs it directly.
import { readDesign, readFields, readPopupConfig, rewardLabel, type FormDesign, type FormField, type FormReward, type PopupConfig } from "./forms.ts";

export interface MobilePopup {
  id: string;
  name: string;
  type: string;
  isPopup: boolean;
  active: boolean;
  fields: FormField[];
  design: FormDesign;
  config: PopupConfig;
  /** Last 30 days. */
  views: number;
  signups: number;
  /** "10% off", or null when it gives nothing. */
  rewardText: string | null;
  /** Whether the phone can change its offer and what it asks for (sign-up pop-ups). */
  signup: boolean;
}

/** A new sign-up pop-up's reward: the web editor's NEW_REWARD (10% off, a code per person, 14 days). */
export const NEW_POPUP_REWARD: FormReward = { source: "new", type: "percentage", value: 10, days: 14, minOrder: 0, unique: true, discountId: null, code: "", prefix: "WELCOME" };

export function mobilePopup(row: { id: string; name: string; type: string; isPopup: boolean; active: boolean; fields: unknown; design: unknown; popupConfig: unknown }, stat?: { views: number; signups: number }): MobilePopup {
  const config = readPopupConfig(row.popupConfig);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    isPopup: row.isPopup,
    active: row.active,
    fields: readFields(row.fields),
    design: readDesign(row.design, row.name),
    config,
    views: stat?.views ?? 0,
    signups: stat?.signups ?? 0,
    rewardText: config.reward && config.reward.source === "new" ? rewardLabel(config.reward) : config.reward?.code || null,
    signup: row.isPopup && config.kind === "signup",
  };
}

/** The starting point for a new pop-up on the phone: a sign-up pop-up after 5 seconds, 10% off, asking for an email
 * and a WhatsApp number (board M-PopupEdit). */
export function blankPopup(storeName: string): Omit<MobilePopup, "id" | "views" | "signups" | "rewardText"> {
  return {
    name: "Welcome pop-up",
    type: "newsletter",
    isPopup: true,
    active: true,
    fields: [
      { key: "email", type: "email", label: "Email", required: true },
      { key: "phone", type: "phone", label: "WhatsApp number", required: false },
    ],
    design: { ...readDesign({}, storeName), headline: "Get 10% off your first order", body: "Join our list for new arrivals and offers.", buttonText: "Send me my code", successMessage: "You're in! Here's your code." },
    config: { ...readPopupConfig({ trigger: "delay", delaySeconds: 5 }), reward: { ...NEW_POPUP_REWARD } },
    signup: true,
  };
}
