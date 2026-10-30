import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { appFromHeaders, featuresFor } from "@/lib/feature-switches.server";
import { APP_VERSION_HEADER } from "@shared/feature-switches";

export const dynamic = "force-dynamic";

// The pilot features on for the signed-in account (any role) on the app asking (shared/feature-switches.ts; set in
// Admin › Pilot features). The apps ask when they open and come back to the front, and hide anything not listed.
//   Headers: X-App-Platform (business_android | business_ios | business_web | plug_android | plug_ios) and
//            X-App-Version ("1.0.3"). The web sends neither and counts as business_web.
//   GET → { data: { features: string[] } }   (never an error for a signed-in account: anything wrong → [])

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const app = appFromHeaders(req.headers);
  const version = req.headers.get(APP_VERSION_HEADER)?.trim().slice(0, 32) || null;
  const features = await featuresFor(user, app, version);
  return ok({ features });
});
