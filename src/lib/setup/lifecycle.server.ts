import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { getPublicEnv } from "@/lib/env";
import { isEmailConfigured } from "@/lib/notifications/resend";
import { sendPlatformEmail } from "@/lib/email/compliance.server";
import { platformEmailAllowed } from "@/lib/email/preferences.server";
import { notify } from "@/lib/notifications/notify.server";
import { canContactMember } from "@/lib/member-messaging/spacing.server";
import { sendingHours } from "@/lib/member-messaging/journeys";
import { getSetupOverview } from "./server";
import {
  LIFECYCLE_WINDOW_DAYS,
  RESUME_DAYS,
  RESUME_QUIET_MAX_DAYS,
  RESUME_WINDOW_DAYS,
  dueLifecycleEmail,
  lifecycleEmail,
  resumeEmail,
  resumePeriod,
  resumeStage,
  sentLifecycleEmails,
  sentResumeNudges,
  wantsResumeNudge,
  wantsSetupNudges,
  withLifecycleEmailSent,
  withResumeNudgeSent,
} from "./lifecycle";

// Sends the setup nudges to new sellers and the paused-setup nudges to sellers who stopped part way (see
// ./lifecycle.ts for who and when). Run hourly from /api/cron/lifecycle.

const BATCH = 50;

export async function sendLifecycleEmails(now = new Date()) {
  if (!isEmailConfigured()) return { sent: 0, checked: 0, skipped: "email not configured" };
  const base = getPublicEnv().appUrl.replace(/\/$/, "");
  const since = new Date(now.getTime() - LIFECYCLE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const stores = await db.store.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, name: true, createdAt: true, brandSettings: true, user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  let sent = 0;
  let checked = 0;

  for (const store of stores) {
    if (sent >= BATCH) break;
    const user = store.user;
    if (!user?.email || user.role !== "seller") continue;
    const already = sentLifecycleEmails(store.brandSettings);
    const index = dueLifecycleEmail(store.createdAt, already, now.getTime());
    if (index === null) continue;
    checked++;

    const overview = await getSetupOverview(user.id).catch(() => null);
    if (!overview || !wantsSetupNudges(overview.checklist)) continue;
    // Setup nudges are lifecycle mail: skip anyone who turned them off in their email preferences.
    if (!(await platformEmailAllowed(user.id, "lifecycle"))) continue;

    const firstName = String(user.name ?? "").trim().split(/\s+/)[0] || "there";
    const email = lifecycleEmail({ index, firstName, storeName: store.name || "Your shop", checklist: overview.checklist, base });
    // Record first, so a slow send can't make the next run email them twice. Written over the latest brandSettings
    // (getSetupOverview read it a moment ago) so a change the seller just made isn't lost.
    const fresh = await db.store.findUnique({ where: { id: store.id }, select: { brandSettings: true } });
    if (sentLifecycleEmails(fresh?.brandSettings).length !== already.length) continue;
    await db.store.update({ where: { id: store.id }, data: { brandSettings: withLifecycleEmailSent(fresh?.brandSettings, now, index) as Prisma.InputJsonValue } });
    const result = await sendPlatformEmail({
      to: user.email,
      user: { id: user.id, role: user.role },
      kind: "lifecycle",
      topic: "lifecycle",
      subject: email.subject,
      heading: email.heading,
      preheader: email.preheader,
      bodyHtml: email.bodyHtml,
      eyebrow: "Set up your shop",
    });
    if (result.success) sent++;
    else console.error("[lifecycle] send failed", result.message);
  }

  const resumed = await sendResumeNudges(now, base).catch((error) => {
    console.error("[lifecycle] paused-setup nudges failed", error instanceof Error ? error.message : "unknown");
    return { sent: 0, checked: 0 };
  });
  return { sent, checked, resumed };
}

const DAY = 24 * 60 * 60 * 1000;

/** "Pick up where you left off" for sellers who started setting up and went quiet (2 and 5 days in). */
async function sendResumeNudges(now: Date, base: string) {
  // Marketing mail: Mon–Sat daytime in Lagos only, like the other journeys.
  if (!sendingHours(now)) return { sent: 0, checked: 0, skipped: "outside sending hours" };
  const quiet = await db.$queryRaw<Array<{ userId: string; last: Date }>>`
    SELECT a."userId", MAX(a."day") AS last
    FROM "UserActivityDay" a
    WHERE a."role" = 'seller'
    GROUP BY a."userId"
    HAVING MAX(a."day") BETWEEN ${new Date(now.getTime() - RESUME_QUIET_MAX_DAYS * DAY)} AND ${new Date(now.getTime() - RESUME_DAYS[0] * DAY)}
    LIMIT 2000`;
  if (!quiet.length) return { sent: 0, checked: 0 };
  const lastOf = new Map(quiet.map((row) => [row.userId, new Date(row.last)]));
  const stores = await db.store.findMany({
    where: { userId: { in: [...lastOf.keys()] }, createdAt: { gte: new Date(now.getTime() - RESUME_WINDOW_DAYS * DAY) } },
    select: { id: true, name: true, brandSettings: true, user: { select: { id: true, name: true, email: true, role: true, verificationStatus: true } } },
  });
  let sent = 0;
  let checked = 0;

  for (const store of stores) {
    if (sent >= BATCH) break;
    const user = store.user;
    if (!user?.email || user.role !== "seller" || user.verificationStatus === "suspended") continue;
    const last = lastOf.get(user.id);
    const stage = last ? resumeStage(last, now.getTime()) : null;
    if (!last || !stage) continue;
    const period = resumePeriod(last, stage);
    const already = sentResumeNudges(store.brandSettings);
    if (already.some((row) => row.period === period)) continue;
    checked++;

    const overview = await getSetupOverview(user.id).catch(() => null);
    if (!overview || !wantsResumeNudge(overview.checklist, already, period)) continue;
    if (!(await platformEmailAllowed(user.id, "lifecycle"))) continue;
    // Spacing (src/lib/member-messaging/spacing.ts): not the same day as another nudge, tip or summary. Too soon:
    // a later hourly run sends it while the step is still due.
    if (!(await canContactMember(user.id, "email", now)).ok) continue;

    const firstName = String(user.name ?? "").trim().split(/\s+/)[0] || "there";
    const storeName = store.name || "Your shop";
    const email = resumeEmail({ stage, firstName, storeName, checklist: overview.checklist, base });
    // Record first (over the latest brandSettings), so a slow send can't make the next run email them twice.
    const fresh = await db.store.findUnique({ where: { id: store.id }, select: { brandSettings: true } });
    if (sentResumeNudges(fresh?.brandSettings).length !== already.length) continue;
    await db.store.update({ where: { id: store.id }, data: { brandSettings: withResumeNudgeSent(fresh?.brandSettings, now, period) as Prisma.InputJsonValue } });

    await notify({
      userId: user.id,
      event: "setup.resume",
      category: "marketing",
      priority: "info",
      title: email.title,
      description: email.description,
      link: "/home/start",
      dedupeKey: `setup-resume-${period}`,
      inAppOnly: true,
    }).catch(() => undefined);
    const result = await sendPlatformEmail({
      to: user.email,
      user: { id: user.id, role: user.role },
      kind: "lifecycle",
      topic: "lifecycle",
      subject: email.subject,
      heading: email.heading,
      preheader: email.preheader,
      bodyHtml: email.bodyHtml,
      eyebrow: "Finish setting up",
    });
    if (result.success) sent++;
    else console.error("[lifecycle] paused-setup send failed", result.message);
  }

  return { sent, checked };
}
