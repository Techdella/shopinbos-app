import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { libraryFor, loadRexBuild, RexBuildError, saveFirstName, saveRexBuild, trackOnboarding } from "@/lib/onboarding/rex-build.server";
import { EXTRA_SECTIONS, FLOW_SCREENS, LAYOUTS, SELL_CHIPS, isOnboardingEvent, type RexBuildMemory } from "@shared/seller-onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The phone's seller onboarding, "Rex builds your shop" (apps/mobile/src/app/onboarding/**, design RB-01…RB-16;
// rules in shared/seller-onboarding.ts, server side in src/lib/onboarding/rex-build.server.ts).
//   GET   → { store, owner, flow, products, collections, suggestedGroups, priceChecks, contact, library }
//           Everything the screens need, and the saved answers so the app reopens on the same screen.
//   PATCH { patch, firstName?, event?, props? } → { flow }
//           Saves a step's answers (merged into Store.brandSettings.onboardingMemory.rexBuild); the first name also
//           names the account when it has none; an event goes to the analytics tools (spec §7).
// Only the seller (or their staff, acting as the owner) reaches their own shop.

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const state = await loadRexBuild(user.id);
  const images = (state.products ?? []).map((product) => product.image).filter((url): url is string => Boolean(url));
  return ok({ ...state, library: libraryFor(state.flow.categories, images) });
});

const text = (max: number) => z.string().max(max);
const Words = z.object({ headline: text(160), sub: text(240).optional(), cta: text(40).optional() });
const Area = z.object({ state: text(80), days: z.enum(["1", "2", "2-3", "3-5"]), fee: z.number().min(0).max(1_000_000) });

/** The answers a step may save (anything else is refused, so the memory never grows unchecked). */
const Patch = z
  .object({
    mode: z.enum(["start", "redesign"]).optional(),
    screen: z.enum(FLOW_SCREENS).optional(),
    startedAt: text(40).optional(),
    buildStartedAt: text(40).optional(),
    firstName: text(40).optional(),
    categories: z.array(z.enum(SELL_CHIPS)).max(SELL_CHIPS.length).optional(),
    slugEdited: z.boolean().optional(),
    path: z.enum(["rex", "self"]).optional(),
    themeId: text(60).optional(),
    style: z.enum(["warm", "soft", "luxury", "bold"]).optional(),
    palette: text(40).optional(),
    banner: z.object({ url: z.string().url().max(2000), source: z.enum(["product", "rex_library", "upload"]), assetId: text(120).nullable().optional(), swipes: z.number().int().min(0).max(500).optional() }).nullable().optional(),
    words: Words.extend({ options: z.array(Words).max(6).optional() }).nullable().optional(),
    layout: z.object({ layout: z.enum(LAYOUTS as [string, ...string[]]), show: z.enum(["best-sellers", "new", "collection"]), collectionId: text(60).nullable().optional(), showPrice: z.boolean() }).nullable().optional(),
    sections: z.record(z.enum(EXTRA_SECTIONS as [string, ...string[]]), z.boolean()).nullable().optional(),
    media: z.array(z.string().url().max(2000)).max(12).optional(),
    about: z.object({ started: text(300).optional(), different: text(500).optional(), story: text(2000).optional(), images: z.array(z.string().url().max(2000)).max(6).optional() }).nullable().optional(),
    categoriesConfirmed: z.boolean().optional(),
    steps: z.record(z.enum(FLOW_SCREENS), z.object({ usedRexChoose: z.boolean(), seconds: z.number().min(0).max(86_400), at: text(40) })).optional(),
    builtAt: text(40).nullable().optional(),
    notifyWhenBuilt: z.boolean().optional(),
    source: text(40).optional(),
    intent: z.object({ kind: z.enum(["add_product", "dropship"]), productSlug: text(160), addedProductId: text(60).nullable().optional() }).nullable().optional(),
    referralCode: text(40).nullable().optional(),
    pilotInvite: text(40).nullable().optional(),
  })
  .strict();

const Body = z.object({
  patch: Patch.default({}),
  event: z.string().max(40).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "That answer couldn't be saved.", 400);
  const { patch, event, props } = parsed.data;
  try {
    if (patch.firstName) patch.firstName = (await saveFirstName(user.id, patch.firstName)) ?? patch.firstName;
    const flow = await saveRexBuild(user.id, patch as Partial<RexBuildMemory>);
    if (event && isOnboardingEvent(event)) await trackOnboarding(user.id, event, props ?? {});
    return ok({ flow });
  } catch (error) {
    if (error instanceof RexBuildError) return apiError(error.code, error.message, error.status);
    throw error;
  }
});
