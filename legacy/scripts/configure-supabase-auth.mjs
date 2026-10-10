#!/usr/bin/env node

// ─── Configure Supabase Auth SMTP & Settings via Rest API ────────────────
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/configure-supabase-auth.mjs
//
// This configures:
//   1. Custom SMTP (Resend) for reliable auth email delivery
//   2. SITE_URL for correct redirect URIs in email links
//   3. Email provider enabled
//
// Get a token at https://supabase.com/dashboard/account/tokens

const PROJECT_REF = "zdnwdkykcqaarlpwqjow";
const MGMT_API = "https://api.supabase.com";

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("❌ SUPABASE_ACCESS_TOKEN not set.");
    console.error("");
    console.error("  1. Go to https://supabase.com/dashboard/account/tokens");
    console.error("  2. Create a token with scope: manage_projects");
    console.error("  3. Run:  $env:SUPABASE_ACCESS_TOKEN=\"sbp_xxx\"; node scripts/configure-supabase-auth.mjs");
    process.exit(1);
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error("❌ RESEND_API_KEY not set. Run from project root with .env.local loaded.");
    process.exit(1);
  }

  const appUrl = process.env.APP_URL ?? "https://app.shopinbos.com";
  const resendFromEmail = process.env.RESEND_FROM_EMAIL ?? "Shopinbos <noreply@shopinbos.com>";
  const senderMatch = resendFromEmail.match(/<?([^<\s]+@[^>\s]+)>?/);
  const senderEmail = senderMatch ? senderMatch[1] : "noreply@shopinbos.com";
  const senderName = resendFromEmail.match(/^([^<]+)</)?.[1]?.trim() ?? "Shopinbos";

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  console.log("\n🔧 Configuring Supabase Auth...");
  console.log(`   Project: ${PROJECT_REF}`);
  console.log(`   SMTP:   smtp.resend.com:587`);
  console.log(`   From:   ${senderName} <${senderEmail}>`);
  console.log(`   SITE_URL: ${appUrl}\n`);

  // Step 1: Configure SMTP + site URL + email provider (PATCH /v1/projects/{ref}/config/auth)
  const authConfigBody = {
    external_email_enabled: true,
    mailer_secure_email_change_enabled: true,
    mailer_autoconfirm: false,
    smtp_admin_email: senderEmail,
    smtp_host: "smtp.resend.com",
    smtp_port: "587",
    smtp_user: "resend",
    smtp_pass: resendApiKey,
    smtp_sender_name: senderName,
    site_url: appUrl.replace(/\/+$/, ""),
  };

  console.log("▪ Updating auth config (SMTP, SITE_URL, email provider)...");
  const authRes = await fetch(`${MGMT_API}/v1/projects/${PROJECT_REF}/config/auth`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(authConfigBody),
  });

  if (!authRes.ok) {
    const err = await authRes.text();
    console.error(`❌ Auth config update failed (${authRes.status}): ${err}`);
    process.exit(1);
  }

  const authResult = await authRes.json();
  console.log("✅ Auth config updated successfully");
  console.log(`   SMTP Sender: ${authResult.smtp_sender_name} <${authResult.smtp_admin_email}>`);
  console.log(`   SMTP Host:   ${authResult.smtp_host}:${authResult.smtp_port}`);
  console.log(`   SITE_URL:    ${authResult.site_url}`);

  // Step 2: Verify current settings
  console.log("\n🔍 Verifying auth provider settings...");
  const checkRes = await fetch(`${MGMT_API}/v1/projects/${PROJECT_REF}/config/auth`, { headers });

  if (checkRes.ok) {
    const cfg = await checkRes.json();
    console.log(`   external_email_enabled:       ${cfg.external_email_enabled}`);
    console.log(`   mailer_autoconfirm:           ${cfg.mailer_autoconfirm}`);
    console.log(`   mailer_secure_email_change:   ${cfg.mailer_secure_email_change_enabled}`);
    console.log(`   SMTP host:                    ${cfg.smtp_host}:${cfg.smtp_port}`);
    console.log(`   SMTP user:                    ${cfg.smtp_user}`);
    console.log(`   SMTP sender:                  ${cfg.smtp_sender_name} <${cfg.smtp_admin_email}>`);
    console.log(`   site_url:                     ${cfg.site_url}`);
  }

  console.log("\n✅ Setup complete. Auth emails will now go through Resend.");
  console.log("   Try logging in with an OTP code to verify delivery.\n");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
