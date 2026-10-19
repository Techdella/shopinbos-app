import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError, parsePagination } from "@/lib/api/response";
import { QuoteRequestCreateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { notifySupplierQuoteRequested } from "@/lib/notifications/events.server";

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const status = req.nextUrl.searchParams.get("status");

  const where = {
    sellerId: user.id,
    ...(status ? { status: status as any } : {}),
  };

  const [total, quotes] = await Promise.all([
    db.supplierQuoteRequest.count({ where }),
    db.supplierQuoteRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true, quantity: true, destination: true, notes: true,
        status: true, quotedPrice: true, supplierResponse: true,
        expiresAt: true, createdAt: true, updatedAt: true,
        supplier: { select: { id: true, displayName: true, slug: true, logoUrl: true } },
        supplierProduct: { select: { id: true, name: true, slug: true, images: true } },
      },
    }),
  ]);

  return okList(quotes, { page, limit, total });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = QuoteRequestCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { supplierId, supplierProductId, quantity, destination, notes } = parsed.data;

  const [supplier, product] = await Promise.all([
    db.supplier.findFirst({ where: { id: supplierId, status: "active", verificationStatus: "verified" } }),
    db.supplierProduct.findFirst({ where: { id: supplierProductId, supplierId, status: "published" } }),
  ]);

  if (!supplier) return apiError("NOT_FOUND", "Supplier not found", 404);
  if (!product) return apiError("NOT_FOUND", "Product not found", 404);
  if (quantity < product.moq) {
    return apiError("BAD_REQUEST", `Minimum order quantity is ${product.moq}`, 400);
  }

  const quote = await db.supplierQuoteRequest.create({
    data: { sellerId: user.id, supplierId, supplierProductId, quantity, destination, notes },
  });
  await notifySupplierQuoteRequested(quote.id);

  return ok(quote, 201);
});
