import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { createAdRequest } from "@/lib/ad-campaigns/requests.server";
import { AdRequestSchema } from "@shared/ad-campaigns";
import { appCallbackUrl } from "@/lib/payments/app-return.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Shopinbos runs it for me": GET lists the store's requests; POST saves one and starts the setup-fee payment.
export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(await db.adServiceRequest.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 30 }));
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = AdRequestSchema.safeParse(body);
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your details.");
  try {
    const result = await createAdRequest({ user: { id: user.id, email: user.email ?? null }, storeId: store.id, request: parsed.data, returnTo: "/home/ads", callbackUrl: appCallbackUrl(body?.app) });
    return ok(result);
  } catch (error) {
    console.error("[ad-requests] create failed", error);
    return apiError("BAD_GATEWAY", error instanceof Error ? error.message : "Couldn't start the payment. Try again.", 502);
  }
});
