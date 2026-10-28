import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { markupProblem } from "@shared/supplier-markup";
import { overQuickLimit, saveSellerMarkup, sellerMarkup } from "@/lib/marketplace/quick-add.server";

export const dynamic = "force-dynamic";

// The seller's markup on supplier prices ("Add 30% to supplier prices"; shared/supplier-markup.ts), kept in the
// store's settings (brandSettings.sourcing.markup).
//   GET → { markup: { kind: "percent"|"amount", value }, asked: boolean }   (30% and asked=false until they pick)
//   PUT { kind, value } → { markup, asked: true }   (5–300%, or ₦100 or more)

const Schema = z.object({ kind: z.enum(["percent", "amount"]), value: z.number().positive().max(5_000_000) });

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const found = await sellerMarkup(user.id);
  if (!found) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(found);
});

export const PUT = withSeller(async (req: NextRequest, { user }) => {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return apiError("BAD_REQUEST", markupProblem(body) ?? "Pick a markup.");
  if (await overQuickLimit(user.id, "markup")) return apiError("RATE_LIMITED", "Wait a few minutes and try again.", 429);
  const saved = await saveSellerMarkup(user.id, parsed.data);
  if (!saved.ok) return saved.code === "NOT_FOUND" ? apiError("NOT_FOUND", "Set up your store first.", 404) : apiError("BAD_REQUEST", markupProblem(parsed.data) ?? "Pick a markup.");
  return ok({ markup: saved.markup, asked: true });
});
