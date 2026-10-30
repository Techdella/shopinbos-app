#!/usr/bin/env node
// Writes the Supabase Auth email templates (docs/email/supabase/*.html) from the app's shared email shell
// (src/lib/email/shell.ts), so sign-up, sign-in, recovery, invite, email change and reauthentication emails
// look like every other Shopinbos email: logo, light/dark mode, transactional footer with our legal details.
//
//   node scripts/build-supabase-email-templates.mjs
//
// Then push them with: SUPABASE_ACCESS_TOKEN=… APP_URL=… node scripts/configure-supabase-auth.mjs --templates-only
//
// The templates use Supabase's Go template variables ({{ .Token }}, {{ .ConfirmationURL }}, {{ .SiteURL }},
// {{ .Email }}, {{ .NewEmail }}). Logo URLs are built from {{ .SiteURL }} (Supabase's SITE_URL = the app's URL).
// Needs Node 22.18+ (it imports the TypeScript shell directly).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shell = await import(join(root, "src/lib/email/shell.ts"));
const { html, platformEmail, SHOPINBOS_LEGAL_DEFAULTS } = shell;

// Placeholders that survive escaping and the shell's link check, swapped for Go template variables at the end.
const SITE = "https://site-url.placeholder";
const CONFIRM = "https://confirmation-url.placeholder";
const swap = (text) =>
  text
    .replaceAll(SITE, "{{ .SiteURL }}")
    .replaceAll(CONFIRM, "{{ .ConfirmationURL }}")
    .replaceAll("TOKEN_PLACEHOLDER", "{{ .Token }}")
    .replaceAll("NEW_EMAIL_PLACEHOLDER", "{{ .NewEmail }}")
    .replaceAll("EMAIL_PLACEHOLDER", "{{ .Email }}");

const legal = {
  name: process.env.SHOPINBOS_LEGAL_NAME?.trim() || SHOPINBOS_LEGAL_DEFAULTS.name,
  address: process.env.SHOPINBOS_POSTAL_ADDRESS?.trim() || SHOPINBOS_LEGAL_DEFAULTS.address,
};

// The aside panel at the bottom of the card: the raw link for when the button doesn't work, then the expiry and
// "wasn't you?" note.
const linkFallback = `<p class="sib-muted" style="margin:0 0 4px;font-size:12px;color:#6E6E68">Button not working? Paste this link into your browser:</p><p style="margin:0 0 12px;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11px;line-height:1.5;word-break:break-all"><a class="sib-link" href="${CONFIRM}" style="color:#2E7E78;text-decoration:none">${CONFIRM}</a></p>`;

const TEMPLATES = [
  {
    key: "confirmation",
    subject: "Your Shopinbos Business code: {{ .Token }}",
    eyebrow: "Welcome to Shopinbos Business",
    heading: "Confirm your email",
    preheader: "Your code to finish creating your Shopinbos account.",
    body: `${html.p("Welcome aboard! Enter this code in Shopinbos Business to finish creating your account.")}${html.code("TOKEN_PLACEHOLDER")}${html.small("Or confirm with one tap:")}`,
    cta: { label: "Confirm my email", url: CONFIRM },
    aside: `${linkFallback}${html.small("The code and link expire soon and work once. If you didn't sign up for Shopinbos Business, ignore this email.")}`,
    reason: "someone used EMAIL_PLACEHOLDER to create a Shopinbos account",
  },
  {
    key: "magic_link",
    subject: "Your Shopinbos Business sign-in code: {{ .Token }}",
    eyebrow: "Sign in",
    heading: "Your sign-in code",
    preheader: "Use this code to sign in to Shopinbos Business.",
    body: `${html.p("Enter this code in Shopinbos Business to sign in.")}${html.code("TOKEN_PLACEHOLDER", "Your sign-in code")}${html.small("Or sign in with one tap:")}`,
    cta: { label: "Sign in to Shopinbos Business", url: CONFIRM },
    aside: `${linkFallback}${html.small("The code expires soon and works once. If you didn't try to sign in, you can ignore this email: nobody can get in without the code.")}`,
    reason: "someone asked to sign in to the Shopinbos account for EMAIL_PLACEHOLDER",
  },
  {
    key: "recovery",
    subject: "Reset your Shopinbos Business password",
    eyebrow: "Account security",
    heading: "Reset your password",
    preheader: "Choose a new password for your Shopinbos account.",
    body: html.p("We got a request to reset the password for EMAIL_PLACEHOLDER. Choose a new one with the button below."),
    cta: { label: "Choose a new password", url: CONFIRM },
    aside: `${linkFallback}${html.small("This link expires in an hour and works once. If you didn't ask for it, ignore this email: your password stays the same.")}`,
    reason: "someone asked to reset the password for EMAIL_PLACEHOLDER on Shopinbos",
  },
  {
    key: "invite",
    subject: "You're invited to Shopinbos Business",
    eyebrow: "Invitation",
    heading: "You've been invited to Shopinbos Business",
    preheader: "Accept your invitation and set up your Shopinbos account.",
    body: html.p("You've been invited to join Shopinbos Business, the commerce operating system for African businesses. Accept to set up your account."),
    cta: { label: "Accept the invitation", url: CONFIRM },
    aside: `${linkFallback}${html.small("If you weren't expecting this, you can ignore it.")}`,
    reason: "someone invited EMAIL_PLACEHOLDER to Shopinbos",
  },
  {
    key: "email_change",
    subject: "Confirm your new Shopinbos Business email",
    eyebrow: "Account security",
    heading: "Confirm your new email",
    preheader: "Confirm the change to your Shopinbos sign-in email.",
    body: html.raw("Confirm that you want to change your Shopinbos sign-in email from <strong>EMAIL_PLACEHOLDER</strong> to <strong>NEW_EMAIL_PLACEHOLDER</strong>."),
    cta: { label: "Confirm the change", url: CONFIRM },
    aside: `${linkFallback}${html.small("If you didn't ask for this, don't click anything, and reset your password from the sign-in page.")}`,
    reason: "someone asked to change the email on a Shopinbos account",
  },
  {
    key: "reauthentication",
    subject: "Your Shopinbos Business confirmation code: {{ .Token }}",
    eyebrow: "Account security",
    heading: "Confirm it's you",
    preheader: "Your code to confirm a sensitive change on Shopinbos.",
    body: `${html.p("Enter this code to confirm the change you're making to your Shopinbos account.")}${html.code("TOKEN_PLACEHOLDER", "Confirmation code")}`,
    cta: null,
    aside: html.small("If you didn't start this, change your password now. Never share this code: Shopinbos staff will never ask for it."),
    reason: "a change was started on the Shopinbos account for EMAIL_PLACEHOLDER",
  },
];

const out = join(root, "docs/email/supabase");
mkdirSync(out, { recursive: true });
const manifest = {};
for (const t of TEMPLATES) {
  const doc = platformEmail({
    appUrl: SITE,
    kind: "transactional",
    title: t.heading,
    preheader: t.preheader,
    eyebrow: t.eyebrow,
    heading: t.heading,
    bodyHtml: t.body,
    cta: t.cta,
    aside: t.aside,
    reason: t.reason,
    legal,
    serviceNote: "This is a service message about your Shopinbos account. You get these even if you unsubscribe from updates.",
  });
  const content = swap(doc);
  writeFileSync(join(out, `${t.key}.html`), content);
  manifest[t.key] = { subject: t.subject, file: `${t.key}.html` };
  console.log(`wrote docs/email/supabase/${t.key}.html (${content.length} bytes)`);
}
writeFileSync(join(out, "subjects.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log("wrote docs/email/supabase/subjects.json");
