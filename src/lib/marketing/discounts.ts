import "server-only";

import { randomBytes } from "node:crypto";
import type { DiscountType, Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { parseDiscountConfig } from "@/lib/discounts";
import { MarketingError } from "./segments";

// Discounts: codes and automatic offers (% off, amount off, free delivery, buy X get Y), limits, dates
// and usage from real orders. The checkout applies them in src/lib/commerce/pricing.server.ts.

export interface DiscountInput {
  name: string;
  code?: string;
  type: DiscountType;
  value: number;
  minOrder?: number | null;
  maxUses?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  status?: "draft" | "active" | "disabled";
  config?: {
    automatic?: boolean;
    buyQuantity?: number;
    getQuantity?: number;
    getPercent?: number | null;
    productIds?: string[];
    segmentId?: string | null;
    oncePerCustomer?: boolean;
  };
}

/** A datetime-local value is Lagos time (WAT, UTC+1); a date alone means the start of that day. */
export function parseLagosInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00+01:00` : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed) ? `${trimmed.length === 16 ? `${trimmed}:00` : trimmed}+01:00` : trimmed;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Keys other features keep on Discount.config (spin-to-win prizes, sign-up form codes). Editing a code here keeps them.
const OWNED_CONFIG_KEYS = ["game", "form"] as const;

function ownedConfig(raw: unknown): Record<string, unknown> {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(OWNED_CONFIG_KEYS.filter((key) => key in c).map((key) => [key, c[key]]));
}

/**
 * Creates (id null) or updates a discount with the same rules everywhere codes are made.
 * `extraConfig` adds a feature's own marker to config (e.g. { form: { formId, email } } for a sign-up code).
 */
export async function saveDiscount(storeId: string, id: string | null, input: DiscountInput, extraConfig?: Record<string, unknown>) {
  const config = parseDiscountConfig(input.config ?? {});
  const automatic = config.automatic;
  let code = (input.code ?? "").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (!code && automatic) code = `AUTO-${randomBytes(3).toString("hex").toUpperCase()}`;
  if (!code) throw new MarketingError("Add a code shoppers can type, like SALE20");
  if (input.type === "percentage" && (input.value <= 0 || input.value > 100)) throw new MarketingError("A percentage must be between 1 and 100");
  if (input.type === "fixed_amount" && input.value <= 0) throw new MarketingError("Add the amount off");
  const startsAt = parseLagosInput(input.startsAt);
  const expiresAt = parseLagosInput(input.expiresAt);
  if (startsAt && expiresAt && expiresAt <= startsAt) throw new MarketingError("The end has to be after the start");
  if (config.segmentId && !(await db.customerSegment.findFirst({ where: { id: config.segmentId, storeId }, select: { id: true } }))) throw new MarketingError("That segment doesn't exist any more");

  const clash = await db.discount.findUnique({ where: { storeId_code: { storeId, code } }, select: { id: true } });
  if (clash && clash.id !== id) throw new MarketingError(`You already have a code ${code}`);

  const data = {
    name: input.name.trim().slice(0, 120),
    code,
    type: input.type,
    value: input.type === "free_shipping" ? input.value || 0 : input.value,
    minOrder: input.minOrder ?? 0,
    maxUses: input.maxUses ?? 0,
    startsAt,
    expiresAt,
    status: input.status ?? "active",
    config: { ...config, ...extraConfig } as unknown as Prisma.InputJsonValue,
  };
  if (id) {
    const existing = await db.discount.findFirst({ where: { id, storeId }, select: { id: true, config: true } });
    if (!existing) throw new MarketingError("Discount not found");
    return db.discount.update({ where: { id }, data: { ...data, config: { ...config, ...ownedConfig(existing.config), ...extraConfig } as unknown as Prisma.InputJsonValue } });
  }
  return db.discount.create({ data: { storeId, ...data } });
}

/** Orders, revenue and money given away per code, from paid orders. */
export async function discountUsage(storeId: string) {
  const rows = await db.retailOrder.groupBy({
    by: ["discountCode"],
    where: { storeId, discountCode: { not: null }, status: { in: [...PAID_ORDER_STATUSES] } },
    _count: true,
    _sum: { total: true, discountAmount: true },
  });
  return new Map(rows.filter((row) => row.discountCode).map((row) => [row.discountCode!.toUpperCase(), { orders: row._count, revenue: row._sum.total ?? 0, given: row._sum.discountAmount ?? 0 }]));
}
