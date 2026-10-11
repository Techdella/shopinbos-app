// What a catalog channel card says, from what we actually know: the seller's word, crawler fetches, API syncs.
// Pure, unit tested.

export interface ConnectionFacts {
  feedAddedAt: Date | null;
  lastFetchAt: Date | null;
  hasToken: boolean;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
}

export type StatusTone = "success" | "warning" | "danger" | "info" | "muted";

const STALE_FETCH_MS = 3 * 24 * 60 * 60 * 1000;

export function ago(date: Date, now: Date) {
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function channelStatus(facts: ConnectionFacts | null, now = new Date()): { tone: StatusTone; label: string } {
  if (facts?.hasToken) {
    if (facts.lastSyncStatus === "error") return { tone: "danger", label: "Last sync failed" };
    if (facts.lastSyncStatus === "ok" && facts.lastSyncAt) return { tone: "success", label: `Synced ${ago(facts.lastSyncAt, now)}` };
    return { tone: "info", label: "Connected, not synced yet" };
  }
  if (facts?.lastFetchAt) {
    const fresh = now.getTime() - facts.lastFetchAt.getTime() < STALE_FETCH_MS;
    return { tone: fresh ? "success" : "warning", label: `Feed fetched ${ago(facts.lastFetchAt, now)}` };
  }
  if (facts?.feedAddedAt) return { tone: "warning", label: "Waiting for the first fetch" };
  return { tone: "muted", label: "Not set up" };
}
