import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { isMissingTable } from "@/lib/rate-limit-core";
import { leadRoleFrom } from "@/lib/lead-growth/pure";
import { LEAD_STATUSES, normalisePhone, type LeadStatus, type WebsiteLeadInputType } from "./pure";

// Website leads: saved from shopinbos.com forms, listed and worked in /admin/leads.

export const LEADS_PAGE_SIZE = 50;

export class LeadsNotReady extends Error {}

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isMissingTable(error)) throw new LeadsNotReady("Run docs/migrations/2026-10-18-website-leads.sql first.");
    // New lead columns (convertedAt, optedOut…) come with the lead-growth migration.
    if ((error as { code?: string } | null)?.code === "P2022") throw new LeadsNotReady("Run docs/migrations/2026-11-05-lead-growth.sql first.");
    throw error;
  }
}

/**
 * Save a lead. Posting the same website id again updates nothing and returns the saved row. Someone who signs up
 * again (same phone or email: often because a confirmation didn't reach them) is the same lead, not a new one:
 * their newer details fill any gaps and the original lead is returned, so the waitlist isn't counted twice and
 * nobody gets the welcome twice. Contact-form questions are kept as their own rows (each is a new question).
 */
export function saveWebsiteLead(input: WebsiteLeadInputType) {
  return guard(async () => {
    const known = await db.websiteLead.findUnique({ where: { externalId: input.id }, select: { id: true } });
    if (known) return known;
    const phone = normalisePhone(input.phone);
    const email = input.email?.trim().toLowerCase() || null;
    if (!input.message?.trim() && (phone || email)) {
      const same = await findSameLead(phone, email);
      if (same) {
        const payload = (same.payload && typeof same.payload === "object" && !Array.isArray(same.payload) ? same.payload : {}) as Record<string, unknown>;
        await db.websiteLead.update({
          where: { id: same.id },
          data: {
            ...(same.name ? {} : input.name ? { name: input.name } : {}),
            ...(same.email ? {} : email ? { email } : {}),
            ...(same.phone ? {} : phone ? { phone } : {}),
            ...(input.consent && !same.consent ? { consent: true } : {}),
            payload: { ...payload, signedUpAgain: (Number(payload.signedUpAgain) || 0) + 1, lastSignUpAt: new Date().toISOString(), lastSource: input.source || null } as Prisma.InputJsonValue,
          },
        });
        return { id: same.id };
      }
    }
    return db.websiteLead.create({
      data: {
        externalId: input.id,
        kind: input.kind,
        name: input.name,
        email: input.email,
        phone,
        message: input.message,
        source: input.source,
        pageUrl: input.pageUrl,
        consent: input.consent,
        // Seller, supplier or delivery partner: the waitlist's "as", or the admin's pick for hand-added leads.
        role: leadRoleFrom(input.payload.as),
        payload: input.payload as Prisma.InputJsonValue,
        ...(input.createdAt ? { createdAt: new Date(input.createdAt) } : {}),
      },
      select: { id: true },
    }).catch(async (error) => {
      // The website sent the same lead twice at once (a retry): the other request saved it first.
      if ((error as { code?: string }).code === "P2002") return db.websiteLead.findUniqueOrThrow({ where: { externalId: input.id }, select: { id: true } });
      throw error;
    });
  });
}

/** The earliest sign-up (not a contact-form question) with this phone (any format) or email. */
function findSameLead(phone: string | null, email: string | null) {
  const digits = phone?.replace(/\D/g, "").slice(-10) ?? "";
  const or: Prisma.WebsiteLeadWhereInput[] = [];
  if (digits.length >= 8) or.push({ phone: { endsWith: digits } });
  if (email) or.push({ email: { equals: email, mode: "insensitive" } });
  if (!or.length) return Promise.resolve(null);
  return db.websiteLead.findFirst({
    where: { OR: or, kind: { not: "contact" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, phone: true, consent: true, payload: true },
  });
}

export type LeadFilters = { kind?: string; status?: string; role?: string; noted?: boolean; q?: string; page?: number };

function where(filters: LeadFilters): Prisma.WebsiteLeadWhereInput {
  const q = filters.q?.trim();
  return {
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.role ? { role: filters.role } : {}),
    // "Has a note": leads the team wrote something about.
    ...(filters.noted ? { AND: [{ note: { not: null } }, { note: { not: "" } }] } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q.replace(/\s/g, "") } },
            { message: { contains: q, mode: "insensitive" } },
            { source: { contains: q, mode: "insensitive" } },
            { note: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export function listWebsiteLeads(filters: LeadFilters, take = LEADS_PAGE_SIZE) {
  const page = Math.max(1, filters.page ?? 1);
  return guard(async () => {
    const [rows, total, byStatus, byKind, noted] = await Promise.all([
      db.websiteLead.findMany({ where: where(filters), orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take }),
      db.websiteLead.count({ where: where(filters) }),
      db.websiteLead.groupBy({ by: ["status"], _count: { _all: true } }),
      db.websiteLead.groupBy({ by: ["kind"], _count: { _all: true }, where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
      db.websiteLead.count({ where: { AND: [{ note: { not: null } }, { note: { not: "" } }] } }),
    ]);
    return {
      rows,
      total,
      page,
      statusCounts: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])) as Record<string, number>,
      allCount: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      notedCount: noted,
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
