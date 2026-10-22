import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { ensureTopUpAccount, walletBalanceView } from "@/lib/wallet/balance.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/app/wallet: the prepaid balance, their top-up account number (made on first visit when switched on),
// whether they can withdraw, and recent movements. Sellers, suppliers and delivery partners (web and mobile).
export const GET = withAuth(async (_req, { user }) => {
  await ensureTopUpAccount(user.id).catch((error) => console.error("[wallet] top-up account", error));
  return ok(await walletBalanceView(user.id));
}, ["seller", "supplier", "logistics_partner"]);
