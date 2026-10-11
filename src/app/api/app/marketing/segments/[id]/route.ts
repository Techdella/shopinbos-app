import { ok } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { deleteSegment, updateSegment } from "@/lib/marketing/segments";
import { SegmentSchema } from "../../schemas";

export const PATCH = marketingRoute(async ({ req, store, params }) => {
  const input = await readBody(req, SegmentSchema.partial());
  return ok(await updateSegment(store.id, params.id, input));
});

export const DELETE = marketingRoute(async ({ store, params }) => {
  await deleteSegment(store.id, params.id);
  return ok({ deleted: true });
});
