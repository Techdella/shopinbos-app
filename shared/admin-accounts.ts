// Admin › Accounts (/admin/accounts, src/lib/admin/accounts.server.ts): the details a team member can change for a
// seller, supplier or delivery partner, checked here. Pure, unit-tested in tests/admin-accounts.test.mjs.

import { toE164 } from "./phone.ts";

export type AccountRole = "seller" | "supplier" | "logistics_partner";

export const ACCOUNT_ROLE_LABEL: Record<AccountRole, string> = { seller: "Sellers", supplier: "Suppliers", logistics_partner: "Delivery partners" };

/** The fields on the form, per role: the person first, then their business. */
export const ACCOUNT_FIELDS = {
  name: { label: "Owner's name", max: 80, required: true },
  phone: { label: "Owner's phone", max: 20, required: false },
  city: { label: "City", max: 60, required: true },
  business: { label: "Business name", max: 80, required: true },
  description: { label: "About the business", max: 1500, required: false },
  address: { label: "Address", max: 200, required: false },
  whatsapp: { label: "Business WhatsApp", max: 20, required: false },
  website: { label: "Website", max: 200, required: false },
  contactName: { label: "Contact person", max: 80, required: false },
  contactPhone: { label: "Contact phone", max: 20, required: false },
  contactEmail: { label: "Contact email", max: 120, required: false },
} as const;
export type AccountField = keyof typeof ACCOUNT_FIELDS;

export const FIELDS_BY_ROLE: Record<AccountRole, readonly AccountField[]> = {
  seller: ["name", "phone", "city", "business", "description"],
  supplier: ["name", "phone", "city", "business", "description", "address", "whatsapp", "website"],
  logistics_partner: ["name", "phone", "city", "business", "description", "address", "contactName", "contactPhone", "contactEmail"],
};

const PHONE_FIELDS: readonly AccountField[] = ["phone", "whatsapp", "contactPhone"];

export type AccountDetails = Partial<Record<AccountField, string | null>>;

/**
 * The form's values for this role, cleaned: text trimmed, phones as +234…, the website as https://…, empty optional
 * fields as null. An error names the first field that's wrong.
 */
export function cleanAccountDetails(role: AccountRole, raw: Record<string, unknown>): { ok: true; values: AccountDetails } | { ok: false; error: string } {
  const values: AccountDetails = {};
  for (const field of FIELDS_BY_ROLE[role]) {
    const rule = ACCOUNT_FIELDS[field];
    const text = String(raw[field] ?? "").replace(field === "description" ? /[ \t]+/g : /\s+/g, " ").trim();
    if (!text) {
      if (rule.required) return { ok: false, error: `Add the ${rule.label.toLowerCase()}.` };
      values[field] = null;
      continue;
    }
    if (text.length > rule.max) return { ok: false, error: `${rule.label} is too long (${rule.max} characters at most).` };
    if (rule.required && text.length < 2) return { ok: false, error: `${rule.label} is too short.` };
    if (PHONE_FIELDS.includes(field)) {
      const phone = toE164(text);
      if (!phone) return { ok: false, error: `${rule.label} isn't a phone number we can use.` };
      values[field] = phone;
    } else if (field === "contactEmail") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { ok: false, error: "Contact email isn't an email address." };
      values[field] = text.toLowerCase();
    } else if (field === "website") {
      const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
      try {
        const parsed = new URL(url);
        if (!parsed.hostname.includes(".")) throw new Error("no host");
        values[field] = parsed.toString();
      } catch {
        return { ok: false, error: "Website isn't a web address." };
      }
    } else values[field] = text;
  }
  return { ok: true, values };
}

/** The fields that changed, for the log ("Business name, City"). */
export function changedFields(before: AccountDetails, after: AccountDetails): AccountField[] {
  return (Object.keys(after) as AccountField[]).filter((field) => (before[field] ?? null) !== (after[field] ?? null));
}
