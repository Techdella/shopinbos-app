import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { rexStudioWelcomeFor } from "@/lib/ai/rex-studio-welcome.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/app/rex-studio → { welcome: { granted, balance, target, percent, state, expiresAt, product, costs } | null }
// The "You have 20 credits to try Rex Studio" card (shared/rex-studio-welcome.ts) for the "is live" screen and Home,
// on the web and in the phone app (Bearer). null: not a free seller who got the welcome, or it was over 30 days ago.
export const GET = withSeller(async (_req, { user }) => ok({ welcome: await rexStudioWelcomeFor(user.id) }));
