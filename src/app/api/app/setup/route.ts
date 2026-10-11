import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { SETUP_STEP_KEYS } from "@/lib/setup/checklist";
import { getSetupOverview, saveSetupChoice, SetupError } from "@/lib/setup/server";

export const dynamic = "force-dynamic";

// The Start here checklist for the web page's clients and the mobile app (cookie or Bearer auth).
// GET → { data: SetupOverview }. PATCH { type: "skip" | "unskip", key } or { type: "dismiss" | "reopen" | "shared" }.

const Body = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["skip", "unskip"]), key: z.enum(SETUP_STEP_KEYS) }),
  z.object({ type: z.enum(["dismiss", "reopen", "shared"]) }),
]);

export const GET = withSeller(async (_req, { user }) => {
  const overview = await getSetupOverview(user.id);
  if (!overview) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(overview);
});

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say which step to skip or bring back.");
  try {
    const overview = await saveSetupChoice(user.id, parsed.data);
    if (!overview) return apiError("NOT_FOUND", "Store not found", 404);
    return ok(overview);
  } catch (error) {
    if (error instanceof SetupError) return apiError("BAD_REQUEST", error.message);
    throw error;
  }
});
