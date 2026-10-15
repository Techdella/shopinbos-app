import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { inboxEmailDomain } from "@/lib/inbox/channels/email";
import { normaliseEmail, normalisePhone } from "@/lib/inbox/pure";
import { getChannel, sendRecorded, sendReply } from "@/lib/inbox/service";
import { MARKETING_STORE_SELECT, storeUrl } from "@/lib/marketing/brand";
import { textSender, WHATSAPP_CONNECT_HREF } from "@/lib/marketing/channels";
import { cleanTags } from "@/lib/marketing/subscribers";
import { templateMessage } from "@/lib/marketing/text-channels";
import { approvedTemplates, defaultHeaderImage, resolveTemplate } from "@/lib/marketing/whatsapp-templates.server";
import { customerContact, type CustomerContact } from "./queries.server";
import { NOTE_MAX, addressPlace, customerTemplateValues, fillCustomerTemplate, readPrivateNote, whatsAppComposer } from "./pure";

// The customer drawer on /home/customers: everything about one customer, and messaging them one to one. Messages
// go through the inbox (sendReply / sendRecorded), into the same InboxConversation the inbox shows: the email
// thread is keyed by their email address and the WhatsApp thread by their phone number, exactly as inbound
// messages are, so replies land in the same conversation. Every function checks the customer belongs to the store.

const PAID = new Set<string>(PAID_ORDER_STATUSES);
const THREAD_MESSAGES = 30;
export const TEMPLATES_HREF = "/home/marketing/templates";

type Store = { id: string; name: string; slug: string; customDomain: string | null; currency: string };

const money = (amount: number, currency: string) => new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 0 }).format(amount);

function lastOrderValues(store: Store, contact: CustomerContact) {
  const order = contact.orders[0];
  if (!order) return null;
  const details = order.logisticsDetails && typeof order.logisticsDetails === "object" ? (order.logisticsDetails as Record<string, unknown>) : {};
  const link = storeUrl(store, `/order/${order.id}`);
  return {
    orderNumber: order.orderNumber,
    total: money(Number(order.total) || 0, order.currency),
    link,
    trackingCode: order.trackingCode || (typeof details.trackingCode === "string" ? details.trackingCode : null),
    trackingLink: typeof details.trackingUrl === "string" && /^https:\/\//.test(details.trackingUrl) ? details.trackingUrl : null,
  };
}

function templateValues(store: Store, contact: CustomerContact) {
  return customerTemplateValues({ name: contact.name, storeName: store.name, storeLink: storeUrl(store), lastOrder: lastOrderValues(store, contact) });
}

/** The inbox threads for this customer: email by address, WhatsApp by phone number (as inbound messages are keyed). */
async function findThreads(storeId: string, email: string | null, phone: string | null) {
  const [emailThread, whatsappThread] = await Promise.all([
    email ? db.inboxConversation.findUnique({ where: { storeId_channel_externalThreadId: { storeId, channel: "email", externalThreadId: email } } }) : null,
    phone ? db.inboxConversation.findUnique({ where: { storeId_channel_externalThreadId: { storeId, channel: "whatsapp", externalThreadId: phone } } }) : null,
  ]);
  return { emailThread, whatsappThread };
}

async function recentMessages(conversationId: string | undefined) {
  if (!conversationId) return [];
  const rows = await db.inboxMessage.findMany({
    where: { conversationId, direction: { in: ["inbound", "outbound"] } },
    orderBy: { createdAt: "desc" },
    take: THREAD_MESSAGES,
    select: { id: true, direction: true, body: true, status: true, error: true, authorName: true, createdAt: true },
  });
  return rows.reverse().map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));
}

async function whatsappSetup(storeId: string) {
  const channel = await getChannel(storeId, "whatsapp").catch(() => null);
  const settings = (channel?.row.settings ?? {}) as Record<string, unknown>;
  const hasAccount = Boolean(channel && (channel.credentials.wabaId || (typeof settings.wabaId === "string" && settings.wabaId)));
  return { connected: Boolean(channel), hasAccount };
}

/** Everything the drawer shows. Null when the key isn't one of this store's customers. */
export async function customerProfile(store: Store, key: string) {
  const contact = await customerContact(store.id, key);
  if (!contact) return null;
  const email = normaliseEmail(contact.email);
  const phone = normalisePhone(contact.phone);

  const paid = contact.orders.filter((o) => PAID.has(o.status));
  const spent = paid.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const place = contact.orders.map((o) => addressPlace(o.deliveryAddress)).find(Boolean) ?? null;

  const [reviews, subscriber, threads, otherThreads, setup, emailChannel] = await Promise.all([
    email
      ? db.productReview.findMany({
          where: { storeId: store.id, buyerEmail: { equals: email, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, rating: true, title: true, body: true, status: true, createdAt: true, product: { select: { name: true } } },
        })
      : [],
    email ? db.subscriber.findUnique({ where: { storeId_email: { storeId: store.id, email } }, select: { status: true, tags: true, source: true, createdAt: true, metadata: true } }) : null,
    findThreads(store.id, email, phone),
    email || phone
      ? db.inboxConversation.findMany({
          where: {
            storeId: store.id,
            channel: { notIn: ["email", "whatsapp"] },
            OR: [...(email ? [{ contactEmail: { equals: email, mode: "insensitive" as const } }] : []), ...(phone ? [{ contactPhone: phone }] : [])],
          },
          orderBy: { lastMessageAt: "desc" },
          take: 5,
          select: { id: true, channel: true, lastMessagePreview: true, lastMessageAt: true },
        })
      : [],
    whatsappSetup(store.id),
    db.inboxChannel.findUnique({ where: { storeId_channel: { storeId: store.id, channel: "email" } }, select: { status: true } }),
  ]);

  const templates = setup.hasAccount && phone ? await approvedTemplates(store.id).catch(() => []) : [];
  const values = templateValues(store, contact);
  const composer = whatsAppComposer({ phone, connected: setup.connected, hasAccount: setup.hasAccount, approvedTemplates: templates.length, lastInboundAt: threads.whatsappThread?.lastInboundAt ?? null });
  const [emailMessages, whatsappMessages] = await Promise.all([recentMessages(threads.emailThread?.id), recentMessages(threads.whatsappThread?.id)]);

  return {
    key,
    name: contact.name || email || contact.phone || "",
    email,
    phone: contact.phone,
    place,
    currency: store.currency,
    stats: {
      orders: contact.orders.length,
      paidOrders: paid.length,
      spent,
      average: paid.length ? spent / paid.length : 0,
      firstAt: contact.orders[contact.orders.length - 1].createdAt.toISOString(),
      lastAt: contact.orders[0].createdAt.toISOString(),
    },
    orders: contact.orders.slice(0, 50).map((o) => ({ id: o.id, orderNumber: o.orderNumber, total: Number(o.total) || 0, currency: o.currency, status: o.status, createdAt: o.createdAt.toISOString() })),
    reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, status: r.status, product: r.product?.name ?? "", createdAt: r.createdAt.toISOString() })),
    marketing: subscriber
      ? { status: subscriber.status, tags: subscriber.tags, source: subscriber.source, joinedAt: subscriber.createdAt.toISOString(), note: readPrivateNote(subscriber.metadata) }
      : null,
    emailChannel: {
      address: email,
      ready: Boolean(process.env.RESEND_API_KEY),
      repliesInInbox: Boolean(inboxEmailDomain() && emailChannel?.status === "connected"),
      conversationId: threads.emailThread?.id ?? null,
      subject: threads.emailThread?.subject ?? null,
      messages: emailMessages,
    },
    whatsapp: {
      phone,
      composer,
      conversationId: threads.whatsappThread?.id ?? null,
      messages: whatsappMessages,
      setupHref: WHATSAPP_CONNECT_HREF,
      templatesHref: TEMPLATES_HREF,
      templates: templates.map((t) => {
        const filled = fillCustomerTemplate(t, values);
        return {
          id: t.id,
          name: t.name,
          language: t.language,
          category: t.category,
          imageHeader: t.content.header.format === "IMAGE",
          content: t.content,
          variables: filled.params.map((value, i) => ({ n: i + 1, key: t.variables[i] ?? "", value })),
          preview: filled.text,
        };
      }),
    },
    otherConversations: otherThreads.map((c) => ({ id: c.id, channel: c.channel, preview: c.lastMessagePreview ?? "", at: c.lastMessageAt.toISOString() })),
  };
}

export type CustomerProfile = NonNullable<Awaited<ReturnType<typeof customerProfile>>>;

export class CustomerMessageError extends Error {
  /** `code` lets the drawer show the reason in the seller's language. */
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
  }
}

/** Finds the customer's thread on this channel, or starts one (the same unique key inbound messages use). */
async function openThread(storeId: string, channel: "email" | "whatsapp", threadId: string, contact: { name: string; email: string | null; phone: string | null }, subject?: string | null) {
  return db.inboxConversation.upsert({
    where: { storeId_channel_externalThreadId: { storeId, channel, externalThreadId: threadId } },
    update: {},
    create: {
      storeId,
      channel,
      externalThreadId: threadId,
      subject: channel === "email" ? subject ?? null : null,
      contactName: contact.name || null,
      contactEmail: contact.email,
      contactPhone: contact.phone,
      unreadCount: 0,
      lastMessageAt: new Date(),
    },
  });
}

export type CustomerMessageInput =
  | { channel: "email"; subject?: string | null; body: string }
  | { channel: "whatsapp"; body: string }
  | { channel: "whatsapp"; templateId: string; params?: string[] | null };

/** Sends one message to a customer of the store by email or WhatsApp and records it in their inbox conversation. */
export async function messageCustomer(storeId: string, key: string, input: CustomerMessageInput, authorName: string) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: MARKETING_STORE_SELECT });
  if (!store) throw new CustomerMessageError("NOT_FOUND", "Store not found", 404);
  const contact = await customerContact(storeId, key);
  if (!contact) throw new CustomerMessageError("NOT_FOUND", "Customer not found", 404);
  const email = normaliseEmail(contact.email);
  const phone = normalisePhone(contact.phone);
  const who = { name: contact.name, email, phone };

  if (input.channel === "email") {
    if (!email) throw new CustomerMessageError("NO_EMAIL", "This customer has no email address.");
    const subject = input.subject?.trim() || `A message from ${store.name}`;
    const conversation = await openThread(storeId, "email", email, who, subject);
    const earlier = await db.inboxMessage.count({ where: { conversationId: conversation.id, direction: { in: ["inbound", "outbound"] } } });
    // A new thread goes out with the seller's subject as is; later messages are replies ("Re: …") to keep it one thread.
    if (!earlier && conversation.subject !== subject) await db.inboxConversation.update({ where: { id: conversation.id }, data: { subject } });
    const sent = await sendReply({ storeId, conversationId: conversation.id, body: input.body, authorName, firstEmail: earlier === 0 });
    return { conversationId: conversation.id, ...sent };
  }

  if (!phone) throw new CustomerMessageError("NO_PHONE", "This customer has no phone number for WhatsApp.");
  const conversation = await openThread(storeId, "whatsapp", phone, who);

  if ("body" in input) {
    // sendReply refuses free text outside the 24-hour window with WhatsApp's own explanation.
    const sent = await sendReply({ storeId, conversationId: conversation.id, body: input.body, authorName });
    return { conversationId: conversation.id, ...sent };
  }

  const template = await resolveTemplate(storeId, input.templateId);
  if (!template || template.status !== "APPROVED") throw new CustomerMessageError("NOT_APPROVED", "Pick one of your approved WhatsApp templates.");
  const optOut = await db.marketingOptOut.findUnique({ where: { storeId_phone_channel: { storeId, phone, channel: "whatsapp" } }, select: { scope: true } });
  if (optOut && (optOut.scope === "all" || template.category === "MARKETING")) {
    throw new CustomerMessageError("OPTED_OUT", "This customer asked not to get these WhatsApp messages from your shop, so it wasn't sent.");
  }
  const filled = fillCustomerTemplate(template, templateValues(store, contact), input.params);
  const headerImageUrl = template.content.header.format === "IMAGE" ? await defaultHeaderImage(storeId) : null;
  if (template.content.header.format === "IMAGE" && !headerImageUrl) throw new CustomerMessageError("NO_PICTURE", "This template needs a picture. Add a product photo or your logo first.");
  const message = templateMessage({ name: template.name, language: template.language, params: filled.params, headerImageUrl });
  const sender = await textSender(store);
  const sent = await sendRecorded(
    { storeId, conversationId: conversation.id, body: filled.text, authorName, meta: { template: template.name } },
    async () => ({ ...(await sender.whatsappTemplate(phone, message)), via: "whatsapp" }),
  );
  return { conversationId: conversation.id, ...sent };
}

/** Tags and the private note on the customer's marketing contact. Only for customers already on the list. */
export async function updateCustomerMarketing(storeId: string, key: string, input: { tags?: string[]; note?: string }) {
  const contact = await customerContact(storeId, key);
  if (!contact) throw new CustomerMessageError("NOT_FOUND", "Customer not found", 404);
  const email = normaliseEmail(contact.email);
  const subscriber = email ? await db.subscriber.findUnique({ where: { storeId_email: { storeId, email } }, select: { id: true, metadata: true } }) : null;
  if (!subscriber) throw new CustomerMessageError("NOT_ON_LIST", "This customer isn't on your marketing list.", 404);
  const metadata = subscriber.metadata && typeof subscriber.metadata === "object" && !Array.isArray(subscriber.metadata) ? (subscriber.metadata as Record<string, unknown>) : {};
  const updated = await db.subscriber.update({
    where: { id: subscriber.id },
    data: {
      ...(input.tags ? { tags: cleanTags(input.tags) } : {}),
      ...(input.note !== undefined ? { metadata: { ...metadata, privateNote: input.note.trim().slice(0, NOTE_MAX) } as unknown as Prisma.InputJsonValue } : {}),
    },
    select: { tags: true, metadata: true },
  });
  return { tags: updated.tags, note: readPrivateNote(updated.metadata) };
}
