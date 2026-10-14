// What the phone app's Payments and Settings screens may send (/api/app/payments, /api/app/payout-bank/resolve,
// /api/app/settings/profile), and how a store's business address is cleaned (also used by the web's
// saveBusinessAddress action). Only zod and relative imports, so tests/seller-settings.test.mjs loads it directly.
import { z } from "zod";
import { cleanAccountNumber, isTransferWindowChoice } from "../../shared/seller-payments.ts";

export const PaymentsPatchSchema = z
  .object({
    methods: z.object({ transfer: z.boolean(), card: z.boolean(), cod: z.boolean(), wa: z.boolean() }).optional(),
    transferWindowHours: z
      .number()
      .int()
      .nullable()
      .refine((hours) => isTransferWindowChoice(hours), "Choose one of the listed times.")
      .optional(),
  })
  .refine((body) => body.methods !== undefined || body.transferWindowHours !== undefined, "Nothing to save.");

export const ResolveAccountSchema = z.object({
  bankName: z.string().trim().min(1, "Choose your bank.").max(80),
  accountNumber: z
    .string()
    .transform((value, context) => {
      const digits = cleanAccountNumber(value);
      if (!digits) context.addIssue({ code: "custom", message: "Enter the 10 digit account number." });
      return digits ?? "";
    }),
});

const phone = z
  .string()
  .trim()
  .max(40, "That phone number is too long.")
  .regex(/^[+\d\s()-]*$/, "Use only numbers in the phone number.");

export const ProfilePatchSchema = z
  .object({
    shop: z
      .object({
        name: z.string().trim().min(1, "Add your shop's name.").max(120),
        description: z.string().trim().max(2000),
        city: z.string().trim().max(80),
        state: z.string().trim().max(80),
        phone,
      })
      .partial()
      .optional(),
    me: z
      .object({
        name: z.string().trim().min(2, "Add your name.").max(120),
        phone,
      })
      .partial()
      .optional(),
  })
  .refine((body) => Object.keys(body.shop ?? {}).length > 0 || Object.keys(body.me ?? {}).length > 0, "Nothing to save.");

export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

// ─── Business address (Store.brandSettings.businessAddress: every email's footer) ─────────────────────────────

export const BUSINESS_ADDRESS_LIMITS = {
  legalName: 160,
  line1: 160,
  line2: 160,
  city: 80,
  state: 80,
  postalCode: 20,
  country: 80,
  email: 200,
  phone: 40,
} as const;

export type BusinessAddressKey = keyof typeof BUSINESS_ADDRESS_LIMITS;

/** Trims, squashes spaces and caps each field; an email that doesn't look like one is dropped. */
export function cleanBusinessAddress(input: Partial<Record<BusinessAddressKey, unknown>>): Record<BusinessAddressKey, string> {
  const field = (key: BusinessAddressKey) => String(input[key] ?? "").trim().replace(/\s+/g, " ").slice(0, BUSINESS_ADDRESS_LIMITS[key]);
  const out = Object.fromEntries((Object.keys(BUSINESS_ADDRESS_LIMITS) as BusinessAddressKey[]).map((key) => [key, field(key)])) as Record<BusinessAddressKey, string>;
  out.email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email) ? out.email.toLowerCase() : "";
  return out;
}
