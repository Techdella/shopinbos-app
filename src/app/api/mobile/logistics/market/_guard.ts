import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { isOnboardingComplete } from "@/lib/role-queries";
import { partnerForUser } from "../_shared";

// Same steps as the web partner forms (src/app/actions/delivery-market-partner.ts): setting up (rates, coverage,
// pickup points) needs onboarding done; working with businesses (private rates, pay on delivery, ending a
// connection) needs the partner verified.

type Partner = NonNullable<Awaited<ReturnType<typeof partnerForUser>>>;

export async function partnerFor(userId: string, need: "any" | "setup" | "verified"): Promise<{ partner: Partner } | { error: NextResponse }> {
  const partner = await partnerForUser(userId);
  if (!partner) return { error: apiError("NOT_FOUND", "Delivery partner profile not found", 404) };
  if (need !== "any" && !isOnboardingComplete(partner)) return { error: apiError("SETUP_REQUIRED", "Finish setting up your company first.", 403) };
  if (need === "verified" && partner.verificationStatus !== "verified") return { error: apiError("VERIFICATION_REQUIRED", "We're still checking your documents. You can do this once you're verified.", 403) };
  return { partner };
}

export const rateInput = (body: Record<string, unknown>) => ({ rows: Array.isArray(body.rows) ? body.rows : [], failedAttemptFee: body.failedAttemptFee ?? 0, returnFee: body.returnFee ?? 0, notes: body.notes ?? "" });
