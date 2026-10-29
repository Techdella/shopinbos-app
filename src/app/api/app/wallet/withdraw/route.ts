import { withAuth } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/app/wallet/withdraw: withdrawals have stopped. The balance is spend-only (prepaid for Shopinbos services),
// so Shopinbos holds no one's money to pay out. Older phone apps that still call this get a plain answer.
export const POST = withAuth(async () => apiError("BAD_REQUEST", "Your Shopinbos balance is for AI credits and other Shopinbos services, so it can't be withdrawn. Sales go straight to your bank."), ["seller", "supplier", "logistics_partner"]);
