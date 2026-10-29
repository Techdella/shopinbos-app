// Ready-made first messages for Admin › Inbox › New conversation, e.g. straight after approving or rejecting a
// supplier or delivery partner. {{reason}} is filled from the Reason box. Pure.

import { SHOPINBOS_WHATSAPP, formatWhatsApp } from "../support-contact.ts";
import { greetingName } from "../../../shared/person-name.ts";

export type PresetId = "approved" | "rejected";
export type PresetRole = "seller" | "supplier" | "logistics_partner" | string;

const ROLE_NOUN: Record<string, string> = { seller: "seller", supplier: "supplier", logistics_partner: "delivery partner" };

function whatTheyCanDo(role: PresetRole) {
  if (role === "supplier") return "Sellers can now find your products in the Shopinbos marketplace and send you orders.";
  if (role === "logistics_partner") return "Sellers can now find you in the Shopinbos logistics marketplace and book your deliveries.";
  return "You can now use everything on Shopinbos.";
}

export type Preset = {
  subject: string;
  /** Email and in-app message; {{reason}} where the reason goes. */
  message: string;
  /** WhatsApp template and the message that goes inside it. */
  template: string;
  note: string;
  needsReason: boolean;
};

export function decisionPreset(id: PresetId, input: { name: string; business: string; role: PresetRole; agent: string }): Preset {
  const first = greetingName(input.name);
  const agent = input.agent.trim().split(/\s+/)[0] || "The Shopinbos team";
  const business = input.business.trim() || "your business";
  const help = `If you need help, reply to this email or message us on WhatsApp at ${formatWhatsApp(SHOPINBOS_WHATSAPP)}.`;
  if (id === "approved") {
    return {
      subject: `${business} is verified on Shopinbos`,
      message: `Hi ${first},\n\nCongratulations: ${business} is now verified on Shopinbos. ${whatTheyCanDo(input.role)}\n\n{{reason}}\n\n${help}\n\n${agent}, Shopinbos`,
      template: "shopinbos_account_approved",
      note: `${whatTheyCanDo(input.role)} {{reason}}`,
      needsReason: false,
    };
  }
  return {
    subject: `About your Shopinbos verification`,
    message: `Hi ${first},\n\nThanks for applying to join Shopinbos as a ${ROLE_NOUN[input.role] ?? "partner"}. We couldn't approve ${business} yet because {{reason}}\n\nOnce that's sorted, update your details from your dashboard and we'll review it again straight away. ${help}\n\n${agent}, Shopinbos`,
    template: "shopinbos_account_update",
    note: "we couldn't approve it yet because {{reason}} Update your details from your dashboard and we'll review it again.",
    needsReason: true,
  };
}

/** The preset with the reason put in (an empty optional reason leaves no gap). */
export function fillReason(text: string, reason: string) {
  const clean = reason.trim().replace(/\s+$/, "");
  const withStop = clean && !/[.!?]$/.test(clean) ? `${clean}.` : clean;
  return text.replace(/\n\n\{\{reason\}\}\n\n/g, withStop ? `\n\n${withStop}\n\n` : "\n\n").replace(/\s*\{\{reason\}\}/g, withStop ? ` ${withStop}` : "").replace(/^ /, "").trim();
}
