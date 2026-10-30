import { ok } from "@/lib/api/response";
import { marketingRoute } from "@/lib/marketing/api";
import { setUpFollowerTemplate } from "@/lib/followers/blasts.server";
import { followersOff } from "../_gate";

// Sets up the WhatsApp template for follower news ("follower_news", a marketing template on the shop's own WhatsApp
// Business account) and sends it to Meta for approval: POST → { data: { status } }. Needs WhatsApp connected.

export const POST = marketingRoute(async ({ req, user, store }) => {
  const off = await followersOff(req, user);
  if (off) return off;
  return ok(await setUpFollowerTemplate(store.id));
});
