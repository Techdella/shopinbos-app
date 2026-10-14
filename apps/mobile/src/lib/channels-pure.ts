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
 * Where the sign-in ended, from the address the server sent the app back to
 * (shopinbos://channels?connected=meta, ?problem=meta or ?closed=meta, see src/lib/sales-channels/pure.ts).
 */
export function connectOutcome(url: string | null | undefined, platform: string): ConnectOutcome {
  const query = (url ?? "").split("#")[0].split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  if (params.get("connected") === platform) return "connected";
  if (params.get("problem") === platform) return "problem";
  return "closed";
}

/** The web page that starts the sign-in, through the app's sign-in handoff (src/app/auth/handoff). */
export function connectStartUrl(apiUrl: string, platform: string, returnUrl: string, token: string | null) {
  const connect = `/api/app/sales-channels/${encodeURIComponent(platform)}/connect?app=${encodeURIComponent(returnUrl)}`;
  return token ? `${apiUrl}/auth/handoff?next=${encodeURIComponent(connect)}#t=${token}` : `${apiUrl}${connect}`;
}

/** Cards that can be disconnected (anything already linked). */
export function canDisconnect(state: CardState) {
  return state.kind === "connected" || state.kind === "syncing" || state.kind === "error" || state.kind === "reauth" || state.kind === "needs_account";
}
