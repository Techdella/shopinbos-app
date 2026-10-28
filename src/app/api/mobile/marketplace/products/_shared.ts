import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { VISIBLE_SUPPLIER } from "@/lib/marketplace/agreements.server";
import { preorderState, type PreorderState } from "@shared/preorder";

// The phone's Find products rows: the same fields the public products API gives (apps/mobile/src/lib/marketplace.ts
// RawProduct), from suppliers sellers can see (verified or not), plus what the seller needs to judge the supplier
// (their level, New | Trusted | Established, for the "Trusted supplier · ★ 4.7 from 18 shops" line).

export const productSelect = {
  id: true, name: true, slug: true, description: true, images: true, wholesalePrice: true, suggestedRetailPrice: true, moq: true,
  stockQuantity: true, pricingTiers: true, dropshipAvailable: true, bulkOrderAvailable: true, processingTime: true, trendScore: true,
  preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderNote: true, preorderDepositPct: true,
  category: { select: { name: true } },
  supplier: { select: { id: true, displayName: true, slug: true, city: true, address: true, rating: true, ratingCount: true, description: true, responseTimeLabel: true, verificationStatus: true, returnPolicy: true, level: true } },
} as const satisfies Prisma.SupplierProductSelect;

export const productWhere = (country: string): Prisma.SupplierProductWhereInput => ({ status: "published", supplier: { ...VISIBLE_SUPPLIER, country: { equals: country, mode: "insensitive" } } });

export async function sellerStore(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true, city: true, country: true } });
}

type PreorderColumns = { preorderEnabled: boolean; preorderShipsAt: Date | null; preorderLimit: number | null; preorderTaken: number; preorderNote: string | null; preorderDepositPct: number };

/**
 * A row for sellers: the supplier's preorder settings as one `preorder` state (ship date, places left, promise;
 * shared/preorder.ts), null when the listing doesn't take preorders. The raw counts stay on the server.
 */
export function withPreorderState<R extends PreorderColumns>(row: R): Omit<R, keyof PreorderColumns> & { preorder: (PreorderState & { depositPct: number }) | null } {
  const { preorderEnabled, preorderShipsAt, preorderLimit, preorderTaken, preorderNote, preorderDepositPct, ...rest } = row;
  // depositPct: the share of a preorder paid when it's placed (shared/preorder.ts depositSplit); 0: paid in full later.
  return { ...rest, preorder: preorderEnabled ? { ...preorderState({ enabled: true, shipsAt: preorderShipsAt, limit: preorderLimit, taken: preorderTaken, note: preorderNote }), depositPct: preorderDepositPct ?? 0 } : null };
}
