import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { markJobReady, reassignJob, reassignOptions, sellerConfirmsCash } from "@/lib/delivery-market/jobs.server";

export const dynamic = "force-dynamic";

// One of the shop's delivery jobs (same rules as the web forms in src/app/actions/delivery-market.ts).
// GET → connected partners who can take it instead, cheapest first ("Send to another partner").
// POST { action: "ready" }                   it's packed: the partner can collect it
//      { action: "reassign", connectionId }  send a declined, unaccepted or late job to another connected partner
//      { action: "cash_received" }           pay on delivery: the shop got the cash from the partner (a record)
export const GET = withSeller(async (_req: NextRequest, { user, params }) => {
  return ok({ options: await reassignOptions(user.id, String(params.id)) });
});

export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const body = (await req.json().catch(() => null)) as { action?: unknown; connectionId?: unknown } | null;
  const id = String(params.id);
  const result =
    body?.action === "ready"
      ? await markJobReady(user.id, id)
      : body?.action === "reassign"
        ? typeof body.connectionId === "string" && body.connectionId
          ? await reassignJob(user.id, id, body.connectionId.slice(0, 40))
          : ({ ok: false, error: "Pick the partner to send it to." } as const)
        : body?.action === "cash_received"
          ? await sellerConfirmsCash(user.id, id)
          : ({ ok: false, error: "Choose what to do with this delivery." } as const);
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ done: true, bookingId: "bookingId" in result ? result.bookingId ?? null : null });
});
