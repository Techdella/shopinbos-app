import "server-only";

import { graph, graphBase } from "@/lib/whatsapp-catalog/graph";
import { metaTemplatePayload, templateImageUrl, type WhatsAppTemplate } from "./whatsapp-content";

// Shopinbos's own WhatsApp number on Meta's Cloud API, for messages to website leads (Admin › Leads › WhatsApp).
// No third-party provider: templates are submitted to and sent from our own WhatsApp Business Account.
//
//   WHATSAPP_LEADS_TOKEN            a System User token with whatsapp_business_messaging + whatsapp_business_management
//   WHATSAPP_LEADS_PHONE_NUMBER_ID  the sending number's id (WhatsApp Manager › Phone numbers)
//   WHATSAPP_LEADS_WABA_ID          the WhatsApp Business Account id (needed to submit and list templates)
//   META_APP_ID                     the Meta app the token belongs to (template images are uploaded through it);
//                                   WHATSAPP_LEADS_APP_ID overrides it
//
// The token and number fall back to WHATSAPP_OTP_TOKEN / WHATSAPP_OTP_PHONE_NUMBER_ID, so the number that sends
// sign-in codes can send lead messages too.

export type MetaWhatsAppConfig = { token: string; phoneNumberId: string; wabaId: string; appId: string };

const clean = (value: string | undefined) => (value ?? "").trim();

export function metaWhatsAppConfig(env: Record<string, string | undefined> = process.env): MetaWhatsAppConfig | null {
  const token = clean(env.WHATSAPP_LEADS_TOKEN) || clean(env.WHATSAPP_OTP_TOKEN);
  const phoneNumberId = (clean(env.WHATSAPP_LEADS_PHONE_NUMBER_ID) || clean(env.WHATSAPP_OTP_PHONE_NUMBER_ID)).replace(/\D/g, "");
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    wabaId: clean(env.WHATSAPP_LEADS_WABA_ID).replace(/\D/g, ""),
    appId: (clean(env.WHATSAPP_LEADS_APP_ID) || clean(env.META_APP_ID)).replace(/\D/g, ""),
  };
}

export type MetaSendResult = { ok: true; id: string | null } | { ok: false; error: string };

/** E.164 without the plus, as the Cloud API wants it. */
const toWaId = (phone: string) => phone.replace(/\D/g, "");

export async function sendMetaTemplate(config: MetaWhatsAppConfig, input: { to: string; template: string; language: string; params: string[]; headerImage?: string | null }): Promise<MetaSendResult> {
  const result = await graph(`${config.phoneNumberId}/messages`, config.token, {
    body: {
      messaging_product: "whatsapp",
      to: toWaId(input.to),
      type: "template",
      template: {
        name: input.template,
        language: { code: input.language || "en" },
        components: [
          ...(input.headerImage ? [{ type: "header", parameters: [{ type: "image", image: { link: input.headerImage } }] }] : []),
          ...(input.params.length ? [{ type: "body", parameters: input.params.map((text) => ({ type: "text", text })) }] : []),
        ],
      },
    },
    timeoutMs: 15_000,
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  const messages = result.json.messages as Array<{ id?: string }> | undefined;
  return { ok: true, id: messages?.[0]?.id ?? null };
}

/** Free text: only reaches people who messaged the number in the last 24 hours. */
export async function sendMetaText(config: MetaWhatsAppConfig, input: { to: string; text: string }): Promise<MetaSendResult> {
  const result = await graph(`${config.phoneNumberId}/messages`, config.token, {
    body: { messaging_product: "whatsapp", to: toWaId(input.to), type: "text", text: { body: input.text.slice(0, 4096), preview_url: true } },
    timeoutMs: 15_000,
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  const messages = result.json.messages as Array<{ id?: string }> | undefined;
  return { ok: true, id: messages?.[0]?.id ?? null };
}

export type PhoneInfo = { ok: true; number: string; name: string; quality: string; status: string } | { ok: false; error: string };

export async function metaPhoneInfo(config: MetaWhatsAppConfig): Promise<PhoneInfo> {
  const result = await graph(config.phoneNumberId, config.token, { query: { fields: "display_phone_number,verified_name,quality_rating,code_verification_status" }, timeoutMs: 10_000 });
  if (!result.ok) return { ok: false, error: result.error.message };
  const json = result.json as Record<string, string | undefined>;
  return { ok: true, number: json.display_phone_number ?? "", name: json.verified_name ?? "", quality: json.quality_rating ?? "UNKNOWN", status: json.code_verification_status ?? "" };
}

export type MetaTemplateStatus = { name: string; language: string; status: string; category: string; reason: string | null };

/** Every template on the WABA (name → status), paged. */
export async function metaTemplates(config: MetaWhatsAppConfig): Promise<{ ok: true; templates: MetaTemplateStatus[] } | { ok: false; error: string }> {
  if (!config.wabaId) return { ok: false, error: "Set WHATSAPP_LEADS_WABA_ID to list and submit templates." };
  const templates: MetaTemplateStatus[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const result = await graph(`${config.wabaId}/message_templates`, config.token, { query: { fields: "name,language,status,category,rejected_reason", limit: "200", ...(after ? { after } : {}) }, timeoutMs: 15_000 });
    if (!result.ok) return { ok: false, error: result.error.message };
    const data = (result.json.data as Array<Record<string, string>>) ?? [];
    for (const row of data) templates.push({ name: row.name, language: row.language, status: row.status, category: row.category, reason: row.rejected_reason && row.rejected_reason !== "NONE" ? row.rejected_reason : null });
    const paging = result.json.paging as { cursors?: { after?: string }; next?: string } | undefined;
    if (!paging?.next || !paging.cursors?.after) break;
    after = paging.cursors.after;
  }
  return { ok: true, templates };
}

/**
 * Meta wants a sample of a template's header image, uploaded through the app's Resumable Upload API: start a session
 * on /{app-id}/uploads, send the bytes, get back a handle for example.header_handle.
 */
async function uploadHeaderSample(config: MetaWhatsAppConfig, imageUrl: string): Promise<{ ok: true; handle: string } | { ok: false; error: string }> {
  if (!config.appId) return { ok: false, error: "Set META_APP_ID (or WHATSAPP_LEADS_APP_ID) so template images can be uploaded to Meta." };
  const image = await fetch(imageUrl, { cache: "no-store", signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!image?.ok) return { ok: false, error: `Couldn't load the template image (${imageUrl}).` };
  const bytes = Buffer.from(await image.arrayBuffer());
  const type = image.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const session = await graph(`${config.appId}/uploads`, config.token, {
    method: "POST",
    query: { file_name: imageUrl.split("/").pop() ?? "header.jpg", file_length: String(bytes.length), file_type: type },
    timeoutMs: 20_000,
  });
  if (!session.ok) return { ok: false, error: `Meta upload: ${session.error.message}` };
  const uploadId = String(session.json.id ?? "");
  const sent = await fetch(`${graphBase()}/${uploadId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${config.token}`, file_offset: "0", "Content-Type": "application/octet-stream" },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  const json = ((await sent?.json().catch(() => null)) ?? {}) as { h?: string; error?: { message?: string } };
  if (!sent?.ok || !json.h) return { ok: false, error: `Meta upload: ${json.error?.message ?? "no handle returned"}` };
  return { ok: true, handle: json.h };
}

export async function submitMetaTemplate(config: MetaWhatsAppConfig, template: WhatsAppTemplate): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  if (!config.wabaId) return { ok: false, error: "Set WHATSAPP_LEADS_WABA_ID to submit templates." };
  const sample = await uploadHeaderSample(config, templateImageUrl(template));
  if (!sample.ok) return sample;
  const result = await graph(`${config.wabaId}/message_templates`, config.token, { body: metaTemplatePayload(template, sample.handle), timeoutMs: 20_000 });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, status: String(result.json.status ?? "PENDING") };
}
