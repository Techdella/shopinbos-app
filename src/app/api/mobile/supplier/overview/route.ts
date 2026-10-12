import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { isOnboardingComplete } from "@/lib/role-queries";
import { parseVerificationDocs } from "@/lib/verification-utils";
import { DROPSHIP_OPEN, LOW_STOCK } from "../_rules";
import { WHOLESALE_SELECT, dropshipOrders, supplierForUser, wholesaleView } from "../_shared";
import { supplierEarnings, supplierOrdersToShip } from "@/lib/supplier-orders/money.server";

export const dynamic = "force-dynamic";

// Supplier Home in the mobile app: today's dropship orders to pack, wholesale orders, quote requests, low stock,
// what's been earned, owed and paid across wholesale and dropship (the same numbers as web /supplier/payouts) and
// verification.

const OPEN_WHOLESALE = ["pending", "confirmed", "processing"] as const;

export const GET = withSupplier(async (_req: NextRequest, { user }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  const where = { supplierId: supplier.id };
  const [dropship, wholesale, wholesaleCount, quotes, quoteCount, lowStock, earnings, bank, productCount, toShip] = await Promise.all([
    dropshipOrders(supplier.id, { statuses: DROPSHIP_OPEN, order: "asc", take: 3 }),
    db.wholesaleOrder.findMany({ where: { ...where, status: { in: [...OPEN_WHOLESALE] } }, orderBy: { createdAt: "asc" }, take: 3, select: WHOLESALE_SELECT }),
    db.wholesaleOrder.count({ where: { ...where, status: { in: [...OPEN_WHOLESALE] } } }),
    db.supplierQuoteRequest.findMany({
      where: { ...where, status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 3,
      select: { id: true, quantity: true, destination: true, createdAt: true, seller: { select: { name: true } }, supplierProduct: { select: { name: true, images: true } } },
    }),
    db.supplierQuoteRequest.count({ where: { ...where, status: "pending" } }),
    db.supplierProduct.findMany({
      where: { ...where, stockQuantity: { lte: LOW_STOCK }, status: { notIn: ["unpublished", "rejected"] } },
      orderBy: { stockQuantity: "asc" },
      take: 5,
      select: { id: true, name: true, stockQuantity: true, images: true },
    }),
    supplierEarnings(supplier.id),
    db.supplierPayoutAccount.findUnique({ where: { supplierId: supplier.id }, select: { bankName: true, accountNumberMask: true, verificationStatus: true } }),
    db.supplierProduct.count({ where }),
    supplierOrdersToShip(supplier.id),
  ]);

  const toPack = dropship.filter((order) => order.next.length > 0);
  const docs = parseVerificationDocs(supplier.verificationDocuments);

  return ok({
    supplier: {
      name: supplier.displayName,
      city: supplier.city,
      logoUrl: supplier.logoUrl,
      verificationStatus: supplier.verificationStatus,
      onboarded: isOnboardingComplete(supplier),
      documents: docs.length,
      rating: supplier.rating,
      ratingCount: supplier.ratingCount,
    },
    firstName: user.name.split(" ")[0] ?? user.name,
    // Every open dropship order (pending or accepted all have a next step), not just the ones listed.
    counts: { toPack: toShip.dropship, toShip: toShip.total, wholesale: wholesaleCount, quotes: quoteCount, lowStock: lowStock.length, products: productCount },
    toPack: toPack.slice(0, 3),
    wholesale: wholesale.map(wholesaleView),
    quotes: quotes.map((quote) => ({
      id: quote.id,
      quantity: quote.quantity,
      destination: quote.destination,
      seller: quote.seller.name,
      product: quote.supplierProduct.name,
      image: quote.supplierProduct.images[0] ?? null,
      createdAt: quote.createdAt.toISOString(),
    })),
    lowStock: lowStock.map((product) => ({ id: product.id, name: product.name, stock: product.stockQuantity, image: product.images[0] ?? null })),
    earned: earnings.earned,
    owed: earnings.owed,
    paid: earnings.paid,
    bank: bank ? { bankName: bank.bankName, account: bank.accountNumberMask, ready: bank.verificationStatus === "verified" } : null,
  });
});
