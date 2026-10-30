import { z } from "zod";
import { ok } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { draftBlastWithRex } from "@/lib/followers/blasts.server";
import { FOLLOWER_BLAST_KINDS } from "@shared/follower-blasts";
import { isLocale } from "@shared/i18n";
import { followersOff } from "../_gate";

// Rex drafts a follower message: POST { kind, productId?, notes?, language? } → { data: { ai, title, body } }.
// Without an AI key (or when it fails), a ready-made message for the kind.

const Body = z.object({
  kind: z.enum(FOLLOWER_BLAST_KINDS),
  productId: z.string().max(64).nullish(),
  notes: z.string().max(400).nullish(),
  language: z.string().max(8).nullish().transform((value) => (value && isLocale(value) ? value : null)),
});

export const POST = marketingRoute(async ({ req, user, store }) => {
  const off = await followersOff(req, user);
  if (off) return off;
  const input = await readBody(req, Body);
  return ok(await draftBlastWithRex(store, input));
});
