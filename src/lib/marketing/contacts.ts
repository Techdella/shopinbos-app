import "server-only";

import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { matchesSegment, normalizeEmail, normalizePhone, normalizeRules, type MarketingContact, type SegmentRules } from "./segment-rules";

// Everyone a shop can market to: subscribers plus buyers, merged by email (buyers without an email are
// merged by phone). Built from the real Subscriber and RetailOrder tables on every call; small shops have
// a few thousand rows at most, so segment counts and audiences are computed in memory.

const MAX_ORDERS = 50_000;
const MAX_SUBSCRIBERS = 50_000;
const PAID = new Set<string>(PAID_ORDER_STATUSES);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function addressText(address: unknown) {
  if (!address || typeof address !== "object") return "";
  const a = address as Record<string, unknown>;
  return [a.city, a.state, a.area, a.lga, a.country].map(text).filter(Boolean).join(", ");
}

function itemProductIds(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => (item && typeof item === "object" ? text((item as Record<string, unknown>).productId) : "")).filter(Boolean);
}

function lastConsent(metadata: unknown): { sms: boolean; whatsapp: boolean } {
  const history = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).consent : null;
  const last = Array.isArray(history) ? (history[history.length - 1] as Record<string, unknown> | undefined) : undefined;
  return { sms: last?.sms === true, whatsapp: last?.whatsapp === true };
}

function birthdayOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = text((metadata as Record<string, unknown>).birthday);
  return /^\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function loadContacts(storeId: string): Promise<MarketingContact[]> {
  const [subscribers, orders] = await Promise.all([
    db.subscriber.findMany({
      where: { storeId },
      take: MAX_SUBSCRIBERS,
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, name: true, phone: true, country: true, source: true, status: true, tags: true, metadata: true, createdAt: true },
    }),
    db.retailOrder.findMany({
      where: { storeId },
      take: MAX_ORDERS,
      orderBy: { createdAt: "desc" },
      select: { buyerEmail: true, buyerName: true, buyerPhone: true, deliveryAddress: true, items: true, total: true, status: true, createdAt: true },
    }),
  ]);

  const byKey = new Map<string, MarketingContact>();
  const keyFor = (email: string | null, phone: string | null) => (email ? `e:${email}` : phone ? `p:${phone}` : null);

  for (const s of subscribers) {
    const email = normalizeEmail(s.email);
    const phone = normalizePhone(s.phone);
    const key = keyFor(email, phone);
    if (!key) continue;
    byKey.set(key, {
      email,
      phone,
      name: s.name,
      subscriberId: s.id,
      status: s.status,
      source: s.source,
      tags: s.tags,
      location: text(s.country),
      orders: 0,
      spent: 0,
      firstOrderAt: null,
      lastOrderAt: null,
      joinedAt: s.createdAt,
      productIds: [],
      birthday: birthdayOf(s.metadata),
      ...(() => {
        const consent = lastConsent(s.metadata);
        const blocked = s.status === "spam" || Boolean((s.metadata as Record<string, unknown> | null)?.textOptOut);
        return { smsOk: consent.sms && !blocked, whatsappOk: consent.whatsapp && !blocked };
      })(),
    });
  }

  for (const order of orders) {
    const email = normalizeEmail(order.buyerEmail);
    const phone = normalizePhone(order.buyerPhone);
    let key = keyFor(email, phone);
    if (!key) continue;
    // A phone-only subscriber who later bought with an email: merge onto the phone row.
    if (email && !byKey.has(key) && phone && byKey.has(`p:${phone}`)) key = `p:${phone}`;
    let contact = byKey.get(key);
    if (!contact) {
      contact = {
        email,
        phone,
        name: order.buyerName || null,
        subscriberId: null,
        status: "customer",
        source: "customer",
        tags: [],
        location: "",
        orders: 0,
        spent: 0,
        firstOrderAt: null,
        lastOrderAt: null,
        joinedAt: null,
        productIds: [],
        birthday: null,
        smsOk: false,
        whatsappOk: false,
      };
      byKey.set(key, contact);
    }
    contact.email ??= email;
    contact.phone ??= phone;
    contact.name ??= order.buyerName || null;
    const place = addressText(order.deliveryAddress);
    if (place && !contact.location.toLowerCase().includes(place.toLowerCase())) contact.location = contact.location ? `${contact.location}; ${place}` : place;
    if (!PAID.has(order.status)) continue;
    contact.orders += 1;
    contact.spent += Number(order.total) || 0;
    // Buyers who gave a phone at checkout can get texts about the shop unless they opted out.
    if (contact.phone && contact.status !== "spam" && contact.status !== "bounced") {
      contact.smsOk ||= contact.status !== "unsubscribed" || contact.subscriberId === null;
      contact.whatsappOk ||= contact.status !== "unsubscribed" || contact.subscriberId === null;
    }
    if (!contact.lastOrderAt || order.createdAt > contact.lastOrderAt) contact.lastOrderAt = order.createdAt;
    if (!contact.firstOrderAt || order.createdAt < contact.firstOrderAt) contact.firstOrderAt = order.createdAt;
    for (const id of itemProductIds(order.items)) if (!contact.productIds.includes(id)) contact.productIds.push(id);
  }

  return Array.from(byKey.values());
}

export async function contactsInSegment(storeId: string, rules: SegmentRules | unknown, now = new Date()) {
  const normalized = (rules as SegmentRules)?.conditions ? (rules as SegmentRules) : normalizeRules(rules);
  const contacts = await loadContacts(storeId);
  return contacts.filter((contact) => matchesSegment(contact, normalized, now));
}

/** Who a segment holds, split by how they can be reached. Suppressed (unsubscribed/bounced) people can't. */
export function reachability(contacts: MarketingContact[]) {
  const suppressed = (c: MarketingContact) => c.status === "unsubscribed" || c.status === "bounced" || c.status === "spam";
  return {
    total: contacts.length,
    email: contacts.filter((c) => c.email && !suppressed(c)).length,
    phone: contacts.filter((c) => c.phone && !suppressed(c)).length,
    subscribed: contacts.filter((c) => c.status === "active").length,
  };
}

export async function segmentRules(storeId: string, segmentId: string): Promise<SegmentRules | null> {
  const segment = await db.customerSegment.findFirst({ where: { id: segmentId, storeId }, select: { rules: true } });
  return segment ? normalizeRules(segment.rules) : null;
}
