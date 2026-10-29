import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { ensureTopUpAccount, walletBalanceView, walletSummary } from "@/lib/wallet/balance.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/app/wallet: the prepaid balance (spend-only: canWithdraw is always false), their top-up account number
// (made on first visit when switched on), and recent movements. Sellers, suppliers and delivery partners (web and
// mobile).
// ?summary=1: just the balance and account number (the sidebar and home card), with nothing set up.
export const GET = withAuth(async (req, { user }) => {
  if (req.nextUrl.searchParams.get("summary") === "1") return ok(await walletSummary(user.id));
  await ensureTopUpAccount(user.id).catch((error) => console.error("[wallet] top-up account", error));
  return ok(await walletBalanceView(user.id));
}, ["seller", "supplier", "logistics_partner"]);
