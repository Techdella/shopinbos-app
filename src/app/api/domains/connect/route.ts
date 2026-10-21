import { NextRequest, NextResponse } from "next/server";
import { customDomainProblem } from "@/lib/plans/gates.server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { DomainError, claimDomain, getDomainSettings, removeDomain } from "@/lib/domains/ownership.server";

// A seller's own domain. POST only records a claim (Store.pendingDomain + a verification token): nothing is
// served until POST /api/domains/verify finds the TXT record. GET reads the state, DELETE removes a domain.

const ClaimSchema = z.object({
  domain: z.string().trim().min(1, "Enter the domain you own.").max(260),
  serveAs: z.enum(["apex", "www"]).optional(),
});
const RemoveSchema = z.object({ which: z.enum(["live", "pending", "all"]).default("all") });

function failure(error: unknown) {
  if (error instanceof DomainError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error("[domains] request failed", error);
  return NextResponse.json({ error: { code: "domain_failed", message: "Something went wrong with your domain. Try again." } }, { status: 500 });
}

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  try {
    return NextResponse.json({ data: await getDomainSettings(user.id) });
  } catch (error) {
    return failure(error);
  }
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = ClaimSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "missing_domain", message: parsed.error.issues[0]?.message ?? "Domain is required." } }, { status: 400 });
  }
  // Your own domain comes with Starter and up (shared/plans.ts).
  const planProblem = await customDomainProblem(user.id);
  if (planProblem) return NextResponse.json({ error: { code: "PLAN_LIMIT", message: planProblem } }, { status: 402 });
  try {
    return NextResponse.json({ data: await claimDomain(user.id, parsed.data.domain, parsed.data.serveAs) });
  } catch (error) {
    return failure(error);
  }
});

export const DELETE = withSeller(async (req: NextRequest, { user }) => {
  const parsed = RemoveSchema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_body", message: "Say which domain to remove." } }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await removeDomain(user.id, parsed.data.which) });
  } catch (error) {
    return failure(error);
  }
});
