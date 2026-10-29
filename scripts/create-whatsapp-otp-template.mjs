#!/usr/bin/env node
// Creates (or checks) the WhatsApp authentication template Shopinbos uses for sign-in codes on its own WhatsApp
// Business number (Meta Cloud API). Run once; Meta usually approves authentication templates within minutes.
//
//   WHATSAPP_OTP_WABA_ID=…  WHATSAPP_OTP_TOKEN=…  [WHATSAPP_OTP_PHONE_NUMBER_ID=…]  node scripts/create-whatsapp-otp-template.mjs
//   … node scripts/create-whatsapp-otp-template.mjs --status      only report the template's status
//
// WHATSAPP_OTP_WABA_ID     the WhatsApp Business Account id (WhatsApp Manager → Account tools → Phone numbers, or
//                          Business Settings → Accounts → WhatsApp accounts).
// WHATSAPP_OTP_TOKEN       a System User token with whatsapp_business_management + whatsapp_business_messaging.
// AUTH_OTP_WHATSAPP_TEMPLATE       template name (default shopinbos_login_code).
// AUTH_OTP_WHATSAPP_TEMPLATE_LANG  language code (default en).
// META_GRAPH_VERSION               default v21.0.
//
// Meta fixes the wording of authentication templates: "*123456* is your verification code. For your security, do
// not share this code." with a "Copy code" button and "This code expires in 10 minutes."

const env = process.env;
const waba = (env.WHATSAPP_OTP_WABA_ID ?? "").trim();
const token = (env.WHATSAPP_OTP_TOKEN ?? "").trim();
const phoneId = (env.WHATSAPP_OTP_PHONE_NUMBER_ID ?? "").trim();
const name = (env.AUTH_OTP_WHATSAPP_TEMPLATE ?? "").trim() || "shopinbos_login_code";
const language = (env.AUTH_OTP_WHATSAPP_TEMPLATE_LANG ?? "").trim() || "en";
const graph = `https://graph.facebook.com/${(env.META_GRAPH_VERSION ?? "").trim() || "v21.0"}`;
const statusOnly = process.argv.includes("--status");

if (!waba || !token) {
  console.error("❌ Set WHATSAPP_OTP_WABA_ID and WHATSAPP_OTP_TOKEN first (see the comment at the top of this file).");
  process.exit(1);
}

async function call(path, init = {}) {
  const res = await fetch(`${graph}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json;
}

if (phoneId) {
  try {
    const number = await call(`/${phoneId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`);
    console.log(`📱 Sending number: ${number.display_phone_number} (${number.verified_name}) · quality ${number.quality_rating ?? "n/a"}`);
  } catch (error) {
    console.warn(`⚠️  Couldn't read WHATSAPP_OTP_PHONE_NUMBER_ID ${phoneId}: ${error.message}`);
  }
}

const existing = (await call(`/${waba}/message_templates?name=${encodeURIComponent(name)}&fields=name,status,language,category,rejected_reason`)).data ?? [];
const match = existing.find((t) => t.name === name && t.language === language);

if (match || statusOnly) {
  if (!match) {
    console.log(`ℹ️  No template called "${name}" (${language}) yet. Run without --status to create it.`);
  } else {
    console.log(`✅ Template "${match.name}" (${match.language}, ${match.category}): ${match.status}${match.rejected_reason && match.rejected_reason !== "NONE" ? ` — ${match.rejected_reason}` : ""}`);
    if (match.status === "APPROVED") console.log(`   Set AUTH_OTP_WHATSAPP_TEMPLATE=${name} and AUTH_OTP_WHATSAPP=1 in Vercel.`);
  }
  process.exit(0);
}

const created = await call(`/${waba}/message_templates`, {
  method: "POST",
  body: JSON.stringify({
    name,
    language,
    category: "AUTHENTICATION",
    // Don't deliver a code that would already have expired.
    message_send_ttl_seconds: 600,
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 10 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy code" }] },
    ],
  }),
});
console.log(`✅ Created template "${name}" (${language}): ${created.status ?? "PENDING"} (id ${created.id}).`);
console.log("   Check approval with --status. Once APPROVED, set in Vercel:");
console.log(`   AUTH_OTP_WHATSAPP=1  AUTH_OTP_WHATSAPP_TEMPLATE=${name}`);
console.log("   WHATSAPP_OTP_PHONE_NUMBER_ID=…  WHATSAPP_OTP_TOKEN=…");
