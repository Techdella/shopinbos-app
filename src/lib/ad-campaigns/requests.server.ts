import "server-only";

import { db } from "@/lib/db/client";
import { billingEmail } from "@/lib/auth/billing-email";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { buildPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import { sendEmail } from "@/lib/notifications/resend";
import { supportInbox } from "@/lib/support/email.server";
import { appOrigin } from "@/lib/ads";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { adSetupFees } from "@shared/platform-pricing";
import { AD_REQUEST_STATUS_LABEL, AD_SETUP_REFERENCE_PREFIX, type AdRequestInput, type AdRequestStatus } from "@shared/ad-campaigns";

// "Shopinbos runs it for me": the seller shares their details for a TikTok or Meta campaign, pays the setup fee
// with Paystack, and the team works it at /admin/ad-requests. Ad spend itself is paid to TikTok or Meta.

export class AdRequestError extends Error {}

const PLATFORM_NAME = { tiktok: "TikTok", meta: "Facebook & Instagram" } as const;

export async function createAdRequest(input: { user: { id: string; email: string | null }; storeId: string; request: AdRequestInput; returnTo: string }) {
  const fee = adSetupFees(await getPriceBook())[input.request.platform];
  const reference = `${AD_SETUP_REFERENCE_PREFIX}${crypto.randomUUID()}`;
  const { campaignId, ...details } = input.request;
  const campaign = campaignId ? await db.adCampaign.findFirst({ where: { id: campaignId, storeId: input.storeId }, select: { id: true } }) : null;
  const row = await db.adServiceRequest.create({
    data: {
      ...details,
      contactEmail: details.contactEmail ?? input.user.email,
      storeId: input.storeId,
      userId: input.user.id,
      campaignId: campaign?.id ?? null,
      setupFee: fee,
      paymentRef: reference,
    },
  });
  const callback = new URL("/api/app/ads/requests/callback", appOrigin());
  callback.searchParams.set("returnTo", input.returnTo);
  const session = await initializePaystackTransaction({
    email: billingEmail(input.user),
    amountKobo: fee * 100,
    reference,
    callbackUrl: callback.toString(),
    metadata: { purpose: "ad_setup", request_id: row.id, platform: row.platform, user_id: input.user.id },
  });
  return { id: row.id, authorizationUrl: session.authorization_url };
}

/** Marks a verified setup fee paid once (callback and webhook may both call this) and tells the team. */
export async function completeAdSetupPayment(reference: string): Promise<"paid" | "failed" | "pending"> {
  const row = await db.adServiceRequest.findUnique({ where: { paymentRef: reference } });
  if (!row) return "failed";
  if (row.paidAt) return "paid";
  const verified = await verifyPaystackTransaction(reference);
  if (verified.status !== "success") return verified.status === "abandoned" || verified.status === "failed" ? "failed" : "pending";
  if (Number(verified.amount) < row.setupFee * 100) return "failed";
  const updated = await db.adServiceRequest.updateMany({ where: { id: row.id, paidAt: null }, data: { paidAt: new Date(), status: "new" } });
  if (updated.count) await notifyTeam(row.id).catch((error) => console.error("[ad-requests] team email failed", error));
  if (row.campaignId) await db.adCampaign.update({ where: { id: row.campaignId }, data: { status: "draft" } }).catch(() => null);
  return "paid";
}

async function notifyTeam(id: string) {
  const row = await db.adServiceRequest.findUnique({ where: { id } });
  if (!row) return;
  const store = await db.store.findUnique({ where: { id: row.storeId }, select: { name: true, slug: true } });
  const lines = [
    `Store: ${store?.name ?? row.businessName} (${store?.slug ?? "?"})`,
    `Contact: ${row.contactName} · ${row.contactPhone}${row.contactEmail ? ` · ${row.contactEmail}` : ""}`,
    row.handle ? `Handle: ${row.handle}` : "",
    row.pageUrl ? `Page: ${row.pageUrl}` : "",
    row.website ? `Website: ${row.website}` : "",
    row.adAccountId ? `Ad account: ${row.adAccountId}` : "",
    `Budget: ₦${row.dailyBudget.toLocaleString("en-NG")} a day for ${row.days} days`,
    row.goals ? `Goals: ${row.goals}` : "",
    row.audience ? `Audience: ${row.audience}` : "",
    row.notes ? `Notes: ${row.notes}` : "",
  ].filter(Boolean);
  const body = buildPlatformEmail({
    kind: "transactional",
    eyebrow: `Ad setup · ${PLATFORM_NAME[row.platform as keyof typeof PLATFORM_NAME] ?? row.platform}`,
    heading: `${row.businessName} paid ₦${row.setupFee.toLocaleString("en-NG")} for ad setup`,
    preheader: `${row.contactName} wants ads on ${row.platform}.`,
    bodyHtml: html.list(lines),
    cta: { label: "Open ad requests", url: `${appOrigin()}/admin/ad-requests` },
    reason: "you're on the Shopinbos ads team",
  }).html;
  await sendEmail({ to: [process.env.ADS_TEAM_EMAIL?.trim() || supportInbox()], subject: `New ad setup: ${row.businessName} (${row.platform})`, html: body, replyTo: row.contactEmail ?? undefined });
}

export function adRequestStatusLabel(status: string) {
  return AD_REQUEST_STATUS_LABEL[status as AdRequestStatus] ?? status;
}
