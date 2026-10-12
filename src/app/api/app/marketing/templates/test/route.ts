import { z } from "zod";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { testSendTemplate } from "@/lib/marketing/templates";

// "Send test email": the template as it is in the editor, to the seller's own address only.
export const POST = marketingRoute(async ({ req, user, store }) => {
  const input = await readBody(req, z.object({ subject: z.string().max(200), preheader: z.string().max(200).nullable().optional(), bodyHtml: z.string().max(200_000) }));
  const me = await db.user.findUnique({ where: { id: user.id }, select: { email: true } });
  return ok(await testSendTemplate(store.id, input, me?.email ?? user.email));
});
