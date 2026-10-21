import { NextRequest, NextResponse } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import type { AuthUser } from "@/lib/auth/types";
import { cacCheckEnabled, runCacCheck } from "@/lib/kyb/verify-cac.server";
import { cacCheckResponse } from "@/lib/kyb/route-response";
import { registrationEnabled } from "@/lib/business-registration/service.server";

// Instant CAC check (see src/lib/kyb/cac.ts). GET says whether it's switched on, and whether registering a new
// business name through Shopinbos is open (Admin › Settings › Launches) so the form can link to it.
export const GET = withLogistics(async () => NextResponse.json({ data: { enabled: cacCheckEnabled(), registrationOpen: await registrationEnabled().catch(() => false) } }));

export const POST = withLogistics(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => ({}));
  return cacCheckResponse(await runCacCheck("logistics_partner", user, body ?? {}));
});
