// The three looks of Shopinbos's own emails (pure, tested in tests/email-look.test.mjs):
//  • classic: a navy header with the logo, the heading and Rex or Peggy, then a pattern strip that changes with the
//    season (shared/seasons.ts). Every notice, tip and summary uses it unless it asks for another.
//  • chat: the email reads like a WhatsApp chat with Rex or Peggy (bubbles, an amber reply): for short nudges.
//  • celebrate: amber page, coral header, a sticker and a big heading: for wins, rewards and gifts.
// Each can carry the reader's own numbers, the proverb of the week and a signature from Rex or Peggy.

import { seasonFor } from "../../../shared/seasons.ts";
import type { Locale } from "../../../shared/i18n/index.ts";
import { mailT, type MailT } from "../../../shared/i18n/mail.ts";

// The shell (shell.ts) imports this file, so the few shared constants are repeated here rather than imported back.
const FONT = "'Space Grotesk','Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono',ui-monospace,Menlo,Consolas,'Courier New',monospace";
const LINE = "#E7E1D5";
const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (ch) => ESC[ch]);

export type EmailLook = "classic" | "chat" | "celebrate";
export type EmailPersona = "rex" | "peggy" | "team";

export const DISPLAY_FONT = "Anton,'Arial Narrow',Impact,sans-serif";
const ITALIC = "Fraunces,Georgia,'Times New Roman',serif";
const INK = "#1C2B33";
const SOFT = "#5B6770";
const NAVY = "#0E2A38";
const AMBER = "#F2A93B";
const CORAL = "#E86A4F";
const CREAM = "#F4F1EA";

export const PERSONAS: Record<EmailPersona, { name: string; image: string | null; line: string; avatarBg: string }> = {
  rex: { name: "Rex", image: "/brand/app/rex-cheer.png", line: "Your store, videos and designs guy 🦖", avatarBg: "#E8F1EE" },
  peggy: { name: "Peggy", image: "/brand/app/peggy-wave.png", line: "Customers, chats and support. I dey for you 💛", avatarBg: "#FCEFD9" },
  team: { name: "The Shopinbos team", image: null, line: "Built in Lagos for businesses across Africa", avatarBg: CREAM },
};

/** The sender name for the From line: "Rex from Shopinbos Business". */
export function personaSender(persona: EmailPersona) {
  return persona === "team" ? null : `${PERSONAS[persona].name} from Shopinbos Business`;
}

export interface LookInput {
  appUrl: string;
  look: EmailLook;
  persona: EmailPersona;
  eyebrow?: string | null;
  heading: string;
  bodyHtml: string;
  /** chat: the messages, as HTML the caller has escaped. bodyHtml is ignored when given. */
  bubbles?: string[];
  /** chat: a reply from the reader, plain text ("Okay Rex, I go try am 🙏🏾"). */
  reply?: string | null;
  /** celebrate: the sticker above the heading ("OYA, LET'S GO! 🚀"). */
  sticker?: string | null;
  /** celebrate: big number tiles. */
  stats?: Array<{ value: string; label: string }>;
  /** Their own numbers, plain text ("Your shop this month: 4 orders, 126 visits."). */
  personal?: string | null;
  proverb?: string | null;
  cta?: { label: string; url: string } | null;
  now?: Date;
  /** The reader's app language (shared/i18n/messages/mail): Rex & Peggy's lines, the proverb title, the greeting. */
  locale?: Locale;
  /** Show the season's greeting ("Merry Christmas! 🎄"). Off for security and billing notices; the pattern still changes. */
  festive?: boolean;
}

const base = (appUrl: string) => appUrl.replace(/\/+$/, "");
const img = (appUrl: string, path: string) => `${base(appUrl)}${path}`;

function button(cta: { label: string; url: string } | null | undefined, bg: string, fg: string) {
  if (!cta) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px"><tr><td class="sib-btn-cell" bgcolor="${bg}" style="border-radius:999px;background:${bg}"><a class="sib-look-btn" href="${escapeHtml(cta.url)}" style="display:inline-block;padding:15px 26px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:${fg};text-decoration:none;border-radius:999px">${escapeHtml(cta.label)}<span aria-hidden="true"> &rarr;</span></a></td></tr></table>`;
}

/** Rex and Peggy's names and one-liners in the reader's language. */
function personaIn(persona: EmailPersona, t: MailT) {
  const p = PERSONAS[persona];
  if (persona === "team") return { ...p, name: t("persona.team.name") };
  return { ...p, line: t(persona === "rex" ? "persona.rex.line" : "persona.peggy.line") };
}

function signature(appUrl: string, persona: EmailPersona, t: MailT) {
  if (persona === "team") return "";
  const p = personaIn(persona, t);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0"><tr>
<td style="padding-right:14px" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="56" height="56" align="center" valign="middle" bgcolor="${p.avatarBg}" style="width:56px;height:56px;border-radius:28px;background:${p.avatarBg};overflow:hidden"><img src="${img(appUrl, p.image!)}" alt="" width="46" height="46" style="display:block;width:46px;height:46px;object-fit:contain"></td></tr></table></td>
<td valign="middle" style="font-family:${FONT}"><div class="sib-ink" style="font-size:16px;font-weight:700;line-height:1.3;color:${NAVY}">${escapeHtml(t("persona.signature", { name: p.name }))}</div><div class="sib-muted" style="font-size:13.5px;line-height:1.4;color:${SOFT}">${escapeHtml(p.line)}</div></td>
</tr></table>`;
}

function personalNote(text: string | null | undefined) {
  if (!text) return "";
  return `<div class="sib-soft" style="margin:0 0 18px;padding:12px 14px;border-radius:14px;background:${CREAM};font-family:${FONT};font-size:14px;line-height:1.5;color:${INK}">📊 ${escapeHtml(text)}</div>`;
}

function proverbBox(text: string | null | undefined, t: MailT) {
  if (!text) return "";
  return `<div style="margin:22px 0 0;padding:16px 18px;border-radius:16px;background:${NAVY}"><div style="font-family:${MONO};font-size:10.5px;letter-spacing:0.16em;text-transform:uppercase;color:${AMBER};margin-bottom:8px">${escapeHtml(t("proverb.title"))}</div><div style="font-family:${ITALIC};font-style:italic;font-size:18px;line-height:1.45;color:#FFFFFF">&ldquo;${escapeHtml(text)}&rdquo;</div></div>`;
}

/** The card rows (each `<tr>…</tr>`) and the page colour for a look. */
/** Footer text colours that stay readable on the look's page colour (the celebrate page is amber). */
export function lookFooterCss(look: EmailLook) {
  return look === "celebrate" ? ".sib-foot,.sib-foot p,.sib-foot td,.sib-address{color:#4A3410!important}.sib-foot a,.sib-foot-strong,.sib-tagline{color:#0E2A38!important}" : "";
}

export function lookRows(input: LookInput): { rows: string; page: string } {
  const now = input.now ?? new Date();
  const season = seasonFor(now);
  const t = mailT(input.locale);
  const persona = personaIn(input.persona, t);
  const seasonGreeting = season.greeting ? t(`season.${season.key}` as Parameters<MailT>[0]) : null;
  const app = input.appUrl;
  const greeting = seasonGreeting && input.festive !== false ? `<div style="font-family:${FONT};font-size:13px;font-weight:700;color:#FFFFFF;margin:0 0 6px">${escapeHtml(seasonGreeting)}</div>` : "";

  if (input.look === "chat") {
    const bubbles = (input.bubbles?.length ? input.bubbles : [input.bodyHtml])
      .map((bubble) => `<tr><td align="left" style="padding:4px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:460px"><tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:4px 16px 16px 16px;padding:11px 15px;font-family:${FONT};font-size:15px;line-height:1.5;color:#16202A;box-shadow:0 1px 0 rgba(0,0,0,0.08)">${bubble}</td></tr></table></td></tr>`)
      .join("");
    const reply = input.reply
      ? `<tr><td align="right" style="padding:6px 0 4px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FCE3B8" style="background:#FCE3B8;border-radius:16px 4px 16px 16px;padding:11px 15px;font-family:${FONT};font-size:15px;line-height:1.5;color:#16202A">${escapeHtml(input.reply)} <span style="font-size:11px;color:#8A6A2E">✓✓</span></td></tr></table></td></tr>`
      : "";
    const avatar = persona.image
      ? `<td width="46" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="44" height="44" align="center" bgcolor="${persona.avatarBg}" style="width:44px;height:44px;border-radius:22px;background:${persona.avatarBg}"><img src="${img(app, persona.image)}" alt="" width="38" height="38" style="display:block;width:38px;height:38px;object-fit:contain"></td></tr></table></td>`
      : "";
    const rows = `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-radius:22px;overflow:hidden;background:#EFE7DC">
<tr><td bgcolor="${NAVY}" style="background:${NAVY};padding:14px 20px;border-radius:22px 22px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${avatar}<td valign="middle" style="padding-left:${persona.image ? 12 : 0}px;font-family:${FONT}"><div style="font-size:16px;font-weight:700;color:#FFFFFF">${escapeHtml(t("persona.from", { name: persona.name }))}</div><div style="font-size:12.5px;color:#A9BCC6">${escapeHtml(persona.line)}</div></td></tr></table></td></tr>
<tr><td style="padding:18px 18px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:0 0 10px"><span style="display:inline-block;background:#FCEFD9;color:#7A5A20;border-radius:8px;padding:4px 10px;font-family:${FONT};font-size:11.5px;font-weight:700">${escapeHtml((input.festive !== false && seasonGreeting) || input.heading)}</span></td></tr>
${input.personal ? `<tr><td style="padding:0 0 6px">${personalNote(input.personal)}</td></tr>` : ""}
${bubbles}${reply}
</table></td></tr>
<tr><td align="center" style="padding:6px 20px 26px">${button(input.cta, AMBER, NAVY)}</td></tr>
</table></td></tr>`;
    return { rows, page: "#EAE3D7" };
  }

  if (input.look === "celebrate") {
    const sticker = input.sticker ? `<div style="display:inline-block;background:${NAVY};color:${AMBER};font-family:${FONT};font-size:13px;font-weight:700;padding:8px 12px;border-radius:999px">${escapeHtml(input.sticker)}</div>` : "";
    const stats = input.stats?.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px"><tr>${input.stats
          .slice(0, 3)
          .map((stat, i) => `<td width="${Math.floor(100 / Math.min(3, input.stats!.length))}%" style="padding:5px"><div style="background:${["#FCEFD9", "#FDE3DC", "#ECE6F4"][i]};border-radius:18px;padding:16px 10px;text-align:center"><div style="font-family:${DISPLAY_FONT};font-size:38px;line-height:1;color:${NAVY}">${escapeHtml(stat.value)}</div><div style="margin-top:6px;font-family:${FONT};font-size:13px;line-height:1.35;color:${INK}">${escapeHtml(stat.label)}</div></div></td>`)
          .join("")}</tr></table>`
      : "";
    const mascot = persona.image ? `<td valign="bottom" width="150" class="sib-mascot"><img src="${img(app, persona.image)}" alt="" width="150" style="display:block;width:150px;height:auto"></td>` : "";
    const rows = `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sib-card" style="border-collapse:separate;border-radius:26px;overflow:hidden;background:#FFFFFF">
<tr><td bgcolor="${CORAL}" style="background:${CORAL};padding:26px 30px 0;border-radius:26px 26px 0 0">
<img src="${img(app, "/brand/email/shopinbos-logo-white@2x.png")}" alt="Shopinbos" width="150" style="display:block;width:150px;height:auto">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px"><tr><td valign="bottom" style="padding-bottom:26px">${greeting}${sticker}
<div style="margin-top:12px;font-family:${DISPLAY_FONT};font-size:44px;line-height:1;text-transform:uppercase;color:#FFFFFF">${escapeHtml(input.heading)}</div></td>${mascot}</tr></table></td></tr>
<tr><td class="sib-pad" style="padding:26px 30px 30px;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${INK}">${personalNote(input.personal)}${input.bodyHtml}${stats}${proverbBox(input.proverb, t)}${signature(app, input.persona, t)}${button(input.cta, NAVY, AMBER)}</td></tr>
</table></td></tr>`;
    return { rows, page: AMBER };
  }

  // classic
  const mascot = persona.image ? `<td valign="bottom" width="140" class="sib-mascot"><img src="${img(app, persona.image)}" alt="" width="130" style="display:block;width:130px;height:auto;margin-left:auto"></td>` : "";
  const eyebrow = input.eyebrow ? `<div style="font-family:${MONO};font-size:11.5px;letter-spacing:0.16em;text-transform:uppercase;color:${AMBER}">${escapeHtml(input.eyebrow)}</div>` : "";
  const rows = `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sib-card" style="border-collapse:separate;border-radius:22px;overflow:hidden;background:#FFFFFF;border:1px solid ${LINE}">
<tr><td bgcolor="${NAVY}" style="background:${NAVY};padding:24px 30px 0;border-radius:21px 21px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" style="padding-bottom:24px"><img src="${img(app, "/brand/email/shopinbos-logo-white@2x.png")}" alt="Shopinbos" width="150" style="display:block;width:150px;height:auto">
<div style="height:22px;line-height:22px">&nbsp;</div>${greeting}${eyebrow}
<h1 class="sib-h1" style="margin:10px 0 0;font-family:${FONT};font-size:27px;line-height:1.18;font-weight:700;letter-spacing:-0.4px;color:#FFFFFF">${escapeHtml(input.heading)}</h1></td>${mascot}</tr></table></td></tr>
<tr><td style="line-height:0;font-size:0"><img src="${img(app, `/brand/email/strips/${season.strip}.png`)}" alt="" width="600" style="display:block;width:100%;height:14px"></td></tr>
<tr><td class="sib-pad" style="padding:28px 30px 30px;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${INK}">${personalNote(input.personal)}${input.bodyHtml}${proverbBox(input.proverb, t)}${signature(app, input.persona, t)}${button(input.cta, NAVY, "#FFFFFF")}</td></tr>
</table></td></tr>`;
  return { rows, page: CREAM };
}
