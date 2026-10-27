import { NextRequest } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { isMissingTable } from "@/lib/rate-limit-core";
import { IMPORT_STEPS } from "@/lib/imports/pure";
import { ImportError, advanceImport, cancelByPartner, sendQuote, updatePartnerDetails } from "@/lib/imports/service.server";

export const dynamic = "force-dynamic";

// Admin › China imports (the sourcing partner's queue): send a quote, move an order on a step, cancel it, or keep
// the tracking details and notes up to date. The Imports section of the admin role decides who can call this.

const money = z.number().min(0).max(1_000_000_000);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const short = (max: number) => z.string().trim().max(max).transform((value) => value || null).nullable();

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("quote"),
    unitPrice: z.number().positive().max(1_000_000_000),
    quantity: z.number().int().min(1).max(100_000),
    freight: money,
    customs: money,
    serviceFee: money,
    validDays: z.number().int().min(1).max(30),
    estimatedArrival: day,
    paymentUrl: z.string().trim().url().max(500).refine((url) => url.startsWith("https://"), "Use an https link.").nullable(),
    quoteNote: short(600),
  }),
  z.object({
    action: z.literal("advance"),
    to: z.enum(IMPORT_STEPS.map((step) => step.key) as [string, ...string[]]),
    carrier: short(80).optional(),
    trackingNumber: short(80).optional(),
    estimatedArrival: day.optional(),
    partnerNote: short(200).optional(),
  }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3).max(300) }),
  z.object({
    action: z.literal("details"),
    partnerNote: short(200).optional(),
    teamNotes: short(2000).optional(),
    carrier: short(80).optional(),
    trackingNumber: short(80).optional(),
    estimatedArrival: day.optional(),
    externalId: short(80).optional(),
  }),
]);

export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the form.");
  const body = parsed.data;
  try {
    if (body.action === "quote") {
      const { action: _action, ...quote } = body;
      return ok(await sendQuote(id, quote));
    }
    if (body.action === "advance") {
      const { action: _action, to, ...rest } = body;
      return ok(await advanceImport(id, { ...rest, to: to as (typeof IMPORT_STEPS)[number]["key"] }));
    }
    if (body.action === "cancel") return ok(await cancelByPartner(id, body.reason));
    const { action: _action, ...details } = body;
    return ok(await updatePartnerDetails(id, details));
  } catch (error) {
    if (error instanceof ImportError) return apiError("BAD_REQUEST", error.message);
    if (isMissingTable(error)) return apiError("MIGRATION_NEEDED", "Run docs/migrations/2026-11-30-import-orders.sql first.", 503);
    if ((error as { code?: string }).code === "P2025") return apiError("NOT_FOUND", "Import not found", 404);
    throw error;
  }
});
