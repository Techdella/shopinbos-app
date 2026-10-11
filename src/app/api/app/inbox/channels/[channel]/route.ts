import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { connectChannel, disconnectChannel } from "@/lib/inbox/connect";
import { CONNECTABLE_CHANNELS, type ConnectableChannel } from "@/lib/inbox/pure";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function channelParam(value: unknown): ConnectableChannel | null {
  return CONNECTABLE_CHANNELS.includes(value as ConnectableChannel) ? (value as ConnectableChannel) : null;
}

// Connect: the credentials are checked with the provider, encrypted, and never returned.
export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const channel = channelParam(params.channel);
  if (!channel) return apiError("NOT_FOUND", "Unknown channel", 404);
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const result = await connectChannel(store, channel, await req.json().catch(() => ({})));
  if (!result.ok) return apiError("CONNECT_FAILED", result.error, 422);
  return ok(result.view);
});

export const DELETE = withSeller(async (_req, { user, params }) => {
  const channel = channelParam(params.channel);
  if (!channel) return apiError("NOT_FOUND", "Unknown channel", 404);
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  await disconnectChannel(store.id, channel);
  return ok({ disconnected: true });
});
