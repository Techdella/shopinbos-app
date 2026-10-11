import "server-only";

import type { Prisma, SubscriberSource } from "@prisma/client";
import { db } from "@/lib/db/client";
import { normalizeEmail, normalizePhone } from "./segment-rules";

// Adding people to a shop's list, with a record of how and when they agreed (Subscriber.metadata.consent).
// A sign-up form or pop-up is an explicit opt-in, so it re-activates someone who unsubscribed before;
// imports and hand-added contacts never re-activate a suppressed address.

export interface ConsentRecord {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  at: string;
  source: string;
  formId?: string | null;
  /** The words the person agreed to, if the form showed any. */
  text?: string | null;
  ip?: string | null;
}

export interface SubscriberInput {
  email: string;
  name?: string | null;
  phone?: string | null;
  country?: string | null;
  birthday?: string | null;
  tags?: string[];
  source: SubscriberSource;
  consent: Omit<ConsentRecord, "at" | "source"> & { source?: string };
}

export type AddResult = { ok: true; id: string; created: boolean; reactivated: boolean } | { ok: false; error: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** "1990-03-07", "07/03", "7 Mar" → "03-07" (month-day), or null. */
export function normalizeBirthday(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (m) return pad(Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (m) return pad(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/.exec(raw);
  if (m) return pad(Number(m[2]), Number(m[1])); // day/month, as written in Nigeria
  return null;
}

function pad(month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function cleanTags(tags: unknown): string[] {
  const list = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(/[,;|]/) : [];
  return [...new Set(list.map((tag) => String(tag).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 30);
}

export async function addSubscriber(storeId: string, input: SubscriberInput, options: { optIn: boolean }): Promise<AddResult> {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "Enter a valid email address" };
  const phone = normalizePhone(input.phone);
  const birthday = normalizeBirthday(input.birthday);
  const tags = cleanTags(input.tags);
  const consent: ConsentRecord = {
    email: input.consent.email,
    sms: input.consent.sms && Boolean(phone),
    whatsapp: input.consent.whatsapp && Boolean(phone),
    at: new Date().toISOString(),
    source: input.consent.source ?? input.source,
    formId: input.consent.formId ?? null,
    text: input.consent.text ?? null,
    ip: input.consent.ip ?? null,
  };

  const existing = await db.subscriber.findUnique({ where: { storeId_email: { storeId, email } } });
  if (!existing) {
    const created = await db.subscriber.create({
      data: {
        storeId,
        email,
        name: input.name?.trim() || null,
        phone,
        country: input.country?.trim() || null,
        source: input.source,
        // Someone added without an email opt-in is kept for SMS/WhatsApp or records, but never emailed.
        status: input.consent.email ? "active" : "unsubscribed",
        unsubscribedAt: input.consent.email ? null : new Date(),
        tags,
        metadata: { consent: [consent], ...(birthday ? { birthday } : {}) } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { ok: true, id: created.id, created: true, reactivated: false };
  }

  const metadata = record(existing.metadata);
  const history = Array.isArray(metadata.consent) ? metadata.consent.slice(-9) : [];
  const reactivate = options.optIn && input.consent.email && existing.status !== "active";
  await db.subscriber.update({
    where: { id: existing.id },
    data: {
      name: existing.name || input.name?.trim() || null,
      phone: phone ?? existing.phone,
      country: existing.country || input.country?.trim() || null,
      tags: [...new Set([...existing.tags, ...tags])],
      metadata: { ...metadata, consent: [...history, consent], ...(birthday ? { birthday } : {}) } as unknown as Prisma.InputJsonValue,
      ...(reactivate ? { status: "active", unsubscribedAt: null } : {}),
    },
  });
  return { ok: true, id: existing.id, created: false, reactivated: reactivate };
}

/** Marks an address unsubscribed (creating a suppression row if it isn't on the list yet). */
export async function unsubscribe(storeId: string, email: string, reason = "link") {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const now = new Date();
  await db.subscriber.upsert({
    where: { storeId_email: { storeId, email: normalized } },
    update: { status: "unsubscribed", unsubscribedAt: now },
    create: { storeId, email: normalized, source: "order", status: "unsubscribed", unsubscribedAt: now, metadata: { unsubscribeReason: reason } },
  });
  return true;
}

export function consentSummary(metadata: unknown) {
  const history = record(metadata).consent;
  const last = Array.isArray(history) ? (history[history.length - 1] as Partial<ConsentRecord> | undefined) : undefined;
  if (!last) return null;
  return { email: Boolean(last.email), sms: Boolean(last.sms), whatsapp: Boolean(last.whatsapp), at: last.at ?? null, source: last.source ?? null, text: last.text ?? null };
}
