import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { phoneOwner } from "@/lib/auth/phone-owner.server";
import { notify } from "@/lib/notifications/notify.server";
import { PUSH_DEVICE_SELECT, pushToDevices } from "@/lib/notifications/push.server";
import { androidChannelFor, appRouteFor, routeHref } from "@shared/notifications";
import { isValidEmail } from "@shared/phone";
import {
  NEWS_PUSH_OFF,
  audienceRiderWhere,
  audienceUserWhere,
  campaignKey,
  contentHash,
  countsTowardsLimit,
  dailyLimitCheck,
  deviceWhere,
  parseAudience,
  pushPlatformsFor,
  runCampaign,
  scheduleProblem,
  testMatches,
  type CampaignRecipient,
  type CampaignStore,
  type PushAudience,
} from "@shared/push-campaigns";

// Admin › Push center (/admin/push): campaigns (model PushCampaign, docs/migrations/2026-11-30-push-center.sql)
// sent through notify(), so each person gets the bell notification and the push follows their "Shopinbos news"
// switch and quiet hours. Riders (no account) get the push only. A send claims the row (draft or due scheduled →
// sending) so it starts once; recipients are claimed in batches (FOR UPDATE SKIP LOCKED) and notify()'s dedupe key
// "push-campaign:<id>" means a retried batch never tells anyone twice. The cron (/api/cron/push-campaigns, every
// 5 minutes) starts scheduled campaigns and carries on big ones.

export class PushCampaignError extends Error {
  constructor(
    message: string,
    readonly code = "VALIDATION_ERROR",
    readonly status = 422,
  ) {
    super(message);
  }
}

export interface Admin {
  id: string;
  name?: string | null;
  email?: string | null;
  adminRole?: string | null;
}

/** Only owners and admins may skip quiet hours (keep it rare). */
export const canSendUrgent = (adminRole: string | null | undefined) => !adminRole || adminRole === "owner" || adminRole === "admin";

function isMissingTable(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  return code === "P2021" || /relation .* does not exist/i.test(String((error as { message?: unknown })?.message ?? ""));
}

export const pushCenterReady = () =>
  db.pushCampaign
    .count({ take: 1 })
    .then(() => true)
    .catch((error) => {
      if (!isMissingTable(error)) console.error("[push-center] check failed", error);
      return false;
    });

async function audit(campaignId: string, action: string, by: Admin | null, detail: Record<string, unknown> = {}) {
  console.info(`[push-center] ${action} ${campaignId} by ${by?.email ?? by?.id ?? "cron"}`, detail);
  await db.pushCampaignEvent.create({ data: { campaignId, action, byId: by?.id ?? null, detail: detail as Prisma.InputJsonValue } }).catch((error) => console.error("[push-center] audit failed", error));
}

// ─── Audience ─────────────────────────────────────────────────────────────────

/** The account an email address or phone number belongs to. */
export async function findContact(contact: string) {
  const value = contact.trim();
  if (isValidEmail(value)) return db.user.findFirst({ where: { email: { equals: value.toLowerCase(), mode: "insensitive" } }, select: { id: true, name: true, role: true } });
  const owner = await phoneOwner(value).catch(() => null);
  return owner ? db.user.findUnique({ where: { id: owner.id }, select: { id: true, name: true, role: true } }) : null;
}

async function whereFor(audience: PushAudience, admin: Admin) {
  const person = audience.scope === "user" && audience.contact ? await findContact(audience.contact) : null;
  return { users: audienceUserWhere(audience, { meId: admin.id, userId: person?.id ?? null }) as Prisma.UserWhereInput | null, riders: audienceRiderWhere(audience) as Prisma.LogisticsTeamMemberWhereInput | null, person };
}

export interface AudienceEstimate {
  /** Accounts that get the bell notification. */
  people: number;
  /** Of them, people with a phone or browser push on who haven't switched Shopinbos news off. */
  pushPeople: number;
  /** Their phones and browsers (for the platform picked). */
  devices: number;
  /** People who switched Shopinbos news push off (bell only). */
  newsOff: number;
  riders: number;
  riderDevices: number;
  /** scope "user": who it is, or null when nobody has that email or number. */
  person: { name: string; role: string } | null;
}

export async function estimateAudience(audience: PushAudience, admin: Admin): Promise<AudienceEstimate> {
  const { users, riders, person } = await whereFor(audience, admin);
  const devices = deviceWhere(audience) as Prisma.PushDeviceWhereInput;
  const reachable: Prisma.UserWhereInput | null = users ? { AND: [users, { pushDevices: { some: devices } }, { NOT: NEWS_PUSH_OFF as Prisma.UserWhereInput }] } : null;
  const [people, pushPeople, deviceCount, newsOff, riderCount, riderDevices] = await Promise.all([
    users ? db.user.count({ where: users }) : 0,
    reachable ? db.user.count({ where: reachable }) : 0,
    reachable ? db.pushDevice.count({ where: { ...devices, user: { is: reachable } } }) : 0,
    users ? db.user.count({ where: { AND: [users, NEWS_PUSH_OFF as Prisma.UserWhereInput] } }) : 0,
    riders ? db.logisticsTeamMember.count({ where: riders }) : 0,
    riders ? db.pushDevice.count({ where: { disabledAt: null, rider: { is: riders } } }) : 0,
  ]);
  return { people, pushPeople, devices: deviceCount, newsOff, riders: riderCount, riderDevices, person: person ? { name: person.name, role: person.role } : null };
}

/** Cities and states people's stores and businesses are in (most first), for the location picker. */
export async function knownCities(limit = 40): Promise<Array<{ city: string; count: number }>> {
  const groups = await Promise.all([
    db.store.groupBy({ by: ["city"], where: { city: { not: null } }, _count: { _all: true } }).catch(() => []),
    db.supplier.groupBy({ by: ["city"], _count: { _all: true } }).catch(() => []),
    db.logisticsPartner.groupBy({ by: ["city"], _count: { _all: true } }).catch(() => []),
  ]);
  const totals = new Map<string, { city: string; count: number }>();
  for (const group of groups) {
    for (const row of group as Array<{ city: string | null; _count: { _all: number } }>) {
      const city = row.city?.trim();
      if (!city) continue;
      const key = city.toLowerCase();
      const current = totals.get(key) ?? { city, count: 0 };
      current.count += row._count._all;
      totals.set(key, current);
    }
  }
  return [...totals.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

// ─── Campaign rows ────────────────────────────────────────────────────────────

export const CAMPAIGN_SELECT = {
  id: true,
  title: true,
  body: true,
  linkKey: true,
  link: true,
  appLink: true,
  audience: true,
  urgent: true,
  status: true,
  scheduledAt: true,
  startedAt: true,
  sentAt: true,
  cancelledAt: true,
  testedHash: true,
  testedAt: true,
  overrideLimit: true,
  targetedCount: true,
  deviceCount: true,
  notifiedCount: true,
  failedCount: true,
  pushSent: true,
  pushOk: true,
  pushErrors: true,
  openedCount: true,
  resentAt: true,
  lastError: true,
  createdById: true,
  sentById: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PushCampaignSelect;

export type CampaignRow = Prisma.PushCampaignGetPayload<{ select: typeof CAMPAIGN_SELECT }>;

export interface CampaignInput {
  title: string;
  body: string;
  linkKey: string;
  link: string;
  appLink: string | null;
  audience: PushAudience;
  urgent: boolean;
}

function checkUrgent(input: { urgent: boolean }, admin: Admin) {
  if (input.urgent && !canSendUrgent(admin.adminRole)) throw new PushCampaignError("Only owners and admins can send an urgent push.", "FORBIDDEN", 403);
}

export async function createCampaign(input: CampaignInput, admin: Admin) {
  checkUrgent(input, admin);
  const row = await db.pushCampaign.create({ data: { ...input, audience: input.audience as unknown as Prisma.InputJsonValue, createdById: admin.id }, select: CAMPAIGN_SELECT });
  await audit(row.id, "created", admin, { title: input.title });
  return row;
}

export async function updateCampaign(id: string, input: CampaignInput, admin: Admin) {
  checkUrgent(input, admin);
  const done = await db.pushCampaign.updateMany({ where: { id, status: "draft" }, data: { ...input, audience: input.audience as unknown as Prisma.InputJsonValue } });
  if (!done.count) throw new PushCampaignError("Only a draft can be changed. Cancel it first if it's scheduled.", "CONFLICT", 409);
  return db.pushCampaign.findUniqueOrThrow({ where: { id }, select: CAMPAIGN_SELECT });
}

export async function deleteDraft(id: string) {
  const done = await db.pushCampaign.deleteMany({ where: { id, status: { in: ["draft", "cancelled"] } } });
  if (!done.count) throw new PushCampaignError("Only drafts and cancelled campaigns can be deleted.", "CONFLICT", 409);
}

async function load(id: string) {
  const row = await db.pushCampaign.findUnique({ where: { id }, select: CAMPAIGN_SELECT });
  if (!row) throw new PushCampaignError("Campaign not found.", "NOT_FOUND", 404);
  return row;
}

const hashOf = (row: Pick<CampaignRow, "title" | "body" | "link" | "appLink">) => contentHash({ title: row.title, body: row.body, link: row.link, appLink: row.appLink });

function audienceOf(row: Pick<CampaignRow, "audience">): PushAudience {
  const parsed = parseAudience(row.audience);
  if ("error" in parsed) throw new PushCampaignError(parsed.error);
  return parsed.audience;
}

// ─── Test, send, schedule, cancel ─────────────────────────────────────────────

/** The campaign to the admin alone (bell and push, through quiet hours), and remembers what was tested. */
export async function sendTest(id: string, admin: Admin) {
  const row = await load(id);
  const result = await notify({
    userId: admin.id,
    event: "push.campaign",
    category: "announcements",
    priority: "info",
    title: row.title,
    description: row.body,
    link: row.link,
    appRoute: row.appLink,
    dedupeKey: false,
    urgent: true,
    metadata: { pushCampaignId: row.id, test: true },
  });
  const devices = await db.pushDevice.count({ where: { userId: admin.id, disabledAt: null } }).catch(() => 0);
  const testedHash = hashOf(row);
  await db.pushCampaign.update({ where: { id }, data: { testedHash, testedAt: new Date() } });
  await audit(id, "test", admin, { devices, notificationId: result.notification.id });
  return { devices, testedHash };
}

/** Real campaigns going out (or scheduled) on the same Lagos day, other than this one. */
async function sameDayTimes(exceptId: string, at: Date) {
  const from = new Date(at.getTime() - 26 * 3600_000);
  const to = new Date(at.getTime() + 26 * 3600_000);
  const rows = await db.pushCampaign.findMany({
    where: { id: { not: exceptId }, status: { in: ["scheduled", "sending", "sent"] }, OR: [{ startedAt: { gte: from, lte: to } }, { scheduledAt: { gte: from, lte: to } }] },
    select: { audience: true, startedAt: true, scheduledAt: true },
  });
  return rows.filter((row) => {
    const parsed = parseAudience(row.audience);
    return !("error" in parsed) && countsTowardsLimit(parsed.audience);
  }).map((row) => (row.startedAt ?? row.scheduledAt)!);
}

export async function startCampaign(id: string, admin: Admin, options: { scheduledAt: Date | null; override: boolean; deadline?: number }) {
  const row = await load(id);
  if (row.status !== "draft") throw new PushCampaignError("This campaign has already been sent or scheduled.", "CONFLICT", 409);
  const audience = audienceOf(row);
  checkUrgent(row, admin);
  if (!testMatches(row, hashOf(row))) throw new PushCampaignError("Send yourself a test of this exact message first.", "TEST_REQUIRED", 422);
  const at = options.scheduledAt ?? new Date();
  if (options.scheduledAt) {
    const problem = scheduleProblem(options.scheduledAt);
    if (problem) throw new PushCampaignError(problem);
  }
  if (countsTowardsLimit(audience) && !options.override) {
    const limit = dailyLimitCheck(await sameDayTimes(id, at), at);
    if (limit.reached) throw new PushCampaignError(`${limit.used} campaigns already go out that day (the limit is ${limit.limit}). Tick "Override the daily limit" if this one really can't wait.`, "RATE_LIMITED", 429);
  }
  const estimate = await estimateAudience(audience, admin);
  if (!estimate.people && !estimate.riders) throw new PushCampaignError("Nobody matches this audience.");

  const base = { overrideLimit: options.override, sentById: admin.id, targetedCount: estimate.people + estimate.riders, deviceCount: estimate.devices + estimate.riderDevices, lastError: null };
  if (options.scheduledAt) {
    const done = await db.pushCampaign.updateMany({ where: { id, status: "draft" }, data: { ...base, status: "scheduled", scheduledAt: options.scheduledAt } });
    if (!done.count) throw new PushCampaignError("This campaign has already been sent or scheduled.", "CONFLICT", 409);
    await audit(id, "scheduled", admin, { scheduledAt: options.scheduledAt.toISOString(), people: base.targetedCount, devices: base.deviceCount, override: options.override });
    return { status: "scheduled" as const, estimate };
  }
  // draft → sending, once: a double click or a second tab gets "already sent".
  const now = new Date();
  const done = await db.pushCampaign.updateMany({ where: { id, status: "draft" }, data: { ...base, status: "sending", startedAt: now, scheduledAt: null } });
  if (!done.count) throw new PushCampaignError("This campaign has already been sent or scheduled.", "CONFLICT", 409);
  await audit(id, "sent", admin, { people: base.targetedCount, devices: base.deviceCount, override: options.override, urgent: row.urgent });
  const progress = await runCampaign({ id, store: prismaStore(), deadline: options.deadline ?? Date.now() + 40_000 });
  await refreshStats(id);
  return { status: progress.status, estimate, progress };
}

export async function cancelCampaign(id: string, admin: Admin) {
  const done = await db.pushCampaign.updateMany({ where: { id, status: "scheduled" }, data: { status: "cancelled", cancelledAt: new Date(), cancelledById: admin.id } });
  if (!done.count) throw new PushCampaignError("Only a scheduled campaign can be cancelled. It may have started already.", "CONFLICT", 409);
  await audit(id, "cancelled", admin);
}

/**
 * "Resend to the failed ones" (once per campaign): phones and browsers whose push failed and are still switched on
 * get it again, and people the run couldn't reach go back in the queue.
 */
export async function resendFailed(id: string, admin: Admin) {
  const row = await load(id);
  if (row.status !== "sent") throw new PushCampaignError("Wait until the campaign has finished sending.", "CONFLICT", 409);
  if (row.resentAt) throw new PushCampaignError("The failed ones were already sent again once.", "CONFLICT", 409);
  const claimed = await db.pushCampaign.updateMany({ where: { id, resentAt: null }, data: { resentAt: new Date() } });
  if (!claimed.count) throw new PushCampaignError("The failed ones were already sent again once.", "CONFLICT", 409);
  const key = campaignKey(id);
  const failedRows = await db.notificationDelivery.findMany({
    where: { collapseKey: key, channel: "push", status: "error", deviceId: { not: null }, device: { is: { disabledAt: null } } },
    select: { id: true, deviceId: true, notificationId: true, userId: true, riderId: true },
    take: 2000,
  });
  // One resend per device (the newest failure), grouped by the person so each gets their own notification id.
  const byOwner = new Map<string, { notificationId: string | null; userId: string | null; riderId: string | null; deviceIds: Set<string> }>();
  for (const failed of failedRows) {
    const ownerKey = failed.userId ?? `rider:${failed.riderId}`;
    const entry = byOwner.get(ownerKey) ?? { notificationId: failed.notificationId, userId: failed.userId, riderId: failed.riderId, deviceIds: new Set<string>() };
    entry.deviceIds.add(failed.deviceId!);
    byOwner.set(ownerKey, entry);
  }
  if (failedRows.length) await db.notificationDelivery.updateMany({ where: { id: { in: failedRows.map((f) => f.id) } }, data: { status: "resent" } });
  const route = appRouteFor(row.appLink || row.link);
  let pushed = 0;
  for (const owner of byOwner.values()) {
    const devices = await db.pushDevice.findMany({ where: { id: { in: [...owner.deviceIds] }, disabledAt: null }, select: PUSH_DEVICE_SELECT });
    if (!devices.length) continue;
    pushed += await pushToDevices(
      devices,
      { title: row.title, body: row.body, url: owner.riderId ? null : row.link, route: owner.riderId ? "/rider" : route ? routeHref(route) : null, notificationId: owner.notificationId, category: "announcements", event: "push.campaign", channelId: androidChannelFor("announcements"), urgent: row.urgent, badge: null, tag: key },
      { notificationId: owner.notificationId, userId: owner.userId, riderId: owner.riderId, collapseKey: key, category: "announcements" },
    );
  }
  const requeued = await db.pushCampaignRecipient.updateMany({ where: { campaignId: id, status: "failed" }, data: { status: "queued", error: null, claimedAt: null } });
  if (requeued.count) await db.pushCampaign.updateMany({ where: { id, status: "sent" }, data: { status: "sending" } });
  await audit(id, "resent", admin, { devices: failedRows.length, pushed, requeued: requeued.count });
  if (requeued.count) await runCampaign({ id, store: prismaStore(), deadline: Date.now() + 30_000 });
  await refreshStats(id);
  return { devices: failedRows.length, pushed, requeued: requeued.count };
}

// ─── The sending store ────────────────────────────────────────────────────────

const SNAPSHOT_PAGE = 1000;

function prismaStore(): CampaignStore {
  const cache = new Map<string, CampaignRow & { parsed: PushAudience }>();
  const campaign = async (id: string) => {
    const hit = cache.get(id);
    if (hit) return hit;
    const row = await load(id);
    const value = { ...row, parsed: audienceOf(row) };
    cache.set(id, value);
    return value;
  };

  return {
    status: async (id) => (await db.pushCampaign.findUnique({ where: { id }, select: { status: true } }))?.status ?? null,
    claim: async (id, now) => (await db.pushCampaign.updateMany({ where: { id, status: "scheduled", scheduledAt: { lte: now } }, data: { status: "sending", startedAt: now } })).count === 1,
    hasRecipients: async (id) => Boolean(await db.pushCampaignRecipient.findFirst({ where: { campaignId: id }, select: { id: true } })),
    snapshot: async (id) => {
      const row = await campaign(id);
      const creator = { id: row.sentById ?? row.createdById };
      const { users, riders } = await whereFor(row.parsed, creator);
      let total = 0;
      if (users) {
        let cursor: string | null = null;
        for (;;) {
          const page: Array<{ id: string }> = await db.user.findMany({ where: cursor ? { AND: [users, { id: { gt: cursor } }] } : users, orderBy: { id: "asc" }, take: SNAPSHOT_PAGE, select: { id: true } });
          if (!page.length) break;
          total += (await db.pushCampaignRecipient.createMany({ data: page.map((user) => ({ campaignId: id, userId: user.id })), skipDuplicates: true })).count;
          cursor = page.at(-1)!.id;
          if (page.length < SNAPSHOT_PAGE) break;
        }
      }
      if (riders) {
        const list = await db.logisticsTeamMember.findMany({ where: riders, select: { id: true }, take: 20_000 });
        if (list.length) total += (await db.pushCampaignRecipient.createMany({ data: list.map((rider) => ({ campaignId: id, riderId: rider.id })), skipDuplicates: true })).count;
      }
      if (!total) await db.pushCampaign.updateMany({ where: { id }, data: { lastError: "Nobody matched the audience when it went out." } });
      return total;
    },
    claimBatch: async (id, take) => {
      const rows = await db.$queryRaw<CampaignRecipient[]>`
        UPDATE "PushCampaignRecipient" SET "status" = 'sending', "claimedAt" = now()
        WHERE "id" IN (
          SELECT "id" FROM "PushCampaignRecipient"
          WHERE "campaignId" = ${id} AND "status" = 'queued'
          ORDER BY "id" LIMIT ${take}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "userId", "riderId"`;
      return rows;
    },
    deliver: async (id, recipient) => {
      const row = await campaign(id);
      const key = campaignKey(id);
      if (recipient.userId) {
        const result = await notify({
          userId: recipient.userId,
          event: "push.campaign",
          category: "announcements",
          priority: "info",
          title: row.title,
          description: row.body,
          link: row.link,
          appRoute: row.appLink,
          pushPlatforms: pushPlatformsFor(row.parsed),
          trackKey: key,
          dedupeKey: key,
          urgent: row.urgent,
          metadata: { pushCampaignId: id },
        });
        return { notificationId: result.notification.id };
      }
      if (recipient.riderId) {
        // Riders: push only, once per campaign.
        const seen = await db.notificationDelivery.findFirst({ where: { riderId: recipient.riderId, collapseKey: key }, select: { id: true } });
        if (seen) return { notificationId: null };
        const devices = await db.pushDevice.findMany({ where: { riderId: recipient.riderId, disabledAt: null }, select: PUSH_DEVICE_SELECT, orderBy: { lastSeenAt: "desc" }, take: 5 });
        if (devices.length) {
          await pushToDevices(
            devices,
            { title: row.title, body: row.body, url: null, route: "/rider", notificationId: null, category: "announcements", event: "push.campaign", channelId: androidChannelFor("announcements"), urgent: row.urgent, badge: null, tag: key },
            { riderId: recipient.riderId, collapseKey: key, category: "announcements" },
          );
        }
        return { notificationId: null };
      }
      throw new Error("Recipient has no account or rider");
    },
    markSent: async (rowId, notificationId, at) => {
      await db.pushCampaignRecipient.updateMany({ where: { id: rowId, status: "sending" }, data: { status: "sent", notificationId, sentAt: at, error: null } });
    },
    markFailed: async (rowId, error) => {
      await db.pushCampaignRecipient.updateMany({ where: { id: rowId, status: "sending" }, data: { status: "failed", error } });
    },
    requeueStale: async (id, before) => {
      await db.pushCampaignRecipient.updateMany({ where: { campaignId: id, status: "sending", claimedAt: { lt: before } }, data: { status: "queued", claimedAt: null } });
    },
    remaining: (id) => db.pushCampaignRecipient.count({ where: { campaignId: id, status: { in: ["queued", "sending"] } } }),
    finish: async (id, at) => {
      await db.pushCampaign.updateMany({ where: { id, status: "sending" }, data: { status: "sent", sentAt: at } });
    },
  };
}

// ─── Results ──────────────────────────────────────────────────────────────────

/** Recounts a campaign from its recipients and push deliveries (kept 30 days) and stores the totals on the row. */
export async function refreshStats(id: string) {
  const key = campaignKey(id);
  const [recipients, deliveries, opened] = await Promise.all([
    db.pushCampaignRecipient.groupBy({ by: ["status"], where: { campaignId: id }, _count: { _all: true } }),
    db.notificationDelivery.groupBy({ by: ["status"], where: { collapseKey: key, channel: "push" }, _count: { _all: true } }),
    db.pushCampaignRecipient.count({ where: { campaignId: id, openedAt: { not: null } } }),
  ]);
  const r = (status: string) => recipients.find((g) => g.status === status)?._count._all ?? 0;
  const d = (...statuses: string[]) => deliveries.filter((g) => statuses.includes(g.status)).reduce((sum, g) => sum + g._count._all, 0);
  const data = {
    notifiedCount: r("sent"),
    failedCount: r("failed"),
    // Handed to Expo or the browser's push service (sent, then ok/error/expired once the receipt is in), and held for the morning.
    pushSent: d("sent", "ok", "error", "expired"),
    pushOk: d("ok"),
    pushErrors: d("error"),
    openedCount: opened,
  };
  // Deliveries older than 30 days are cleared: keep the last counts instead of zeros.
  const keepPush = deliveries.length === 0;
  await db.pushCampaign.update({ where: { id }, data: keepPush ? { notifiedCount: data.notifiedCount, failedCount: data.failedCount, openedCount: data.openedCount } : data }).catch(() => null);
  return data;
}

export async function listCampaigns(limit = 30) {
  const rows = await db.pushCampaign.findMany({ orderBy: { createdAt: "desc" }, take: limit, select: CAMPAIGN_SELECT });
  // Live numbers for the ones still moving (sending, or receipts and taps still coming in).
  const recent = rows.filter((row) => row.status === "sending" || (row.status === "sent" && row.sentAt && Date.now() - row.sentAt.getTime() < 3 * 86_400_000));
  await Promise.all(recent.map((row) => refreshStats(row.id).catch(() => null)));
  const fresh = recent.length ? await db.pushCampaign.findMany({ where: { id: { in: rows.map((row) => row.id) } }, select: CAMPAIGN_SELECT }) : rows;
  const byId = new Map(fresh.map((row) => [row.id, row]));
  const people = await db.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((row) => [row.createdById, row.sentById].filter((v): v is string => Boolean(v))))] } }, select: { id: true, name: true } });
  const names = new Map(people.map((person) => [person.id, person.name]));
  return rows.map((row) => {
    const current = byId.get(row.id) ?? row;
    return { ...current, createdByName: names.get(current.createdById) ?? null, sentByName: current.sentById ? names.get(current.sentById) ?? null : null };
  });
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export interface DeviceRow {
  platform: string;
  role: string;
  total: number;
  active: number;
  seen7: number;
  seen30: number;
}

export async function pushOverview(now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const [devices, health, topErrors, lastChecked, cronRun] = await Promise.all([
    db
      .$queryRaw<Array<{ platform: string; role: string; total: bigint; active: bigint; seen7: bigint; seen30: bigint }>>`
        SELECT d."platform",
          COALESCE(u."role"::text, CASE WHEN d."riderId" IS NOT NULL THEN 'rider' END, 'other') AS role,
          count(*) AS total,
          count(*) FILTER (WHERE d."disabledAt" IS NULL) AS active,
          count(*) FILTER (WHERE d."disabledAt" IS NULL AND d."lastSeenAt" > now() - interval '7 days') AS seen7,
          count(*) FILTER (WHERE d."disabledAt" IS NULL AND d."lastSeenAt" > now() - interval '30 days') AS seen30
        FROM "PushDevice" d LEFT JOIN "User" u ON u."id" = d."userId"
        GROUP BY 1, 2`
      .then((rows) => rows.map((row): DeviceRow => ({ platform: row.platform, role: row.role, total: Number(row.total), active: Number(row.active), seen7: Number(row.seen7), seen30: Number(row.seen30) })))
      .catch(() => [] as DeviceRow[]),
    db.notificationDelivery.groupBy({ by: ["status"], where: { channel: "push", createdAt: { gte: since } }, _count: { _all: true } }).catch(() => []),
    db.notificationDelivery
      .groupBy({ by: ["error"], where: { channel: "push", status: "error", createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { error: "desc" } }, take: 5 })
      .catch(() => []),
    db.notificationDelivery.aggregate({ where: { provider: "expo", checkedAt: { not: null } }, _max: { checkedAt: true } }).catch(() => null),
    db
      .$queryRaw<Array<{ start_time: Date | null; status: string | null }>>`
        SELECT r.start_time, r.status FROM cron.job j JOIN cron.job_run_details r ON r.jobid = j.jobid
        WHERE j.jobname = 'push-receipts' ORDER BY r.start_time DESC LIMIT 1`
      .then((rows) => rows[0] ?? null)
      .catch(() => null),
  ]);
  const count = (status: string) => health.find((g) => g.status === status)?._count._all ?? 0;
  return {
    devices,
    health: { ok: count("ok"), error: count("error"), expired: count("expired"), waiting: count("sent"), held: count("held_quiet") + count("held_burst") },
    topErrors: topErrors.map((row) => ({ error: row.error ?? "Unknown", count: row._count._all })),
    receipts: { cronLastRun: cronRun?.start_time ?? null, cronStatus: cronRun?.status ?? null, lastChecked: lastChecked?._max.checkedAt ?? null },
  };
}

// ─── Cron ─────────────────────────────────────────────────────────────────────

/** Starts scheduled campaigns that are due (each claimed once) and carries on any still sending, until `deadline`. */
export async function runPushCampaignsCron(now = new Date(), deadline = Date.now() + 240_000) {
  const store = prismaStore();
  const due = await db.pushCampaign.findMany({ where: { status: "scheduled", scheduledAt: { lte: now } }, orderBy: { scheduledAt: "asc" }, select: { id: true }, take: 10 });
  const started: string[] = [];
  for (const row of due) {
    if (await store.claim(row.id, now)) {
      started.push(row.id);
      await audit(row.id, "started", null, { scheduled: true });
    }
  }
  const sending = await db.pushCampaign.findMany({ where: { status: "sending" }, orderBy: { startedAt: "asc" }, select: { id: true }, take: 10 });
  const results = [];
  for (const row of sending) {
    if (Date.now() >= deadline) break;
    try {
      results.push({ id: row.id, ...(await runCampaign({ id: row.id, store, deadline })) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sending failed";
      console.error(`[push-center] campaign ${row.id} failed`, error);
      await db.pushCampaign.updateMany({ where: { id: row.id }, data: { lastError: message.slice(0, 300) } });
      results.push({ id: row.id, error: message });
    }
    await refreshStats(row.id).catch(() => null);
  }
  // Receipts and taps keep arriving for a day or two.
  const recent = await db.pushCampaign.findMany({ where: { status: "sent", sentAt: { gte: new Date(now.getTime() - 2 * 86_400_000) } }, select: { id: true }, take: 20 });
  for (const row of recent) await refreshStats(row.id).catch(() => null);
  return { started, results, refreshed: recent.length };
}

// ─── Opens ────────────────────────────────────────────────────────────────────

/** The person tapped the push for this notification (the app and the browser report it). */
export async function recordOpen(userId: string, notificationId: string) {
  const done = await db.pushCampaignRecipient.updateMany({ where: { notificationId, userId, openedAt: null }, data: { openedAt: new Date() } }).catch((error) => {
    if (!isMissingTable(error)) console.error("[push-center] open not recorded", error);
    return { count: 0 };
  });
  return done.count > 0;
}

export { hashOf as campaignHash };
