import "server-only";

// Rewards for posting a status. The rewards backend (src/lib/rewards/rewards.server.ts, recordRewardEvent: idempotent
// on userId + kind + ref) lands separately, so it is loaded lazily and anything going wrong (not there yet, an
// error, an unexpected answer) means "no reward" (null): posting never fails because of rewards.
//
// The import is a template with the folder in a variable, so webpack makes a context limited by webpackInclude to
// that one file: the build works whether or not the file exists, and picks it up once it does.

export interface StatusReward {
  points: number;
  streak: number;
}

type RecordRewardEvent = (event: { userId: string; kind: string; ref: string }) => Promise<unknown>;

const REWARDS_DIR = "rewards";

async function loadRecorder(): Promise<RecordRewardEvent | null> {
  try {
    const mod: { recordRewardEvent?: unknown } = await import(
      /* webpackInclude: /[\\/]rewards[\\/]rewards\.server\.ts$/ */
      /* webpackMode: "lazy" */
      `../${REWARDS_DIR}/rewards.server.ts`
    );
    return typeof mod?.recordRewardEvent === "function" ? (mod.recordRewardEvent as RecordRewardEvent) : null;
  } catch {
    return null;
  }
}

/** Reads { points, streak } from what recordRewardEvent returns (directly, or under `reward`), else null. */
export function readReward(result: unknown): StatusReward | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  const source = record.reward && typeof record.reward === "object" ? (record.reward as Record<string, unknown>) : record;
  const points = Number(source.points ?? source.pointsAwarded ?? source.awarded);
  if (!Number.isFinite(points)) return null;
  const streak = Number(source.streak ?? 0);
  return { points, streak: Number.isFinite(streak) ? streak : 0 };
}

/** Records "status_posted" for this post. Never throws; null when rewards aren't available. */
export async function rewardStatusPosted(userId: string, postId: string): Promise<StatusReward | null> {
  const record = await loadRecorder();
  if (!record) return null;
  try {
    return readReward(await record({ userId, kind: "status_posted", ref: postId }));
  } catch (error) {
    console.warn("[status] reward hook failed", error);
    return null;
  }
}
