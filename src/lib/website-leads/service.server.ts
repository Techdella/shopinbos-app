import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { isMissingTable } from "@/lib/rate-limit-core";
import { LEAD_STATUSES, normalisePhone, type LeadStatus, type WebsiteLeadInputType } from "./pure";

// Website leads: saved from shopinbos.com forms, listed and worked in /admin/leads.

export const LEADS_PAGE_SIZE = 50;

export class LeadsNotReady extends Error {}

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isMissingTable(error)) throw new LeadsNotReady("Run docs/migrations/2026-10-18-website-leads.sql first.");
    throw error;
  }
}

/** Save a lead. Posting the same website id again updates nothing and returns the saved row. */
export function saveWebsiteLead(input: WebsiteLeadInputType) {
  return guard(() =>
    db.websiteLead.upsert({
      where: { externalId: input.id },
      update: {},
      create: {
        externalId: input.id,
        kind: input.kind,
        name: input.name,
        email: input.email,
        phone: normalisePhone(input.phone),
        message: input.message,
        source: input.source,
        pageUrl: input.pageUrl,
        consent: input.consent,
        payload: input.payload as Prisma.InputJsonValue,
        ...(input.createdAt ? { createdAt: new Date(input.createdAt) } : {}),
      },
      select: { id: true },
    }),
  );
}

export type LeadFilters = { kind?: string; status?: string; q?: string; page?: number };

function where(filters: LeadFilters): Prisma.WebsiteLeadWhereInput {
  const q = filters.q?.trim();
  return {
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q.replace(/\s/g, "") } },
            { message: { contains: q, mode: "insensitive" } },
            { source: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export function listWebsiteLeads(filters: LeadFilters, take = LEADS_PAGE_SIZE) {
  const page = Math.max(1, filters.page ?? 1);
  return guard(async () => {
    const [rows, total, byStatus, byKind] = await Promise.all([
      db.websiteLead.findMany({ where: where(filters), orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take }),
      db.websiteLead.count({ where: where(filters) }),
      db.websiteLead.groupBy({ by: ["status"], _count: { _all: true } }),
      db.websiteLead.groupBy({ by: ["kind"], _count: { _all: true }, where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    ]);
    return {
      rows,
      total,
      page,
      statusCounts: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])) as Record<string, number>,
      kindCounts30d: Object.fromEntries(byKind.map((row) => [row.kind, row._count._all])) as Record<string, number>,
    };
  });
}

export function updateWebsiteLead(id: string, data: { status?: string; note?: string | null }) {
  const status = data.status && (LEAD_STATUSES as readonly string[]).includes(data.status) ? (data.status as LeadStatus) : undefined;
  return guard(() =>
    db.websiteLead.update({
      where: { id },
      data: { ...(status ? { status } : {}), ...(data.note !== undefined ? { note: data.note?.slice(0, 2000) || null } : {}) },
      select: { id: true, status: true, note: true },
    }),
  );
}
