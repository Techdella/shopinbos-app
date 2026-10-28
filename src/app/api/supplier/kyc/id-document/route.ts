import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { supplierIdStep } from "@/lib/kyc/supplier-steps.server";

export const runtime = "nodejs";

// The step itself is in src/lib/kyc/supplier-steps.server.ts, shared with the phone link (/verify/phone/[token]).
export const POST = withSupplier(async (req: NextRequest, { user }) => supplierIdStep(user.id, (await req.json().catch(() => null)) as Record<string, unknown> | null));
