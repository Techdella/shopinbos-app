import { NextRequest } from "next/server";
import { z } from "zod";
import { withSupplier } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { answerAgreement } from "@/lib/marketplace/agreements.server";

export const dynamic = "force-dynamic";

// The supplier signs a shop's Dropship agreement with their typed name (the shop can then list their products), or
// declines it saying why. POST { accept: true, signedName } | { accept: false, note }. Same rules as the web's
// answerDropshipAgreementAction (src/app/actions/supplier.ts).
const Body = z.object({ accept: z.boolean(), note: z.string().max(600).optional(), signedName: z.string().max(80).optional() });

export const POST = withSupplier(async (req: NextRequest, { user, params }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Sign with your name, or say why you decline.");
  const input = parsed.data;
  const result = await answerAgreement(user, String(params.id).slice(0, 40), input.accept, input.note, input.accept ? (input.signedName ?? "") : undefined);
  return result.ok ? ok({ message: result.message }) : apiError("NOT_ANSWERED", result.error, 409);
});
