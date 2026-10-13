import { NextRequest } from "next/server";
import { z } from "zod";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { isOnboardingComplete } from "@/lib/role-queries";
import { bookPickup, cancelPickup, markPacked, pickupState } from "@/lib/supplier-orders/pickup.server";

export const dynamic = "force-dynamic";

// The rider for one of the supplier's orders (web portal and the mobile app). ?kind=dropship (default) | wholesale.
//   GET    → the slots to choose from ("In 1 hour", "This afternoon (12–4pm)"...), the saved address and the pickup.
//   POST   { kind, intent: "packed" }  "I've packed it".
//   POST   { kind, intent: "book", slot, day?, startHour?, address? }  books the rider (or moves the time).
//   DELETE ?kind=  cancels the pickup while no rider has the job yet.

const Body = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("packed"), kind: z.enum(["dropship", "wholesale"]).default("dropship") }),
  z.object({
    intent: z.literal("book"),
    kind: z.enum(["dropship", "wholesale"]).default("dropship"),
    slot: z.string().trim().min(1).max(40),
    day: z.string().trim().max(10).optional(),
    startHour: z.number().int().min(0).max(23).optional(),
    address: z.string().trim().max(300).optional(),
  }),
]);

const kindOf = (req: NextRequest) => (req.nextUrl.searchParams.get("kind") === "wholesale" ? "wholesale" : "dropship");

async function tradingSupplier(userId: string) {
  const supplier = await db.supplier.findUnique({ where: { userId } });
  if (!supplier) return { error: apiError("NOT_FOUND", "Supplier profile not found", 404) };
  if (!isOnboardingComplete(supplier) || supplier.verificationStatus !== "verified") {
    return { error: apiError("VERIFICATION_REQUIRED", "Finish setting up and get verified before you send orders.", 403) };
  }
  return { supplier };
}

export const GET = withSupplier(async (req: NextRequest, { user, params }) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const state = await pickupState(supplier.id, kindOf(req), String(params.id));
  if (!state) return apiError("NOT_FOUND", "Order not found", 404);
  return ok(state);
});

export const POST = withSupplier(async (req: NextRequest, { user, params }) => {
  const found = await tradingSupplier(user.id);
  if (found.error) return found.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Pick when a rider can collect it.");
  const id = String(params.id);
  const input = parsed.data;
  if (input.intent === "packed") {
    const packed = await markPacked(found.supplier.id, input.kind, id);
    if (!packed.ok) return apiError(packed.code, packed.message, packed.code === "NOT_FOUND" ? 404 : packed.code === "CONFLICT" ? 409 : 400);
    return ok(await pickupState(found.supplier.id, input.kind, id));
  }
  const result = await bookPickup({ supplierId: found.supplier.id, kind: input.kind, orderId: id, choice: { key: input.slot, day: input.day, startHour: input.startHour }, address: input.address });
  if (!result.ok) return apiError(result.code, result.message, result.code === "NOT_FOUND" ? 404 : result.code === "CONFLICT" ? 409 : 400);
  return ok(result.data);
});

export const DELETE = withSupplier(async (req: NextRequest, { user, params }) => {
  const found = await tradingSupplier(user.id);
  if (found.error) return found.error;
  const result = await cancelPickup(found.supplier.id, kindOf(req), String(params.id));
  if (!result.ok) return apiError(result.code, result.message, result.code === "NOT_FOUND" ? 404 : 409);
  return ok(result.data);
});
