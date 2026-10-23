import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { browserLabel, errorFingerprint, pagePattern } from "./friendly";

// Admin › App errors: storing what browsers report (src/lib/errors/report-client.ts), with the signed-in account
// when there is one, and listing them for the team.

export const clientErrorSchema = z.object({
  name: z.string().max(120).default("Error"),
  message: z.string().min(1).max(2000),
  stack: z.string().max(6000).nullish(),
  kind: z.enum(["storage", "network", "update", "permission", "code"]).default("code"),
  source: z.enum(["shown", "unhandled", "boundary"]).default("shown"),
  shown: z.string().max(500).nullish(),
  digest: z.string().max(120).nullish(),
  path: z.string().max(500).default("/"),
});

export type ClientErrorInput = z.infer<typeof clientErrorSchema>;

/** The signed-in account behind this request, if any (cookie session). Never throws. */
export async function reportingUser() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    return await db.user.findUnique({ where: { supabaseId: data.user.id }, select: { id: true, role: true } });
  } catch {
    return null;
  }
}

/** Store (or count again) one error. visitorKey groups anonymous visitors (a hash of IP and browser). */
export async function recordClientError(input: ClientErrorInput, who: { userId: string | null; role: string | null; userAgent: string | null; visitorKey: string }) {
  const fingerprint = createHash("sha256").update(errorFingerprint(input.message, input.path)).digest("hex").slice(0, 32);
  const id = createHash("sha256").update(`${fingerprint}|${who.userId ?? `anon:${who.visitorKey}`}`).digest("hex").slice(0, 32);
  const now = new Date();
  const fields = {
    role: who.role,
    kind: input.kind,
    source: input.source,
    name: input.name,
    message: input.message,
    shown: input.shown ?? null,
    stack: input.stack ?? null,
    digest: input.digest ?? null,
    path: input.path,
    userAgent: who.userAgent?.slice(0, 500) ?? null,
    browser: browserLabel(who.userAgent),
  };
  await db.clientError.upsert({
    where: { id },
    create: { id, fingerprint, userId: who.userId, pagePattern: pagePattern(input.path), ...fields, firstSeenAt: now, lastSeenAt: now },
    // Happening again re-opens it.
    update: { ...fields, count: { increment: 1 }, lastSeenAt: now, resolvedAt: null },
  });
}

export type ErrorFilter = "open" | "fixed" | "all";

export async function listClientErrors(filter: ErrorFilter, query: string, take = 100) {
  const q = query.trim();
  const rows = await db.clientError.findMany({
    where: {
      ...(filter === "open" ? { resolvedAt: null } : filter === "fixed" ? { resolvedAt: { not: null } } : {}),
      ...(q ? { OR: [{ message: { contains: q, mode: "insensitive" as const } }, { path: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: { lastSeenAt: "desc" },
    take,
  });
  const userIds = [...new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id)))];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, phone: true, role: true } })
    : [];
  const byId = new Map(users.map((user) => [user.id, user]));
  return rows.map((row) => ({ ...row, user: row.userId ? byId.get(row.userId) ?? null : null }));
}

export async function errorCounts() {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const [open, today, people] = await Promise.all([
    db.clientError.count({ where: { resolvedAt: null } }),
    db.clientError.count({ where: { lastSeenAt: { gte: since } } }),
    db.clientError.findMany({ where: { resolvedAt: null, userId: { not: null } }, distinct: ["userId"], select: { userId: true }, take: 1000 }),
  ]);
  return { open, today, people: people.length };
}

/** Mark every row of this problem fixed (or open again). */
export async function setErrorFixed(fingerprint: string, fixed: boolean) {
  await db.clientError.updateMany({ where: { fingerprint }, data: { resolvedAt: fixed ? new Date() : null } });
}
