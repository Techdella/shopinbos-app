import "server-only";
import { startCall } from "@/lib/sms/africastalking";
import { sendStoreSms } from "@/lib/sms";
import type { SmsCredentials } from "@/lib/sms/types";
import type { SendInput, SendResult } from "./types";

// SMS and phone calls on the store's own Termii, Africa's Talking or Sendchamp account (src/lib/sms).
// Credentials: provider, apiKey, plus username (AT), senderId, phoneNumber (number/shortcode for replies),
// secretKey (Termii webhook signature), route, baseUrl (Termii).

export async function sendSmsReply(input: SendInput): Promise<SendResult> {
  if (!input.credentials.apiKey) return { ok: false, error: "SMS isn't connected." };
  return sendStoreSms(input.credentials, { to: input.to, body: input.body });
}

/** Click-to-call through Africa's Talking Voice: ring the seller, then bridge them to the customer (see the voice webhook). */
export async function startCallBack(credentials: Record<string, string>, input: { sellerPhone: string; conversationId: string }): Promise<SendResult> {
  if (credentials.provider !== "africastalking") return { ok: false, error: "Phone calls need reconnecting with Africa's Talking in Inbox › Channels." };
  return startCall(credentials as unknown as SmsCredentials, { to: input.sellerPhone, clientRequestId: input.conversationId });
}
