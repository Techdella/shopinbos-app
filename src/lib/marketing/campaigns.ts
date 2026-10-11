import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { formatFromAddress, isEmailConfigured, sendEmail } from "@/lib/notifications/resend";
import { campaignFilter, resolveCampaignRecipients, resolveTextRecipients, sendCampaign, type CampaignChannel, type RecipientFilter } from "@/lib/campaigns/send";
import { MARKETING_STORE_SELECT, emailBrand, storeUrl } from "./brand";
import { sendMarketingText } from "./channels";
import { SAMPLE_VARIABLES, wrapEmail } from "./email-layout";
import { fillVariables } from "./flows";
import { MarketingError } from "./segments";

// Campaign drafts, scheduling, audience counts and test sends. Sending itself is src/lib/campaigns/send.ts.

export interface CampaignInput {
  name: string;
  channel?: CampaignChannel;
  subject?: string;
  preheader?: string | null;
  bodyHtml?: string;
  templateId?: string | null;
  segmentId?: string | null;
  audience?: RecipientFilter;
  campaignType?: string;
}

const CHANNELS: CampaignChannel[] = ["email", "sms", "whatsapp"];

async function checkSegment(storeId: string, segmentId: string | null | undefined) {
  if (!segmentId) return null;
  const segment = await db.customerSegment.findFirst({ where: { id: segmentId, storeId }, select: { id: true } });
  if (!segment) throw new MarketingError("That segment doesn't exist any more");
  return segment.id;
}

export async function createCampaign(storeId: string, input: CampaignInput) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true } });
  if (!store) throw new MarketingError("Store not found");
  const channel = input.channel && CHANNELS.includes(input.channel) ? input.channel : "email";
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new MarketingError("Give the campaign a name");
  const segmentId = await checkSegment(storeId, input.segmentId);
  return db.broadcastCampaign.create({
    data: {
      storeId,
      name,
      channel,
      subject: (input.subject?.trim() || (channel === "email" ? name : `${channel.toUpperCase()} message`)).slice(0, 200),
      preheader: input.preheader?.trim() || null,
      bodyHtml: input.bodyHtml ?? "",
      templateId: input.templateId || null,
      senderName: store.name,
      campaignType: input.campaignType ?? "newsletter",
      segmentId,
      recipientFilter: (input.audience ?? { mode: "all" }) as unknown as Prisma.InputJsonValue,
      status: "draft",
    },
  });
}

async function editable(storeId: string, id: string) {
  const campaign = await db.broadcastCampaign.findFirst({ where: { id, storeId } });
  if (!campaign) throw new MarketingError("Campaign not found");
  if (campaign.status === "sent" || campaign.status === "sending") throw new MarketingError("Sent campaigns can't be changed");
  return campaign;
}

export async function updateCampaign(storeId: string, id: string, input: Partial<CampaignInput>) {
  const campaign = await editable(storeId, id);
  const data: Prisma.BroadcastCampaignUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim().slice(0, 120) || campaign.name;
  if (input.channel !== undefined && CHANNELS.includes(input.channel)) data.channel = input.channel;
  if (input.subject !== undefined) data.subject = input.subject.trim().slice(0, 200) || campaign.subject;
  if (input.preheader !== undefined) data.preheader = input.preheader?.trim() || null;
  if (input.bodyHtml !== undefined) data.bodyHtml = input.bodyHtml;
  if (input.templateId !== undefined) data.templateId = input.templateId || null;
  if (input.campaignType !== undefined) data.campaignType = input.campaignType;
  if (input.segmentId !== undefined) data.segmentId = await checkSegment(storeId, input.segmentId);
  if (input.audience !== undefined) data.recipientFilter = input.audience as unknown as Prisma.InputJsonValue;
  return db.broadcastCampaign.update({ where: { id }, data });
}

/** Queues the campaign for the scheduler (Lagos time is the caller's job). */
export async function scheduleCampaign(storeId: string, id: string, at: Date) {
  await editable(storeId, id);
  if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 60_000) throw new MarketingError("Pick a time at least a minute from now");
  return db.broadcastCampaign.update({ where: { id }, data: { scheduledAt: at, status: "scheduled" } });
}

export async function unscheduleCampaign(storeId: string, id: string) {
  await editable(storeId, id);
  return db.broadcastCampaign.update({ where: { id }, data: { scheduledAt: null, status: "draft" } });
}

export { sendCampaign };

/** How many people the audience reaches on the channel right now. */
export async function audienceSize(storeId: string, channel: CampaignChannel, filter: RecipientFilter) {
  if (channel === "email") return (await resolveCampaignRecipients(storeId, filter)).length;
  return (await resolveTextRecipients(storeId, filter, channel)).length;
}

export async function campaignAudienceSize(storeId: string, campaign: { channel: string; segmentId: string | null; recipientFilter: unknown }) {
  return audienceSize(storeId, (campaign.channel || "email") as CampaignChannel, campaignFilter(campaign));
}

/** The email as a recipient sees it (sample customer data, brand kit applied). */
export async function previewCampaignHtml(storeId: string, input: { bodyHtml: string; preheader?: string | null }) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: MARKETING_STORE_SELECT });
  if (!store) throw new MarketingError("Store not found");
  const brand = emailBrand(store);
  const vars = { ...SAMPLE_VARIABLES, store: store.name, store_url: storeUrl(store), cart_url: storeUrl(store, "/cart"), unsubscribe_url: "#", brand_accent: brand.accent };
  return wrapEmail({ bodyHtml: fillVariables(input.bodyHtml, vars, "html"), brand, preheader: input.preheader });
}

/** Sends the current draft to the seller only, marked [Test]. */
export async function testSendCampaign(storeId: string, id: string, to: { email?: string | null; phone?: string | null }) {
  const campaign = await db.broadcastCampaign.findFirst({ where: { id, storeId } });
  if (!campaign) throw new MarketingError("Campaign not found");
  const store = await db.store.findUnique({ where: { id: storeId }, select: MARKETING_STORE_SELECT });
  if (!store) throw new MarketingError("Store not found");
  if (!campaign.bodyHtml.trim()) throw new MarketingError("Write the message first");
  const channel = (campaign.channel || "email") as CampaignChannel;
  if (channel === "email") {
    if (!to.email) throw new MarketingError("Add an email address to your account to get test emails");
    if (!isEmailConfigured()) throw new MarketingError("Email isn't set up yet (RESEND_API_KEY)");
    const html = await previewCampaignHtml(storeId, { bodyHtml: campaign.bodyHtml, preheader: campaign.preheader });
    const result = await sendEmail({ to: [to.email], subject: `[Test] ${fillVariables(campaign.subject, { ...SAMPLE_VARIABLES, store: store.name }, "text")}`, html, from: formatFromAddress(store.name) });
    if (!result.success) throw new MarketingError(result.message ?? "The test email couldn't be sent");
    return { to: to.email };
  }
  if (!to.phone) throw new MarketingError("Add a phone number to your account to get test messages");
  const body = `[Test] ${fillVariables(campaign.bodyHtml, { ...SAMPLE_VARIABLES, store: store.name, store_url: storeUrl(store) }, "text")}`;
  const result = await sendMarketingText(store, channel, to.phone, body);
  if (!result.ok) throw new MarketingError(result.error);
  return { to: to.phone };
}
