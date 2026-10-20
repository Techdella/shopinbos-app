"use server";

import { requireAdminSection } from "@/lib/admin-team/service.server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LeadAudience, LeadMessageContent, LeadStep } from "@/lib/lead-growth/pure";
import { WHATSAPP_TEMPLATES, whatsappTemplate } from "@/lib/lead-growth/whatsapp-content";
import { metaTemplates, metaWhatsAppConfig, submitMetaTemplate } from "@/lib/lead-growth/whatsapp-meta.server";
import { connectInboxWebhook, submitTeamTemplates } from "@/lib/support/whatsapp.server";
import {
  LeadGrowthNotReady,
  addLaunchContent,
  addWhatsAppContent,
  cancelCampaign,
  countAudience,
  createAutomation,
  createCampaign,
  deleteAutomation,
  deleteCampaign,
  enrolLeads,
  runCampaign,
  runDueSteps,
  scheduleCampaign,
  sendTestMessage,
  setAutomationActive,
  updateAutomation,
  updateCampaign,
} from "@/lib/lead-growth/service.server";

// Admin › Lead campaigns: write, test, send or schedule campaigns to website leads, and run automations.

type Result = { ok: true; id?: string; message?: string } | { ok: false; error: string };

const PATH = "/admin/lead-campaigns";

function failure(error: unknown): Result {
  if (error instanceof LeadGrowthNotReady) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Check the form." };
  console.error("[admin lead growth]", error);
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

const CampaignForm = z.object({
  id: z.string().max(64).optional().nullable(),
  name: z.string().trim().min(1, "Give the campaign a name.").max(120),
  audience: LeadAudience,
  content: LeadMessageContent,
});

export async function saveLeadCampaign(input: unknown): Promise<Result> {
  const admin = await requireAdminSection("leads");
  try {
    const form = CampaignForm.parse(input);
    const data = { ...form.content, name: form.name, audience: form.audience };
    if (form.id) {
      const updated = await updateCampaign(form.id, data);
      if (!updated.count) return { ok: false, error: "This campaign has already gone out, so it can't be changed. Duplicate it instead." };
      revalidatePath(PATH);
      return { ok: true, id: form.id };
    }
    const created = await createCampaign(data, admin.id);
    revalidatePath(PATH);
    return { ok: true, id: created.id };
  } catch (error) {
    return failure(error);
  }
}

export async function previewLeadAudience(input: unknown) {
  await requireAdminSection("leads");
  try {
    return { ok: true as const, counts: await countAudience(LeadAudience.parse(input ?? {})) };
  } catch (error) {
    return failure(error) as { ok: false; error: string };
  }
}

const TestForm = z.object({ name: z.string().max(120).default("Test"), content: LeadMessageContent, to: z.string().trim().min(5, "Enter where to send the test.").max(190), testName: z.string().trim().max(60).optional() });

export async function sendLeadTest(input: unknown): Promise<Result> {
  await requireAdminSection("leads");
  try {
    const form = TestForm.parse(input);
    const outcome = await sendTestMessage(form.content, { name: form.name }, form.to, form.testName || "Ada");
    return outcome.status === "sent" ? { ok: true, message: `Test sent to ${outcome.to}.` } : { ok: false, error: outcome.error };
  } catch (error) {
    return failure(error);
  }
}

function formId(formData: FormData) {
  return String(formData.get("id") ?? "").slice(0, 64);
}

/** Send now: mark it due and start sending after the response; the cron finishes anything left. */
export async function sendLeadCampaignNow(formData: FormData) {
  await requireAdminSection("leads");
  const id = formId(formData);
  if (!id) return;
  await scheduleCampaign(id, new Date());
  after(() => runCampaign(id, Date.now() + 240_000).catch((error) => console.error("[lead campaign] send failed", error)));
  revalidatePath(PATH);
}

export async function scheduleLeadCampaign(formData: FormData) {
  await requireAdminSection("leads");
  const id = formId(formData);
  // datetime-local is Lagos time (UTC+1, no daylight saving).
  const local = String(formData.get("at") ?? "");
  const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? new Date(`${local}:00+01:00`) : null;
  if (!id || !at || Number.isNaN(at.getTime())) return;
  await scheduleCampaign(id, at);
  revalidatePath(PATH);
}

export async function cancelLeadCampaign(formData: FormData) {
  await requireAdminSection("leads");
  const id = formId(formData);
  if (id) await cancelCampaign(id);
  revalidatePath(PATH);
}

export async function deleteLeadCampaign(formData: FormData) {
  await requireAdminSection("leads");
  const id = formId(formData);
  if (id) await deleteCampaign(id);
  revalidatePath(PATH);
}

// ─── Automations ────────────────────────────────────────────────────────────────────────────────────────────────

const AutomationForm = z.object({
  id: z.string().max(64).optional().nullable(),
  name: z.string().trim().min(1, "Give the automation a name.").max(120),
  audience: LeadAudience,
  steps: z.array(LeadStep).min(1, "Add at least one message.").max(10, "Up to 10 messages."),
  includeExisting: z.boolean().default(false),
});

export async function saveLeadAutomation(input: unknown): Promise<Result> {
  await requireAdminSection("leads");
  try {
    const form = AutomationForm.parse(input);
    const data = { name: form.name, audience: form.audience, steps: form.steps, includeExisting: form.includeExisting };
    const saved = form.id ? await updateAutomation(form.id, data) : await createAutomation(data);
    revalidatePath(PATH);
    return { ok: true, id: saved.id };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleLeadAutomation(formData: FormData) {
  await requireAdminSection("leads");
  const id = formId(formData);
  if (!id) return;
  const active = formData.get("active") === "1";
  await setAutomationActive(id, active);
  if (active) after(() => enrolLeads().then(() => runDueSteps(Date.now() + 120_000)).catch((error) => console.error("[lead automation] run failed", error)));
  revalidatePath(PATH);
}

export async function deleteLeadAutomation(formData: FormData) {
  await requireAdminSection("leads");
  const id = formId(formData);
  if (id) await deleteAutomation(id);
  revalidatePath(PATH);
  redirect(PATH);
}

/** Admin: load the launch sequences and win campaign drafts that aren't there yet. */
export async function addLaunchSequences() {
  const admin = await requireAdminSection("leads");
  await addLaunchContent(admin.id);
  revalidatePath(PATH);
}

// ─── WhatsApp ───────────────────────────────────────────────────────────────────────────────────────────────────

const WA_PATH = "/admin/lead-campaigns/whatsapp";

function waBack(params: Record<string, string>): never {
  redirect(`${WA_PATH}?${new URLSearchParams(params)}`);
}

/** Admin: the WhatsApp launch sequences, switched off. */
export async function addWhatsAppSequences() {
  await requireAdminSection("leads");
  await addWhatsAppContent();
  revalidatePath(WA_PATH);
  revalidatePath(PATH);
}

/** Admin: send one launch template (or every one Meta doesn't have yet) to Meta for approval. */
export async function submitWhatsAppTemplates(formData: FormData) {
  await requireAdminSection("leads");
  const config = metaWhatsAppConfig();
  if (!config) waBack({ error: "Connect the WhatsApp number first." });
  const name = String(formData.get("name") ?? "");
  let wanted = name ? [whatsappTemplate(name)].filter((t) => t !== null) : WHATSAPP_TEMPLATES;
  if (!name) {
    const existing = await metaTemplates(config);
    if (!existing.ok) waBack({ error: existing.error });
    const have = new Set(existing.templates.map((t) => `${t.name}:${t.language}`));
    wanted = wanted.filter((t) => !have.has(`${t.name}:${t.language}`));
  }
  const failures: string[] = [];
  for (const template of wanted) {
    const result = await submitMetaTemplate(config, template);
    if (!result.ok) failures.push(`${template.name}: ${result.error}`);
  }
  // "Submit all" also sends the inbox's own templates (follow-up, reconnect).
  const team = name ? { submitted: 0, failures: [] as string[] } : await submitTeamTemplates();
  failures.push(...team.failures);
  revalidatePath(WA_PATH);
  if (failures.length) waBack({ error: failures.join(" · ").slice(0, 600) });
  waBack({ submitted: String(wanted.length + team.submitted) });
}

/** Admin: subscribe the WhatsApp Business Account to the app, so messages to the number reach the inbox. */
export async function connectWhatsAppInbox() {
  await requireAdminSection("inbox");
  const result = await connectInboxWebhook();
  revalidatePath(WA_PATH);
  if (!result.ok) waBack({ error: `Meta: ${result.error}` });
  waBack({ connected: "1" });
}

/** Admin: send the inbox's own templates (follow-up, reconnect) to Meta for approval. */
export async function submitInboxTemplates() {
  await requireAdminSection("inbox");
  const result = await submitTeamTemplates();
  revalidatePath(WA_PATH);
  if (result.failures.length) waBack({ error: result.failures.join(" · ").slice(0, 600) });
  waBack({ submitted: String(result.submitted) });
}
