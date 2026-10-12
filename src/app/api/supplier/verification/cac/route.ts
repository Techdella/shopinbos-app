import { NextRequest, NextResponse } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import type { AuthUser } from "@/lib/auth/types";
import { cacCheckEnabled, runCacCheck } from "@/lib/kyb/verify-cac.server";
import { cacCheckResponse } from "@/lib/kyb/route-response";

// Instant CAC check (see src/lib/kyb/cac.ts). GET says whether it's switched on.
export const GET = withSupplier(async () => NextResponse.json({ data: { enabled: cacCheckEnabled() } }));

export const POST = withSupplier(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => ({}));
  return cacCheckResponse(await runCacCheck("supplier", user, body ?? {}));
});
