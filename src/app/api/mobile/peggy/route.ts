import { NextRequest } from "next/server";
import { setupStatus, setupText } from "@/lib/onboarding/setup-status.server";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { meterAi } from "@/lib/ai/usage";
import { aiText } from "@/lib/ai/text";
import { creditBalance } from "@/lib/ai/credits.server";
import { buildSellerSnapshot, greetingFor, parsePeggyBody, runPeggy } from "@/lib/ai/peggy";
import { buildSupplierSnapshot } from "@/lib/ai/peggy/supplier-context.server";
import { buildPartnerSnapshot } from "@/lib/ai/peggy/partner-context.server";
import { IN_APP_PAYMENTS_RULE } from "@shared/store-payments";
import { peggyRoleOf, rolePeggyIntro, rolePeggySuggestions, rolePeggySystem } from "@/lib/ai/peggy/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Ask Peggy in the phone app, for every role.
//   GET  → { intro, suggestions }
//   POST { messages: [{ role: "user" | "assistant", content }] } (the conversation, newest last)
//        → { reply, creditsLeft, actions? }
// Sellers get the same Peggy as /api/app/peggy (runPeggy, with her tools and confirmations; `actions` lists what she
// did). Suppliers and delivery partners get a read-only Peggy: no tools, their own numbers in the context
// (src/lib/ai/peggy/roles.ts). Every reply is metered like seller Peggy (meterAi "text": the day's allowance, then
// AI credits; out of both → 402 AI_CREDITS_NEEDED). This is the phone app, so her instructions carry the app store
// payment rule (IN_APP_PAYMENTS_RULE, shared/store-payments.ts): she never tells anyone to buy credits or plans.

const ROLES = ["seller", "supplier", "logistics_partner"] as const;

export const GET = withAuth(async (_req: NextRequest, { user }) => {
  const role = peggyRoleOf(user.role);
  if (role === "supplier") {
    const { firstName, pendingRequest } = await buildSupplierSnapshot(user.id);
    return ok({ intro: rolePeggyIntro(role, firstName ?? user.name), suggestions: rolePeggySuggestions(role, { priceRequest: pendingRequest }) });
  }
  if (role === "logistics_partner") {
    const { firstName, missedJob } = await buildPartnerSnapshot(user.id);
    return ok({ intro: rolePeggyIntro(role, firstName ?? user.name), suggestions: rolePeggySuggestions(role, { missedJob }) });
  }
  const [snapshot, top] = await Promise.all([
    buildSellerSnapshot(user.id).catch(() => null),
    db.storeProduct
      .findFirst({ where: { userId: user.id, status: "published" }, orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }], select: { name: true } })
      .catch(() => null),
  ]);
  return ok({
    intro: snapshot ? greetingFor(user.name, snapshot) : rolePeggyIntro(role, user.name),
    suggestions: rolePeggySuggestions(role, { product: top?.name ?? null }),
  });
}, [...ROLES]);

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = parsePeggyBody(await req.json().catch(() => null));
  if (!parsed.ok) return apiError("BAD_REQUEST", parsed.error);

  // Setup help is free: while they're still getting set up, Peggy doesn't use AI credits (a daily cap instead).
  const setup = await setupStatus(user.id).catch(() => null);
  const settingUp = Boolean(setup?.next);
  if (settingUp) {
    if (!(await checkRateLimitShared(rateLimitKey("setup-peggy", user.id), { maxRequests: 80, windowMs: 86_400_000 })).allowed) {
      return apiError("RATE_LIMITED", "That's a lot of messages today. Peggy is back tomorrow, or message us on WhatsApp.", 429);
    }
  } else {
    const limited = await meterAi(user.id, "text");
    if (limited) return limited;
  }

  const role = peggyRoleOf(user.role);
  if (role === "seller") {
    const result = await runPeggy({ id: user.id, phone: user.phone ?? null }, parsed.turns, { inApp: true });
    if ("error" in result) return apiError("UNAVAILABLE", result.error, 503);
    return ok({ reply: result.text, creditsLeft: await creditBalance(user.id).catch(() => null), actions: result.actions });
  }

  const { snapshot } = role === "supplier" ? await buildSupplierSnapshot(user.id) : await buildPartnerSnapshot(user.id);
  const system = `${rolePeggySystem(role, snapshot)}${settingUp && setup ? `\n\nThey're still setting up. Help them finish, one step at a time, and say which screen to open:\n${setupText(setup)}` : ""}\n\n${IN_APP_PAYMENTS_RULE}`;
  const result = await aiText({ system, messages: parsed.turns, maxTokens: 4000 }).catch((error) => {
    console.error("[mobile/peggy] reply failed", error);
    return null;
  });
  if (!result) return apiError("UNAVAILABLE", "Peggy couldn't answer just now. Try again in a moment.", 503);
  return ok({ reply: result.text, creditsLeft: await creditBalance(user.id).catch(() => null) });
}, [...ROLES]);
