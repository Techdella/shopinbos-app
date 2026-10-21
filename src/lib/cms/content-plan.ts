// Rex's content plan, pure parts: the shape of an idea (a CMS item for one of the store's collections, or a
// social post for a channel), and turning the model's JSON into ideas the planner can show and draft.

export const PLAN_CHANNELS = ["instagram", "facebook", "whatsapp", "tiktok", "x"] as const;
export type PlanChannel = (typeof PLAN_CHANNELS)[number];

export interface PlanIdea {
  id: string;
  /** YYYY-MM-DD, inside the plan's dates. */
  date: string;
  kind: "cms" | "social";
  /** The collection a cms idea belongs to. */
  collectionId: string | null;
  channel: PlanChannel | null;
  title: string;
  /** What the piece should cover: becomes the writer's brief. */
  brief: string;
  /** Social ideas: a ready caption. */
  caption: string;
}

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** The plan's dates: from `start` for `weeks` weeks. */
export function planWindow(start: Date, weeks: number) {
  const from = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const to = new Date(from.getTime() + (weeks * 7 - 1) * 86400000);
  return { from: isoDay(from), to: isoDay(to) };
}

/**
 * Keeps the ideas that point at a real collection or an allowed channel, clamps their dates into the plan's
 * window and sorts them by date. At most 60.
 */
export function cleanPlan(raw: unknown, options: { collectionIds: string[]; channels: PlanChannel[]; from: string; to: string }): PlanIdea[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { ideas?: unknown }).ideas) ? (raw as { ideas: unknown[] }).ideas : [];
  const ideas: PlanIdea[] = [];
  for (const entry of list.slice(0, 80)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const title = str(row.title, 200);
    if (!title) continue;
    let date = /^\d{4}-\d{2}-\d{2}$/.test(str(row.date, 10)) ? str(row.date, 10) : options.from;
    if (date < options.from) date = options.from;
    if (date > options.to) date = options.to;
    const kind = row.kind === "social" ? "social" : "cms";
    if (kind === "cms") {
      const collectionId = str(row.collectionId, 64);
      if (!options.collectionIds.includes(collectionId)) continue;
      ideas.push({ id: `idea-${ideas.length + 1}`, date, kind, collectionId, channel: null, title, brief: str(row.brief, 1500) || title, caption: "" });
    } else {
      const channel = str(row.channel, 20) as PlanChannel;
      if (!options.channels.includes(channel)) continue;
      ideas.push({ id: `idea-${ideas.length + 1}`, date, kind, collectionId: null, channel, title, brief: str(row.brief, 1500) || title, caption: str(row.caption, 2200) });
    }
    if (ideas.length >= 60) break;
  }
  return ideas.sort((a, b) => a.date.localeCompare(b.date));
}
