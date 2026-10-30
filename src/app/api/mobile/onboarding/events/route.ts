import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { trackOnboarding } from "@/lib/onboarding/rex-build.server";
import { isOnboardingEvent } from "@shared/seller-onboarding";

export const dynamic = "force-dynamic";

// POST /api/mobile/onboarding/events { event, props? } → { tracked }
// The seller onboarding's analytics events (spec §7, shared/seller-onboarding.ts ONBOARDING_EVENTS) from the phone,
// sent to the analytics tools from the server (trackServerEvent), so ad blockers and app builds don't hide them.
// Only the listed events, and only short plain properties.
const Body = z.object({ event: z.string().max(40), props: z.record(z.string(), z.unknown()).optional() });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isOnboardingEvent(parsed.data.event)) return apiError("BAD_REQUEST", "Unknown event.", 400);
  await trackOnboarding(user.id, parsed.data.event, parsed.data.props ?? {});
  return ok({ tracked: true });
});
