import "server-only";
import { db } from "@/lib/db/client";
import { getPublicEnv } from "@/lib/env";
import { createBroadcast, startBroadcast } from "@/lib/email/product-news.server";
import { ALL_NEWS_AUDIENCES } from "@/lib/email/product-news";
import { cacVasReady } from "@/lib/cac-vas.server";
import { paystackSecretReady } from "@shared/checkout-payments";

// The switch for registering a business name with CAC through Shopinbos (Admin › Settings › Launches). Off until
// an admin turns it on: the register-business pages, links and APIs stay hidden, while applications already
// started keep being tracked. The first time it goes live, everyone (sellers, suppliers, delivery partners) gets a
// product news email saying they can now register, sent in batches by the product news cron. Turning it off and
// on again never sends a second email. Kept in PlatformSetting, every change in PlatformSettingChange.

export const REGISTRATION_LAUNCH_KEY = "feature.business_registration";

export interface RegistrationLaunch {
  live: boolean;
  changedAt: string | null;
  /** The product news email sent when it first went live. */
  announcementId: string | null;
}

const OFF: RegistrationLaunch = { live: false, changedAt: null, announcementId: null };

function readLaunch(value: unknown): RegistrationLaunch {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    live: v.live === true,
    changedAt: typeof v.changedAt === "string" ? v.changedAt : null,
    announcementId: typeof v.announcementId === "string" ? v.announcementId : null,
  };
}

export async function getRegistrationLaunch(): Promise<RegistrationLaunch> {
  const row = await db.platformSetting.findUnique({ where: { key: REGISTRATION_LAUNCH_KEY } }).catch(() => null);
  return row ? readLaunch(row.value) : OFF;
}

export async function registrationLaunched() {
  return (await getRegistrationLaunch()).live;
}

/** What has to be in place before it can go live: the CAC VAS key and Paystack (it's paid first). */
export function registrationReadiness() {
  return { cacVas: cacVasReady(), paystack: paystackSecretReady(process.env.PAYSTACK_SECRET_KEY) };
}

export class RegistrationLaunchError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function announcement() {
  const appUrl = getPublicEnv().appUrl.replace(/\/$/, "");
  return {
    subject: "You can now register your business with CAC on Shopinbos",
    preheader: "Register your business name with CAC without leaving Shopinbos.",
    heading: "Register your business name with CAC, right inside Shopinbos",
    body: [
      "Good news: you can now register your business name with the Corporate Affairs Commission (CAC) through Shopinbos.",
      "## How it works",
      "- Check that your business name is free with CAC (free)",
      "- Fill in your details and add your passport photo, signature and ID",
      "- Pay once on Paystack and we file it with CAC for you",
      "- Follow every step in the app, and download your certificate when CAC approves it",
      "A registered business builds trust with buyers, suppliers and delivery partners, and helps you get verified faster on Shopinbos.",
    ].join("\n\n"),
    imageUrl: null,
    ctaLabel: "Register my business",
    ctaUrl: `${appUrl}/register-business`,
    audience: [...ALL_NEWS_AUDIENCES],
  };
}

/**
 * Turns registration on or off. Going live needs the CAC VAS key and Paystack; the first time, it sends the
 * announcement to everyone (unless announce is false).
 */
export async function setRegistrationLaunch(input: { live: boolean; announce?: boolean; note?: string | null }, by: { userId: string }) {
  const before = await getRegistrationLaunch();
  if (input.live) {
    const ready = registrationReadiness();
    if (!ready.cacVas) throw new RegistrationLaunchError("Add the CAC VAS API key (CAC_VAS_API_KEY) before switching registration on.");
    if (!ready.paystack) throw new RegistrationLaunchError("Add the Paystack secret key before switching registration on (applications are paid first).");
  }
  const after: RegistrationLaunch = { live: input.live, changedAt: new Date().toISOString(), announcementId: before.announcementId };
  const json = JSON.parse(JSON.stringify(after));
  await db.$transaction([
    db.platformSetting.upsert({ where: { key: REGISTRATION_LAUNCH_KEY }, create: { key: REGISTRATION_LAUNCH_KEY, value: json, updatedById: by.userId }, update: { value: json, updatedById: by.userId } }),
    db.platformSettingChange.create({ data: { key: REGISTRATION_LAUNCH_KEY, before: JSON.parse(JSON.stringify(before)), after: json, note: input.note?.slice(0, 500) || (input.live ? "Switched on" : "Switched off"), changedById: by.userId } }),
  ]);

  let announced: { id: string; status: string } | null = null;
  if (input.live && !before.announcementId && input.announce !== false) {
    const broadcast = await createBroadcast(announcement(), by.userId);
    // Saved before sending, so a retry or a second click never creates another email.
    after.announcementId = broadcast.id;
    await db.platformSetting.update({ where: { key: REGISTRATION_LAUNCH_KEY }, data: { value: JSON.parse(JSON.stringify(after)) } });
    const started = await startBroadcast(broadcast.id).catch((error: Error) => {
      // The product news cron carries on with a broadcast left in "sending"; the admin can also resend it.
      console.error("[business registration] announcement didn't start", error.message);
      return { status: "sending" };
    });
    announced = { id: broadcast.id, status: String(started.status) };
  }
  return { launch: after, announced };
}
