import "server-only";

import { db } from "@/lib/db/client";
import { getPublicEnv } from "@/lib/env";
import { isEmailConfigured, sendEmail } from "@/lib/notifications/resend";
import { cacCheckEnabled } from "@/lib/kyb/verify-cac.server";
import { LOGISTICS_DOC_TYPES, SUPPLIER_DOC_TYPES, missingRequiredDocs, normalizeVerificationDocs } from "@shared/verification-docs";
import { dueReminder, reminderEmail, reminderStart, sentReminders } from "./reminders";

// Emails suppliers and delivery partners who are in their portal without finished verification (see ./reminders.ts
// for the schedule). Run from /api/cron/verification-reminders, hourly is plenty.

const BATCH = 50;

type Kind = "supplier" | "logistics_partner";

export async function sendVerificationReminders(now = new Date()) {
  if (!isEmailConfigured()) return { sent: 0, skipped: "email not configured" };
  const base = getPublicEnv().appUrl.replace(/\/$/, "");
  const cacEnabled = cacCheckEnabled();
  let sent = 0;
  let checked = 0;

  for (const kind of ["supplier", "logistics_partner"] as Kind[]) {
    const model = (kind === "supplier" ? db.supplier : db.logisticsPartner) as any;
    const rows: any[] = await model.findMany({
      where: { verificationStatus: { in: ["unverified", "pending"] } },
      select: {
        id: true,
        onboardingState: true,
        verificationDocuments: true,
        verificationStatus: true,
        ...(kind === "supplier" ? { businessName: true } : { companyName: true }),
        displayName: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 500,
    });

    for (const row of rows) {
      if (sent >= BATCH) break;
      checked++;
      const configs = kind === "supplier" ? SUPPLIER_DOC_TYPES : LOGISTICS_DOC_TYPES;
      const missing = missingRequiredDocs(configs, normalizeVerificationDocs(row.verificationDocuments));
      // Everything is in and with the review team: nothing to chase.
      if (!missing.length) continue;
      const email = row.user?.email;
      if (!email) continue;
      const already = sentReminders(row.onboardingState);
      const index = dueReminder(reminderStart(row.onboardingState), already, now.getTime());
      if (index === null) continue;

      const businessName = (kind === "supplier" ? row.businessName : row.companyName) || row.displayName || "your business";
      const firstName = String(row.user?.name ?? "").trim().split(/\s+/)[0] || "there";
      const { subject, html } = reminderEmail({
        index,
        role: kind,
        firstName,
        businessName,
        missing: missing.map((config) => config.label),
        link: `${base}${kind === "supplier" ? "/supplier/verification" : "/logistics/verification"}`,
        cacEnabled,
      });

      // Record first, so a slow send can't make the next run email them twice.
      const state = row.onboardingState && typeof row.onboardingState === "object" ? row.onboardingState : {};
      await model.update({ where: { id: row.id }, data: { onboardingState: { ...state, docReminders: [...already, now.toISOString()] } } });
      const result = await sendEmail({ to: [email], subject, html });
      if (result.success) sent++;
      else console.error("[verification-reminders] send failed", result.message);
    }
  }

  return { sent, checked };
}
