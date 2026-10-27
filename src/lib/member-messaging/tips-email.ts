// The weekly tips from Rex & Peggy, pure: which tip someone gets next, when each channel sends (Lagos time), the
// email and the WhatsApp text. Unit-tested in tests/member-tips.test.mjs; the sending is tips.server.ts.

import type { Tip, TipRole } from "./tips-library";
import type { Locale } from "../../../shared/i18n/index.ts";
import { mailT } from "../../../shared/i18n/mail.ts";
import { localizedTip } from "./i18n/index.ts";

export type TipChannel = "email" | "whatsapp";

/** WhatsApp tips go on Wednesdays, emails on Thursdays, from 10:00 Lagos (never before 08:00 or after 20:00). */
export const TIP_DAY: Record<TipChannel, number> = { whatsapp: 3, email: 4 };
export const TIP_HOUR = 10;

const LAGOS_OFFSET_MS = 60 * 60_000; // UTC+1, no daylight saving

function lagos(now: Date) {
  const local = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const weekday = local.getUTCDay() === 0 ? 7 : local.getUTCDay(); // Monday 1 … Sunday 7
  return { local, weekday, hour: local.getUTCHours() };
}

/** "2026-11-23": the Monday (Lagos) of the week `now` is in. One tip per channel per week. */
export function tipWeek(now: Date) {
  const { local, weekday } = lagos(now);
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (weekday - 1)));
  return monday.toISOString().slice(0, 10);
}

/** Is it time to send this week's tips on this channel? (A late run catches up later the same week, Mon–Sat.) */
export function tipDue(channel: TipChannel, now: Date) {
  const { weekday, hour } = lagos(now);
  if (weekday === 7 || hour < 8 || hour >= 20) return false;
  return weekday > TIP_DAY[channel] || (weekday === TIP_DAY[channel] && hour >= TIP_HOUR);
}

/** The next tip for this person: the first of their role they haven't had, else the one they had longest ago. */
export function nextTip(tips: readonly Tip[], role: TipRole, history: ReadonlyArray<{ ref: string; at: Date }>): Tip | null {
  const mine = tips.filter((tip) => tip.role === role);
  if (!mine.length) return null;
  const last = new Map<string, number>();
  for (const item of history) last.set(item.ref, Math.max(last.get(item.ref) ?? 0, item.at.getTime()));
  const fresh = mine.find((tip) => !last.has(tip.id));
  if (fresh) return fresh;
  return [...mine].sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0))[0] ?? null;
}

export const FROM_NAME = { rex: "Rex", peggy: "Peggy" } as const;

/** The tip as it goes in the WhatsApp template's {{3}}: one line, a capital first letter, at most 300 characters. */
export function whatsappTipText(tip: Tip) {
  const text = tip.whatsapp.replace(/\s+/g, " ").trim();
  const capped = text.charAt(0).toUpperCase() + text.slice(1);
  return capped.length > 300 ? `${capped.slice(0, 297).trimEnd()}…` : capped;
}

export function firstNameOf(name: string | null | undefined) {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first && !/@/.test(first) ? first : "there";
}

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface TipProduct {
  name: string;
  price: number;
  image: string | null;
  url: string;
  /** How many shops added it lately (shown when more than one). */
  shops?: number | null;
}

export interface TipEmailInput {
  firstName: string;
  /** Where the button goes (the /tip/<id> link that records the click). */
  ctaUrl: string;
  /** Sellers: top marketplace products this week. */
  products?: TipProduct[];
  /** Suppliers: categories sellers added most this week. */
  categories?: Array<{ name: string; count: number }>;
  marketplaceUrl?: string;
  /** The reader's app language (English by default): the tip and everything around it. */
  locale?: Locale;
  /** "From a real member": an approved story another member shared with consent (shown in their own words). */
  story?: { displayName: string; city: string | null; result: string | null; story: string } | null;
  /** Video tips: a Rex video to watch (a member's shared one, the reader's own, or the team's sample). */
  video?: { kind: "member" | "yours" | "sample"; videoUrl: string; posterUrl: string; name?: string | null; caption?: string | null } | null;
  /** "Share your story" (/story). */
  storyUrl?: string;
}

const naira = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;

/** The email's parts for the platform email shell (sendPlatformEmail). */
export function renderTipEmail(source: Tip, input: TipEmailInput) {
  const locale = input.locale ?? "en";
  const t = mailT(locale);
  const tip = localizedTip(source, locale);
  const from = FROM_NAME[tip.from];
  // Steps in amber circles, the example as a "real talk" note, then what's selling (the look's signature, proverb
  // and button come from the email shell, src/lib/email/looks.ts).
  const points = tip.points
    .map(
      (point, i) => `<tr><td valign="top" width="44" style="padding:0 12px 14px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="30" height="30" align="center" valign="middle" bgcolor="#F2A93B" style="width:30px;height:30px;border-radius:15px;background:#F2A93B;color:#0E2A38;font-size:14px;font-weight:700">${i + 1}</td></tr></table></td><td valign="top" style="padding:4px 0 14px;font-size:15.5px;line-height:1.55">${escape(point)}</td></tr>`,
    )
    .join("");
  const where = locale === "en" ? tip.example?.match(/\bin ([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?)/)?.[1] : undefined;
  const example = tip.example
    ? `<div style="margin:8px 0 6px;padding:14px 16px;border-radius:4px 18px 18px 18px;background:#FCEFD9"><div style="font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;color:#9A5B0A;margin-bottom:8px">${escape(where ? `Real talk from ${where}` : t("tip.realTalk"))}</div><div style="font-size:15px;line-height:1.55;color:#1C2B33">${escape(tip.example)}</div></div>`
    : "";
  let extra = "";
  if (input.products?.length) {
    const cells = input.products.slice(0, 4).map(
      (product) => `<td width="50%" valign="top" style="padding:6px">
  <a href="${escape(product.url)}" style="display:block;text-decoration:none;color:#0E2A38;border:1px solid #ECE6DA;border-radius:16px;overflow:hidden">
    ${product.image ? `<img src="${escape(product.image)}" alt="" width="260" style="display:block;width:100%;height:150px;object-fit:cover">` : ""}
    <span style="display:block;padding:12px 14px 0;font-size:14.5px;font-weight:700;line-height:1.35">${escape(product.name)}</span>
    <span style="display:block;padding:6px 14px 0;font-size:17px;font-weight:700;color:#1C2B33">${naira(product.price)} <span style="font-size:12.5px;font-weight:400;color:#5B6770">${escape(t("tip.suggestedPrice"))}</span></span>
    ${product.shops && product.shops > 1 ? `<span style="display:inline-block;margin:9px 14px 0;padding:5px 10px;border-radius:999px;background:#FDF0E9;color:#B4442C;font-size:12px;font-weight:700">🔥 ${escape(t("tip.addedByShops", { count: product.shops }))}</span>` : ""}
    <span style="display:block;height:14px;line-height:14px">&nbsp;</span>
  </a>
</td>`,
    );
    const rows: string[] = [];
    for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells[i]}${cells[i + 1] ?? '<td width="50%"></td>'}</tr>`);
    extra = `<h2 style="margin:30px 0 6px;font-size:19px;color:#0E2A38">${escape(t("tip.sellingTitle"))}</h2>
<p style="margin:0 0 8px;font-size:14.5px;color:#5B6770">${escape(t("tip.sellingSub"))}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows.join("")}</table>
${input.marketplaceUrl ? `<p style="margin:12px 0 0;font-size:14.5px"><a href="${escape(input.marketplaceUrl)}" style="color:#0E2A38;font-weight:700">${escape(t("tip.moreMarketplace"))} &rarr;</a></p>` : ""}`;
  } else if (input.categories?.length) {
    const items = input.categories.slice(0, 5).map((category) => `<li style="margin:0 0 6px">${escape(category.name)} <span style="color:#5B6770">${escape(t("tip.categoryCount", { count: category.count }))}</span></li>`).join("");
    extra = `<h2 style="margin:30px 0 6px;font-size:19px;color:#0E2A38">${escape(t("tip.addingTitle"))}</h2>
<p style="margin:0 0 8px;font-size:14.5px;color:#5B6770">${escape(t("tip.addingSub"))}</p>
<ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.5">${items}</ul>`;
  }
  const video = tip.topic === "rex-videos" && input.video ? videoCard(input.video, t) : "";
  const story = input.story
    ? `<div style="margin:24px 0 6px;padding:18px 18px 16px;border-radius:18px;background:#EEF7F5;border:1px solid #D3ECE7"><div style="font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;color:#1F5F5A;margin-bottom:8px">${escape(t("story.eyebrow"))}</div>${input.story.result ? `<div style="font-size:17px;font-weight:700;line-height:1.35;color:#0E2A38;margin-bottom:6px">${escape(input.story.result)}</div>` : ""}<div style="font-size:15px;line-height:1.6;color:#1C2B33">&ldquo;${escape(input.story.story)}&rdquo;</div><div style="margin-top:8px;font-size:13.5px;font-weight:700;color:#1F5F5A">${escape(input.story.displayName)}${input.story.city ? `, ${escape(input.story.city)}` : ""}</div></div>`
    : "";
  const share = input.storyUrl ? `<p style="margin:18px 0 0;font-size:14px"><a href="${escape(input.storyUrl)}" style="color:#1F5F5A;font-weight:700">${escape(t("story.share"))} &rarr;</a></p>` : "";
  const bodyHtml = `<p style="margin:0 0 14px">${escape(t("hello", { name: input.firstName }))}</p>
<p style="margin:0 0 14px">${escape(t("tip.howsBusiness"))} ${escape(tip.intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px">${points}</table>
${example}
${video}
${extra}
${story}
${share}`;
  return {
    subject: tip.subject,
    preheader: tip.preheader,
    eyebrow: t("tip.eyebrow", { from }),
    heading: tip.title,
    bodyHtml,
    cta: { label: tip.cta.label, url: input.ctaUrl },
    persona: tip.from,
  };
}

/** The Rex video in a video tip: its cover picture (tap to watch) and who made it. */
function videoCard(video: NonNullable<TipEmailInput["video"]>, t: ReturnType<typeof mailT>) {
  const title = video.kind === "member" && video.name ? t("video.member", { name: video.name }) : video.kind === "yours" ? t("video.yours") : t("video.sample");
  const sub = video.kind === "yours" ? t("video.yoursHint") : video.caption ?? "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:22px auto 8px"><tr><td align="center">
<a href="${escape(video.videoUrl)}" style="display:block;text-decoration:none;color:#0E2A38">
<img src="${escape(video.posterUrl)}" alt="${escape(title)}" width="240" style="display:block;width:240px;max-width:100%;height:auto;border-radius:18px;border:1px solid #ECE6DA">
<span style="display:inline-block;margin-top:12px;padding:10px 18px;border-radius:999px;background:#0E2A38;color:#FFFFFF;font-size:14px;font-weight:700">&#9654; ${escape(t("video.watch"))}</span>
<span style="display:block;margin-top:10px;font-size:14.5px;font-weight:700">${escape(title)}</span>
${sub ? `<span style="display:block;margin-top:4px;font-size:13.5px;color:#5B6770">${escape(sub)}</span>` : ""}
</a></td></tr></table>`;
}

/** A reply that means "send me tips again" ("START", "subscribe", "unstop"). */
export function isStartWord(text: string | null | undefined) {
  return /^\s*(start|subscribe|unstop|resume|start tips)\s*[.!]?\s*$/i.test(text ?? "");
}

/** A reply that means "stop sending me tips" ("STOP", "stop tips", "unsubscribe"). */
export function isStopWord(text: string | null | undefined) {
  return /^\s*(stop|stop tips|stop all|unsubscribe|opt out|no more)\s*[.!]?\s*$/i.test(text ?? "");
}
