import "server-only";

import { graph } from "@/lib/whatsapp-catalog/graph";
import { metaTemplates, metaWhatsAppConfig, sendMetaTemplate, sendMetaText, type MetaSendResult } from "@/lib/lead-growth/whatsapp-meta.server";
import { verifyMetaSignature } from "@/lib/inbox/pure";
import { db } from "@/lib/db/client";
import { TEAM_TEMPLATES, metaTeamTemplatePayload, readCustomTemplate, teamTemplateParams, type TeamTemplate, type TeamTemplateValues } from "./whatsapp-pure";
import { WHATSAPP_MAX_ATTACHMENT_BYTES } from "./pure";

// Templates the team writes in Admin › Inbox › WhatsApp templates, kept in PlatformSetting.
const CUSTOM_KEY = "inbox.whatsapp_templates";

export async function customTemplates(): Promise<TeamTemplate[]> {
  const row = await db.platformSetting.findUnique({ where: { key: CUSTOM_KEY } }).catch(() => null);
  return (Array.isArray(row?.value) ? row.value : []).map(readCustomTemplate).filter((t): t is TeamTemplate => t !== null);
}

/** Built-in templates first, then the team's own. */
export async function allTeamTemplates(): Promise<TeamTemplate[]> {
  return [...TEAM_TEMPLATES, ...(await customTemplates())];
}

export async function findTeamTemplate(name: string | null | undefined) {
  return (await allTeamTemplates()).find((t) => t.name === name) ?? null;
}

async function writeCustom(list: TeamTemplate[], userId: string) {
  const value = list.map(({ custom: _custom, ...rest }) => rest);
  await db.platformSetting.upsert({ where: { key: CUSTOM_KEY }, create: { key: CUSTOM_KEY, value, updatedById: userId }, update: { value, updatedById: userId } });
}

/** Saves a new template and sends it to Meta for approval. */
export async function addCustomTemplate(template: TeamTemplate, userId: string): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const list = await customTemplates();
  if (list.some((t) => t.name === template.name)) return { ok: false, error: "A template with that name already exists. Pick another name." };
  const submitted = await submitTeamTemplate(template);
  if (!submitted.ok) return submitted;
  await writeCustom([...list, template], userId);
  return submitted;
}

/** Removes a team template here and on Meta. */
export async function deleteCustomTemplate(name: string, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const list = await customTemplates();
  if (!list.some((t) => t.name === name)) return { ok: false, error: "Only templates the team wrote can be deleted." };
  const config = inboxWhatsAppConfig();
  if (config?.wabaId) {
    const result = await graph(`${config.wabaId}/message_templates`, config.token, { method: "DELETE", query: { name }, timeoutMs: 15_000 });
    // Never submitted (or already gone on Meta): still remove it here.
    if (!result.ok && !/does not exist|not found/i.test(result.error.message)) return { ok: false, error: `Meta: ${result.error.message}` };
  }
  await writeCustom(list.filter((t) => t.name !== name), userId);
  return { ok: true };
}

/** Sends one template to Meta for approval. */
export async function submitTeamTemplate(template: TeamTemplate): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const config = inboxWhatsAppConfig();
  if (!config?.wabaId) return { ok: false, error: "Connect the WhatsApp number first (WHATSAPP_LEADS_TOKEN, WHATSAPP_LEADS_PHONE_NUMBER_ID, WHATSAPP_LEADS_WABA_ID)." };
  const result = await graph(`${config.wabaId}/message_templates`, config.token, { body: metaTeamTemplatePayload(template), timeoutMs: 20_000 });
  return result.ok ? { ok: true, status: String(result.json.status ?? "PENDING") } : { ok: false, error: result.error.message };
}

// Shopinbos's own WhatsApp number in the admin inbox (Admin › Inbox). It is the number the lead sequences send
// from (WHATSAPP_LEADS_*, src/lib/lead-growth/whatsapp-meta.server.ts): replies to those messages, and anyone who
// messages +1 711-695-1381, come in through /api/webhooks/whatsapp and land in the inbox as conversations.
//
// For Meta to send those messages here, the WhatsApp Business Account must be subscribed to the Meta app whose
// webhook points at https://app.shopinbos.com/api/webhooks/whatsapp ("messages" field). The Connect button on
// Admin › Leads › WhatsApp does the subscription. Deliveries are signed with that app's secret: META_APP_SECRET,
// or WHATSAPP_LEADS_APP_SECRET when the number is on a different app.

export function inboxWhatsAppConfig() {
  return metaWhatsAppConfig();
}

/** Is this phone_number_id (from a webhook) our own inbox number? */
export function isInboxWhatsAppNumber(phoneNumberId: string) {
  const config = inboxWhatsAppConfig();
  return Boolean(config && phoneNumberId && config.phoneNumberId === phoneNumberId.replace(/\D/g, ""));
}

/** The webhook's signature, checked against the platform app secret or the inbox number's own app secret. */
export function inboxSignatureOk(raw: string, signature: string | null) {
  return [process.env.META_APP_SECRET, process.env.WHATSAPP_LEADS_APP_SECRET].some((secret) => Boolean(secret) && verifyMetaSignature(raw, signature, secret));
}

const NOT_CONNECTED: MetaSendResult = { ok: false, error: "The WhatsApp number isn't connected. Set WHATSAPP_LEADS_TOKEN and WHATSAPP_LEADS_PHONE_NUMBER_ID." };

export async function sendInboxText(to: string, text: string): Promise<MetaSendResult> {
  const config = inboxWhatsAppConfig();
  if (!config) return NOT_CONNECTED;
  return sendMetaText(config, { to, text });
}

export async function sendInboxTemplate(to: string, template: TeamTemplate, values: TeamTemplateValues): Promise<MetaSendResult> {
  const config = inboxWhatsAppConfig();
  if (!config) return NOT_CONNECTED;
  return sendMetaTemplate(config, { to, template: template.name, language: template.language, params: teamTemplateParams(template, values) });
}

/** A photo, voice note, video, sticker or document someone sent, fetched from Meta so the inbox can show it. */
export async function downloadInboxMedia(mediaId: string, name: string | null, contentType: string | null): Promise<File | null> {
  const config = inboxWhatsAppConfig();
  if (!config || !mediaId) return null;
  const meta = await graph(mediaId, config.token, { timeoutMs: 10_000 }).catch(() => null);
  const url = meta?.ok ? String(meta.json.url ?? "") : "";
  if (!url) return null;
  // Too big to keep: not downloaded at all (the message says to open WhatsApp for it).
  if (Number(meta?.json.file_size) > WHATSAPP_MAX_ATTACHMENT_BYTES) return null;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(45_000), cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  const type = (contentType || response.headers.get("content-type") || "application/octet-stream").split(";")[0]!;
  const extension = type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
  return new File([await response.arrayBuffer()], name || `whatsapp-${mediaId}.${extension}`, { type });
}

export type InboxWhatsAppStatus = {
  connected: boolean;
  wabaSubscribed: boolean | null;
  templates: Array<{ name: string; purpose: string; status: string | null; reason: string | null; custom: boolean }>;
  error: string | null;
};

/** For Admin › Leads › WhatsApp: is the inbox receiving, and are the team's templates approved? */
export async function inboxWhatsAppStatus(): Promise<InboxWhatsAppStatus> {
  const config = inboxWhatsAppConfig();
  const all = await allTeamTemplates();
  if (!config) return { connected: false, wabaSubscribed: null, templates: all.map((t) => ({ name: t.name, purpose: t.purpose, status: null, reason: null, custom: Boolean(t.custom) })), error: null };
  const [subscribed, listed] = await Promise.all([
    config.wabaId ? graph(`${config.wabaId}/subscribed_apps`, config.token, { timeoutMs: 10_000 }).catch(() => null) : Promise.resolve(null),
    metaTemplates(config).catch(() => null),
  ]);
  const statuses = listed?.ok ? listed.templates : [];
  return {
    connected: true,
    wabaSubscribed: subscribed?.ok ? ((subscribed.json.data as unknown[] | undefined)?.length ?? 0) > 0 : null,
    templates: all.map((t) => {
      const found = statuses.find((s) => s.name === t.name && s.language === t.language);
      return { name: t.name, purpose: t.purpose, status: found?.status ?? null, reason: found?.reason ?? null, custom: Boolean(t.custom) };
    }),
    error: listed && !listed.ok ? listed.error : null,
  };
}

/** Subscribes the WhatsApp Business Account to the token's app, so incoming messages reach the webhook. */
export async function connectInboxWebhook(): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = inboxWhatsAppConfig();
  if (!config) return { ok: false, error: "The WhatsApp number isn't connected. Set WHATSAPP_LEADS_TOKEN and WHATSAPP_LEADS_PHONE_NUMBER_ID." };
  if (!config.wabaId) return { ok: false, error: "Set WHATSAPP_LEADS_WABA_ID first." };
  const result = await graph(`${config.wabaId}/subscribed_apps`, config.token, { method: "POST", timeoutMs: 15_000 });
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

/** Sends the team templates Meta doesn't have yet for approval. */
export async function submitTeamTemplates(): Promise<{ submitted: number; failures: string[] }> {
  const config = inboxWhatsAppConfig();
  if (!config?.wabaId) return { submitted: 0, failures: ["Set WHATSAPP_LEADS_WABA_ID to submit templates."] };
  const existing = await metaTemplates(config);
  if (!existing.ok) return { submitted: 0, failures: [existing.error] };
  const have = new Set(existing.templates.map((t) => `${t.name}:${t.language}`));
  const failures: string[] = [];
  let submitted = 0;
  for (const template of (await allTeamTemplates()).filter((t) => !have.has(`${t.name}:${t.language}`))) {
    const result = await submitTeamTemplate(template);
    if (result.ok) submitted += 1;
    else failures.push(`${template.name}: ${result.error}`);
  }
  return { submitted, failures };
}
