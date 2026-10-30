import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { RexBuildError, saveContact } from "@/lib/onboarding/rex-build.server";
import { SetupError } from "@/lib/setup/server";
import { validWhatsapp } from "@shared/seller-onboarding";

export const dynamic = "force-dynamic";

// PUT /api/mobile/onboarding/contact { whatsapp, areas: [{ state, days, fee }], pickup?, pod } → { podProblem }
// "I filled your contact page. Just check it's right." (design RB-13): saved where the shop already keeps each fact
// (src/lib/onboarding/rex-build.server.ts saveContact): the WhatsApp number, the delivery areas (Start here's
// delivery areas), the pickup address and pay on delivery. A plan without pay on delivery saves the rest and says so.
const Body = z.object({
  whatsapp: z.string().trim().max(40),
  areas: z.array(z.object({ state: z.string().trim().min(2).max(80), days: z.enum(["1", "2", "2-3", "3-5"]), fee: z.number().min(0).max(1_000_000) })).max(20),
  pickup: z.string().max(200).optional(),
  pod: z.boolean(),
});

export const PUT = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your contact details.", 400);
  if (!validWhatsapp(parsed.data.whatsapp)) return apiError("BAD_REQUEST", "Add a WhatsApp number so customers can reach you.", 400);
  try {
    return ok(await saveContact(user.id, parsed.data));
  } catch (error) {
    if (error instanceof RexBuildError) return apiError(error.code, error.message, error.status);
    if (error instanceof SetupError) return apiError("BAD_REQUEST", error.message, 400);
    throw error;
  }
});
