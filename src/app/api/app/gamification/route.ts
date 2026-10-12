import { z } from "zod";
import { ok, apiError } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { GameError, loadGameConfig, saveGameConfig } from "@/lib/gamification/config.server";
import { configProblems, readGameConfig } from "@/lib/gamification/logic";
import { gameStats } from "@/lib/gamification/stats.server";

// Marketing > Rewards: GET the settings and the last 30 days' numbers; PUT saves the settings (games, prizes
// and odds, reward tiers, loyalty points, post-purchase spin). The body is cleaned by readGameConfig, so only
// known settings within their limits are stored.

export const GET = marketingRoute(async ({ store, req }) => {
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const [config, stats] = await Promise.all([loadGameConfig(store.id), gameStats(store.id, days)]);
  return ok({ config, stats });
});

const Body = z.object({ config: z.record(z.string(), z.unknown()) });

export const PUT = marketingRoute(async ({ store, req }) => {
  const { config: raw } = await readBody(req, Body);
  const config = readGameConfig(raw);
  const problems = configProblems(config);
  if (problems.length) return apiError("BAD_REQUEST", problems[0]!, 400);
  try {
    return ok({ config: await saveGameConfig(store.id, config) });
  } catch (error) {
    if (error instanceof GameError) return apiError("BAD_REQUEST", error.message, 400);
    throw error;
  }
});
