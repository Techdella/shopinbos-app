import type { BusinessDetails, MyDetails } from "@shared/my-details";
import { api } from "./api";

// "My details" (app/my-details.tsx): the same routes as the web's /home/details, /supplier/details and
// /logistics/details (src/lib/my-details.server.ts). Photo and logo go through lib/identity.ts.

export type { MyDetails };

export const fetchMyDetails = () => api<MyDetails>("/api/app/me/details");

export const saveMyDetails = (body: { name?: string; business?: Partial<BusinessDetails> }) =>
  api<MyDetails>("/api/app/me/details", { method: "PATCH", json: body });

/** Supabase sends a confirmation link to the new email (and the current one, when there is one). */
export const requestEmailChange = (email: string) =>
  api<{ pendingEmail: string; currentToo: boolean }>("/api/app/me/email", { method: "POST", json: { email } });

/** A 6-digit code to the new number (WhatsApp first when set up; `via: "sms"` for SMS). */
export const sendPhoneChangeCode = (phone: string, via?: "sms") =>
  api<{ phone: string; challenge: string; channel: string }>("/api/app/me/phone", { method: "POST", json: { action: "send", phone, ...(via ? { via } : {}) } });

/** Checks the code; the number becomes the account's sign-in phone. */
export const confirmPhoneChange = (phone: string, challenge: string, code: string) =>
  api<{ phone: string }>("/api/app/me/phone", { method: "POST", json: { action: "verify", phone, challenge, code } });
