import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import type { AuthUser } from "@/lib/auth/types";
import { apiError } from "@/lib/api/response";
import { getT } from "@/lib/i18n/server";
import { CampaignError, sellerStoreFor, type SellerStore } from "./server";

// Route wrapper for /api/app/campaigns/**: a signed-in seller and their own store, readable errors.

export interface CampaignRouteContext {
  req: NextRequest;
  user: AuthUser;
  store: SellerStore;
  params: Record<string, string>;
  /** The seller's language, for words a preset fills in. */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function campaignRoute(handler: (ctx: CampaignRouteContext) => Promise<NextResponse>) {
  return withSeller(async (req, { user, params }) => {
    const store = await sellerStoreFor(user.id);
    if (!store) return apiError("NOT_FOUND", "Set up your store first", 404);
    try {
      const translate = await getT("campaigns");
      const t = (key: string, vars?: Record<string, string | number>) => translate.dynamic(key, key, vars);
      return await handler({ req, user, store, params: (params ?? {}) as Record<string, string>, t });
    } catch (error) {
      if (error instanceof CampaignError) return apiError(error.status === 404 ? "NOT_FOUND" : error.status === 402 ? "PLAN_LIMIT" : error.status === 503 ? "NOT_CONFIGURED" : "BAD_REQUEST", error.message, error.status);
      console.error("[campaigns api]", error);
      return apiError("INTERNAL_ERROR", "Something went wrong on our side. Try again.", 500);
    }
  });
}

/** Parses a JSON body with zod; throws CampaignError with the first issue. */
export async function readCampaignBody<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CampaignError(issue?.message ?? "Check the form and try again");
  }
  return parsed.data;
}
