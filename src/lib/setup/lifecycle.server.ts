import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { getPublicEnv } from "@/lib/env";
import { isEmailConfigured } from "@/lib/notifications/resend";
import { sendPlatformEmail } from "@/lib/email/compliance.server";
import { platformEmailAllowed } from "@/lib/email/preferences.server";
import { getSetupOverview } from "./server";
import { LIFECYCLE_WINDOW_DAYS, dueLifecycleEmail, lifecycleEmail, sentLifecycleEmails, wantsSetupNudges, withLifecycleEmailSent } from "./lifecycle";

// Sends the setup nudges to new sellers (see ./lifecycle.ts for who and when). Run hourly from /api/cron/lifecycle.

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

  return { sent, checked };
}
