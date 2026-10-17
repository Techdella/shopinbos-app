import "server-only";

import { db } from "@/lib/db/client";

// "Used the app today": one UserActivityDay row per account per day, written the first time a signed-in page or API
// call sees them that day (Admin › Analytics: active users and retention). Remembered per server instance so it is
// one insert per person per day per instance, not one per request. Never throws or slows the request down.

const seen = new Map<string, string>();

export function recordActivity(user: { id: string; role: string }) {
  if (user.role === "admin") return;
  const day = new Date().toISOString().slice(0, 10);
  if (seen.get(user.id) === day) return;
  seen.set(user.id, day);
  if (seen.size > 20_000) seen.clear();
  db.userActivityDay
    .createMany({ data: [{ userId: user.id, day: new Date(`${day}T00:00:00Z`), role: user.role }], skipDuplicates: true })
    .catch(() => seen.delete(user.id));
}
