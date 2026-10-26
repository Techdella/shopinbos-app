import "server-only";

import { db } from "@/lib/db/client";
import { getPublicEnv } from "@/lib/env";
import { isEmailConfigured } from "@/lib/notifications/resend";
import { sendPlatformEmail } from "@/lib/email/compliance.server";
import { platformEmailAllowed } from "@/lib/email/preferences.server";
import { cacCheckEnabled } from "@/lib/kyb/verify-cac.server";
import { LOGISTICS_DOC_TYPES, SUPPLIER_DOC_TYPES, missingRequiredDocs, normalizeVerificationDocs } from "@shared/verification-docs";
import { paystackPhone } from "@/lib/wallet/balance-rules";
import { sendShopinbosTemplate } from "@/lib/member-messaging/send.server";
import { dueNudge, sentNudges, verifyNudgeEmail } from "./reminders";

// The "verify your account" sequence for suppliers and delivery partners not verified yet, by email and WhatsApp
// (see ./reminders.ts for the schedule and words): the first nudge now (with their wallet account number, if they
// were given one: it switches on once they're verified), then 3 and 7 days later. Every one points to Peggy's free
// call. Run from /api/cron/verification-reminders, hourly is plenty.

const DAY_MS = 24 * 60 * 60 * 1000;

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
        ...(kind === "supplier" ? { whatsappNumber: true } : { whatsappNumber: true, contactPhone: true }),
        user: { select: { id: true, name: true, email: true, role: true, phone: true, createdAt: true, wallet: { select: { topUpStatus: true, topUpAccountNumber: true, topUpBankName: true } } } },
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
      const email = row.user?.email ?? null;
      const phone = paystackPhone(row.user?.phone ?? row.whatsappNumber ?? row.contactPhone);
      if (!email && !phone) continue;
      // Give a brand-new account a day to finish on its own first.
      if (row.user?.createdAt && now.getTime() - new Date(row.user.createdAt).getTime() < DAY_MS) continue;
      const already = sentNudges(row.onboardingState);
      const index = dueNudge(already, now.getTime());
      if (index === null) continue;
      // Onboarding nudges are lifecycle messages: skip anyone who turned them off in their email preferences.
      if (row.user?.id && !(await platformEmailAllowed(row.user.id, "lifecycle"))) continue;

      const businessName = (kind === "supplier" ? row.businessName : row.companyName) || row.displayName || "your business";
      const firstName = String(row.user?.name ?? "").trim().split(/\s+/)[0] || "there";
      const wallet = row.user?.wallet?.topUpStatus === "ready" && row.user.wallet.topUpAccountNumber ? { number: row.user.wallet.topUpAccountNumber, bank: row.user.wallet.topUpBankName ?? "Wema Bank" } : null;
      const link = `${base}${kind === "supplier" ? "/supplier/verification" : "/logistics/verification"}`;
      const missingLabels = missing.map((config: { label: string }) => config.label);

      // Record first, so a slow send can't make the next run message them twice.
      const state = row.onboardingState && typeof row.onboardingState === "object" ? row.onboardingState : {};
      await model.update({ where: { id: row.id }, data: { onboardingState: { ...state, verifyNudges: [...already, now.toISOString()] } } });

      let delivered = false;
      if (email) {
        const { subject, heading, preheader, bodyHtml } = verifyNudgeEmail({
          index,
          role: kind,
          firstName,
          businessName,
          missing: missingLabels,
          link,
          cacEnabled,
          wallet,
          peggyImage: `${base}/brand/email/call-peggy.png`,
          dashboard: `${base}${kind === "supplier" ? "/supplier/dashboard" : "/logistics/dashboard"}`,
        });
        const result = await sendPlatformEmail({ to: email, user: { id: row.user.id, role: row.user.role ?? kind }, kind: "lifecycle", topic: "lifecycle", subject, heading, preheader, bodyHtml, eyebrow: "Verification" });
        if (result.success) delivered = true;
        else console.error("[verification-reminders] email failed", result.message);
      }
      const missingText = missingLabels.join(", ") || "your documents";
      const sentWhatsApp = index === 0 && wallet
        ? await sendShopinbosTemplate("shopinbos_verify_wallet", phone, [firstName, businessName, missingText]).catch(() => false)
        : await sendShopinbosTemplate("shopinbos_verify_reminder", phone, [firstName, businessName, kind === "supplier" ? "sellers" : "sellers who need deliveries", missingText]).catch(() => false);
      if (delivered || sentWhatsApp) sent++;
    }
  }

  return { sent, checked };
}
