import "server-only";

import { db } from "@/lib/db/client";
import { escapeHtml } from "@/lib/campaigns/render";
import { checkConfirmationCode, confirmationCode } from "@/lib/marketing/brand";
import {
  campaignAudienceSize,
  channelStatus,
  createAutomation,
  createCampaign,
  createSegment,
  listAutomations,
  listSegments,
  listTemplates,
  MarketingError,
  scheduleCampaign,
  sendCampaign,
  setAutomationActive,
  testSendCampaign,
} from "@/lib/marketing";
import { describeRules, type SegmentCondition, type SegmentField } from "@/lib/marketing/segment-rules";
import { presetByKey, TRIGGER_INFO } from "@/lib/marketing/flows";
import type { PeggyToolInput } from "./pure";
import { ToolError, type PeggyToolContext, type ToolOutput } from "./tools";

// Peggy's marketing tools, on the same library the Marketing pages use (src/lib/marketing). Sending a
// campaign and switching an automation on message real customers, so both return a preview and a
// confirmation code first; the code is tied to the store, the target and the audience size, and expires.

const money = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

async function wrap<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MarketingError) throw new ToolError(error.message);
    throw error;
  }
}

async function findCampaign(ctx: PeggyToolContext, query: string) {
  const campaign =
    (await db.broadcastCampaign.findFirst({ where: { id: query, storeId: ctx.store.id } })) ??
    (await db.broadcastCampaign.findFirst({ where: { storeId: ctx.store.id, name: { equals: query, mode: "insensitive" } }, orderBy: { createdAt: "desc" } }));
  if (!campaign) throw new ToolError(`No campaign called "${query}". Use marketing_overview to see campaign names.`);
  return campaign;
}

function lagos(value: string) {
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value);
  const date = new Date(local ? `${value.length === 16 ? `${value}:00` : value}+01:00` : value);
  if (Number.isNaN(date.getTime())) throw new ToolError("`when` must be a date-time like 2026-12-01T09:00");
  return date;
}

const whenText = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }).format(date);

async function overview(ctx: PeggyToolContext): Promise<ToolOutput> {
  const storeId = ctx.store.id;
  const [subscribers, segments, campaigns, automations, templates, channels] = await Promise.all([
    db.subscriber.groupBy({ by: ["status"], where: { storeId }, _count: true }),
    listSegments(storeId),
    db.broadcastCampaign.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, name: true, channel: true, status: true, sentCount: true, openCount: true, clickCount: true, revenueGenerated: true, scheduledAt: true, sentAt: true } }),
    listAutomations(storeId),
    listTemplates(storeId),
    channelStatus(storeId),
  ]);
  return {
    content: JSON.stringify({
      subscribers: Object.fromEntries(subscribers.map((row) => [row.status, row._count])),
      segments: segments.map((s) => ({ name: s.name, rules: s.summary, people: s.count })),
      campaigns: campaigns.map((c) => ({ ...c, revenueGenerated: money(c.revenueGenerated), scheduledAt: c.scheduledAt ? whenText(c.scheduledAt) : null, sentAt: c.sentAt ? whenText(c.sentAt) : null })),
      automations: automations.map((a) => ({ name: a.name, trigger: TRIGGER_INFO[a.trigger]?.label ?? a.trigger, on: a.active, messages: a.messages, sentLast30Days: a.sent30d, inFlowNow: a.inFlow })),
      templates: { saved: templates.saved.map((t) => t.name), library: templates.library.map((t) => t.name) },
      channels: Object.fromEntries(Object.entries(channels).map(([key, value]) => [key, value.ready ? `ready (${value.via})` : `not set up: ${value.howTo}`])),
    }),
  };
}

async function createSegmentTool(ctx: PeggyToolContext, input: PeggyToolInput<"marketing_create_segment">): Promise<ToolOutput> {
  const conditions: SegmentCondition[] = [];
  for (const c of input.conditions) {
    let value: string | number | null = c.value;
    let label: string | null = null;
    if (c.field === "product" && c.value) {
      const matches = await db.storeProduct.findMany({ where: { storeId: ctx.store.id, OR: [{ id: c.value }, { name: { contains: c.value, mode: "insensitive" } }] }, select: { id: true, name: true }, take: 5 });
      const exact = matches.find((p) => p.id === c.value || p.name.toLowerCase() === c.value!.toLowerCase());
      const product = exact ?? (matches.length === 1 ? matches[0] : null);
      if (!product) throw new ToolError(matches.length ? `"${c.value}" matches ${matches.map((p) => p.name).join(", ")}. Which one?` : `No product matches "${c.value}".`);
      value = product.id;
      label = product.name;
    }
    conditions.push({ field: c.field as SegmentField, op: c.op as SegmentCondition["op"], value, label });
  }
  const segment = await wrap(() => createSegment(ctx.store.id, { name: input.name, rules: { match: input.match, conditions } }));
  const summary = `Saved the segment "${segment.name}" (${describeRules({ match: input.match, conditions })}). ${segment.subscriberCount} ${segment.subscriberCount === 1 ? "person matches" : "people match"} right now.`;
  return { content: summary, action: { summary, href: "/home/marketing/segments" } };
}

function textToHtml(message: string) {
  return message
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 14px">${escapeHtml(paragraph.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

async function createCampaignTool(ctx: PeggyToolContext, input: PeggyToolInput<"marketing_create_campaign">): Promise<ToolOutput> {
  if (input.channel === "email" && !input.subject) throw new ToolError("An email campaign needs a subject.");
  let segmentId: string | null = null;
  if (input.segment) {
    const segment = await db.customerSegment.findFirst({ where: { storeId: ctx.store.id, name: { equals: input.segment, mode: "insensitive" } }, select: { id: true } });
    if (!segment) throw new ToolError(`No segment called "${input.segment}". Create it with marketing_create_segment first, or use audience.`);
    segmentId = segment.id;
  }
  const campaign = await wrap(() =>
    createCampaign(ctx.store.id, {
      name: input.name,
      channel: input.channel,
      subject: input.subject ?? undefined,
      bodyHtml: input.channel === "email" ? textToHtml(input.message) : input.message,
      segmentId,
      audience: { mode: input.audience === "subscribers" ? "subscribers" : "all" },
      campaignType: "promotion",
    }),
  );
  const size = await campaignAudienceSize(ctx.store.id, campaign);
  const summary = `Saved the ${input.channel === "email" ? "email" : input.channel === "sms" ? "SMS" : "WhatsApp"} campaign "${campaign.name}" as a draft for ${input.segment ? `the "${input.segment}" segment` : input.audience === "subscribers" ? "subscribers" : "subscribers and past buyers"} (${size} ${size === 1 ? "person" : "people"} right now). Nothing was sent.`;
  const whatsappNote = input.channel === "whatsapp" ? " WhatsApp campaigns go out as a Meta-approved template: the seller picks one (and what fills its variables) in the campaign editor before sending." : "";
  return { content: `${summary}${whatsappNote} Campaign id: ${campaign.id}`, action: { summary, href: `/home/marketing/campaigns/${campaign.id}` } };
}

async function sendCampaignTool(ctx: PeggyToolContext, input: PeggyToolInput<"marketing_send_campaign">): Promise<ToolOutput> {
  const campaign = await findCampaign(ctx, input.campaign);
  if (campaign.status === "sent" || campaign.status === "sending") throw new ToolError("That campaign has already been sent.");
  const when = input.when ? lagos(input.when) : null;
  const size = await campaignAudienceSize(ctx.store.id, campaign);
  if (!size) throw new ToolError("Nobody in this campaign's audience can be reached on its channel yet.");
  const parts = [ctx.store.id, "send", campaign.id, String(size), when ? when.toISOString() : "now"];
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    const what = `${campaign.channel === "email" ? `the email "${campaign.subject}"` : `the ${campaign.channel === "sms" ? "SMS" : "WhatsApp"} message`} (campaign "${campaign.name}") to ${size} ${size === 1 ? "person" : "people"} ${when ? `on ${whenText(when)}` : "right now"}`;
    return {
      content: `NOT SENT YET. Ask the seller to confirm: send ${what}? Confirmation code: ${confirmationCode(parts)}. Only call marketing_send_campaign again with this code after they clearly say yes.${input.confirmCode ? " (The code given was wrong or expired.)" : ""}`,
    };
  }
  if (when) {
    await wrap(() => scheduleCampaign(ctx.store.id, campaign.id, when));
    const summary = `Scheduled "${campaign.name}" for ${whenText(when)} (Lagos time), to ${size} ${size === 1 ? "person" : "people"}.`;
    return { content: summary, action: { summary, href: `/home/marketing/campaigns/${campaign.id}` } };
  }
  const result = await sendCampaign(ctx.store.id, campaign.id);
  if (!result.ok) throw new ToolError(result.error);
  const summary = `Sent "${campaign.name}" to ${result.sent} ${result.sent === 1 ? "person" : "people"}${result.failed ? `; ${result.failed} couldn't be sent (they can be retried from the campaign page)` : ""}.`;
  return { content: summary, action: { summary, href: `/home/marketing/campaigns/${campaign.id}` } };
}

async function sendTestTool(ctx: PeggyToolContext, input: PeggyToolInput<"marketing_send_test">): Promise<ToolOutput> {
  const campaign = await findCampaign(ctx, input.campaign);
  const me = await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true, phone: true } });
  const result = await wrap(() => testSendCampaign(ctx.store.id, campaign.id, { email: me?.email, phone: me?.phone ?? ctx.userPhone }));
  const summary = `Sent a test of "${campaign.name}" to ${result.to}. No customers got it.`;
  return { content: summary, action: { summary, href: `/home/marketing/campaigns/${campaign.id}` } };
}

async function createAutomationTool(ctx: PeggyToolContext, input: PeggyToolInput<"marketing_create_automation">): Promise<ToolOutput> {
  const preset = presetByKey(input.flow)!;
  const existing = await db.automationRule.findFirst({ where: { storeId: ctx.store.id, name: preset.name }, select: { id: true, active: true } });
  if (input.activate) {
    const parts = [ctx.store.id, "flow", input.flow];
    if (!checkConfirmationCode(input.confirmCode, parts)) {
      return {
        content: `NOT SWITCHED ON YET. Ask the seller to confirm: switch on "${preset.name}" (${preset.description}) so it messages customers automatically from now on? Confirmation code: ${confirmationCode(parts)}. Only call again with activate=true and this code after they clearly say yes.`,
      };
    }
  }
  const rule = existing
    ? await wrap(() => setAutomationActive(ctx.store.id, existing.id, input.activate || existing.active))
    : await wrap(() => createAutomation(ctx.store.id, { presetKey: input.flow, active: input.activate }));
  const summary = existing
    ? `"${preset.name}" already existed; it is ${rule.active ? "on" : "off"}.`
    : `Added the "${preset.name}" automation, switched ${rule.active ? "ON: it now messages customers automatically" : "OFF: review it and switch it on when ready"}.`;
  return { content: summary, action: { summary, href: `/home/automations/${rule.id}` } };
}

async function listTemplatesTool(ctx: PeggyToolContext): Promise<ToolOutput> {
  const templates = await listTemplates(ctx.store.id);
  return {
    content: JSON.stringify({
      saved: templates.saved.map((t) => ({ name: t.name, subject: t.subject, kind: t.category })),
      library: templates.library.map((t) => ({ name: t.name, subject: t.subject, kind: t.category })),
    }),
  };
}

export const MARKETING_TOOL_RUNNERS = {
  marketing_overview: overview,
  marketing_create_segment: createSegmentTool,
  marketing_create_campaign: createCampaignTool,
  marketing_send_campaign: sendCampaignTool,
  marketing_send_test: sendTestTool,
  marketing_create_automation: createAutomationTool,
  marketing_list_templates: listTemplatesTool,
};
