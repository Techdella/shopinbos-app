import "server-only";

import { db } from "@/lib/db/client";
import { logDataAccess } from "@/lib/admin/data-access.server";
import { phoneOwner } from "@/lib/auth/phone-owner.server";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { clearFeatureSwitchCache, logFeatureChange } from "@/lib/feature-switches.server";
import { FEATURES } from "@shared/feature-switches";
import { changedFields, cleanAccountDetails, ACCOUNT_FIELDS, type AccountDetails, type AccountRole } from "@shared/admin-accounts";

// Admin › Accounts (/admin/accounts): pick a seller, supplier or delivery partner from a list or a search, change
// their details, choose the pilot features they test, and give them credits or a free plan (the gift forms,
// src/lib/admin/gifts.server.ts). Field rules are in shared/admin-accounts.ts. A details change is written to the
// admin data access log (who changed which fields, and why) before it's saved; pilot changes go to the pilot
// features log like the ones made on Admin › Pilot features.

export class AccountError extends Error {}

const ROLES: readonly AccountRole[] = ["seller", "supplier", "logistics_partner"];
const asAccountRole = (role: unknown): AccountRole | null => ((ROLES as readonly unknown[]).includes(role) ? (role as AccountRole) : null);

/** Everyone of each role for the pickers, by business name (the newest `take` of each role). */
export async function accountChoices(take = 400) {
  const rows = await Promise.all(
    ROLES.map((role) =>
      db.user.findMany({
        where: { role },
        orderBy: { createdAt: "desc" },
        take,
        select: { id: true, name: true, email: true, store: { select: { name: true } }, supplier: { select: { businessName: true } }, logisticsPartner: { select: { displayName: true } } },
      }),
    ),
  );
  const out = {} as Record<AccountRole, Array<{ id: string; label: string }>>;
  ROLES.forEach((role, index) => {
    out[role] = rows[index]
      .map((row) => {
        const business = row.store?.name || row.supplier?.businessName || row.logisticsPartner?.displayName || "";
        const who = [business, business && row.name !== business ? row.name : "", row.email ?? ""].filter(Boolean);
        return { id: row.id, label: who.length ? who.join(" · ") : row.name };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  });
  return out;
}

/** One account's details as the form shows them, with its business record's id and slug. */
export async function accountDetails(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      city: true,
      role: true,
      createdAt: true,
      store: { select: { id: true, slug: true, name: true, description: true, city: true } },
      supplier: { select: { id: true, slug: true, businessName: true, description: true, city: true, address: true, whatsappNumber: true, website: true } },
      logisticsPartner: { select: { id: true, slug: true, displayName: true, description: true, city: true, address: true, contactName: true, contactPhone: true, contactEmail: true } },
    },
  });
  const role = asAccountRole(user?.role);
  if (!user || !role) return null;
  const { store, supplier, logisticsPartner: partner } = user;
  const values: AccountDetails = {
    name: user.name,
    phone: user.phone,
    city: store?.city ?? supplier?.city ?? partner?.city ?? user.city,
    business: store?.name ?? supplier?.businessName ?? partner?.displayName ?? null,
    description: store?.description ?? supplier?.description ?? partner?.description ?? null,
    address: supplier?.address ?? partner?.address ?? null,
    whatsapp: supplier?.whatsappNumber ?? null,
    website: supplier?.website ?? null,
    contactName: partner?.contactName ?? null,
    contactPhone: partner?.contactPhone ?? null,
    contactEmail: partner?.contactEmail ?? null,
  };
  const business = store ? { kind: "store" as const, id: store.id, slug: store.slug, href: `/admin/sellers/${store.id}` } : supplier ? { kind: "supplier" as const, id: supplier.id, slug: supplier.slug, href: `/admin/suppliers/${supplier.id}` } : partner ? { kind: "partner" as const, id: partner.id, slug: partner.slug, href: `/admin/logistics-partners/${partner.id}` } : null;
  return { id: user.id, email: user.email, role, createdAt: user.createdAt, values, business };
}

/** Saves a team member's change to someone's details: checked, logged with the reason, then saved. */
export async function saveAccountDetails(input: { adminId: string; userId: string; raw: Record<string, unknown>; reason: string }) {
  const current = await accountDetails(input.userId);
  if (!current) throw new AccountError("Only sellers, suppliers and delivery partners can be changed here.");
  const cleaned = cleanAccountDetails(current.role, input.raw);
  if (!cleaned.ok) throw new AccountError(cleaned.error);
  const next = cleaned.values;
  const changed = changedFields(current.values, next);
  if (!changed.length) return { changed };
  const reason = input.reason.replace(/\s+/g, " ").trim().slice(0, 300);
  if (reason.length < 3) throw new AccountError("Say why you're changing it (a few words), for the log.");
  if (changed.includes("phone") && next.phone) {
    const owner = await phoneOwner(next.phone, current.id).catch(() => null);
    if (owner) throw new AccountError("Another account already has that phone number.");
  }
  if (!current.business) throw new AccountError("This account has no business set up yet, so there's nothing to change.");

  await logDataAccess({ adminId: input.adminId, subjectUserId: current.id, action: "edit_account", reason: "support", note: `${changed.map((field) => ACCOUNT_FIELDS[field].label).join(", ")} · ${reason}` });
  const text = (value: string | null | undefined) => value ?? null;
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: current.id }, data: { name: next.name!, phone: text(next.phone), city: next.city! } });
    if (current.business!.kind === "store") {
      await tx.store.update({ where: { id: current.business!.id }, data: { name: next.business!, description: text(next.description), city: next.city! } });
    } else if (current.business!.kind === "supplier") {
      await tx.supplier.update({
        where: { id: current.business!.id },
        data: { businessName: next.business!, displayName: next.business!, description: text(next.description), city: next.city!, address: text(next.address), whatsappNumber: text(next.whatsapp), website: text(next.website) },
      });
    } else {
      await tx.logisticsPartner.update({
        where: { id: current.business!.id },
        data: { displayName: next.business!, description: text(next.description), city: next.city!, address: text(next.address), contactName: text(next.contactName), contactPhone: text(next.contactPhone), contactEmail: text(next.contactEmail) },
      });
    }
  });
  if (current.business.kind === "supplier") invalidatePublicMarketplaceCache({ supplierSlug: current.business.slug });
  if (current.business.kind === "partner") invalidatePublicMarketplaceCache({ logisticsSlug: current.business.slug });
  return { changed };
}

/** The pilot features turned on for this person by name (Admin › Pilot features "Person" targets). */
export async function pilotFeaturesFor(userId: string) {
  const [switches, mine] = await Promise.all([
    db.featureSwitch.findMany({ select: { key: true, name: true, description: true, enabled: true, killed: true } }).catch(() => null),
    db.featureTarget.findMany({ where: { kind: "user", value: userId }, select: { featureKey: true } }).catch(() => []),
  ]);
  if (!switches) return null;
  const on = new Set(mine.map((row) => row.featureKey));
  const known = new Map(switches.map((row) => [row.key, row]));
  return FEATURES.filter((feature) => known.has(feature.key)).map((feature) => {
    const row = known.get(feature.key)!;
    return { key: feature.key, name: row.name || feature.name, description: row.description || feature.description, tester: on.has(feature.key), live: row.enabled && !row.killed };
  });
}

/** Makes the person a tester of exactly these pilot features (adds and removes their "Person" targets). */
export async function setPilotFeatures(input: { adminId: string; userId: string; keys: string[] }) {
  const user = await db.user.findUnique({ where: { id: input.userId }, select: { id: true, email: true, name: true, role: true } });
  if (!user || !asAccountRole(user.role)) throw new AccountError("Only sellers, suppliers and delivery partners can be pilot testers here.");
  const features = await pilotFeaturesFor(user.id);
  if (!features) throw new AccountError("Pilot features aren't set up yet (the migration hasn't run).");
  const wanted = new Set(input.keys.filter((key) => features.some((feature) => feature.key === key)));
  const add = features.filter((feature) => wanted.has(feature.key) && !feature.tester);
  const remove = features.filter((feature) => !wanted.has(feature.key) && feature.tester);
  const label = user.email || user.name;
  for (const feature of add) {
    await db.featureTarget.create({ data: { featureKey: feature.key, kind: "user", value: user.id, label, createdBy: input.adminId } }).catch((error) => {
      if ((error as { code?: string }).code !== "P2002") throw error;
    });
    await logFeatureChange({ featureKey: feature.key, action: "target.added", after: { kind: "user", value: user.id, label }, actorUserId: input.adminId });
  }
  if (remove.length) {
    await db.featureTarget.deleteMany({ where: { kind: "user", value: user.id, featureKey: { in: remove.map((feature) => feature.key) } } });
    for (const feature of remove) await logFeatureChange({ featureKey: feature.key, action: "target.removed", before: { kind: "user", value: user.id, label }, actorUserId: input.adminId });
  }
  if (add.length || remove.length) clearFeatureSwitchCache();
  return { added: add.length, removed: remove.length };
}
