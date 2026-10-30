// Admin › Developers › Launch settings: is the running deployment set up for production? Which keys Vercel has
// (set or not, never the values), and whether every scheduled job runs. Pure (no server imports), so
// tests/launch-check.test.mjs runs it.

type Env = Record<string, string | undefined>;

export type SettingLevel = "required" | "recommended";

export interface SettingCheck {
  group: string;
  label: string;
  /** Any one of these set counts (e.g. Brevo or BulkSMS Nigeria). */
  keys: string[];
  level: SettingLevel;
  /** What breaks, or what the app falls back to, while it's missing. */
  missing: string;
  /** Where the value comes from. */
  where: string;
}

export const SETTING_CHECKS: SettingCheck[] = [
  // Email
  { group: "Email", label: "Resend API key", keys: ["RESEND_API_KEY"], level: "required", missing: "No email leaves the app: orders, sign-up, product news, campaigns.", where: "resend.com → API Keys" },
  { group: "Email", label: "From address", keys: ["RESEND_FROM_EMAIL"], level: "required", missing: "Emails go from a default address that may not be verified in Resend.", where: "e.g. Shopinbos Business <hello@shopinbos.com> (domain verified in Resend; the name shown is always Shopinbos Business)" },
  { group: "Email", label: "Resend webhook secret", keys: ["RESEND_WEBHOOK_SECRET"], level: "recommended", missing: "Bounces and complaints aren't recorded, so bad addresses keep getting mail.", where: "resend.com → Webhooks → signing secret" },

  // Scheduled jobs
  { group: "Scheduled jobs", label: "Cron secret", keys: ["CRON_SECRET"], level: "required", missing: "Every scheduled job is refused (401): campaigns, order expiry, reminders, payouts.", where: "The same value as the cron_secret in Supabase → Vault" },

  // Sign-in
  { group: "Sign-in", label: "Send SMS hook secret", keys: ["SUPABASE_SEND_SMS_HOOK_SECRET"], level: "required", missing: "Phone sign-in codes can't be sent through our SMS provider (Supabase falls back to Twilio).", where: "Supabase → Auth → Hooks → Send SMS (v1,whsec_…)" },
  { group: "Sign-in", label: "SMS provider", keys: ["BREVO_API_KEY", "BULKSMSNIGERIA_API_TOKEN", "TERMII_API_KEY", "AFRICASTALKING_API_KEY", "SENDCHAMP_API_KEY"], level: "required", missing: "No sign-in codes, order texts or SMS campaigns.", where: "Brevo or BulkSMS Nigeria (SMS_PROVIDER=brevo,bulksmsnigeria)" },
  { group: "Sign-in", label: "Cookie signing secret", keys: ["AUTH_COOKIE_SECRET"], level: "recommended", missing: "Session cookies are signed with JWT_SECRET or the Supabase service key.", where: "Any long random string (openssl rand -base64 48)" },

  // Signing secrets: each falls back to a shared key when unset
  { group: "Signing secrets", label: "JWT secret", keys: ["JWT_SECRET"], level: "required", missing: "Several links fall back to the Supabase service key.", where: "Any long random string" },
  { group: "Signing secrets", label: "Campaign preview secret", keys: ["CAMPAIGN_PREVIEW_SECRET"], level: "recommended", missing: "Campaign preview links are signed with JWT_SECRET or the Supabase service key.", where: "Any long random string" },
  { group: "Signing secrets", label: "Marketing link secret", keys: ["MARKETING_LINK_SECRET"], level: "recommended", missing: "Unsubscribe and tracking links are signed with CRON_SECRET or the Supabase service key.", where: "Any long random string" },
  { group: "Signing secrets", label: "Review link secret", keys: ["REVIEW_LINK_SECRET"], level: "recommended", missing: "Review request links are signed with the Supabase service key.", where: "Any long random string" },
  { group: "Signing secrets", label: "Checkout phone secret", keys: ["CHECKOUT_PHONE_SECRET"], level: "recommended", missing: "Checkout phone checks are signed with JWT_SECRET or the Supabase service key.", where: "Any long random string" },

  // Encryption at rest
  { group: "Encryption", label: "Inbox encryption key", keys: ["INBOX_ENCRYPTION_KEY"], level: "required", missing: "Sellers can't connect WhatsApp, Instagram, Messenger, SMS or Gmail (their keys can't be stored safely).", where: "32 random bytes: openssl rand -base64 32 (never change it once set)" },
  { group: "Encryption", label: "Integrations encryption key", keys: ["INTEGRATIONS_ENCRYPTION_KEY"], level: "required", missing: "Google (Search Console, reviews) connections can't be stored safely.", where: "32 random bytes: openssl rand -base64 32 (never change it once set)" },

  // Payments
  { group: "Payments", label: "Paystack secret key", keys: ["PAYSTACK_SECRET_KEY"], level: "required", missing: "No card or transfer payments, plans or payouts.", where: "Paystack → Settings → API Keys (live)" },
  { group: "Payments", label: "Paystack public key", keys: ["NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY"], level: "required", missing: "The payment window can't open at checkout.", where: "Paystack → Settings → API Keys (live)" },
];

export interface SettingStatus extends SettingCheck {
  set: boolean;
  /** Which of keys is set (the first), for "Brevo" vs "BulkSMS Nigeria". */
  setKey: string | null;
}

const filled = (value: string | undefined) => Boolean(value && value.trim() && !/^(your[_-]|changeme|xxx)/i.test(value.trim()));

export function settingStatus(env: Env, checks: SettingCheck[] = SETTING_CHECKS): SettingStatus[] {
  return checks.map((check) => {
    const setKey = check.keys.find((key) => filled(env[key])) ?? null;
    return { ...check, set: Boolean(setKey), setKey };
  });
}

// ─── Scheduled jobs ──────────────────────────────────────────────────────────

export interface ScheduledJob {
  /** The route each run calls. */
  path: string;
  label: string;
  /** Supabase pg_cron job names that run it (old and new spellings). */
  pgCron: string[];
  /** QStash schedule id in scripts/qstash-schedules.mjs ("shopinbos-<id>"), or null when it stays elsewhere. */
  qstash: string | null;
  /** Runs from vercel.json instead. */
  vercel?: boolean;
}

export const SCHEDULED_JOBS: ScheduledJob[] = [
  { path: "/api/cron/campaigns", label: "Send scheduled campaigns", pgCron: ["send-scheduled-campaigns"], qstash: "campaigns" },
  { path: "/api/cron/expire-orders", label: "Expire unpaid orders", pgCron: ["expire-unpaid-orders"], qstash: "expire-orders" },
  { path: "/api/cron/supplier-acceptance", label: "Supplier acceptance deadlines", pgCron: ["supplier-acceptance"], qstash: "supplier-acceptance" },
  { path: "/api/cron/push-receipts", label: "Push notification receipts", pgCron: ["push-receipts"], qstash: "push-receipts" },
  { path: "/api/cron/push-campaigns", label: "Push center campaigns", pgCron: ["push-campaigns"], qstash: "push-campaigns" },
  { path: "/api/cron/marketing", label: "Marketing automations", pgCron: ["run-marketing"], qstash: "marketing" },
  { path: "/api/conversations/cron", label: "Unread message emails", pgCron: ["send-unread-message-emails"], qstash: "unread-message-emails" },
  { path: "/api/cron/product-news", label: "Product news emails", pgCron: ["product-news"], qstash: "product-news" },
  { path: "/api/cron/whatsapp-catalog", label: "WhatsApp catalog sync", pgCron: ["whatsapp-catalog-sync"], qstash: "whatsapp-catalog" },
  { path: "/api/cron/partner-payins", label: "Delivery partner pay-ins", pgCron: ["partner-payins"], qstash: "partner-payins" },
  { path: "/api/cron/delivery-jobs", label: "Delivery jobs", pgCron: ["delivery-jobs"], qstash: "delivery-jobs" },
  { path: "/api/cron/partner-webhooks", label: "Partner webhook retries", pgCron: ["partner-webhooks"], qstash: "partner-webhooks" },
  { path: "/api/cron/post-reminders", label: "\"Time to post\" reminders", pgCron: ["post-reminders"], qstash: "post-reminders" },
  { path: "/api/cron/status-purge", label: "Clear expired status posts", pgCron: ["status-purge"], qstash: "status-purge" },
  { path: "/api/cron/verification-reminders", label: "Verification reminders", pgCron: ["verification-reminders"], qstash: "verification-reminders" },
  { path: "/api/cron/morning-brief", label: "Peggy's morning brief (suppliers and delivery partners)", pgCron: ["morning-brief"], qstash: "morning-brief" },
  { path: "/api/cron/lifecycle", label: "Lifecycle emails", pgCron: ["lifecycle-emails"], qstash: "lifecycle-emails" },
  { path: "/api/cron/referrals", label: "Refer & earn rewards", pgCron: ["referrals"], qstash: "referrals" },
  { path: "/api/cron/member-tips", label: "Weekly tips from Rex & Peggy", pgCron: ["member-tips"], qstash: "member-tips" },
  { path: "/api/cron/member-journeys", label: "Member journeys and announcements", pgCron: ["member-journeys"], qstash: "member-journeys" },
  { path: "/api/cron/seasonal-campaigns", label: "Seasonal campaigns", pgCron: ["seasonal-campaigns"], qstash: "seasonal-campaigns" },
  { path: "/api/cron/gmail-sync", label: "Gmail sync", pgCron: ["gmail-sync"], qstash: "gmail-sync" },
  { path: "/api/cron/lead-growth", label: "Lead campaigns", pgCron: ["lead-growth"], qstash: "lead-growth" },
  { path: "/api/cron/sales-channels", label: "Sales channel sync", pgCron: ["sales-channels", "sales-channels-sync"], qstash: "sales-channels" },
  { path: "/api/cron/domain-renewals", label: "Domain renewals", pgCron: ["domain-renewals"], qstash: "domain-renewals" },
  { path: "/api/cron/business-registrations", label: "CAC business registrations", pgCron: ["business-registrations"], qstash: "business-registrations" },
  { path: "/api/cron/money-owed", label: "Money owed reminders", pgCron: ["money-owed"], qstash: "money-owed" },
  { path: "/api/cron/pay-together", label: "Pay small small, ajo and group buy (reminders, autopay, missed payments)", pgCron: ["pay-together"], qstash: "pay-together" },
  { path: "/api/cron/price-notices", label: "Supplier price changes (7 days' notice)", pgCron: ["price-notices"], qstash: "price-notices" },
  { path: "/api/cron/social-posts", label: "Scheduled social posts", pgCron: ["social-posts"], qstash: "social-posts" },
  { path: "/api/cron/store-publish", label: "Scheduled shop publishes", pgCron: ["store-publish"], qstash: "store-publish" },
  { path: "/api/cron/weekly-summary", label: "Weekly summary", pgCron: ["weekly-summary", "weekly-summary-continue"], qstash: "weekly-summary" },
  { path: "/api/cron/reviews", label: "Review requests", pgCron: [], qstash: null, vercel: true },
];

export interface CronRow {
  jobname: string;
  active: boolean;
  schedule: string;
  lastRun: Date | null;
  lastStatus: string | null;
  /** HTTP status of the newest response to this job's URL, when known. */
  lastHttp: number | null;
}

export type JobHealth = "running" | "failing" | "paused" | "missing" | "vercel";

export interface JobStatus extends ScheduledJob {
  health: JobHealth;
  schedule: string | null;
  lastRun: Date | null;
  detail: string;
}

/**
 * Matches the jobs the app needs with what pg_cron has. A job counts as running when an active pg_cron job calls it
 * and its last run succeeded (and, when we know it, got a 2xx back). QStash schedules aren't visible from here, so a
 * job moved to QStash shows as missing in pg_cron; the card says to check QStash then.
 */
export function jobStatus(rows: CronRow[], jobs: ScheduledJob[] = SCHEDULED_JOBS): JobStatus[] {
  return jobs.map((job) => {
    if (job.vercel) return { ...job, health: "vercel", schedule: null, lastRun: null, detail: "Runs from vercel.json (Vercel Cron)." };
    const found = rows.filter((row) => job.pgCron.includes(row.jobname));
    if (!found.length) return { ...job, health: "missing", schedule: null, lastRun: null, detail: "Not scheduled in Supabase pg_cron." };
    const active = found.filter((row) => row.active);
    if (!active.length) return { ...job, health: "paused", schedule: found[0].schedule, lastRun: found[0].lastRun, detail: "Scheduled but switched off." };
    const latest = [...active].sort((a, b) => (b.lastRun?.getTime() ?? 0) - (a.lastRun?.getTime() ?? 0))[0];
    const http = latest.lastHttp;
    const failing = (latest.lastStatus && latest.lastStatus !== "succeeded") || (http !== null && (http < 200 || http >= 300));
    const detail = failing
      ? http === 401
        ? "The app refused the run (401): CRON_SECRET in Vercel doesn't match cron_secret in Supabase Vault."
        : `Last run ${latest.lastStatus ?? "?"}${http !== null ? `, HTTP ${http}` : ""}.`
      : latest.lastRun
        ? "Last run succeeded."
        : "Scheduled, no run yet.";
    return { ...job, health: failing ? "failing" : "running", schedule: active.map((row) => row.schedule).join(" · "), lastRun: latest.lastRun, detail };
  });
}
