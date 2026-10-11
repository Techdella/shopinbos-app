import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { contactsInSegment, reachability } from "./contacts";
import { describeRules, normalizeRules, type SegmentRules } from "./segment-rules";

// Saved segments: rules over subscribers, buyers and orders. Counts are recomputed from live data whenever
// a segment is saved or previewed, and cached on CustomerSegment.subscriberCount for lists.

export class MarketingError extends Error {}

export async function previewSegment(storeId: string, rawRules: unknown) {
  const rules = normalizeRules(rawRules);
  const members = await contactsInSegment(storeId, rules);
  return {
    rules,
    description: describeRules(rules),
    ...reachability(members),
    sample: members.slice(0, 8).map((c) => ({ name: c.name, email: c.email, phone: c.phone, orders: c.orders, spent: Math.round(c.spent), status: c.status })),
  };
}

export async function createSegment(storeId: string, input: { name: string; description?: string | null; rules: SegmentRules | unknown }) {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new MarketingError("Give the segment a name");
  const rules = normalizeRules(input.rules);
  if (!rules.conditions.length) throw new MarketingError("Add at least one rule");
  const existing = await db.customerSegment.findUnique({ where: { storeId_name: { storeId, name } }, select: { id: true } });
  if (existing) throw new MarketingError(`There is already a segment called "${name}"`);
  const preview = await previewSegment(storeId, rules);
  return db.customerSegment.create({
    data: { storeId, name, description: input.description?.trim() || null, type: "auto", rules: rules as unknown as Prisma.InputJsonValue, subscriberCount: preview.total },
  });
}

export async function updateSegment(storeId: string, id: string, input: { name?: string; description?: string | null; rules?: unknown }) {
  const segment = await db.customerSegment.findFirst({ where: { id, storeId } });
  if (!segment) throw new MarketingError("Segment not found");
  const rules = input.rules === undefined ? normalizeRules(segment.rules) : normalizeRules(input.rules);
  if (!rules.conditions.length) throw new MarketingError("Add at least one rule");
  const name = input.name?.trim().slice(0, 120) || segment.name;
  if (name !== segment.name && (await db.customerSegment.findUnique({ where: { storeId_name: { storeId, name } }, select: { id: true } }))) {
    throw new MarketingError(`There is already a segment called "${name}"`);
  }
  const preview = await previewSegment(storeId, rules);
  return db.customerSegment.update({
    where: { id },
    data: {
      name,
      description: input.description === undefined ? segment.description : input.description?.trim() || null,
      type: "auto",
      rules: rules as unknown as Prisma.InputJsonValue,
      subscriberCount: preview.total,
    },
  });
}

export async function deleteSegment(storeId: string, id: string) {
  const segment = await db.customerSegment.findFirst({ where: { id, storeId }, select: { id: true } });
  if (!segment) throw new MarketingError("Segment not found");
  const inUse = await db.broadcastCampaign.count({ where: { storeId, segmentId: id, status: { in: ["scheduled", "sending"] } } });
  if (inUse) throw new MarketingError("A scheduled campaign uses this segment. Change its audience first.");
  await db.customerSegment.delete({ where: { id } });
}

export async function listSegments(storeId: string) {
  const rows = await db.customerSegment.findMany({ where: { storeId }, orderBy: { updatedAt: "desc" }, take: 200 });
  return rows.map((row) => {
    const rules = normalizeRules(row.rules);
    return { id: row.id, name: row.name, description: row.description, rules, summary: describeRules(rules), count: row.subscriberCount, updatedAt: row.updatedAt };
  });
}
