import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import type { AuthUser } from "@/lib/auth/types";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { MarketingError } from "./segments";

// Route wrapper for /api/app/marketing/**: signed-in seller, their store, readable errors.

export interface MarketingRouteContext {
  req: NextRequest;
  user: AuthUser;
  store: { id: string; name: string; slug: string; currency: string; userId: string };
  params: Record<string, string>;
}

export function marketingRoute(handler: (ctx: MarketingRouteContext) => Promise<NextResponse>) {
  return withSeller(async (req, { user, params }) => {
    const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, currency: true, userId: true } });
    if (!store) return apiError("NOT_FOUND", "Set up your store first", 404);
    try {
      return await handler({ req, user, store, params: (params ?? {}) as Record<string, string> });
    } catch (error) {
      if (error instanceof MarketingError) return apiError("BAD_REQUEST", error.message, 400);
      console.error("[marketing api]", error);
      return apiError("INTERNAL_ERROR", "Something went wrong on our side. Try again.", 500);
    }
  });
}

/** Parses a JSON body with zod; throws MarketingError with the first issue. */
export async function readBody<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new MarketingError(issue ? `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}` : "Check the form and try again");
  }
  return parsed.data;
}
