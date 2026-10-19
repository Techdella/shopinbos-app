import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { riderFromToken } from "@/lib/logistics/rider-session";
import { webPushPublicKey } from "@/lib/notifications/push.server";
import { isAllowedWebPushEndpoint, isExpoPushToken } from "@shared/notifications";

// Phones and browsers that get push notifications.
//   GET    → the Web Push public key (null when web push isn't set up) and this account's devices.
//   POST   → register (or refresh) this phone's Expo token or this browser's Web Push subscription.
//   DELETE → stop pushes to it (signing out, or "Turn off" in settings).
// Signed-in people use their session (cookie or Bearer). Riders have no account: they send X-Rider-Token.

const Meta = { appVersion: z.string().trim().max(40).optional(), deviceName: z.string().trim().max(80).optional() };

const RegisterSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("expo"),
    platform: z.enum(["ios", "android"]),
    token: z.string().trim().max(200).refine(isExpoPushToken, "That isn't an Expo push token."),
    ...Meta,
  }),
  z.object({
    provider: z.literal("webpush"),
    platform: z.literal("web").default("web"),
    subscription: z.object({
      endpoint: z.string().refine(isAllowedWebPushEndpoint, "That browser push address isn't supported."),
      keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
    }),
    ...Meta,
  }),
]);

const RemoveSchema = z.object({ token: z.string().trim().min(1).max(1000) });

type Owner = { userId: string; riderId?: undefined } | { riderId: string; userId?: undefined };

async function limited(owner: Owner) {
  const id = owner.userId ?? `rider:${owner.riderId}`;
  const result = await checkRateLimitShared(rateLimitKey("push-device", id), { maxRequests: 20, windowMs: 10 * 60_000 });
  return !result.allowed;
}

async function register(req: NextRequest, owner: Owner) {
  if (await limited(owner)) return apiError("RATE_LIMITED", "That's a lot of tries. Wait a few minutes and try again.", 429);
  const parsed = RegisterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the device details.");
  const input = parsed.data;
  const token = input.provider === "expo" ? input.token : input.subscription.endpoint;
  const keys = input.provider === "webpush" ? input.subscription.keys : null;
  const now = new Date();
  // A token belongs to whoever signed in on that phone or browser last.
  const data = {
    userId: owner.userId ?? null,
    riderId: owner.riderId ?? null,
    platform: input.platform,
    provider: input.provider,
    p256dh: keys?.p256dh ?? null,
    auth: keys?.auth ?? null,
    appVersion: input.appVersion ?? null,
    deviceName: input.deviceName ?? null,
    lastSeenAt: now,
    disabledAt: null,
    failureCount: 0,
    lastError: null,
  };
  const device = await db.pushDevice.upsert({
    where: { token },
    create: { token, ...data },
    update: data,
    select: { id: true, platform: true, provider: true, lastSeenAt: true },
  });
  return ok(device, 201);
}

async function remove(req: NextRequest, owner: Owner) {
  const parsed = RemoveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say which device to turn off.");
  const where = owner.userId ? { token: parsed.data.token, userId: owner.userId } : { token: parsed.data.token, riderId: owner.riderId };
  const updated = await db.pushDevice.updateMany({ where: { ...where, disabledAt: null }, data: { disabledAt: new Date(), lastError: "Turned off" } });
  return ok({ success: true, updated: updated.count });
}

async function riderOwner(req: NextRequest): Promise<Owner | Response> {
  const lookup = await riderFromToken(req.headers.get("x-rider-token")?.trim() ?? "");
  if (!lookup.ok) return apiError(lookup.reason === "limited" ? "RATE_LIMITED" : "UNAUTHORIZED", lookup.reason === "limited" ? "Too many tries. Wait a minute." : "This rider link has stopped working. Ask your dispatcher for a new one.", lookup.reason === "limited" ? 429 : 401);
  return { riderId: lookup.rider.id };
}

const userGet = withAuth(async (_req, { user }) => {
  const devices = await db.pushDevice.findMany({
    where: { userId: user.id, disabledAt: null },
    select: { id: true, platform: true, provider: true, deviceName: true, lastSeenAt: true },
    orderBy: { lastSeenAt: "desc" },
    take: 20,
  });
  return ok({ webPushPublicKey: webPushPublicKey(), devices });
});
const userPost = withAuth(async (req, { user }) => register(req, { userId: user.id }));
const userDelete = withAuth(async (req, { user }) => remove(req, { userId: user.id }));

type RouteContext = { params: Promise<Record<string, string>> };
const isRider = (req: NextRequest) => Boolean(req.headers.get("x-rider-token"));

export async function GET(req: NextRequest, ctx: RouteContext) {
  return userGet(req, ctx);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  if (!isRider(req)) return userPost(req, ctx);
  const owner = await riderOwner(req);
  return owner instanceof Response ? owner : register(req, owner);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  if (!isRider(req)) return userDelete(req, ctx);
  const owner = await riderOwner(req);
  return owner instanceof Response ? owner : remove(req, owner);
}
