#!/usr/bin/env node

// ─── Configure Supabase Auth SMTP, settings and email templates via the Management API ────────────────
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_xxx APP_URL=https://app.shopinbos.com RESEND_API_KEY=re_xxx \
//     node scripts/configure-supabase-auth.mjs [--dry-run]
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/configure-supabase-auth.mjs --templates-only [--dry-run]
//
// Full run (no flag) configures:
//   1. Custom SMTP (Resend) for reliable auth email delivery (needs RESEND_API_KEY)
//   2. SITE_URL plus the redirect allow-list (web callback and the mobile app's shopinbos:// scheme). APP_URL is
//      required: there is deliberately no default, because the old one (app.shopinbos.com) doesn't serve the app.
//      Production today is https://app.shopinbos.com.
//   3. Email provider enabled
//   4. Optional: Google sign-in   (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET)
//   5. Optional: phone codes by SMS through the app's own Termii / Africa's Talking / Sendchamp account, via
//      Supabase's "Send SMS" auth hook ({APP_URL}/api/webhooks/supabase-sms). Needs SUPABASE_SEND_SMS_HOOK_SECRET
//      ("v1,whsec_<base64>", any 32+ random bytes; the same value goes in the app's env) and SMS_PROVIDER keys.
//   6. The auth email templates and subjects (confirm sign-up, magic link / code, recovery, invite, email change,
//      reauthentication) from docs/email/supabase/*.html, built on the app's email shell by
//      scripts/build-supabase-email-templates.mjs.
//
// --templates-only  updates just step 6 (needs only SUPABASE_ACCESS_TOKEN; SMTP, URLs and providers untouched).
// --dry-run         prints what would change and calls nothing (no token needed).
//
// Get a token at https://supabase.com/dashboard/account/tokens

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has("--dry-run");
const TEMPLATES_ONLY = ARGS.has("--templates-only");
const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "email", "supabase");
// Management API field names (https://supabase.com/docs/guides/auth/auth-email-templates).
const TEMPLATE_KEYS = ["confirmation", "magic_link", "recovery", "invite", "email_change", "reauthentication"];

/** { mailer_subjects_<key>, mailer_templates_<key>_content } for every template file. */
function templateConfig() {
  const subjects = JSON.parse(readFileSync(join(TEMPLATE_DIR, "subjects.json"), "utf8"));
  const body = {};
  for (const key of TEMPLATE_KEYS) {
    const entry = subjects[key];
    if (!entry) throw new Error(`docs/email/supabase/subjects.json has no "${key}" entry`);
    body[`mailer_subjects_${key}`] = entry.subject;
    body[`mailer_templates_${key}_content`] = readFileSync(join(TEMPLATE_DIR, entry.file), "utf8");
  }
  return body;
}

function describe(value) {
  if (typeof value !== "string") return JSON.stringify(value);
  if (value.length > 90) return `${value.length} chars of HTML`;
  return JSON.stringify(value);
}

const PROJECT_REF = "zdnwdkykcqaarlpwqjow";
const MGMT_API = "https://api.supabase.com";

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken && !DRY_RUN) {
    console.error("❌ SUPABASE_ACCESS_TOKEN not set.");
    console.error("");
    console.error("  1. Go to https://supabase.com/dashboard/account/tokens");
    console.error("  2. Create a token with scope: manage_projects");
    console.error("  3. Run:  $env:SUPABASE_ACCESS_TOKEN=\"sbp_xxx\"; node scripts/configure-supabase-auth.mjs --templates-only");
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const templates = templateConfig();
  let authConfigBody = { ...templates };

  console.log(`\n🔧 Configuring Supabase Auth${DRY_RUN ? " (dry run: nothing will be changed)" : ""}...`);
  console.log(`   Project: ${PROJECT_REF}`);
  console.log(`   Mode:    ${TEMPLATES_ONLY ? "email templates and subjects only" : "SMTP, URLs, providers and email templates"}`);

  if (!TEMPLATES_ONLY) {
    const rawAppUrl = process.env.APP_URL?.trim();
    if (!rawAppUrl || !/^https?:\/\//.test(rawAppUrl)) {
      console.error("❌ APP_URL not set. It becomes Supabase's SITE_URL (where auth links land), so there is no default.");
      console.error("   Production is https://app.shopinbos.com:  APP_URL=https://app.shopinbos.com node scripts/configure-supabase-auth.mjs");
      console.error("   To update only the email templates: node scripts/configure-supabase-auth.mjs --templates-only");
      process.exit(1);
    }
    const appUrl = rawAppUrl.replace(/\/+$/, "");

    // SMTP needs the Resend key; only this mode configures SMTP.
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey && !DRY_RUN) {
      console.error("❌ RESEND_API_KEY not set (needed to configure SMTP). Run from project root with .env.local loaded, or use --templates-only.");
      process.exit(1);
    }

    const resendFromEmail = process.env.RESEND_FROM_EMAIL ?? "Shopinbos <noreply@shopinbos.com>";
    const senderMatch = resendFromEmail.match(/<?([^<\s]+@[^>\s]+)>?/);
    const senderEmail = senderMatch ? senderMatch[1] : "noreply@shopinbos.com";
    const senderName = resendFromEmail.match(/^([^<]+)</)?.[1]?.trim() ?? "Shopinbos";

    console.log(`   SMTP:     smtp.resend.com:587`);
    console.log(`   From:     ${senderName} <${senderEmail}>`);
    console.log(`   SITE_URL: ${appUrl}   ← auth links and email logos use this; check it serves the app\n`);

    authConfigBody = {
      ...authConfigBody,
      external_email_enabled: true,
      mailer_secure_email_change_enabled: true,
      mailer_autoconfirm: false,
      smtp_admin_email: senderEmail,
      smtp_host: "smtp.resend.com",
      smtp_port: "587",
      smtp_user: "resend",
      smtp_pass: resendApiKey ?? "(RESEND_API_KEY)",
      smtp_sender_name: senderName,
      site_url: appUrl,
      uri_allow_list: [
        `${appUrl}/**`,
        "http://localhost:3000/**",
        "shopinbos://**",
        "exp://**",
      ].join(","),
    };

    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      Object.assign(authConfigBody, {
        external_google_enabled: true,
        external_google_client_id: process.env.GOOGLE_CLIENT_ID,
        external_google_secret: process.env.GOOGLE_CLIENT_SECRET,
      });
      console.log("   Google sign-in: enabling");
    }

    if (process.env.SUPABASE_SEND_SMS_HOOK_SECRET) {
      Object.assign(authConfigBody, {
        external_phone_enabled: true,
        sms_otp_length: 6,
        hook_send_sms_enabled: true,
        hook_send_sms_uri: `${appUrl}/api/webhooks/supabase-sms`,
        hook_send_sms_secrets: process.env.SUPABASE_SEND_SMS_HOOK_SECRET,
      });
      console.log("   Phone codes (SMS via the app's SMS provider): enabling the Send SMS hook");
    }
  }

  // What changes: compare with the live config when we can read it.
  let current = null;
  if (accessToken) {
    const res = await fetch(`${MGMT_API}/v1/projects/${PROJECT_REF}/config/auth`, { headers }).catch(() => null);
    if (res?.ok) current = await res.json();
    else console.warn(`⚠️  Couldn't read the current auth config (${res?.status ?? "network error"}); showing every field.`);
  }
  if (current?.site_url) {
    console.log(`   Current SITE_URL: ${current.site_url}${/app\.shopinbos\.com/.test(current.site_url) ? "   ⚠️  app.shopinbos.com doesn't serve the app; template logos load from SITE_URL" : ""}`);
  }
  const SECRET_FIELDS = new Set(["smtp_pass", "external_google_secret", "hook_send_sms_secrets"]);
  const changes = Object.entries(authConfigBody).filter(([key, value]) => !current || SECRET_FIELDS.has(key) || current[key] !== value);
  console.log(`\n▪ ${changes.length} field(s) to set:`);
  for (const [key, value] of changes) {
    const before = current && !SECRET_FIELDS.has(key) ? describe(current[key] ?? null) : current ? "(secret)" : "(unknown)";
    console.log(`   ${key.padEnd(44)} ${before} → ${SECRET_FIELDS.has(key) ? "(secret)" : describe(value)}`);
  }
  const unchanged = Object.keys(authConfigBody).length - changes.length;
  if (unchanged) console.log(`   (${unchanged} field(s) already up to date)`);

  if (DRY_RUN) {
    console.log("\n🧪 Dry run: nothing was sent to Supabase.\n");
    return;
  }
  if (!changes.length) {
    console.log("\n✅ Nothing to change.\n");
    return;
  }

  console.log(`\n▪ Updating auth config (${TEMPLATES_ONLY ? "email templates" : "SMTP, SITE_URL, email provider, email templates"})...`);
  const authRes = await fetch(`${MGMT_API}/v1/projects/${PROJECT_REF}/config/auth`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(Object.fromEntries(changes)),
  });

  if (!authRes.ok) {
    const err = await authRes.text();
    console.error(`❌ Auth config update failed (${authRes.status}): ${err}`);
    process.exit(1);
  }

  const cfg = await authRes.json();
  console.log("✅ Auth config updated successfully");
  for (const key of TEMPLATE_KEYS) {
    const ok = cfg[`mailer_templates_${key}_content`] === templates[`mailer_templates_${key}_content`];
    console.log(`   ${key.padEnd(18)} subject: ${JSON.stringify(cfg[`mailer_subjects_${key}`])}  template: ${ok ? "updated" : "⚠️  not returned as sent"}`);
  }
  if (!TEMPLATES_ONLY) {
    console.log(`   SMTP sender:  ${cfg.smtp_sender_name} <${cfg.smtp_admin_email}>`);
    console.log(`   SMTP host:    ${cfg.smtp_host}:${cfg.smtp_port}`);
    console.log(`   site_url:     ${cfg.site_url}`);
    console.log(`   uri_allow_list: ${cfg.uri_allow_list}`);
    console.log(`   google enabled: ${cfg.external_google_enabled}`);
    console.log(`   phone enabled:  ${cfg.external_phone_enabled} (${cfg.sms_provider ?? "no provider"})`);
  }
  console.log("\n✅ Done. Send yourself a sign-in code to check the new email.\n");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
