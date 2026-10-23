import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { appBase, sendPlatformEmail } from "@/lib/email/compliance.server";
import { metaTemplates, metaWhatsAppConfig, sendMetaTemplate } from "@/lib/lead-growth/whatsapp-meta.server";
import { MEMBER_TEMPLATES, memberTemplateImageUrl } from "./whatsapp-templates";
import { TIPS, type Tip, type TipRole } from "./tips-library";
import { FROM_NAME, firstNameOf, nextTip, renderTipEmail, tipDue, tipWeek, whatsappTipText, type TipChannel, type TipProduct } from "./tips-email";

// Weekly tips from Rex & Peggy to sellers, suppliers and delivery partners: a WhatsApp tip on Wednesdays and an email
// on Thursdays, from 10:00 Lagos (tips-email.ts has the timing and the email). Both are off until an admin switches
// them on (Admin › Leads › Member tips, PlatformSetting "member.tips").
//
// Each person gets one tip per channel per week: a MemberMessage row (unique person + kind + week) is claimed before
// anything is sent, so two runs never double up. They get the tips in order, and never the same one twice in a row
// across both channels. Email follows their "Tips from Rex and Peggy" preference (the unsubscribe link turns it off);
// WhatsApp stops when they reply STOP (a NotificationPreference row "whatsapp.tips").

const SETTING = "member.tips";
const ROLES: TipRole[] = ["seller", "supplier", "logistics_partner"];
const KIND: Record<TipChannel, string> = { email: "tip_email", whatsapp: "tip_whatsapp" };
const WA_TEMPLATE: Record<TipRole, string> = { seller: "shopinbos_tip_seller", supplier: "shopinbos_tip_supplier", logistics_partner: "shopinbos_tip_partner" };
/** New accounts get their setup help first: tips start a few days in. */
const NEW_ACCOUNT_DAYS = 3;
const DAY = 86_400_000;

export type TipSettings = { email: boolean; whatsapp: boolean };

export async function tipSettings(): Promise<TipSettings> {
  const row = await db.platformSetting.findUnique({ where: { key: SETTING } }).catch(() => null);
  const value = (row?.value ?? {}) as Partial<TipSettings>;
  return { email: value.email === true, whatsapp: value.whatsapp === true };
}

export async function saveTipSettings(settings: TipSettings, userId: string) {
  const value = { email: settings.email, whatsapp: settings.whatsapp, updatedBy: userId, updatedAt: new Date().toISOString() };
  await db.platformSetting.upsert({ where: { key: SETTING }, create: { key: SETTING, value }, update: { value } });
}

export const WHATSAPP_TIPS_EVENT = "whatsapp.tips";

/** "STOP" on WhatsApp: no more weekly tips for the accounts on this number. Returns how many accounts it covered. */
export async function stopWhatsAppTips(phone: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length < 10) return 0;
  const users = await db.user.findMany({ where: { phone: { endsWith: digits } }, select: { id: true, role: true } });
  for (const user of users) {
    await db.notificationPreference.upsert({
      where: { userId_eventKey_category: { userId: user.id, eventKey: WHATSAPP_TIPS_EVENT, category: "system" } },
      create: { userId: user.id, role: user.role, eventKey: WHATSAPP_TIPS_EVENT, category: "system", inApp: false, whatsapp: false },
      update: { whatsapp: false },
    });
  }
  return users.length;
}

async function whatsappTipsOff(userId: string) {
  const row = await db.notificationPreference.findUnique({ where: { userId_eventKey_category: { userId, eventKey: WHATSAPP_TIPS_EVENT, category: "system" } } }).catch(() => null);
  return row ? !row.whatsapp : false;
}

/** The link in the email and WhatsApp button: records the tap, then opens the page (/tip/<tip>?m=<message>). */
export function tipLink(tip: Tip, messageId: string | null) {
  return `${appBase()}/tip/${tip.id}${messageId ? `?m=${messageId}` : ""}`;
}

/** /tip/<tip>: where the tip's button goes. Records the first tap on that message. */
export async function openTip(tipId: string, messageId: string | null) {
  const tip = TIPS.find((item) => item.id === tipId);
  if (messageId) await db.memberMessage.updateMany({ where: { id: messageId, ref: tipId, clickedAt: null }, data: { clickedAt: new Date() } }).catch(() => undefined);
  return tip?.cta.path ?? "/";
}

// ─── What's selling (for the emails) ──────────────────────────────────────────

/** Marketplace products shops added most in the last 2 weeks (newest listings if nothing was added). */
async function topProducts(limit = 4): Promise<TipProduct[]> {
  const since = new Date(Date.now() - 14 * DAY);
  const added = await db.storeProduct
    .groupBy({ by: ["supplierProductId"], where: { supplierProductId: { not: null }, createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { supplierProductId: "desc" } }, take: 20 })
    .catch(() => []);
  const counts = new Map(added.map((row) => [row.supplierProductId as string, row._count._all]));
  const select = { id: true, name: true, images: true, suggestedRetailPrice: true } as const;
  let products = counts.size
    ? (await db.supplierProduct.findMany({ where: { id: { in: [...counts.keys()] }, status: "published" }, select })).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
    : [];
  if (products.length < limit) {
    const more = await db.supplierProduct.findMany({ where: { status: "published", images: { isEmpty: false }, id: { notIn: products.map((p) => p.id) } }, orderBy: { createdAt: "desc" }, take: limit - products.length, select });
    products = [...products, ...more];
  }
  return products.slice(0, limit).map((product) => {
    const shops = counts.get(product.id) ?? 0;
    return {
      name: product.name,
      price: product.suggestedRetailPrice,
      image: product.images[0] ?? null,
      url: `${appBase()}/marketplace/product/${product.id}`,
      note: shops > 1 ? `added by ${shops} shops` : null,
    };
  });
}

/** Categories shops added most from the marketplace in the last 2 weeks (for suppliers). */
async function topCategories(limit = 5) {
  const since = new Date(Date.now() - 14 * DAY);
  const rows = await db.$queryRaw<Array<{ name: string; count: bigint }>>`
    SELECT c."name" AS name, COUNT(*)::bigint AS count
    FROM "StoreProduct" sp
    JOIN "SupplierProduct" p ON p."id" = sp."supplierProductId"
    JOIN "Category" c ON c."id" = p."categoryId"
    WHERE sp."createdAt" >= ${since}
    GROUP BY c."name"
    ORDER BY count DESC
    LIMIT ${limit}`.catch(() => []);
  return rows.map((row) => ({ name: row.name, count: Number(row.count) }));
}

// ─── Sending ──────────────────────────────────────────────────────────────────

type Candidate = { id: string; name: string | null; email: string | null; phone: string | null; role: string };

/** People due this week's tip on this channel who haven't been claimed yet. */
async function candidates(channel: TipChannel, period: string, take: number): Promise<Candidate[]> {
  const kind = KIND[channel];
  const joinedBefore = new Date(Date.now() - NEW_ACCOUNT_DAYS * DAY);
  const contact = channel === "email" ? Prisma.sql`u."email" IS NOT NULL AND u."email" <> ''` : Prisma.sql`u."phone" IS NOT NULL AND length(u."phone") >= 10`;
  return db.$queryRaw<Candidate[]>`
    SELECT u."id", u."name", u."email", u."phone", u."role"::text AS role
    FROM "User" u
    WHERE u."role"::text IN ('seller', 'supplier', 'logistics_partner')
      AND u."verificationStatus"::text <> 'suspended'
      AND u."createdAt" < ${joinedBefore}
      AND ${contact}
      AND NOT EXISTS (SELECT 1 FROM "MemberMessage" m WHERE m."userId" = u."id" AND m."kind" = ${kind} AND m."period" = ${period})
    ORDER BY u."createdAt" ASC
    LIMIT ${take}`;
}

async function historyFor(userId: string) {
  const rows = await db.memberMessage.findMany({ where: { userId, kind: { in: [KIND.email, KIND.whatsapp] }, status: { in: ["sent", "claimed"] } }, select: { ref: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 120 });
  return rows.map((row) => ({ ref: row.ref, at: row.createdAt }));
}

/** Claims this person's slot for the week; null when another run already has it. */
async function claim(userId: string, channel: TipChannel, period: string, tip: Tip) {
  try {
    return await db.memberMessage.create({ data: { userId, kind: KIND[channel], period, ref: tip.id, channel } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return null;
    throw error;
  }
}

async function finish(id: string, result: { ok: boolean; error?: string | null; skipped?: boolean; providerId?: string | null }) {
  await db.memberMessage.update({
    where: { id },
    data: { status: result.skipped ? "skipped" : result.ok ? "sent" : "failed", error: result.error?.slice(0, 500) ?? null, providerId: result.providerId ?? null, sentAt: result.ok ? new Date() : null },
  });
}

/** Approved WhatsApp tip templates (by role). Empty when the number isn't connected. */
async function approvedTipTemplates() {
  const config = metaWhatsAppConfig();
  if (!config) return { config: null, approved: new Set<string>() };
  const list = await metaTemplates(config);
  if (!list.ok) return { config, approved: new Set<string>() };
  return { config, approved: new Set(list.templates.filter((t) => t.status === "APPROVED").map((t) => t.name)) };
}

export type TipRunResult = { channel: TipChannel; due: boolean; enabled: boolean; sent: number; failed: number; skipped: number; note?: string };

async function runChannel(channel: TipChannel, now: Date, deadline: number): Promise<TipRunResult> {
  const result: TipRunResult = { channel, due: tipDue(channel, now), enabled: false, sent: 0, failed: 0, skipped: 0 };
  result.enabled = (await tipSettings())[channel];
  if (!result.due || !result.enabled) return result;
  const period = tipWeek(now);

  const wa = channel === "whatsapp" ? await approvedTipTemplates() : null;
  if (wa && (!wa.config || !wa.approved.size)) return { ...result, note: "WhatsApp tip templates aren't approved yet" };
  const products = channel === "email" ? await topProducts() : [];
  const categories = channel === "email" ? await topCategories() : [];

  while (Date.now() < deadline) {
    const batch = await candidates(channel, period, 100);
    if (!batch.length) break;
    for (const person of batch) {
      if (Date.now() >= deadline) break;
      const role = person.role as TipRole;
      const tip = nextTip(TIPS, role, await historyFor(person.id));
      if (!tip) continue;
      const row = await claim(person.id, channel, period, tip);
      if (!row) continue;
      try {
        if (channel === "email") {
          const email = renderTipEmail(tip, {
            firstName: firstNameOf(person.name),
            ctaUrl: tipLink(tip, row.id),
            products: role === "seller" ? products : undefined,
            categories: role === "supplier" ? categories : undefined,
            marketplaceUrl: `${appBase()}/marketplace`,
          });
          const sent = await sendPlatformEmail({ to: person.email!, user: { id: person.id, role }, kind: "marketing", topic: "tips", ...email });
          const off = !sent.success && /turned off/i.test(sent.message ?? "");
          await finish(row.id, { ok: sent.success, skipped: off, error: sent.success ? null : sent.message, providerId: sent.success ? sent.id ?? null : null });
          if (sent.success) result.sent++;
          else if (off) result.skipped++;
          else result.failed++;
        } else {
          const template = MEMBER_TEMPLATES.find((t) => t.name === WA_TEMPLATE[role]);
          if (!template || !wa!.approved.has(template.name) || (await whatsappTipsOff(person.id))) {
            await finish(row.id, { ok: false, skipped: true, error: !template || !wa!.approved.has(WA_TEMPLATE[role]) ? "Template not approved" : "Turned off (STOP)" });
            result.skipped++;
            continue;
          }
          const sent = await sendMetaTemplate(wa!.config!, {
            to: person.phone!,
            template: template.name,
            language: template.language,
            params: [firstNameOf(person.name), FROM_NAME[tip.from], whatsappTipText(tip)],
            headerImage: memberTemplateImageUrl(template),
            buttonUrlSuffix: `${tip.id}?m=${row.id}`,
          });
          await finish(row.id, { ok: sent.ok, error: sent.ok ? null : sent.error, providerId: sent.ok ? sent.id : null });
          if (sent.ok) result.sent++;
          else result.failed++;
        }
      } catch (error) {
        await finish(row.id, { ok: false, error: error instanceof Error ? error.message : "send failed" }).catch(() => undefined);
        result.failed++;
      }
    }
  }
  return result;
}

/** The tips job (every 15 minutes): WhatsApp on Wednesdays, email on Thursdays, when switched on. */
export async function runTipsJob(now = new Date(), deadline = Date.now() + 240_000) {
  const whatsapp = await runChannel("whatsapp", now, deadline);
  const email = await runChannel("email", now, deadline);
  return { week: tipWeek(now), whatsapp, email };
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/** Sends one tip email to an admin to check it (not logged, ignores the switches). */
export async function sendTipTest(tipId: string, admin: { id: string; email: string | null; name: string | null }) {
  const tip = TIPS.find((item) => item.id === tipId);
  if (!tip) return { ok: false as const, error: "Unknown tip" };
  if (!admin.email) return { ok: false as const, error: "Your account has no email address." };
  const [products, categories] = await Promise.all([tip.role === "seller" ? topProducts() : Promise.resolve([]), tip.role === "supplier" ? topCategories() : Promise.resolve([])]);
  const email = renderTipEmail(tip, { firstName: firstNameOf(admin.name), ctaUrl: tipLink(tip, null), products, categories, marketplaceUrl: `${appBase()}/marketplace` });
  const sent = await sendPlatformEmail({ to: admin.email, user: { id: admin.id, role: tip.role }, kind: "notification", ...email, subject: `[Test] ${email.subject}` });
  return sent.success ? { ok: true as const } : { ok: false as const, error: sent.message ?? "Couldn't send" };
}

/** This week and the last few: sent, failed, skipped and taps per channel. */
export async function tipStats(weeks = 4, now = new Date()) {
  const periods = Array.from({ length: weeks }, (_, i) => tipWeek(new Date(now.getTime() - i * 7 * DAY)));
  const rows = await db.memberMessage.groupBy({ by: ["kind", "period", "status"], where: { kind: { in: [KIND.email, KIND.whatsapp] }, period: { in: periods } }, _count: { _all: true } }).catch(() => []);
  const clicks = await db.memberMessage.groupBy({ by: ["kind", "period"], where: { kind: { in: [KIND.email, KIND.whatsapp] }, period: { in: periods }, clickedAt: { not: null } }, _count: { _all: true } }).catch(() => []);
  return periods.map((period) => {
    const of = (kind: string, status: string) => rows.find((row) => row.kind === kind && row.period === period && row.status === status)?._count._all ?? 0;
    const tapped = (kind: string) => clicks.find((row) => row.kind === kind && row.period === period)?._count._all ?? 0;
    return {
      period,
      email: { sent: of(KIND.email, "sent"), failed: of(KIND.email, "failed"), skipped: of(KIND.email, "skipped"), taps: tapped(KIND.email) },
      whatsapp: { sent: of(KIND.whatsapp, "sent"), failed: of(KIND.whatsapp, "failed"), skipped: of(KIND.whatsapp, "skipped"), taps: tapped(KIND.whatsapp) },
    };
  });
}

/** How many people each channel would reach this week (roughly: everyone eligible). */
export async function tipAudience() {
  const joinedBefore = new Date(Date.now() - NEW_ACCOUNT_DAYS * DAY);
  const base = { role: { in: ROLES }, verificationStatus: { not: "suspended" as const }, createdAt: { lt: joinedBefore } };
  const [email, whatsapp] = await Promise.all([
    db.user.count({ where: { ...base, email: { not: null } } }),
    db.user.count({ where: { ...base, phone: { not: null } } }),
  ]);
  return { email, whatsapp };
}
