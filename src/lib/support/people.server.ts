import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { phoneTail, pickPhoneMatch } from "./whatsapp-pure";

// Who the team can message from Admin › Inbox › New conversation: sellers, suppliers and delivery partners (by
// their name, business, email or phone) and website leads who haven't signed up yet.

export type PersonRole = "seller" | "supplier" | "logistics_partner" | "lead";

export type Person = {
  /** "user:<id>" or "lead:<id>". */
  key: string;
  userId: string | null;
  leadId: string | null;
  role: PersonRole;
  name: string;
  business: string | null;
  email: string | null;
  phone: string | null;
  /** Verification, for suppliers and delivery partners. */
  status: string | null;
};

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  store: { select: { name: true } },
  supplier: { select: { displayName: true, verificationStatus: true } },
  logisticsPartner: { select: { displayName: true, verificationStatus: true } },
} as const;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function fromUser(user: UserRow): Person {
  return {
    key: `user:${user.id}`,
    userId: user.id,
    leadId: null,
    role: user.role as PersonRole,
    name: user.name,
    business: user.store?.name ?? user.supplier?.displayName ?? user.logisticsPartner?.displayName ?? null,
    email: user.email,
    phone: user.phone,
    status: (user.supplier?.verificationStatus ?? user.logisticsPartner?.verificationStatus ?? null) as string | null,
  };
}

/** Up to 20 people matching the search (newest first when it's empty), optionally only one kind. */
export async function searchPeople(query: string, role?: PersonRole | null): Promise<Person[]> {
  const q = query.trim().slice(0, 80);
  const digits = q.replace(/\D/g, "");
  const text = (field: string) => ({ [field]: { contains: q, mode: "insensitive" as const } });
  const userWhere: Prisma.UserWhereInput = {
    role: role && role !== "lead" ? role : { in: ["seller", "supplier", "logistics_partner"] },
    ...(q
      ? {
          OR: [
            text("name"),
            text("email"),
            ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-10) } }] : []),
            { store: { name: { contains: q, mode: "insensitive" } } },
            { supplier: { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { businessName: { contains: q, mode: "insensitive" } }] } },
            { logisticsPartner: { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { companyName: { contains: q, mode: "insensitive" } }] } },
          ],
        }
      : {}),
  };
  const leadWhere: Prisma.WebsiteLeadWhereInput = {
    convertedAt: null,
    ...(q ? { OR: [text("name"), text("email"), ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-10) } }] : [])] } : {}),
  };
  const [users, leads] = await Promise.all([
    role === "lead" ? Promise.resolve([]) : db.user.findMany({ where: userWhere, select: USER_SELECT, orderBy: { createdAt: "desc" }, take: 20 }),
    role && role !== "lead" ? Promise.resolve([]) : db.websiteLead.findMany({ where: leadWhere, select: { id: true, name: true, email: true, phone: true, role: true }, orderBy: { createdAt: "desc" }, take: role === "lead" ? 20 : 8 }).catch(() => []),
  ]);
  return [
    ...users.map(fromUser),
    ...leads.map((lead) => ({
      key: `lead:${lead.id}`,
      userId: null,
      leadId: lead.id,
      role: "lead" as const,
      name: lead.name?.trim() || lead.email || lead.phone || "Lead",
      business: lead.role === "delivery" ? "Delivery partner (waitlist)" : lead.role === "supplier" ? "Supplier (waitlist)" : "Seller (waitlist)",
      email: lead.email,
      phone: lead.phone,
      status: null,
    })),
  ].slice(0, 20);
}

/** One person by key ("user:…" or "lead:…"), for links like ?to=user:abc. */
export async function personByKey(key: string | null | undefined): Promise<Person | null> {
  const [kind, id] = (key ?? "").split(":");
  if (!id) return null;
  if (kind === "user") {
    const user = await db.user.findUnique({ where: { id }, select: USER_SELECT }).catch(() => null);
    return user && user.role !== "admin" ? fromUser(user) : null;
  }
  if (kind === "lead") {
    const lead = await db.websiteLead.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true, role: true } }).catch(() => null);
    return lead ? { key: `lead:${lead.id}`, userId: null, leadId: lead.id, role: "lead", name: lead.name?.trim() || lead.email || lead.phone || "Lead", business: null, email: lead.email, phone: lead.phone, status: null } : null;
  }
  return null;
}

/**
 * The account a signed-out email or phone belongs to: by email, else by phone, however either side wrote the
 * number ("+234…", "234…" from Supabase Auth or a WhatsApp wa_id, "0…"). Only for context, never proof it's them.
 */
export async function accountByContact(email: string | null | undefined, phone: string | null | undefined) {
  const select = { id: true, role: true, name: true, phone: true } as const;
  const byEmail = email ? await db.user.findUnique({ where: { email }, select }).catch(() => null) : null;
  if (byEmail) return byEmail;
  const tail = phoneTail(phone);
  if (!tail) return null;
  const candidates = await db.user.findMany({ where: { phone: { endsWith: tail } }, select, take: 5 }).catch(() => []);
  return pickPhoneMatch(phone, candidates);
}
