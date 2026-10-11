import { ok, created } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { createSegment, listSegments } from "@/lib/marketing/segments";
import { SegmentSchema } from "../schemas";

export const GET = marketingRoute(async ({ store }) => ok(await listSegments(store.id)));

export const POST = marketingRoute(async ({ req, store }) => {
  const input = await readBody(req, SegmentSchema);
  return created(await createSegment(store.id, input));
});
