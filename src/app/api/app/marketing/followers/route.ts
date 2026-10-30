import { after } from "next/server";
import { z } from "zod";
import { apiError, created, ok } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { BlastCapError, createFollowerBlast, followersOverview, processFollowerBlast } from "@/lib/followers/blasts.server";
import { BLAST_CHANNELS, FOLLOWER_BLAST_KINDS } from "@shared/follower-blasts";
import { followersOff } from "./_gate";

// Notify my followers (shared/follower-blasts.ts), for the web page /home/marketing/followers and the phone screen.
//   GET  → { data: FollowersOverview }  follower count, who each channel reaches, "2 of 3 left this week", history
//   POST { kind, title, body, productId?, link?, channels? } → { data: { blast } }  queues it and starts sending
//        409 CAP_REACHED when the week's 3 are used (data in error.allowance).

export const maxDuration = 300;

const Body = z.object({
  kind: z.enum(FOLLOWER_BLAST_KINDS),
  title: z.string().max(200),
  body: z.string().max(2000),
  productId: z.string().max(64).nullish(),
  link: z.string().max(600).nullish(),
  channels: z.array(z.enum(BLAST_CHANNELS)).max(3).optional(),
});

export const GET = marketingRoute(async ({ req, user, store }) => {
  const off = await followersOff(req, user);
  if (off) return off;
  return ok(await followersOverview(store));
});

export const POST = marketingRoute(async ({ req, user, store }) => {
  const off = await followersOff(req, user);
  if (off) return off;
  const input = await readBody(req, Body);
  try {
    const blast = await createFollowerBlast(store, user.id, input);
    // Sends after the answer; the marketing cron finishes anything left (time limit, crash).
    after(() => processFollowerBlast(blast.id));
    return created({ blast });
  } catch (error) {
    if (error instanceof BlastCapError) return apiError("CAP_REACHED", error.message, 409);
    throw error;
  }
});
