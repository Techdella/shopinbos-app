// The weekly tips from Rex & Peggy, pure: which tip someone gets next, when each channel sends (Lagos time), the
// email and the WhatsApp text. Unit-tested in tests/member-tips.test.mjs; the sending is tips.server.ts.

import type { Tip, TipRole } from "./tips-library";

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
  note?: string | null;
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
}

const naira = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;

/** The email's parts for the platform email shell (sendPlatformEmail). */
export function renderTipEmail(tip: Tip, input: TipEmailInput) {
  const from = FROM_NAME[tip.from];
  const points = tip.points.map((point) => `<li style="margin:0 0 10px">${escape(point)}</li>`).join("");
  const example = tip.example
    ? `<p style="margin:16px 0;padding:12px 14px;border-radius:12px;background:#F4F1EA;font-size:14px;line-height:1.5"><strong>Example:</strong> ${escape(tip.example)}</p>`
    : "";
  let extra = "";
  if (input.products?.length) {
    const cells = input.products
      .slice(0, 4)
      .map(
        (product) => `<td width="50%" valign="top" style="padding:6px">
  <a href="${escape(product.url)}" style="display:block;text-decoration:none;color:#0E2A38;border:1px solid #E7E2D8;border-radius:14px;overflow:hidden">
    ${product.image ? `<img src="${escape(product.image)}" alt="" width="260" style="display:block;width:100%;height:160px;object-fit:cover">` : ""}
    <span style="display:block;padding:10px 12px;font-size:14px;font-weight:700;line-height:1.35">${escape(product.name)}</span>
    <span style="display:block;padding:0 12px 12px;font-size:13px;color:#2E7E78">Sell for about ${naira(product.price)}${product.note ? ` · ${escape(product.note)}` : ""}</span>
  </a>
</td>`,
      );
    const rows: string[] = [];
    for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells[i]}${cells[i + 1] ?? '<td width="50%"></td>'}</tr>`);
    extra = `<h2 style="margin:28px 0 6px;font-size:18px">Top products to sell this week</h2>
<p style="margin:0 0 8px;font-size:14px;color:#55544F">What other shops are adding from the marketplace right now. Add any of them to your shop and sell without holding stock.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows.join("")}</table>
${input.marketplaceUrl ? `<p style="margin:10px 0 0;font-size:14px"><a href="${escape(input.marketplaceUrl)}" style="color:#0E2A38;font-weight:700">See more in the marketplace</a></p>` : ""}`;
  } else if (input.categories?.length) {
    const items = input.categories.slice(0, 5).map((category) => `<li style="margin:0 0 6px">${escape(category.name)} <span style="color:#55544F">(${category.count} added by shops)</span></li>`).join("");
    extra = `<h2 style="margin:28px 0 6px;font-size:18px">What shops are adding this week</h2>
<p style="margin:0 0 8px;font-size:14px;color:#55544F">The categories sellers added most from the marketplace in the last two weeks. Got stock in these? List it.</p>
<ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.5">${items}</ul>`;
  }
  const bodyHtml = `<p style="margin:0 0 14px">Hi ${escape(input.firstName)},</p>
<p style="margin:0 0 14px">${escape(tip.intro)}</p>
<ol style="margin:0 0 6px;padding-left:22px;font-size:15px;line-height:1.55">${points}</ol>
${example}
<p style="margin:16px 0 0">${tip.from === "rex" ? "Happy building," : "Talk soon,"}<br><strong>${from}</strong>, from Shopinbos</p>
${extra}`;
  return {
    subject: tip.subject,
    preheader: tip.preheader,
    eyebrow: `Tip from ${from}`,
    heading: tip.title,
    bodyHtml,
    cta: { label: tip.cta.label, url: input.ctaUrl },
  };
}

/** A reply that means "stop sending me tips" ("STOP", "stop tips", "unsubscribe"). */
export function isStopWord(text: string | null | undefined) {
  return /^\s*(stop|stop tips|stop all|unsubscribe|opt out|no more)\s*[.!]?\s*$/i.test(text ?? "");
}
