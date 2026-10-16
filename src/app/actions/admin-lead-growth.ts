"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/server-auth";
import { LeadAudience, LeadMessageContent, LeadStep } from "@/lib/lead-growth/pure";
import {
  LeadGrowthNotReady,
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
  const admin = await requireRole(["admin"], "/admin/login");
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
  await requireRole(["admin"], "/admin/login");
  try {
    return { ok: true as const, counts: await countAudience(LeadAudience.parse(input ?? {})) };
  } catch (error) {
    return failure(error) as { ok: false; error: string };
  }
}

const TestForm = z.object({ name: z.string().max(120).default("Test"), content: LeadMessageContent, to: z.string().trim().min(5, "Enter where to send the test.").max(190), testName: z.string().trim().max(60).optional() });

export async function sendLeadTest(input: unknown): Promise<Result> {
  await requireRole(["admin"], "/admin/login");
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
  await requireRole(["admin"], "/admin/login");
  const id = formId(formData);
  if (!id) return;
  await scheduleCampaign(id, new Date());
  after(() => runCampaign(id, Date.now() + 240_000).catch((error) => console.error("[lead campaign] send failed", error)));
  revalidatePath(PATH);
}

export async function scheduleLeadCampaign(formData: FormData) {
  await requireRole(["admin"], "/admin/login");
  const id = formId(formData);
  // datetime-local is Lagos time (UTC+1, no daylight saving).
  const local = String(formData.get("at") ?? "");
  const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? new Date(`${local}:00+01:00`) : null;
  if (!id || !at || Number.isNaN(at.getTime())) return;
  await scheduleCampaign(id, at);
  revalidatePath(PATH);
}

export async function cancelLeadCampaign(formData: FormData) {
  await requireRole(["admin"], "/admin/login");
  const id = formId(formData);
  if (id) await cancelCampaign(id);
  revalidatePath(PATH);
}

export async function deleteLeadCampaign(formData: FormData) {
  await requireRole(["admin"], "/admin/login");
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
  await requireRole(["admin"], "/admin/login");
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
  await requireRole(["admin"], "/admin/login");
  const id = formId(formData);
  if (!id) return;
  const active = formData.get("active") === "1";
  await setAutomationActive(id, active);
  if (active) after(() => enrolLeads().then(() => runDueSteps(Date.now() + 120_000)).catch((error) => console.error("[lead automation] run failed", error)));
  revalidatePath(PATH);
}

export async function deleteLeadAutomation(formData: FormData) {
  await requireRole(["admin"], "/admin/login");
  const id = formId(formData);
  if (id) await deleteAutomation(id);
  revalidatePath(PATH);
  redirect(PATH);
}
