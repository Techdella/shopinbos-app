import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { getChannel } from "@/lib/inbox/service";
import { readJson } from "@/lib/inbox/channels/types";
import { whatsappError, whatsappGraphBase } from "@/lib/inbox/channels/whatsapp";
import { MarketingError } from "./segments";
import {
  TEMPLATE_PRESETS,
  TEMPLATE_VARIABLES,
  fillTemplateVariables,
  fromMetaComponents,
  presetTemplate,
  readTemplateContent,
  readVariables,
  renderTemplateText,
  templateMessage,
  templateProblems,
  toMetaComponents,
  variableCount,
  type TemplateCategory,
  type TemplateContent,
  type VariableValues,
} from "./text-channels";
import type { SendOutcome, TextSender } from "./channels";

// WhatsApp message templates on the store's own WhatsApp Business Account (WABA). Marketing and utility messages
// outside the 24-hour window must use a template Meta has approved. Drafts live here; "Submit" sends them to
// POST /{WABA_ID}/message_templates; "Sync" reads every template's status (and rejection reason) back with
// GET /{WABA_ID}/message_templates. Credentials come from the store's connected WhatsApp channel (Inbox ›
// Chatbot › WhatsApp, Embedded Signup or manual): accessToken + phoneNumberId + wabaId.

export interface WabaAccess {
  wabaId: string;
  accessToken: string;
  phoneNumberId: string;
}

/** The store's WABA, or a readable reason it can't manage templates. */
export async function wabaAccess(storeId: string): Promise<{ ok: true; access: WabaAccess } | { ok: false; error: string }> {
  const channel = await getChannel(storeId, "whatsapp").catch(() => null);
  if (!channel) return { ok: false, error: "Connect your WhatsApp Business number first (Inbox › Chatbot › WhatsApp)." };
  const settings = (channel.row.settings ?? {}) as Record<string, unknown>;
  const wabaId = channel.credentials.wabaId || (typeof settings.wabaId === "string" ? settings.wabaId : "");
  if (!wabaId) return { ok: false, error: "Your WhatsApp connection has no WhatsApp Business Account ID. Reconnect WhatsApp with Embedded Signup, or add the account ID in Inbox › Channels." };
  if (!channel.credentials.accessToken) return { ok: false, error: "Your WhatsApp token is missing. Reconnect WhatsApp in Inbox › Chatbot › WhatsApp." };
  return { ok: true, access: { wabaId, accessToken: channel.credentials.accessToken, phoneNumberId: channel.credentials.phoneNumberId ?? "" } };
}

async function requireWaba(storeId: string) {
  const result = await wabaAccess(storeId);
  if (!result.ok) throw new MarketingError(result.error);
  return result.access;
}

export interface TemplateInput {
  name: string;
  language: string;
  category: TemplateCategory;
  content: TemplateContent;
  variables: string[];
  preset?: string | null;
}

function shape(row: Awaited<ReturnType<typeof db.whatsAppTemplate.findFirstOrThrow>>) {
  return { ...row, content: readTemplateContent(row.components), variables: readVariables(row.variables) };
}

export type WhatsAppTemplateView = ReturnType<typeof shape>;

export async function listWhatsAppTemplates(storeId: string) {
  const rows = await db.whatsAppTemplate.findMany({ where: { storeId }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
  return rows.map(shape);
}

export async function approvedTemplates(storeId: string) {
  return (await listWhatsAppTemplates(storeId)).filter((t) => t.status === "APPROVED");
}

/** An approved template by id, or (for ready-made flows) "preset:<key>" → the store's approved template from that preset. */
export async function resolveTemplate(storeId: string, ref: string | null | undefined) {
  if (!ref) return null;
  const row = ref.startsWith("preset:")
    ? await db.whatsAppTemplate.findFirst({ where: { storeId, preset: ref.slice(7), status: "APPROVED" }, orderBy: { updatedAt: "desc" } })
    : await db.whatsAppTemplate.findFirst({ where: { id: ref, storeId } });
  return row ? shape(row) : null;
}

function check(input: TemplateInput) {
  const problems = templateProblems(input);
  if (problems.length) throw new MarketingError(problems[0]);
}

export async function saveWhatsAppTemplate(storeId: string, id: string | null, input: TemplateInput) {
  check(input);
  const data = {
    name: input.name,
    language: input.language,
    category: input.category,
    components: input.content as unknown as Prisma.InputJsonValue,
    variables: input.variables as unknown as Prisma.InputJsonValue,
    ...(input.preset !== undefined ? { preset: input.preset } : {}),
  };
  if (id) {
    const existing = await db.whatsAppTemplate.findFirst({ where: { id, storeId } });
    if (!existing) throw new MarketingError("Template not found");
    // After submission Meta owns the wording; only the variable mapping (ours) can change.
    if (existing.status !== "DRAFT" && existing.status !== "LOCAL_ERROR" && existing.status !== "REJECTED") {
      return shape(await db.whatsAppTemplate.update({ where: { id }, data: { variables: data.variables } }));
    }
    return shape(await db.whatsAppTemplate.update({ where: { id }, data: { ...data, status: "DRAFT", rejectedReason: null } }));
  }
  const clash = await db.whatsAppTemplate.findFirst({ where: { storeId, name: input.name, language: input.language }, select: { id: true } });
  if (clash) throw new MarketingError(`You already have a template called ${input.name} in this language. Pick another name.`);
  return shape(await db.whatsAppTemplate.create({ data: { storeId, ...data, status: "DRAFT" } }));
}

/** Creates a draft from a ready-made template (order confirmation, shipped, …), renaming it if the name is taken. */
export async function draftFromPreset(storeId: string, key: string) {
  const preset = presetTemplate(key);
  if (!preset) throw new MarketingError(`Unknown ready-made template. Pick one of: ${TEMPLATE_PRESETS.map((p) => p.key).join(", ")}`);
  let name = preset.name;
  for (let i = 2; await db.whatsAppTemplate.findFirst({ where: { storeId, name, language: "en" }, select: { id: true } }); i++) name = `${preset.name}_${i}`;
  return saveWhatsAppTemplate(storeId, null, { name, language: "en", category: preset.category, content: preset.content, variables: [...preset.variables], preset: preset.key });
}

/**
 * Meta needs a sample image for an image header, uploaded through the Resumable Upload API to get a handle.
 * Uses the platform app (META_APP_ID) and the store's token.
 */
async function uploadHeaderSample(accessToken: string, imageUrl: string): Promise<string> {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new MarketingError("Image headers need META_APP_ID on the server to upload the sample image. Use a text header or none for now.");
  const image = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!image?.ok) throw new MarketingError("Couldn't download the sample image for the header.");
  const type = image.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  if (!/^image\/(jpeg|png)$/.test(type)) throw new MarketingError("The header image must be a JPG or PNG.");
  const bytes = Buffer.from(await image.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) throw new MarketingError("The header image must be under 5 MB.");
  const base = whatsappGraphBase();
  const session = await fetch(`${base}/${encodeURIComponent(appId)}/uploads?file_length=${bytes.length}&file_type=${encodeURIComponent(type)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const sessionJson = session ? await readJson(session) : {};
  if (!session?.ok || typeof sessionJson.id !== "string") throw new MarketingError(whatsappError(sessionJson, "Meta didn't accept the header image upload."));
  const upload = await fetch(`${base}/${sessionJson.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${accessToken}`, file_offset: "0", "Content-Type": type },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  const uploadJson = upload ? await readJson(upload) : {};
  if (!upload?.ok || typeof uploadJson.h !== "string") throw new MarketingError(whatsappError(uploadJson, "Meta didn't accept the header image upload."));
  return uploadJson.h;
}

async function sampleImage(storeId: string) {
  const product = await db.storeProduct.findFirst({ where: { storeId, status: "published", images: { isEmpty: false } }, orderBy: { soldStock: "desc" }, select: { images: true } }).catch(() => null);
  const url = product?.images.find((src) => /^https:\/\//.test(src));
  return url ?? null;
}

/** Sends a draft (or a rejected template after editing) to Meta for review. */
export async function submitWhatsAppTemplate(storeId: string, id: string, options: { headerImageUrl?: string | null } = {}) {
  const row = await db.whatsAppTemplate.findFirst({ where: { id, storeId } });
  if (!row) throw new MarketingError("Template not found");
  if (row.status === "PENDING" || row.status === "APPROVED") throw new MarketingError(row.status === "PENDING" ? "Meta is already reviewing this template." : "This template is already approved.");
  const template = shape(row);
  check({ name: row.name, language: row.language, category: row.category as TemplateCategory, content: template.content, variables: template.variables });
  const access = await requireWaba(storeId);

  let handle: string | null = null;
  if (template.content.header.format === "IMAGE") {
    const sample = options.headerImageUrl || (await sampleImage(storeId));
    if (!sample) throw new MarketingError("Image headers need a sample picture. Add a product photo to your shop first, or choose a text header.");
    handle = await uploadHeaderSample(access.accessToken, sample);
  }

  const body = { name: row.name, language: row.language, category: row.category, components: toMetaComponents(template.content, template.variables, handle) };
  const res = await fetch(`${whatsappGraphBase()}/${encodeURIComponent(access.wabaId)}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res) throw new MarketingError("Couldn't reach Meta to submit the template. Try again.");
  const json = await readJson(res);
  if (!res.ok) {
    const error = whatsappError(json, "Meta didn't accept the template.");
    await db.whatsAppTemplate.update({ where: { id }, data: { status: "LOCAL_ERROR", rejectedReason: error.slice(0, 500) } });
    throw new MarketingError(error);
  }
  const status = typeof json.status === "string" ? json.status.toUpperCase() : "PENDING";
  return shape(
    await db.whatsAppTemplate.update({
      where: { id },
      data: { metaId: typeof json.id === "string" ? json.id : row.metaId, status, category: typeof json.category === "string" ? json.category.toUpperCase() : row.category, rejectedReason: null, submittedAt: new Date(), syncedAt: new Date() },
    }),
  );
}

interface MetaTemplate {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  rejected_reason?: string;
  components?: unknown;
}

/**
 * Reads every template on the WABA (paged) and brings statuses here: approved, pending, rejected (with Meta's
 * reason), paused or disabled. Templates made in WhatsApp Manager are added too, so they can be used here.
 */
export async function syncWhatsAppTemplates(storeId: string) {
  const access = await requireWaba(storeId);
  const remote: MetaTemplate[] = [];
  let url: string | null = `${whatsappGraphBase()}/${encodeURIComponent(access.wabaId)}/message_templates?fields=id,name,language,status,category,rejected_reason,components&limit=100`;
  for (let page = 0; url && page < 10; page++) {
    const res: Response | null = await fetch(url, { headers: { Authorization: `Bearer ${access.accessToken}` }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!res) throw new MarketingError("Couldn't reach Meta to sync templates. Try again.");
    const json = await readJson(res);
    if (!res.ok) throw new MarketingError(whatsappError(json, "Meta didn't return your templates."));
    remote.push(...((json.data as MetaTemplate[] | undefined) ?? []));
    const next = ((json.paging as Record<string, unknown> | undefined)?.next as string | undefined) ?? null;
    url = next && next.startsWith(whatsappGraphBase()) ? next : null;
  }

  const now = new Date();
  let updated = 0;
  let added = 0;
  for (const t of remote) {
    if (!t.name || !t.language) continue;
    const status = String(t.status ?? "PENDING").toUpperCase();
    const reason = t.rejected_reason && t.rejected_reason !== "NONE" ? String(t.rejected_reason) : null;
    const existing = await db.whatsAppTemplate.findFirst({ where: { storeId, OR: [...(t.id ? [{ metaId: t.id }] : []), { name: t.name, language: t.language }] } });
    if (existing) {
      await db.whatsAppTemplate.update({ where: { id: existing.id }, data: { metaId: t.id ?? existing.metaId, status, rejectedReason: status === "REJECTED" ? reason ?? "Meta didn't give a reason" : null, category: t.category ? t.category.toUpperCase() : existing.category, syncedAt: now } });
      updated++;
    } else {
      const content = fromMetaComponents(t.components);
      await db.whatsAppTemplate.create({
        data: { storeId, name: t.name, language: t.language, category: String(t.category ?? "MARKETING").toUpperCase(), components: content as unknown as Prisma.InputJsonValue, variables: [], status, rejectedReason: status === "REJECTED" ? reason : null, metaId: t.id ?? null, syncedAt: now },
      });
      added++;
    }
  }
  // Templates we think are at Meta but Meta no longer lists were deleted in WhatsApp Manager.
  const names = new Set(remote.map((t) => `${t.name}|${t.language}`));
  const gone = await db.whatsAppTemplate.findMany({ where: { storeId, metaId: { not: null }, status: { notIn: ["DRAFT", "LOCAL_ERROR"] } }, select: { id: true, name: true, language: true } });
  let removed = 0;
  for (const row of gone) {
    if (names.has(`${row.name}|${row.language}`)) continue;
    await db.whatsAppTemplate.update({ where: { id: row.id }, data: { status: "DRAFT", metaId: null, rejectedReason: "Deleted in WhatsApp Manager. Submit it again to use it.", syncedAt: now } });
    removed++;
  }
  return { updated, added, removed, total: remote.length };
}

export async function deleteWhatsAppTemplate(storeId: string, id: string) {
  const row = await db.whatsAppTemplate.findFirst({ where: { id, storeId } });
  if (!row) throw new MarketingError("Template not found");
  if (row.metaId) {
    // Deleting at Meta too; if that fails (already gone), keep going.
    const access = await wabaAccess(storeId);
    if (access.ok) {
      const res = await fetch(`${whatsappGraphBase()}/${encodeURIComponent(access.access.wabaId)}/message_templates?name=${encodeURIComponent(row.name)}&hsm_id=${encodeURIComponent(row.metaId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${access.access.accessToken}` },
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      if (res && !res.ok) {
        const json = await readJson(res);
        const code = Number(((json.error ?? {}) as { code?: number }).code);
        if (code !== 100) throw new MarketingError(whatsappError(json, "Meta didn't delete the template."));
      }
    }
  }
  await db.whatsAppTemplate.delete({ where: { id } });
}

/** A picture for an image-header template when the sender didn't pick one: the store's best-selling product photo. */
export async function defaultHeaderImage(storeId: string) {
  return sampleImage(storeId);
}

/**
 * Sends an approved template to one person: {{1}}..{{n}} from `mapping` (or the template's own default mapping)
 * filled with this person's values. Returns the text they'll read, for logs and the inbox.
 */
export async function sendTemplate(
  sender: TextSender,
  template: WhatsAppTemplateView,
  to: string,
  input: { mapping?: string[] | null; values: VariableValues; headerImageUrl?: string | null },
): Promise<SendOutcome & { text?: string }> {
  if (template.status !== "APPROVED") return { ok: false, error: `The WhatsApp template "${template.name}" isn't approved (${template.status.toLowerCase()}).` };
  const mapping = input.mapping?.some(Boolean) ? input.mapping : template.variables;
  const count = variableCount(template.content);
  const { params } = fillTemplateVariables(mapping, count, input.values);
  if (template.content.header.format === "IMAGE" && !input.headerImageUrl) return { ok: false, error: `The template "${template.name}" has an image header: pick an image or a product.` };
  const message = templateMessage({ name: template.name, language: template.language, params, headerImageUrl: template.content.header.format === "IMAGE" ? input.headerImageUrl : null });
  const result = await sender.whatsappTemplate(to, message);
  return result.ok ? { ...result, text: renderTemplateText(template.content, params) } : result;
}

/**
 * Peggy writing a WhatsApp template from the seller's words ("a template for our weekend sale with a code").
 * Returns a draft for the form (nothing is saved). Without an AI key, the closest ready-made template.
 */
export async function draftTemplateWithPeggy(storeId: string, instruction: string, category: TemplateCategory) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true, description: true } });
  const keys = Object.keys(TEMPLATE_VARIABLES).join(", ");
  const result = await aiText({
    fast: true,
    maxTokens: 900,
    system:
      `You write WhatsApp message templates for ${store?.name ?? "a small shop"} in Nigeria, to be approved by Meta. Warm, clear Nigerian English, under 400 characters, no emojis in the first line. ` +
      `Category ${category}: ${category === "UTILITY" ? "only about a specific order or account (no promotion at all)" : "promotional"}. ` +
      "Use numbered variables {{1}}, {{2}}… in order, never at the very start or end of the message, never two side by side. " +
      `Each variable is one of: ${keys}. Never invent prices, discounts or policies. ` +
      'Answer with JSON only: {"name":"lowercase_with_underscores","header":"short header or empty","body":"…","footer":"short footer or empty","variables":["first_name",…]}',
    prompt: `The seller asks: ${instruction}`,
  }).catch(() => null);
  const json = firstJsonObject(result?.text ?? null);
  if (json && typeof json.body === "string") {
    const header = typeof json.header === "string" ? json.header.trim().slice(0, 60) : "";
    const footer = typeof json.footer === "string" ? json.footer.trim().slice(0, 60) : "";
    return {
      ai: true,
      name: typeof json.name === "string" ? json.name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 60) : "",
      category,
      content: { header: header ? { format: "TEXT" as const, text: header } : { format: "NONE" as const }, body: json.body.slice(0, 1024), ...(footer ? { footer } : {}), buttons: category === "MARKETING" ? [{ type: "QUICK_REPLY" as const, text: "Stop promotions" }] : [] },
      variables: Array.isArray(json.variables) ? json.variables.map(String).slice(0, 20) : [],
    };
  }
  const words = instruction.toLowerCase();
  const preset =
    TEMPLATE_PRESETS.find((p) => words.includes(p.key.replace(/_/g, " ")) || words.includes(p.title.toLowerCase())) ??
    TEMPLATE_PRESETS.find((p) => (/ship|deliver|track/.test(words) ? p.key === "order_shipped" : /cart/.test(words) ? p.key === "abandoned_cart" : /stock/.test(words) ? p.key === "back_in_stock" : p.key === (category === "UTILITY" ? "order_confirmation" : "promo")))!;
  return { ai: false, name: preset.name, category: preset.category, content: preset.content, variables: [...preset.variables] };
}
