import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { networkFeeRule } from "@/lib/logistics/carriers/fee";
import { sellerNetworks } from "@/lib/logistics/networks.server";

// The delivery networks this seller can book (Kwik, Fez, …), whether each would be booked on their own connected
// account or on Shopinbos's, what to type to connect one, and the Shopinbos fee rule for bookings on ours.
export const GET = withSeller(async (_req, { user }) => {
  const networks = await sellerNetworks(user.id);
  return ok({ networks, fee: networkFeeRule() });
});
