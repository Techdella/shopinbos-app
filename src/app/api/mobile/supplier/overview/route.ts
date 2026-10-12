import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { isOnboardingComplete } from "@/lib/role-queries";
import { parseVerificationDocs } from "@/lib/verification-utils";
import { DROPSHIP_OPEN, LOW_STOCK } from "../_rules";
import { WHOLESALE_SELECT, dropshipOrders, supplierForUser, wholesaleView } from "../_shared";

export const dynamic = "force-dynamic";

// Supplier Home in the mobile app: today's dropship orders to pack, wholesale orders, quote requests, low stock,
// what's been earned (web /supplier/payouts counts shipped and delivered orders) and verification.

const OPEN_WHOLESALE = ["pending", "confirmed", "processing"] as const;

export const GET = withSupplier(async (_req: NextRequest, { user }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  const where = { supplierId: supplier.id };
  const [dropship, wholesale, wholesaleCount, quotes, quoteCount, lowStock, earnedWholesale, bank, productCount, earnedDropshipSum] = await Promise.all([
    dropshipOrders(supplier.id, { statuses: DROPSHIP_OPEN, order: "asc", take: 60 }),
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
    db.wholesaleOrder.aggregate({ where: { ...where, status: { in: ["shipped", "delivered"] } }, _sum: { totalPrice: true } }),
    db.supplierPayoutAccount.findUnique({ where: { supplierId: supplier.id }, select: { bankName: true, accountNumberMask: true, verificationStatus: true } }),
    db.supplierProduct.count({ where }),
    db.supplierOrder.aggregate({ where: { ...where, status: { in: ["shipped", "delivered"] } }, _sum: { costTotal: true } }),
  ]);

  const toPack = dropship.filter((order) => order.next.length > 0);
  const earnedDropship = earnedDropshipSum._sum.costTotal ?? 0;
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
    counts: { toPack: toPack.length, wholesale: wholesaleCount, quotes: quoteCount, lowStock: lowStock.length, products: productCount },
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
    earned: (earnedWholesale._sum.totalPrice ?? 0) + earnedDropship,
    bank: bank ? { bankName: bank.bankName, account: bank.accountNumberMask, ready: bank.verificationStatus === "verified" } : null,
  });
});
