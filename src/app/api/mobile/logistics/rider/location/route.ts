import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api/response";
import { riderFromToken } from "@/lib/logistics/rider-session";
import { recordRiderLocations } from "@/lib/logistics/rider-location";

export const dynamic = "force-dynamic";

// Riders app location reports (apps/mobile/src/lib/rider-location.ts): about once a minute, or after moving 100 m,
// while the rider is online or on a job. Queued points from a phone that was offline arrive together.
//   POST { points: [{ lat, lng, accuracy?, at }] }  (X-Rider-Token header)  → { saved, tracking }
// tracking: false tells the app to stop (the rider is offline with no job), so it never reports in the background
// of an idle phone.

const LINK_ERROR = "This link no longer works. Ask your dispatcher for a new one.";

const Body = z.object({
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy: z.number().min(0).max(1_000_000).nullish(),
        at: z.union([z.number().int().positive(), z.string().max(40)]),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(req: NextRequest) {
  const session = await riderFromToken(req.headers.get("x-rider-token")?.trim() ?? "");
  if (!session.ok) {
    return session.reason === "limited"
      ? apiError("RATE_LIMITED", "Too many tries. Wait a minute and try again.", 429)
      : apiError("UNAUTHORIZED", LINK_ERROR, 401);
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "We couldn't read that location. The app will send the next one.");

  const result = await recordRiderLocations(session.rider, parsed.data.points);
  if (!result.ok) return ok({ saved: 0, tracking: result.reason !== "not_active" });
  return ok({ saved: result.saved, tracking: true });
}
