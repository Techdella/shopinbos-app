import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { customerProfile } from "@/lib/customers/drawer.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QuerySchema = z.object({ key: z.string().trim().min(1).max(320) });

// GET /api/app/customers/profile?key=<customer key> — the customer drawer: contact, shopping history, orders,
// reviews, marketing, and their email / WhatsApp inbox threads. Only the signed-in seller's own customers.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const parsed = QuerySchema.safeParse({ key: req.nextUrl.searchParams.get("key") ?? "" });
  if (!parsed.success) return apiError("BAD_REQUEST", "Which customer?");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, currency: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const profile = await customerProfile(store, parsed.data.key);
  if (!profile) return apiError("NOT_FOUND", "Customer not found", 404);
  return ok(profile);
});
