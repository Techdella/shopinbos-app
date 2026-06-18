import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { okList, apiError, parsePagination } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withLogistics(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const status = req.nextUrl.searchParams.get("status");

  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner profile not found", 404);

  const where = {
    logisticsPartnerId: partner.id,
    ...(status ? { status: status as any } : {}),
  };

  const [total, quotes] = await Promise.all([
    db.deliveryQuoteRequest.count({ where }),
    db.deliveryQuoteRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true, pickupLocation: true, destination: true,
        packageDetails: true, preferredDate: true,
        status: true, quotedPrice: true, partnerResponse: true,
        expiresAt: true, createdAt: true,
        seller: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return okList(quotes, { page, limit, total });
});
