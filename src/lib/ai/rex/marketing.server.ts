import "server-only";
import { db } from "@/lib/db/client";
import { createAutomation, createCampaign, createSegment, MarketingError, setAutomationActive } from "@/lib/marketing";
import { automationRuleData, campaignRecipientFilter, segmentRules, textToEmailHtml, type RexToolInput } from "@/lib/ai/rex/agent-pure";

// Rex's marketing writes, through the marketing suite (src/lib/marketing): segments, draft email campaigns and
// switched-off automations. Nothing here sends a message: campaigns are drafts and automations start off;
// turning one on is the seller's tap on Rex's card.

export { MarketingError };

export async function rexCreateSegment(storeId: string, input: RexToolInput<"create_segment">) {
  const rules = segmentRules(input);
  const segment = await createSegment(storeId, { name: input.name, description: input.description, rules });
  return { id: segment.id, name: segment.name, rules, count: segment.subscriberCount };
}

export async function rexCreateCampaign(storeId: string, input: RexToolInput<"create_campaign">) {
  let segmentId: string | null = null;
  if (input.audience === "segment") {
    const segment = await db.customerSegment.findFirst({ where: { storeId, name: { equals: input.segment!.trim(), mode: "insensitive" } }, select: { id: true } });
    if (!segment) throw new MarketingError(`No segment called "${input.segment}". Create it first with create_segment, or pick another audience.`);
    segmentId = segment.id;
  }
  const campaign = await createCampaign(storeId, {
    name: input.name,
    channel: "email",
    subject: input.subject,
    bodyHtml: textToEmailHtml(input.message),
    segmentId,
    audience: campaignRecipientFilter(input.audience),
    campaignType: input.type ?? "promotion",
  });
  return { id: campaign.id, name: campaign.name, subject: campaign.subject };
}

export async function rexCreateAutomation(storeId: string, input: RexToolInput<"create_automation">) {
  const data = automationRuleData(input);
  const rule = await createAutomation(storeId, {
    name: data.name,
    description: "Set up by Rex",
    trigger: data.trigger as Parameters<typeof createAutomation>[1]["trigger"],
    steps: data.actionConfig.steps,
    settings: data.actionConfig.settings,
    active: false,
  });
  return { id: rule.id, name: rule.name, waitMinutes: data.waitMinutes };
}

/** The seller's confirmation from the automation card. */
export async function rexActivateAutomation(storeId: string, id: string) {
  try {
    const rule = await setAutomationActive(storeId, id, true);
    return { id: rule.id, name: rule.name };
  } catch (error) {
    if (error instanceof MarketingError) return null;
    throw error;
  }
}
