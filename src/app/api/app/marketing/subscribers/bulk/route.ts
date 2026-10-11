import { z } from "zod";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { MarketingError } from "@/lib/marketing/segments";
import { cleanTags } from "@/lib/marketing/subscribers";

const BulkSchema = z.object({
  ids: z.array(z.string().max(64)).min(1, "Pick at least one person").max(5000),
  action: z.enum(["tag", "untag", "unsubscribe", "delete"]),
  tag: z.string().max(40).optional(),
});

// Tag, untag, unsubscribe or delete many subscribers. Re-subscribing someone is only possible through a form they fill in.
export const POST = marketingRoute(async ({ req, store }) => {
  const input = await readBody(req, BulkSchema);
  const where = { id: { in: input.ids }, storeId: store.id };
  if (input.action === "unsubscribe") {
    const result = await db.subscriber.updateMany({ where: { ...where, status: "active" }, data: { status: "unsubscribed", unsubscribedAt: new Date() } });
    return ok({ updated: result.count });
  }
  if (input.action === "delete") {
    // Unsubscribed and bounced addresses stay as a "do not contact" record, so a later order can't re-add them to emails.
    const result = await db.subscriber.deleteMany({ where: { ...where, status: "active" } });
    return ok({ updated: result.count, kept: input.ids.length - result.count });
  }
  const [tag] = cleanTags([input.tag ?? ""]);
  if (!tag) throw new MarketingError("Type a tag");
  const rows = await db.subscriber.findMany({ where, select: { id: true, tags: true } });
  for (const row of rows) {
    const tags = input.action === "tag" ? [...new Set([...row.tags, tag])] : row.tags.filter((t) => t !== tag);
    if (tags.length !== row.tags.length) await db.subscriber.update({ where: { id: row.id }, data: { tags } });
  }
  return ok({ updated: rows.length });
});
