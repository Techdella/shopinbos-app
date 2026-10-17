import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { NetworkAccountConnectSchema } from "@/lib/schemas";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { connectNetworkAccount, disconnectNetworkAccount, networkApiError } from "@/lib/logistics/networks.server";

// A seller's own delivery network account: deliveries on it are booked and paid with the network directly, with
// no Shopinbos fee. POST checks the details with the network before saving them (encrypted); DELETE ?network=.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = NetworkAccountConnectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the account details.");
  if (!(await checkRateLimitShared(rateLimitKey("network-connect", user.id), { maxRequests: 10, windowMs: 10 * 60_000 })).allowed) {
    return apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429);
  }
  try {
    return ok(await connectNetworkAccount(user.id, parsed.data.network, parsed.data.credentials), 201);
  } catch (error) {
    return networkApiError(error);
  }
});

export const DELETE = withSeller(async (req: NextRequest, { user }) => {
  const network = req.nextUrl.searchParams.get("network")?.trim();
  if (!network) return apiError("BAD_REQUEST", "Say which network to disconnect.");
  try {
    await disconnectNetworkAccount(user.id, network);
    return ok({ disconnected: true });
  } catch (error) {
    return networkApiError(error);
  }
});
