import "server-only";

import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { sendPlatformEmail } from "@/lib/email/compliance.server";
import { platformEmailAllowed } from "@/lib/email/preferences.server";
import { isEmailConfigured } from "@/lib/notifications/resend";
import { BASELINE_KEY, MAX_ATTEMPTS, planLifecycle, type AdminFacts, type LifecycleFacts, type SentEntry } from "./catalog";
import { loadAdminFacts, loadLifecycleFacts } from "./facts.server";

// Sends lifecycle email (catalog: ./catalog.ts). Two entry points, one code path:
// - runLifecycle: the hourly sweep from /api/cron/lifecycle, every account with an email address;
// - queueLifecycle: straight after an in-app event (sign-up, first sale, verification…), for that one account.
// Each send first claims its LifecycleEmail row (unique per user and key), so the sweep and an event racing each
// other can't both send it.

const PAGE = 200;
/** Per sweep; anything left over goes out on the next one. */
const MAX_SENDS = 300;
/** Stop starting new pages after this long, well inside the route's maxDuration. */
const TIME_BUDGET_MS = 200_000;

export type LifecycleOutcome = "sent" | "skipped" | "failed" | "baselined" | "idle";

function isMissingTable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022");
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function historyFor(userIds: string[]) {
  const rows = await db.lifecycleEmail.findMany({ where: { userId: { in: userIds } }, select: { userId: true, key: true, rule: true, status: true, attempts: true, updatedAt: true } });
  const byUser = new Map<string, SentEntry[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push({ key: row.key, rule: row.rule, status: row.status, attempts: row.attempts, at: row.updatedAt.getTime() });
    byUser.set(row.userId, list);
  }
  return byUser;
}

/** Evaluates one account and sends at most one email. */
async function processUser(facts: LifecycleFacts, history: SentEntry[], now: Date): Promise<LifecycleOutcome> {
  const plan = planLifecycle(facts, history, now.getTime());
  const userId = facts.userId;

  if (plan.baselined) {
    await db.lifecycleEmail.createMany({
      data: [{ key: BASELINE_KEY, rule: BASELINE_KEY }, ...plan.baseline.map(({ rule, key }) => ({ key, rule: rule.id }))].map((row) => ({ ...row, userId, status: "baseline" })),
      skipDuplicates: true,
    });
    return "baselined";
  }
  if (!plan.send || !facts.email) return "idle";

  const { rule, key, retry } = plan.send;
  // Turned off in their email preferences: settle the key without sending, so it isn't re-evaluated every hour.
  if (rule.kind === "lifecycle" && rule.topic && !(await platformEmailAllowed(userId, rule.topic))) {
    await db.lifecycleEmail.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, rule: rule.id, status: "skipped", error: `${rule.topic} turned off` },
      update: { status: "skipped", error: `${rule.topic} turned off` },
    });
    return "skipped";
  }

  const claimed = retry
    ? (await db.lifecycleEmail.updateMany({ where: { userId, key, status: "failed", attempts: { lt: MAX_ATTEMPTS } }, data: { status: "sending", attempts: { increment: 1 }, error: null } })).count === 1
    : await db.lifecycleEmail.create({ data: { userId, key, rule: rule.id, status: "sending" } }).then(
        () => true,
        (error) => {
          if (isUniqueViolation(error)) return false; // another evaluation got there first
          throw error;
        },
      );
  if (!claimed) return "idle";

  const content = rule.render(facts, plan.ctx);
  const result = await sendPlatformEmail({
    to: facts.email,
    user: { id: userId, role: facts.role },
    kind: rule.kind,
    topic: rule.topic ?? undefined,
    subject: content.subject,
    heading: content.heading,
    eyebrow: content.eyebrow,
    preheader: content.preheader,
    bodyHtml: content.bodyHtml,
    cta: content.cta,
  }).catch((error: unknown) => ({ success: false as const, id: undefined, message: error instanceof Error ? error.message : String(error) }));

  await db.lifecycleEmail.update({
    where: { userId_key: { userId, key } },
    data: result.success
      ? { status: "sent", sentAt: new Date(), resendId: result.id ?? null, error: null }
      : { status: "failed", error: (result.message ?? "Send failed").slice(0, 500) },
  });
  if (!result.success) console.warn(`[lifecycle] ${key} for ${userId} failed: ${result.message}`);
  return result.success ? "sent" : "failed";
}

async function processBatch(userIds: string[], now: Date, admin: AdminFacts | null, tally: Record<LifecycleOutcome, number>, maxSends: number) {
  const [facts, history] = await Promise.all([loadLifecycleFacts(userIds, admin), historyFor(userIds)]);
  for (const id of userIds) {
    if (tally.sent >= maxSends) return;
    const userFacts = facts.get(id);
    if (!userFacts) continue;
    try {
      tally[await processUser(userFacts, history.get(id) ?? [], now)]++;
    } catch (error) {
      tally.failed++;
      console.error(`[lifecycle] evaluating ${id} failed`, error);
    }
  }
}

const emptyTally = (): Record<LifecycleOutcome, number> => ({ sent: 0, skipped: 0, failed: 0, baselined: 0, idle: 0 });

async function tableReady() {
  try {
    await db.lifecycleEmail.findFirst({ select: { id: true } });
    return true;
  } catch (error) {
    if (isMissingTable(error)) return false;
    throw error;
  }
}

/** The hourly sweep over every account with an email address. */
export async function runLifecycle(options: { now?: Date; maxSends?: number } = {}) {
  if (!isEmailConfigured()) return { skipped: "email not configured" };
  if (!(await tableReady())) return { skipped: "LifecycleEmail table missing: run docs/migrations/2026-10-16-lifecycle-emails.sql" };

  const now = options.now ?? new Date();
  const maxSends = options.maxSends ?? MAX_SENDS;
  const started = Date.now();
  const admin = await loadAdminFacts(now).catch((error) => {
    console.error("[lifecycle] admin facts failed", error);
    return null;
  });
  const tally = emptyTally();
  let cursor: string | null = null;
  let checked = 0;

  while (tally.sent < maxSends && Date.now() - started < TIME_BUDGET_MS) {
    const page: Array<{ id: string }> = await db.user.findMany({
      where: { email: { not: null } },
      select: { id: true },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!page.length) break;
    cursor = page[page.length - 1].id;
    checked += page.length;
    await processBatch(
      page.map((row) => row.id),
      now,
      admin,
      tally,
      maxSends,
    );
  }
  return { checked, ...tally, complete: tally.sent < maxSends && Date.now() - started < TIME_BUDGET_MS };
}

/** Evaluates one account now (after an in-app event). Safe to call any time; does nothing until the table exists. */
export async function runLifecycleForUser(userId: string, now = new Date()): Promise<LifecycleOutcome | "unavailable"> {
  if (!isEmailConfigured() || !(await tableReady())) return "unavailable";
  const tally = emptyTally();
  await processBatch([userId], now, null, tally, 1);
  return (Object.keys(tally) as LifecycleOutcome[]).find((key) => tally[key] > 0) ?? "idle";
}

/**
 * Re-evaluates an account after the response is sent (sign-up, store published, order paid, verification…).
 * Never throws and never delays the request; the hourly sweep catches anything this misses.
 */
export function queueLifecycle(userId: string | null | undefined) {
  if (userId) defer(async () => userId);
}

/** queueLifecycle for the account behind a store (or one of its orders), supplier or delivery partner (looked up after the response). */
export function queueLifecycleFor(profile: { storeId?: string | null; retailOrderId?: string | null; supplierId?: string | null; logisticsPartnerId?: string | null }) {
  defer(async () => {
    if (profile.retailOrderId) return (await db.retailOrder.findUnique({ where: { id: profile.retailOrderId }, select: { store: { select: { userId: true } } } }))?.store.userId ?? null;
    if (profile.storeId) return (await db.store.findUnique({ where: { id: profile.storeId }, select: { userId: true } }))?.userId ?? null;
    if (profile.supplierId) return (await db.supplier.findUnique({ where: { id: profile.supplierId }, select: { userId: true } }))?.userId ?? null;
    if (profile.logisticsPartnerId) return (await db.logisticsPartner.findUnique({ where: { id: profile.logisticsPartnerId }, select: { userId: true } }))?.userId ?? null;
    return null;
  });
}

function defer(resolveUser: () => Promise<string | null>) {
  const run = () =>
    resolveUser()
      .then((userId) => (userId ? runLifecycleForUser(userId) : undefined))
      .then(
        () => undefined,
        (error) => console.error("[lifecycle] event evaluation failed", error),
      );
  try {
    after(run);
  } catch {
    // Outside a request (scripts, tests): run it now, unawaited.
    void run();
  }
}
