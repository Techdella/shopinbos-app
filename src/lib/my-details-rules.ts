// What "My details" may send (/api/app/me/details, /api/app/me/email, /api/app/me/phone; shared/my-details.ts).
// Only zod and relative imports, so tests/my-details.test.mjs loads it directly.
import { z } from "zod";
import { BUSINESS_LIMITS } from "../../shared/my-details.ts";
import { isValidEmail } from "../../shared/phone.ts";

const phoneText = z
  .string()
  .trim()
  .max(BUSINESS_LIMITS.phone, "That phone number is too long.")
  .regex(/^[+\d\s()-]*$/, "Use only numbers in the phone number.")
  .refine((value) => !value || value.replace(/\D/g, "").length >= 7, "Check the phone number.");

const text = (max: number) => z.string().trim().max(max, "That's too long.");

/** PATCH /api/app/me/details: the person's own name and the business's details; at least one field. */
export const DetailsPatchSchema = z
  .object({
    name: z.string().trim().min(2, "Add your name.").max(120, "That name is too long."),
    business: z
      .object({
        name: z.string().trim().min(2, "Add your business name.").max(BUSINESS_LIMITS.name, "That name is too long."),
        phone: phoneText,
        address: text(BUSINESS_LIMITS.address),
        city: text(BUSINESS_LIMITS.city),
        state: text(BUSINESS_LIMITS.state),
      })
      .partial(),
  })
  .partial()
  .refine((body) => body.name !== undefined || Object.keys(body.business ?? {}).length > 0, "Nothing to save.");

export type DetailsPatch = z.infer<typeof DetailsPatchSchema>;

/** POST /api/app/me/email: the new sign-in email (Supabase sends the confirmation links). */
export const EmailChangeSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200, "That email is too long.")
    .refine((value) => isValidEmail(value), "Enter a valid email address."),
});

/**
 * POST /api/app/me/phone: { action: "send", phone, via? } sends a 6-digit code to the new number;
 * { action: "verify", phone, challenge, code } checks it and makes it the account's sign-in phone.
 */
export const PhoneChangeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), phone: z.string().trim().min(1, "Enter your new phone number.").max(30), via: z.enum(["whatsapp", "sms"]).optional() }),
  z.object({ action: z.literal("verify"), phone: z.string().trim().min(1).max(30), challenge: z.string().min(1, "Send a code first.").max(2000), code: z.string().trim().min(1, "Enter the code we sent you.").max(12) }),
]);
