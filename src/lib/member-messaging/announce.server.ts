import "server-only";

import { db } from "@/lib/db/client";
import { appBase, sendPlatformEmail } from "@/lib/email/compliance.server";
import { metaTemplates, metaWhatsAppConfig, sendMetaTemplate } from "@/lib/lead-growth/whatsapp-meta.server";
import { referralCodeFor } from "@/lib/referrals/service.server";
import { REFERRAL_OFFERS, welcomeText, type ReferralRole } from "@shared/referrals";
import { MEMBER_TEMPLATES, memberTemplateImageUrl } from "./whatsapp-templates";
import { WHATSAPP_TIPS_EVENT } from "./tips.server";
import { firstNameOf } from "./tips-email";
import { overEmailCap, sendingHours } from "./journeys";

// The one-off "Refer & earn is here" announcement to every seller, supplier and delivery partner: an email with
// their own link and (when the template is approved) the WhatsApp invite. Started from Admin › Referrals, then sent in
// batches by the hourly journeys job in sending hours; each person once (MemberMessage "announce_referral" / "v1").

const SETTING = "member.announce.referral";
const KIND = "announce_referral";
const PERIOD = "v1";
const DAY = 86_400_000;

/** Who each role is nudged to invite (the people they know best), and the WhatsApp template for it. */
const PITCH: Record<ReferralRole, { invite: ReferralRole; template: string }> = {
  seller: { invite: "supplier", template: "shopinbos_refer_supplier" },
  supplier: { invite: "seller", template: "shopinbos_refer_seller" },
  logistics_partner: { invite: "logistics_partner", template: "shopinbos_refer_partner" },
};

export async function announcementState() {
  const row = await db.platformSetting.findUnique({ where: { key: SETTING } }).catch(() => null);
  const value = (row?.value ?? {}) as { active?: boolean; startedAt?: string; finishedAt?: string };
  const sent = await db.memberMessage.count({ where: { kind: KIND, period: PERIOD, status: "sent" } }).catch(() => 0);
  return { active: value.active === true, startedAt: value.startedAt ?? null, finishedAt: value.finishedAt ?? null, sent };
}

export async function startReferralAnnouncement(userId: string) {
  const value = { active: true, startedAt: new Date().toISOString(), by: userId };
  await db.platformSetting.upsert({ where: { key: SETTING }, create: { key: SETTING, value }, update: { value } });
}

export async function stopReferralAnnouncement() {
  const current = await announcementState();
  const value = { active: false, startedAt: current.startedAt, finishedAt: new Date().toISOString() };
  await db.platformSetting.upsert({ where: { key: SETTING }, create: { key: SETTING, value }, update: { value } });
}

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function emailFor(role: ReferralRole, firstName: string, link: string) {
  const rows = (Object.values(REFERRAL_OFFERS) as Array<(typeof REFERRAL_OFFERS)[ReferralRole]>)
    .map((offer) => `<li style="margin:0 0 10px"><strong>Refer ${offer.noun}:</strong> you get ${offer.referrerMonths} month${offer.referrerMonths === 1 ? "" : "s"} free or ${offer.referrerCredits} AI credits. They get ${escape(welcomeText(offer.role))}.</li>`)
    .join("");
  const best = REFERRAL_OFFERS[PITCH[role].invite];
  return {
    subject: `New: invite ${best.noun}, get ${best.referrerMonths} month${best.referrerMonths === 1 ? "" : "s"} free`,
    preheader: "Or AI credits for Rex videos. They get a welcome gift too.",
    eyebrow: "Refer & earn",
    heading: "Invite businesses you know, get rewarded",
    bodyHtml: `<p style="margin:0 0 14px">Hi ${escape(firstName)},</p>
<p style="margin:0 0 14px">You know suppliers, shops and riders who should be on Shopinbos. Now every one you bring in earns you free months on your plan or AI credits, your choice.</p>
<ul style="margin:0 0 14px;padding-left:20px;line-height:1.5">${rows}</ul>
<p style="margin:0 0 14px">Your link: <a href="${escape(link)}" style="color:#0E2A38;font-weight:700">${escape(link)}</a>. Share it on WhatsApp, it takes ten seconds. A reward counts when they're properly set up, and you can see their progress on your Refer &amp; earn page.</p>`,
    cta: { label: "Get my link", url: `${appBase()}/refer` },
  };
}

/** One batch of the announcement (called by the hourly journeys job). */
export async function runReferralAnnouncement(now = new Date(), deadline = Date.now() + 120_000) {
  const state = await announcementState();
  if (!state.active || !sendingHours(now)) return { active: state.active, sent: 0 };
  const config = metaWhatsAppConfig();
  const list = config ? await metaTemplates(config) : null;
  const approved = new Set(list?.ok ? list.templates.filter((t) => t.status === "APPROVED").map((t) => t.name) : []);
  let sent = 0;
  while (Date.now() < deadline) {
    const people = await db.$queryRaw<Array<{ id: string; name: string | null; email: string | null; phone: string | null; role: string }>>`
      SELECT u."id", u."name", u."email", u."phone", u."role"::text AS role
      FROM "User" u
      WHERE u."role"::text IN ('seller', 'supplier', 'logistics_partner')
        AND u."verificationStatus"::text <> 'suspended'
        AND NOT EXISTS (SELECT 1 FROM "MemberMessage" m WHERE m."userId" = u."id" AND m."kind" = ${KIND} AND m."period" = ${PERIOD})
      ORDER BY u."createdAt" ASC
      LIMIT 100`;
    if (!people.length) {
      await stopReferralAnnouncement();
      break;
    }
    for (const person of people) {
      if (Date.now() >= deadline) break;
      const role = person.role as ReferralRole;
      let row;
      try {
        row = await db.memberMessage.create({ data: { userId: person.id, kind: KIND, period: PERIOD, ref: "referral", channel: "email" } });
      } catch {
        continue;
      }
      const firstName = firstNameOf(person.name);
      let status = "skipped";
      let error: string | null = null;
      try {
        const code = await referralCodeFor(person.id);
        const link = `${appBase()}/r/${code.code}?for=${PITCH[role].invite}`;
        const weekly = await db.memberMessage.count({ where: { userId: person.id, channel: "email", status: "sent", sentAt: { gte: new Date(now.getTime() - 7 * DAY) } } });
        if (person.email && !overEmailCap(weekly)) {
          const result = await sendPlatformEmail({ to: person.email, user: { id: person.id, role }, kind: "marketing", topic: "product_news", ...emailFor(role, firstName, link) });
          status = result.success ? "sent" : /turned off/i.test(result.message ?? "") ? "skipped" : "failed";
          if (!result.success) error = result.message ?? null;
        }
        const template = MEMBER_TEMPLATES.find((t) => t.name === PITCH[role].template);
        const off = await db.notificationPreference.findUnique({ where: { userId_eventKey_category: { userId: person.id, eventKey: WHATSAPP_TIPS_EVENT, category: "system" } } }).catch(() => null);
        if (config && template && approved.has(template.name) && person.phone && !(off && !off.whatsapp)) {
          const offer = REFERRAL_OFFERS[PITCH[role].invite];
          const wa = await sendMetaTemplate(config, { to: person.phone, template: template.name, language: template.language, params: [firstName, `${offer.referrerMonths} month${offer.referrerMonths === 1 ? "" : "s"} free or ${offer.referrerCredits} AI credits`], headerImage: memberTemplateImageUrl(template) });
          if (wa.ok && status !== "sent") status = "sent";
        }
      } catch (caught) {
        status = "failed";
        error = caught instanceof Error ? caught.message : "failed";
      }
      await db.memberMessage.update({ where: { id: row.id }, data: { status, error: error?.slice(0, 500) ?? null, sentAt: status === "sent" ? new Date() : null } });
      if (status === "sent") sent++;
    }
  }
  return { active: true, sent };
}
