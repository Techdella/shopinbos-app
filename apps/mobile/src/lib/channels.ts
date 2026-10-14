import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { api, API_URL } from "./api";
import { supabase } from "./supabase";
import { connectOutcome, connectStartUrl, type CardState, type ConnectOutcome, type LivePlatform } from "./channels-pure";

// Sell everywhere (web /channels): GET /api/app/sales-channels for the cards, POST/DELETE
// /api/app/sales-channels/<platform> for Try again, Tell me when it's ready and Disconnect. Connect runs the web's
// sign-in (/api/app/sales-channels/<platform>/connect → the platform → .../callback) in an in-app browser that
// comes back to shopinbos://channels.

export type { CardState, LivePlatform };

export interface ChannelCard {
  platform: LivePlatform;
  name: string;
  state: CardState;
  accountUrl: string | null;
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
  const returnUrl = makeRedirectUri({ scheme: "shopinbos", path: "channels" });
  const token = await freshToken().catch(() => null);
  const result = await WebBrowser.openAuthSessionAsync(connectStartUrl(API_URL, platform, returnUrl, token), returnUrl);
  return result.type === "success" ? connectOutcome(result.url, platform) : "dismissed";
}
