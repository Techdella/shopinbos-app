import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { api, API_URL } from "./api";
import { supabase } from "./supabase";
import { connectOutcome, connectStartUrl, whatsappConnectUrl, type CardState, type ChannelAccounts, type ConnectOutcome, type EmailSetupLite, type LivePlatform } from "./channels-pure";

// Connect accounts (web /channels): GET /api/app/sales-channels for the cards, POST/DELETE
// /api/app/sales-channels/<platform> for Try again, Tell me when it's ready and Disconnect. Connect runs the web's
// sign-in (/api/app/sales-channels/<platform>/connect → the platform → .../callback) in an in-app browser, and
// WhatsApp runs Meta's Embedded Signup on the web's small /channels/whatsapp page; both come back to
// shopinbos://connected?channel=…&status=… (shared/app-connect.ts), never to the website's Sell everywhere page.

export type { CardState, LivePlatform };

export interface ChannelCard {
  platform: LivePlatform;
  name: string;
  state: CardState;
  accountUrl: string | null;
  /** The number, Page and Instagram this card brought in (older servers leave it out). */
  accounts?: ChannelAccounts;
}

export interface SoonPlatform {
  platform: string;
  name: string;
  noted: boolean;
}

export interface ChannelsOverview {
  cards: ChannelCard[];
  soon: SoonPlatform[];
  saved: boolean;
  listed: number | null;
  skipped: number;
}

export const fetchChannels = () => api<ChannelsOverview>("/api/app/sales-channels");

export const retryChannel = (platform: LivePlatform) =>
  api<{ ok: boolean; needsSignup?: boolean }>(`/api/app/sales-channels/${platform}`, { method: "POST", json: { action: "retry" } });

export const notifyWhenReady = (platform: string) =>
  api<{ ok: boolean }>(`/api/app/sales-channels/${encodeURIComponent(platform)}`, { method: "POST", json: { action: "notify" } });

export const disconnectChannel = (platform: LivePlatform) => api<{ ok: boolean }>(`/api/app/sales-channels/${platform}`, { method: "DELETE" });

// The web session borrows this token (src/app/auth/handoff), so make sure it lasts the whole sign-in.
async function freshToken() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  if ((session.expires_at ?? 0) - Date.now() / 1000 > 20 * 60) return session.access_token;
  const refreshed = await supabase.auth.refreshSession().catch(() => null);
  return refreshed?.data.session?.access_token ?? session.access_token;
}

/**
 * Signs in to Facebook & Instagram, TikTok or Google in an in-app browser. "dismissed" means they closed the
 * browser before the end (or the server couldn't send them back): the caller refreshes the cards either way.
 */
export async function connectChannel(platform: Exclude<LivePlatform, "whatsapp">): Promise<ConnectOutcome | "dismissed"> {
  const returnUrl = connectedReturnUrl();
  const token = await freshToken().catch(() => null);
  const result = await WebBrowser.openAuthSessionAsync(connectStartUrl(API_URL, platform, returnUrl, token), returnUrl);
  return result.type === "success" ? connectOutcome(result.url, platform) : "dismissed";
}

/**
 * Connects the seller's WhatsApp Business number in an in-app browser: Meta's Embedded Signup (pick or add the
 * number, confirm it), saved like the web's WhatsApp card, then back here. "dismissed": closed before the end.
 */
export async function connectWhatsApp(): Promise<ConnectOutcome | "dismissed"> {
  const returnUrl = connectedReturnUrl();
  const token = await freshToken().catch(() => null);
  const result = await WebBrowser.openAuthSessionAsync(whatsappConnectUrl(API_URL, returnUrl, token), returnUrl);
  return result.type === "success" ? connectOutcome(result.url, "whatsapp") : "dismissed";
}

/** shopinbos://connected (Expo Go: exp://…/--/connected), where the web sends the in-app browser at the end. */
function connectedReturnUrl() {
  return makeRedirectUri({ scheme: "shopinbos", path: "connected" });
}

// ─── Email (web Inbox → Email) ───────────────────────────────────────────────
// GET shows what's connected; DELETE disconnects (Gmail is signed out at Google, an own domain is removed).
// Connecting Gmail or an own domain runs on the web (GMAIL_CONNECT_PATH / EMAIL_SETUP_PATH in channels-pure.ts).

export type { EmailSetupLite };

export const fetchEmailSetup = () => api<EmailSetupLite>("/api/app/inbox/email");

export const disconnectEmail = () => api<EmailSetupLite>("/api/app/inbox/email", { method: "DELETE" });
