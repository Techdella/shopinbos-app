import "server-only";

import type { AutomationTrigger, Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { FLOW_PRESETS, TRIGGER_INFO, countMessages, parseFlowConfig, parseStep, presetByKey, stepProblems, type FlowPreset, type FlowSettings, type FlowStep, type FlowTrigger } from "./flows";
import { MarketingError } from "./segments";
import { seriesAutomation } from "./template-library";
import { variableCount } from "./text-channels";
import { listWhatsAppTemplates } from "./whatsapp-templates.server";

/** Refuses to switch a flow on while a step can't work (unapproved template, unmapped variable, missing segment…). */
async function checkSteps(storeId: string, steps: FlowStep[]) {
  const templates = steps.some((step) => step.type === "send_whatsapp" && step.template)
    ? (await listWhatsAppTemplates(storeId)).map((t) => ({ id: t.id, status: t.status, variableCount: variableCount(t.content) }))
    : [];
  for (const [index, step] of steps.entries()) {
    const problem = stepProblems(step, { templates })[0];
    if (problem) throw new MarketingError(`Step ${index + 1}: ${problem}`);
  }
}

// Automation flows on AutomationRule: steps and settings in actionConfig, on/off in active.

export interface AutomationInput {
  name?: string;
  description?: string;
  trigger?: FlowTrigger;
  steps?: unknown[];
  settings?: FlowSettings;
  active?: boolean;
}

const TRIGGERS = Object.keys(TRIGGER_INFO) as FlowTrigger[];

function cleanSteps(raw: unknown[] | undefined): FlowStep[] {
  return (raw ?? []).map(parseStep).filter((step): step is FlowStep => Boolean(step)).slice(0, 20);
}

/** A starter-library series ("series:cart") as a ready-made flow: its emails, waits and conditions. */
function seriesPreset(key: string): FlowPreset | null {
  if (!key.startsWith("series:")) return null;
  const series = seriesAutomation(key.slice("series:".length));
  if (!series) return null;
  return { key, name: series.name, description: series.description, trigger: series.trigger, ...(series.settings ? { settings: series.settings } : {}), steps: cleanSteps(series.steps) };
}

/** Creates a flow from a ready-made one (presetKey, or "series:<key>" for a template series) or from scratch. Starts off unless `active` is true. */
export async function createAutomation(storeId: string, input: AutomationInput & { presetKey?: string }) {
  const preset = input.presetKey ? presetByKey(input.presetKey) ?? seriesPreset(input.presetKey) : null;
  if (input.presetKey && !preset) throw new MarketingError(`Unknown flow "${input.presetKey}". Pick one of: ${FLOW_PRESETS.map((p) => p.key).join(", ")}`);
  const trigger = input.trigger ?? preset?.trigger;
  if (!trigger || !TRIGGERS.includes(trigger)) throw new MarketingError("Pick what starts the flow");
  const steps = input.steps ? cleanSteps(input.steps) : preset?.steps ?? [];
  if (!steps.length) throw new MarketingError("Add at least one step");
  const settings = input.settings ?? preset?.settings ?? {};
  if (input.active === true) await checkSteps(storeId, steps);
  return db.automationRule.create({
    data: {
      storeId,
      name: (input.name?.trim() || preset?.name || TRIGGER_INFO[trigger].label).slice(0, 80),
      description: (input.description ?? preset?.description ?? "").slice(0, 300),
      trigger: trigger as AutomationTrigger,
      actionType: "send_email",
      actionConfig: { steps, settings, ...(preset ? { preset: preset.key } : {}) } as unknown as Prisma.InputJsonValue,
      delayMinutes: 0,
      active: input.active === true,
    },
  });
}

export async function updateAutomation(storeId: string, id: string, input: AutomationInput) {
  const rule = await db.automationRule.findFirst({ where: { id, storeId } });
  if (!rule) throw new MarketingError("Automation not found");
  const current = parseFlowConfig(rule.actionConfig, rule);
  const steps = input.steps ? cleanSteps(input.steps) : current.steps;
  if (!steps.length) throw new MarketingError("Add at least one step");
  const previous = rule.actionConfig && typeof rule.actionConfig === "object" ? (rule.actionConfig as Record<string, unknown>) : {};
  const trigger = input.trigger && TRIGGERS.includes(input.trigger) ? input.trigger : rule.trigger;
  if (input.active ?? rule.active) await checkSteps(storeId, steps);
  return db.automationRule.update({
    where: { id },
    data: {
      name: input.name?.trim().slice(0, 80) || rule.name,
      description: input.description !== undefined ? input.description.slice(0, 300) : rule.description,
      trigger: trigger as AutomationTrigger,
      // Steps now carry any delay, so the legacy rule-level delay is cleared.
      delayMinutes: 0,
      actionType: "send_email",
      actionConfig: { ...(typeof previous.preset === "string" ? { preset: previous.preset } : {}), steps, settings: input.settings ?? current.settings } as unknown as Prisma.InputJsonValue,
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

export async function setAutomationActive(storeId: string, id: string, active: boolean) {
  const rule = await db.automationRule.findFirst({ where: { id, storeId }, select: { id: true, actionConfig: true, actionType: true, delayMinutes: true } });
  if (!rule) throw new MarketingError("Automation not found");
  if (active) await checkSteps(storeId, parseFlowConfig(rule.actionConfig, rule).steps);
  return db.automationRule.update({ where: { id }, data: { active } });
}

export async function deleteAutomation(storeId: string, id: string) {
  const rule = await db.automationRule.findFirst({ where: { id, storeId }, select: { id: true, trigger: true } });
  if (!rule) throw new MarketingError("Automation not found");
  if (rule.trigger === "abandoned_checkout" && (await db.automationRule.count({ where: { storeId, trigger: "abandoned_checkout" } })) === 1) {
    throw new MarketingError("Your shop keeps one abandoned-cart flow. Switch it off instead of deleting it.");
  }
  await db.automationEnrollment.updateMany({ where: { automationId: id, status: "active" }, data: { status: "exited", exitReason: "The flow was deleted", nextRunAt: null } });
  await db.automationRule.delete({ where: { id } });
}

export async function listAutomations(storeId: string, since = new Date(Date.now() - 30 * 86_400_000)) {
  const [rules, enrollments, sends] = await Promise.all([
    db.automationRule.findMany({ where: { storeId }, orderBy: { createdAt: "asc" } }),
    db.automationEnrollment.groupBy({ by: ["automationId", "status"], where: { storeId }, _count: true }),
    db.automationLog.groupBy({ by: ["automationId"], where: { storeId, status: "ok", stepType: { in: ["send_email", "send_sms", "send_whatsapp", "request_review"] }, createdAt: { gte: since } }, _count: true }),
  ]);
  return rules.map((rule) => {
    const flow = parseFlowConfig(rule.actionConfig, rule);
    const counts = enrollments.filter((row) => row.automationId === rule.id);
    const preset = rule.actionConfig && typeof rule.actionConfig === "object" ? (rule.actionConfig as Record<string, unknown>).preset : null;
    return {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      trigger: rule.trigger as FlowTrigger,
      active: rule.active,
      preset: typeof preset === "string" ? preset : null,
      steps: flow.steps,
      settings: flow.settings,
      messages: countMessages(flow.steps),
      inFlow: counts.find((row) => row.status === "active")?._count ?? 0,
      total: counts.reduce((sum, row) => sum + row._count, 0),
      sent30d: sends.find((row) => row.automationId === rule.id)?._count ?? 0,
      lastTriggeredAt: rule.lastTriggeredAt,
    };
  });
}
