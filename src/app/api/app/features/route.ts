import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { featuresFor } from "@/lib/feature-switches.server";
import { APP_PLATFORM_HEADER, APP_VERSION_HEADER, parseFeatureApp, type FeatureApp } from "@shared/feature-switches";
import { APP_CLIENT_HEADER, APP_CLIENT_VALUE } from "@shared/store-payments";

export const dynamic = "force-dynamic";

// The pilot features on for the signed-in account (any role) on the app asking (shared/feature-switches.ts; set in
// Admin › Pilot features). The apps ask when they open and come back to the front, and hide anything not listed.
//   Headers: X-App-Platform (business_android | business_ios | business_web | plug_android | plug_ios) and
//            X-App-Version ("1.0.3"). The web sends neither and counts as business_web.
//   GET → { data: { features: string[] } }   (never an error for a signed-in account: anything wrong → [])

/** The app asking: its X-App-Platform header; none from a browser is the web; none from the phone app is nothing. */
export function appFromHeaders(headers: Headers): FeatureApp | null {
  const header = headers.get(APP_PLATFORM_HEADER);
  if (header) return parseFeatureApp(header);
  return headers.get(APP_CLIENT_HEADER) === APP_CLIENT_VALUE ? null : "business_web";
}

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const app = appFromHeaders(req.headers);
  const version = req.headers.get(APP_VERSION_HEADER)?.trim().slice(0, 32) || null;
  const features = await featuresFor(user, app, version);
  return ok({ features });
});
