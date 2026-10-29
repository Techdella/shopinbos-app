// Sell everywhere (app/channels.tsx), pure parts so tests/mobile-native-tools.test.mjs can run them.

export type LivePlatform = "whatsapp" | "meta" | "tiktok" | "google";

export type CardState =
  | { kind: "soon" }
  | { kind: "connect" }
  | { kind: "syncing" }
  | { kind: "connected"; count: number | null }
  | { kind: "error" }
  | { kind: "reauth" }
  | { kind: "needs_account" };

export type ConnectOutcome = "connected" | "problem" | "closed";

/**
 * Where the sign-in ended, from the address the server sent the app back to: shopinbos://connected?channel=meta&
 * status=connected|problem|closed (shared/app-connect.ts, through the web's /api/mobile/connected page), or the older
 * shopinbos://channels?connected=meta, ?problem=meta or ?closed=meta (src/lib/sales-channels/pure.ts).
 */
export function connectOutcome(url: string | null | undefined, platform: string): ConnectOutcome {
  const query = (url ?? "").split("#")[0].split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  const status = params.get("status");
  if (params.get("channel") === platform && (status === "connected" || status === "problem" || status === "closed")) return status;
  if (params.get("connected") === platform) return "connected";
  if (params.get("problem") === platform) return "problem";
  return "closed";
}

/** The web page that starts the sign-in, through the app's sign-in handoff (src/app/auth/handoff). */
export function connectStartUrl(apiUrl: string, platform: string, returnUrl: string, token: string | null) {
  return signedIn(apiUrl, `/api/app/sales-channels/${encodeURIComponent(platform)}/connect?app=${encodeURIComponent(returnUrl)}`, token);
}

/**
 * The web's WhatsApp sign-up page for the app (src/app/channels/whatsapp): Meta's Embedded Signup, the same as the
 * WhatsApp card on the website, then straight back into the app.
 */
export function whatsappConnectUrl(apiUrl: string, returnUrl: string, token: string | null) {
  return signedIn(apiUrl, `/channels/whatsapp?app=${encodeURIComponent(returnUrl)}`, token);
}

function signedIn(apiUrl: string, path: string, token: string | null) {
  return token ? `${apiUrl}/auth/handoff?next=${encodeURIComponent(path)}#t=${token}` : `${apiUrl}${path}`;
}

/** The accounts a card brought in, by name (GET /api/app/sales-channels cards[].accounts). */
export interface ChannelAccounts {
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
}

export type AccountLine = { key: "whatsapp" | "facebook" | "instagram" | "noInstagram"; name: string };

/**
 * The account lines a card shows once it's linked (like the web's card): the WhatsApp number, or the Facebook Page
 * and the Instagram on it (or that no Instagram came along). Also on "Connect" when the inbox already has them.
 */
export function accountLines(platform: LivePlatform, state: CardState, accounts: ChannelAccounts | null | undefined): AccountLine[] {
  if (!accounts || state.kind === "soon") return [];
  const linkedHere = platform === "whatsapp" ? Boolean(accounts.whatsapp) : platform === "meta" ? Boolean(accounts.facebook) : false;
  if (!linkedHere) return [];
  if (platform === "whatsapp") return [{ key: "whatsapp", name: accounts.whatsapp! }];
  return [{ key: "facebook", name: accounts.facebook! }, accounts.instagram ? { key: "instagram", name: accounts.instagram } : { key: "noInstagram", name: "" }];
}

/** Cards that can be disconnected (anything already linked). */
export function canDisconnect(state: CardState) {
  return state.kind === "connected" || state.kind === "syncing" || state.kind === "error" || state.kind === "reauth" || state.kind === "needs_account";
}

// ─── Email (web Inbox → Email, GET/DELETE /api/app/inbox/email) ──────────────

export type EmailProvider = "platform" | "resend_domain" | "gmail";

/** The parts of the web's email setup view (src/lib/email-channel/server.ts) the Email card reads. */
export interface EmailSetupLite {
  connected: boolean;
  provider: EmailProvider | null;
  address: string | null;
  lastError: string | null;
  domain: { name: string; status: string } | null;
  gmail: { email: string } | null;
  ready: { google: boolean; encryption: boolean };
}

export type EmailCardState =
  | { kind: "off" }
  | { kind: "connected"; provider: EmailProvider; address: string | null }
  | { kind: "attention"; provider: EmailProvider; address: string | null }
  | { kind: "domainWaiting"; domain: string };

/**
 * Starts the Gmail sign-in on the web. Google sends the browser back to the web's email page (there is no way back
 * into the app), so the seller closes the browser and the card checks again.
 */
export const GMAIL_CONNECT_PATH = "/api/app/inbox/email/gmail/connect";
/** The web's email page: own-domain email (DNS records) is set up there. */
export const EMAIL_SETUP_PATH = "/home/inbox/email";

/** What the Email card shows: connected (and from which address), needs attention, a domain still waiting, or off. */
export function emailCardState(view: EmailSetupLite): EmailCardState {
  if (view.connected) {
    const provider = view.provider ?? "platform";
    return { kind: view.lastError ? "attention" : "connected", provider, address: view.address };
  }
  if (view.domain && view.domain.status !== "verified") return { kind: "domainWaiting", domain: view.domain.name };
  return { kind: "off" };
}

/** Gmail can be connected only when Google sign-in and the token lock are switched on for Shopinbos. */
export function gmailAvailable(view: EmailSetupLite) {
  return view.ready.google && view.ready.encryption;
}

/** A connected email can be disconnected (the web's Disconnect: Gmail is signed out, a domain is removed). */
export function canDisconnectEmail(state: EmailCardState) {
  return state.kind === "connected" || state.kind === "attention";
}
