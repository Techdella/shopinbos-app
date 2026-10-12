import "server-only";

import { randomBytes } from "node:crypto";
import type { AutomationTrigger, Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { createNotification } from "@/lib/notifications/create";
import { formatFromAddress, isEmailConfigured, sendEmailBatch } from "@/lib/notifications/resend";
import { requestReviews } from "@/lib/reviews/requests";
import { MARKETING_STORE_SELECT, emailBrand, storeUrl, unsubscribeUrl, type MarketingStore } from "@/lib/marketing/brand";
import { isMarketingOptOutError, textSender } from "@/lib/marketing/channels";
import { loadOptOuts, recordOptOut } from "@/lib/marketing/opt-outs";
import { mayText, purposeOfTrigger, type TextChannel } from "@/lib/marketing/text-channels";
import { defaultHeaderImage, resolveTemplate, sendTemplate } from "@/lib/marketing/whatsapp-templates.server";
import { getMessagingSettings } from "@/lib/marketing/messaging-settings";
import { contactsInSegment, loadContacts, segmentRules } from "@/lib/marketing/contacts";
import { wrapEmail } from "@/lib/marketing/email-layout";
import { fillVariables, firstName, parseFlowConfig, type FlowStep, type FlowVariables } from "@/lib/marketing/flows";
import { normalizeEmail, normalizePhone } from "@/lib/marketing/segment-rules";

// The automation runner. A trigger (an order event, a sign-up, or a sweep over carts, wishlists, lapsed
// customers and birthdays) enrolls a contact in every live flow for that trigger. Each enrollment walks the
// flow's steps: actions run straight away, a wait parks it until nextRunAt, a failed condition ends it.
// /api/cron/marketing picks up parked enrollments. Every step outcome goes to AutomationLog.

const DAY = 86_400_000;
const LEASE_MS = 10 * 60_000;
const PAID = [...PAID_ORDER_STATUSES] as string[];

type Rule = { id: string; storeId: string; name: string; trigger: string; actionType: string; actionConfig: unknown; delayMinutes: number; active: boolean };
type Enrollment = Awaited<ReturnType<typeof db.automationEnrollment.findFirstOrThrow>>;

export interface EnrollContact {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function log(enrollment: Pick<Enrollment, "id" | "storeId" | "automationId">, stepIndex: number, stepType: string, status: "ok" | "skipped" | "failed" | "exited", message: string, recipient?: string | null) {
  await db.automationLog
    .create({ data: { storeId: enrollment.storeId, automationId: enrollment.automationId, enrollmentId: enrollment.id, stepIndex, stepType, status, message: message.slice(0, 500), recipient: recipient ?? null } })
    .catch((error) => console.error("[automations] log failed", error));
}

/** Puts a contact into a flow once (per dedupeKey). Returns the enrollment id, or null if already in or nothing to do. */
export async function enroll(rule: Rule, contact: EnrollContact, context: Record<string, unknown>, dedupeKey: string, options: { runNow?: boolean } = {}) {
  const { steps } = parseFlowConfig(rule.actionConfig, rule);
  if (!rule.active || !steps.length) return null;
  const email = normalizeEmail(contact.email);
  const phone = normalizePhone(contact.phone);
  if (!email && !phone) return null;
  const enrollment = await db.automationEnrollment
    .create({
      data: {
        storeId: rule.storeId,
        automationId: rule.id,
        dedupeKey: dedupeKey.slice(0, 200),
        email,
        phone,
        name: contact.name?.trim() || null,
        context: context as Prisma.InputJsonValue,
        nextRunAt: new Date(),
      },
    })
    .catch(() => null); // unique (automationId, dedupeKey): already enrolled
  if (!enrollment) return null;
  await Promise.all([
    log(enrollment, 0, "enrolled", "ok", "Started the flow", email ?? phone),
    db.automationRule.update({ where: { id: rule.id }, data: { lastTriggeredAt: new Date() } }).catch(() => null),
  ]);
  if (options.runNow) await runEnrollment(enrollment.id).catch((error) => console.error("[automations] run failed", error));
  return enrollment.id;
}

async function rulesFor(storeId: string, triggers: string[]) {
  return db.automationRule.findMany({
    where: { storeId, active: true, trigger: { in: triggers as AutomationTrigger[] } },
    select: { id: true, storeId: true, name: true, trigger: true, actionType: true, actionConfig: true, delayMinutes: true, active: true },
  });
}

// ─── Running a contact through the steps ──────────────────────────────────────

/** Leases a due enrollment (so overlapping cron runs can't double-send) and advances it. */
export async function runEnrollment(id: string, now = new Date()) {
  const leased = await db.automationEnrollment.updateMany({
    where: { id, status: "active", nextRunAt: { lte: now } },
    data: { nextRunAt: new Date(now.getTime() + LEASE_MS) },
  });
  if (!leased.count) return;
  const enrollment = await db.automationEnrollment.findUnique({ where: { id } });
  if (!enrollment) return;
  const rule = await db.automationRule.findUnique({ where: { id: enrollment.automationId } });
  const finish = (status: "completed" | "exited", exitReason: string | null) =>
    db.automationEnrollment.update({ where: { id }, data: { status, exitReason, nextRunAt: null, completedAt: new Date() } });
  if (!rule) return void (await finish("exited", "The flow was deleted"));
  if (!rule.active) {
    await log(enrollment, enrollment.currentStep, "exit", "exited", "The flow was turned off");
    return void (await finish("exited", "The flow was turned off"));
  }

  const store = await db.store.findUnique({ where: { id: rule.storeId }, select: { ...MARKETING_STORE_SELECT, userId: true } });
  if (!store) return void (await finish("exited", "Store not found"));
  const { steps } = parseFlowConfig(rule.actionConfig, rule);
  const context = record(enrollment.context);

  for (let index = enrollment.currentStep; index < steps.length; index++) {
    const step = steps[index];
    if (step.type === "wait") {
      await db.automationEnrollment.update({ where: { id }, data: { currentStep: index + 1, nextRunAt: new Date(Date.now() + step.minutes * 60_000), context: context as Prisma.InputJsonValue } });
      return;
    }
    if (step.type === "condition") {
      const passed = await checkCondition(step, enrollment, store.id);
      if (!passed.ok) {
        await log(enrollment, index, "condition", "exited", passed.reason);
        await db.automationEnrollment.update({ where: { id }, data: { context: context as Prisma.InputJsonValue } });
        return void (await finish("exited", passed.reason));
      }
      continue;
    }
    const outcome = await runAction(step, { enrollment, store, context, trigger: rule.trigger }).catch((error): ActionOutcome => ({ status: "failed", message: String(error instanceof Error ? error.message : error) }));
    await log(enrollment, index, step.type, outcome.status, outcome.message, outcome.recipient);
    await db.automationEnrollment.update({ where: { id }, data: { currentStep: index + 1, context: context as Prisma.InputJsonValue } });
  }
  await finish("completed", null);
}

async function orderedSince(storeId: string, enrollment: Pick<Enrollment, "email" | "phone" | "createdAt">) {
  const or: Prisma.RetailOrderWhereInput[] = [];
  if (enrollment.email) or.push({ buyerEmail: { equals: enrollment.email, mode: "insensitive" } });
  if (enrollment.phone) or.push({ buyerPhone: { contains: enrollment.phone.slice(-10) } });
  if (!or.length) return false;
  const order = await db.retailOrder.findFirst({ where: { storeId, createdAt: { gt: enrollment.createdAt }, status: { not: "cancelled" }, OR: or }, select: { id: true } });
  return Boolean(order);
}

async function checkCondition(step: Extract<FlowStep, { type: "condition" }>, enrollment: Enrollment, storeId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const context = record(enrollment.context);
  switch (step.check) {
    case "not_ordered_since_start":
      return (await orderedSince(storeId, enrollment)) ? { ok: false, reason: "They ordered, so the flow stopped" } : { ok: true };
    case "ordered_since_start":
      return (await orderedSince(storeId, enrollment)) ? { ok: true } : { ok: false, reason: "They haven't ordered" };
    case "cart_not_recovered": {
      const cartId = typeof context.cartEventId === "string" ? context.cartEventId : null;
      if (cartId) {
        const cart = await db.abandonedCartEvent.findFirst({ where: { id: cartId, storeId }, select: { recoveredAt: true } });
        if (!cart || cart.recoveredAt) return { ok: false, reason: "Their cart was paid for" };
      }
      return (await orderedSince(storeId, enrollment)) ? { ok: false, reason: "They ordered, so the flow stopped" } : { ok: true };
    }
    case "subscribed": {
      if (!enrollment.email) return { ok: true };
      const row = await db.subscriber.findUnique({ where: { storeId_email: { storeId, email: enrollment.email } }, select: { status: true } });
      return !row || row.status === "active" ? { ok: true } : { ok: false, reason: "They unsubscribed" };
    }
    case "in_segment": {
      const rules = step.segmentId ? await segmentRules(storeId, step.segmentId) : null;
      if (!rules?.conditions.length) return { ok: false, reason: "The segment has no rules or was deleted" };
      const members = await contactsInSegment(storeId, rules);
      const inside = members.some((c) => (enrollment.email && c.email === enrollment.email) || (enrollment.phone && c.phone === enrollment.phone));
      return inside ? { ok: true } : { ok: false, reason: "Not in the segment" };
    }
    case "has_email":
      return enrollment.email ? { ok: true } : { ok: false, reason: "No email address" };
    case "has_phone":
      return enrollment.phone ? { ok: true } : { ok: false, reason: "No phone number" };
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

type ActionOutcome = { status: "ok" | "skipped" | "failed"; message: string; recipient?: string | null };
type ActionInput = { enrollment: Enrollment; store: MarketingStore & { userId: string }; context: Record<string, unknown>; trigger: string };

const money = (amount: number, currency = "NGN") => new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

function variables({ enrollment, store, context }: ActionInput, mode: "email" | "text"): FlowVariables {
  const currency = typeof context.currency === "string" ? context.currency : store.currency;
  const total = Number(context.orderTotal);
  const cartTotal = Number(context.cartTotal);
  return {
    name: firstName(enrollment.name) || "there",
    full_name: enrollment.name ?? "",
    store: store.name,
    store_url: typeof context.productUrl === "string" && context.productUrl ? String(context.productUrl) : storeUrl(store),
    cart_url: typeof context.cartUrl === "string" ? context.cartUrl : storeUrl(store, "/cart"),
    cart_items: typeof context.cartItems === "string" ? context.cartItems : "",
    cart_total: Number.isFinite(cartTotal) && cartTotal > 0 ? money(cartTotal, currency) : "",
    order_number: typeof context.orderNumber === "string" ? context.orderNumber : "",
    order_total: Number.isFinite(total) && total > 0 ? money(total, currency) : "",
    product_name: typeof context.productName === "string" ? context.productName : "",
    discount_code: typeof context.discountCode === "string" ? context.discountCode : "",
    unsubscribe_url: mode === "email" && enrollment.email ? unsubscribeUrl(store.id, enrollment.email) : "",
    currency,
  };
}

async function suppressed(storeId: string, email: string | null) {
  if (!email) return false;
  const row = await db.subscriber.findUnique({ where: { storeId_email: { storeId, email } }, select: { status: true } });
  return Boolean(row && row.status !== "active");
}

/** Whether this person's latest consent record allows marketing on the channel (matched by email, else phone). */
async function textConsent(storeId: string, email: string | null, phone: string | null, channel: TextChannel) {
  const or: Prisma.SubscriberWhereInput[] = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone }, { phone: phone.replace(/^\+234/, "0") }, { phone: phone.slice(1) });
  if (!or.length) return false;
  const rows = await db.subscriber.findMany({ where: { storeId, OR: or }, select: { status: true, metadata: true }, take: 5 });
  return rows.some((row) => {
    const metadata = record(row.metadata);
    if (row.status === "spam" || metadata.textOptOut) return false;
    const history = Array.isArray(metadata.consent) ? (metadata.consent as Array<Record<string, unknown>>) : [];
    return history[history.length - 1]?.[channel] === true;
  });
}

async function noteCartReminder(context: Record<string, unknown>) {
  if (typeof context.cartEventId !== "string") return;
  await db.abandonedCartEvent.updateMany({ where: { id: context.cartEventId }, data: { remindersSent: { increment: 1 }, lastReminderAt: new Date() } }).catch(() => null);
}

async function runAction(step: FlowStep, input: ActionInput): Promise<ActionOutcome> {
  const { enrollment, store, context } = input;
  switch (step.type) {
    case "send_email": {
      if (!enrollment.email) return { status: "skipped", message: "No email address" };
      if (!isEmailConfigured()) return { status: "skipped", message: "Email isn't set up (RESEND_API_KEY)" };
      if (await suppressed(store.id, enrollment.email)) return { status: "skipped", message: "They unsubscribed", recipient: enrollment.email };
      let subject = step.subject;
      let body = step.bodyHtml;
      if (step.templateId && (!subject || !body.trim())) {
        const template = await db.emailTemplate.findFirst({ where: { id: step.templateId, storeId: store.id }, select: { subject: true, bodyHtml: true } });
        subject ||= template?.subject ?? "";
        if (!body.trim()) body = template?.bodyHtml ?? "";
      }
      if (!subject || !body.trim()) return { status: "skipped", message: "The email has no subject or content" };
      const vars = variables(input, "email");
      const brand = emailBrand(store);
      const footer = `<p style="margin:28px 0 0;font-size:12px;color:#8A8796;text-align:center">You're getting this because you shopped with or subscribed to ${fillVariables("{{store}}", vars, "html")}. <a href="${fillVariables("{{unsubscribe_url}}", vars, "html")}" style="color:#8A8796">Unsubscribe</a></p>`;
      const html = wrapEmail({ bodyHtml: fillVariables(body, { ...vars, brand_accent: brand.accent }, "html") + footer, brand });
      const result = await sendEmailBatch([
        {
          to: enrollment.email,
          subject: fillVariables(subject, vars, "text"),
          html,
          from: formatFromAddress(store.name),
          headers: { "List-Unsubscribe": `<${vars.unsubscribe_url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        },
      ]);
      if (!result.success) return { status: "failed", message: result.message ?? "The email provider refused it", recipient: enrollment.email };
      await noteCartReminder(context);
      return { status: "ok", message: `Sent "${fillVariables(subject, vars, "text")}"`, recipient: enrollment.email };
    }
    case "send_sms":
    case "send_whatsapp": {
      const channel: TextChannel = step.type === "send_sms" ? "sms" : "whatsapp";
      const label = channel === "sms" ? "SMS" : "WhatsApp";
      if (!enrollment.phone) return { status: "skipped", message: "No phone number" };
      // Order and cart flows may text the phone given at checkout; marketing flows need that channel's opt-in.
      const purpose = purposeOfTrigger(input.trigger);
      const consent = purpose === "transactional" || (await textConsent(store.id, enrollment.email, enrollment.phone, channel));
      const allowed = mayText({ channel, phone: enrollment.phone, purpose, consent, optOuts: await loadOptOuts(store.id) });
      if (!allowed.ok) return { status: "skipped", message: `${label}: ${allowed.reason}`, recipient: enrollment.phone };
      if (purpose === "marketing" && enrollment.email && (await suppressed(store.id, enrollment.email))) return { status: "skipped", message: "They unsubscribed", recipient: enrollment.phone };
      const settings = channel === "sms" ? await getMessagingSettings(store.id) : null;
      const sender = await textSender(store, { senderId: settings?.smsSenderId });
      let result: { ok: true; externalId: string | null } | { ok: false; error: string };
      if (step.type === "send_whatsapp" && step.template) {
        const template = await resolveTemplate(store.id, step.template);
        if (!template) return { status: "skipped", message: step.template.startsWith("preset:") ? `WhatsApp: no approved "${step.template.slice(7).replace(/_/g, " ")}" template yet. Add it in Marketing › WhatsApp templates.` : "WhatsApp: the template was deleted", recipient: enrollment.phone };
        const vars = variables(input, "text");
        const header = template.content.header.format === "IMAGE" ? step.headerImageUrl || (typeof context.productImage === "string" ? context.productImage : null) || (await defaultHeaderImage(store.id)) : null;
        result = await sendTemplate(sender, template, enrollment.phone, {
          mapping: step.variables,
          values: {
            first_name: vars.name,
            store_name: store.name,
            link: storeUrl(store),
            discount_code: vars.discount_code,
            order_number: vars.order_number,
            order_total: vars.order_total,
            order_link: typeof context.orderId === "string" ? storeUrl(store, `/order/${context.orderId}`) : storeUrl(store),
            tracking_code: typeof context.trackingCode === "string" ? context.trackingCode : vars.order_number,
            tracking_link: typeof context.orderId === "string" ? storeUrl(store, `/order/${context.orderId}`) : storeUrl(store),
            cart_link: vars.cart_url,
            cart_items: vars.cart_items || "your items",
            product_name: vars.product_name,
            product_link: vars.store_url,
          },
          headerImageUrl: header,
        });
      } else {
        const body = fillVariables(step.message, variables(input, "text"), "text");
        result = channel === "sms" ? await sender.sms(enrollment.phone, body) : await sender.whatsappText(enrollment.phone, body);
      }
      if (!result.ok) {
        if (isMarketingOptOutError(result.error)) await recordOptOut(store.id, enrollment.phone, "whatsapp", { scope: "marketing", source: "whatsapp_meta" }).catch(() => null);
        return { status: result.error.includes("isn't set up") ? "skipped" : "failed", message: `${label}: ${result.error}`, recipient: enrollment.phone };
      }
      await noteCartReminder(context);
      return { status: "ok", message: `${label} sent`, recipient: enrollment.phone };
    }
    case "add_tag": {
      if (!enrollment.email) return { status: "skipped", message: "No email address to tag" };
      const row = await db.subscriber.findUnique({ where: { storeId_email: { storeId: store.id, email: enrollment.email } }, select: { id: true, tags: true } });
      if (!row) return { status: "skipped", message: "Not on your subscriber list, so there is nothing to tag", recipient: enrollment.email };
      if (!row.tags.includes(step.tag)) await db.subscriber.update({ where: { id: row.id }, data: { tags: [...row.tags, step.tag] } });
      return { status: "ok", message: `Tagged "${step.tag}"`, recipient: enrollment.email };
    }
    case "give_discount": {
      const prefix = store.name.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase() || "SHOP";
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = `${prefix}-${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`;
        const created = await db.coupon
          .create({ data: { storeId: store.id, code, type: "percentage", value: step.percent, maxUses: 1, expiresAt: new Date(Date.now() + step.days * DAY) } })
          .catch(() => null);
        if (created) {
          context.discountCode = code;
          return { status: "ok", message: `Made code ${code} (${step.percent}% off, ${step.days} days, one use)` };
        }
      }
      return { status: "failed", message: "Couldn't make a unique code" };
    }
    case "request_review": {
      const orderId = typeof context.orderId === "string" ? context.orderId : null;
      if (!orderId) return { status: "skipped", message: "This flow isn't about an order, so there is nothing to review" };
      const channel = enrollment.email ? "email" : "sms";
      const [result] = (await requestReviews({ storeId: store.id, orderIds: [orderId], channel, trigger: "automation" })).results;
      if (!result) return { status: "skipped", message: "Order not found" };
      return { status: result.status === "sent" ? "ok" : result.status === "failed" ? "failed" : "skipped", message: `Review request: ${result.status}${result.reason ? ` (${result.reason})` : ""}`, recipient: enrollment.email ?? enrollment.phone };
    }
    case "notify_seller": {
      const vars = variables(input, "text");
      await createNotification(store.userId, "marketing", "info", "Automation update", fillVariables(step.message, vars, "text"), { link: `/home/automations/${enrollment.automationId}` });
      return { status: "ok", message: "Notified you" };
    }
    default:
      return { status: "skipped", message: "Nothing to do" };
  }
}

// ─── Triggers ─────────────────────────────────────────────────────────────────

export interface TriggerContext {
  storeId: string;
  storeName?: string;
  buyerEmail?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  orderId?: string | null;
  orderNumber?: string;
  orderTotal?: number;
  currency?: string;
  dedupe?: string;
  [key: string]: unknown;
}

const EVENT_TRIGGERS: Record<string, string[]> = {
  order_placed: ["order_placed"],
  payment_received: ["payment_received", "post_purchase"],
  order_shipped: ["order_shipped"],
  order_delivered: ["order_delivered", "review_request"],
  welcome_email: ["welcome_email"],
  new_customer: ["new_customer"],
};

/**
 * Enrolls the contact in every live flow for this event and runs the first steps right away (up to the
 * first wait). Abandoned carts are enrolled by the cart sweep instead, from AbandonedCartEvent rows.
 */
export async function triggerFlows(event: string, ctx: TriggerContext) {
  const triggers = EVENT_TRIGGERS[event];
  if (!triggers) return;
  const rules = await rulesFor(ctx.storeId, triggers);
  const isOrderEvent = Boolean(ctx.orderNumber);
  let order: { id: string; buyerPhone: string | null; items: unknown; trackingCode: string | null } | null = null;
  if (isOrderEvent) {
    order = await db.retailOrder.findFirst({ where: { storeId: ctx.storeId, orderNumber: ctx.orderNumber }, select: { id: true, buyerPhone: true, items: true, trackingCode: true } });
  }
  // First order from this buyer → also the "First order" flows.
  if (event === "order_placed" && ctx.buyerEmail) {
    const count = await db.retailOrder.count({ where: { storeId: ctx.storeId, buyerEmail: { equals: ctx.buyerEmail, mode: "insensitive" } } });
    if (count === 1) rules.push(...(await rulesFor(ctx.storeId, ["new_customer"])));
  }
  if (!rules.length) return;
  const items = Array.isArray(order?.items) ? (order!.items as Array<Record<string, unknown>>) : [];
  const context = {
    orderId: ctx.orderId ?? order?.id ?? null,
    orderNumber: ctx.orderNumber ?? null,
    orderTotal: ctx.orderTotal ?? null,
    currency: ctx.currency ?? null,
    productName: items.length ? String(items[0].name ?? "") : null,
    trackingCode: order?.trackingCode ?? null,
    // A sign-up reward code, so the welcome email can repeat it.
    discountCode: typeof ctx.discountCode === "string" ? ctx.discountCode : null,
  };
  const key = ctx.dedupe ?? (ctx.orderNumber ? `${event}:${ctx.orderNumber}` : `${event}:${(ctx.buyerEmail ?? ctx.buyerPhone ?? "").toLowerCase()}`);
  for (const rule of rules) {
    await enroll(rule, { email: ctx.buyerEmail, phone: ctx.buyerPhone ?? order?.buyerPhone ?? null, name: ctx.buyerName }, context, key, { runNow: true });
  }
}

// ─── Sweeps (run by the cron) ─────────────────────────────────────────────────

function cartSummary(items: unknown) {
  if (!Array.isArray(items)) return "";
  return items
    .slice(0, 6)
    .map((item) => {
      const i = record(item);
      return `${String(i.name ?? "Item")} × ${Number(i.quantity) || 1}`;
    })
    .join(", ");
}

async function activeRulesByTrigger(trigger: AutomationTrigger) {
  return db.automationRule.findMany({
    where: { active: true, trigger },
    select: { id: true, storeId: true, name: true, trigger: true, actionType: true, actionConfig: true, delayMinutes: true, active: true },
    take: 2000,
  });
}

/** Carts left with an email or phone at least 20 minutes ago and not yet paid for. */
export async function sweepAbandonedCarts(now = new Date()) {
  const rules = await activeRulesByTrigger("abandoned_checkout");
  let enrolled = 0;
  const stores = new Map<string, MarketingStore | null>();
  for (const rule of rules) {
    if (!stores.has(rule.storeId)) stores.set(rule.storeId, await db.store.findUnique({ where: { id: rule.storeId }, select: MARKETING_STORE_SELECT }));
    const store = stores.get(rule.storeId);
    if (!store || store.status !== "active") continue;
    const carts = await db.abandonedCartEvent.findMany({
      where: {
        storeId: rule.storeId,
        recoveredAt: null,
        createdAt: { gte: new Date(now.getTime() - 3 * DAY), lte: new Date(now.getTime() - 20 * 60_000) },
        OR: [{ email: { not: null } }, { phone: { not: null } }],
      },
      take: 500,
      orderBy: { createdAt: "asc" },
    });
    for (const cart of carts) {
      const id = await enroll(
        rule,
        { email: cart.email, phone: cart.phone, name: cart.name },
        {
          cartEventId: cart.id,
          cartItems: cartSummary(cart.items),
          cartTotal: cart.subtotal,
          currency: cart.currency,
          cartUrl: cart.recoveryToken ? storeUrl(store, `/cart?recover=${encodeURIComponent(cart.recoveryToken)}`) : storeUrl(store, "/cart"),
          productName: Array.isArray(cart.items) && cart.items.length ? String(record(cart.items[0]).name ?? "") : null,
        },
        `cart:${cart.id}`,
      );
      if (id) enrolled++;
    }
  }
  return enrolled;
}

/** Known shoppers (email given) who saved products to their wishlist 1-3 days ago and haven't ordered since. */
export async function sweepBrowseAbandonment(now = new Date()) {
  const rules = await activeRulesByTrigger("browse_abandonment");
  let enrolled = 0;
  for (const rule of rules) {
    const store = await db.store.findUnique({ where: { id: rule.storeId }, select: MARKETING_STORE_SELECT });
    if (!store) continue;
    const saves = await db.storeWishlistItem.findMany({
      where: { storeId: rule.storeId, createdAt: { gte: new Date(now.getTime() - 3 * DAY), lte: new Date(now.getTime() - DAY) }, visitor: { email: { not: null } } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { createdAt: true, visitorId: true, productId: true, visitor: { select: { email: true, name: true, phone: true } }, product: { select: { name: true } } },
    });
    const seen = new Set<string>();
    for (const save of saves) {
      if (seen.has(save.visitorId) || !save.visitor.email) continue;
      seen.add(save.visitorId);
      const bought = await db.retailOrder.findFirst({ where: { storeId: rule.storeId, buyerEmail: { equals: save.visitor.email, mode: "insensitive" }, createdAt: { gt: save.createdAt } }, select: { id: true } });
      if (bought) continue;
      const id = await enroll(
        rule,
        { email: save.visitor.email, phone: save.visitor.phone, name: save.visitor.name },
        { productName: save.product.name, productUrl: storeUrl(store, `/product/${save.productId}`) },
        `browse:${save.visitorId}:${save.createdAt.toISOString().slice(0, 10)}`,
      );
      if (id) enrolled++;
    }
  }
  return enrolled;
}

/** Customers whose last paid order was `days` to `days + 30` days ago. */
export async function sweepWinBack(now = new Date()) {
  const rules = await activeRulesByTrigger("win_back");
  let enrolled = 0;
  for (const rule of rules) {
    const days = parseFlowConfig(rule.actionConfig, rule).settings.days ?? 90;
    const contacts = await loadContacts(rule.storeId);
    for (const contact of contacts) {
      if (!contact.lastOrderAt || contact.orders < 1) continue;
      const age = (now.getTime() - contact.lastOrderAt.getTime()) / DAY;
      if (age < days || age > days + 30) continue;
      const id = await enroll(rule, contact, {}, `winback:${contact.email ?? contact.phone}:${contact.lastOrderAt.toISOString().slice(0, 10)}`);
      if (id) enrolled++;
    }
  }
  return enrolled;
}

/** Subscribers whose birthday (month-day, Lagos time) is today. */
export async function sweepBirthdays(now = new Date()) {
  const rules = await activeRulesByTrigger("birthday");
  if (!rules.length) return 0;
  const [month, day, year] = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", month: "2-digit", day: "2-digit", year: "numeric" }).format(now).split("/");
  const today = `${month}-${day}`;
  let enrolled = 0;
  for (const rule of rules) {
    const people = await db.subscriber.findMany({ where: { storeId: rule.storeId, status: "active", metadata: { path: ["birthday"], equals: today } }, take: 1000, select: { email: true, name: true, phone: true } });
    for (const person of people) {
      const id = await enroll(rule, person, {}, `bday:${year}:${person.email}`);
      if (id) enrolled++;
    }
  }
  return enrolled;
}

/** Advances every enrollment whose wait is over. */
export async function processDueEnrollments(now = new Date(), limit = 200) {
  const due = await db.automationEnrollment.findMany({ where: { status: "active", nextRunAt: { lte: now } }, orderBy: { nextRunAt: "asc" }, take: limit, select: { id: true } });
  let processed = 0;
  for (const { id } of due) {
    await runEnrollment(id, now).catch((error) => console.error(`[automations] enrollment ${id} failed`, error));
    processed++;
  }
  return processed;
}
