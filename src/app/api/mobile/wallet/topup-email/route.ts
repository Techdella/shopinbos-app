import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { appBase, sendPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { ensureTopUpAccount } from "@/lib/wallet/balance.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Top up" on the phone's Wallet card. The wallet pays for AI credits and other Shopinbos services (digital goods),
// so the app can't take that money (Apple 3.1.1, Google Play payments): like AI credits (/api/mobile/credits/
// topup-email), we email the person how to top up on the website instead, with their own wallet account number when
// they have one. No amounts or payment here. At most 3 a day per person → { sent: true }.

/** The web page with the wallet's top-up, for each role. */
function walletUrlFor(role: string | null | undefined) {
  return role === "supplier" ? "/supplier/wallet" : role === "logistics_partner" ? "/logistics/wallet" : "/home/wallet";
}

export const POST = withAuth(async (_req: NextRequest, { user }) => {
  if (!user.email) return apiError("NO_EMAIL", "Add an email address to your account first, so we can send you the steps.", 422);

  const limit = await checkRateLimitShared(rateLimitKey("wallet-topup-email", user.id), { maxRequests: 3, windowMs: 24 * 60 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "We've already emailed you the steps today. Check your inbox (and spam).", 429);

  const wallet = await ensureTopUpAccount(user.id).catch(() => null);
  const account = wallet?.topUpStatus === "ready" && wallet.topUpAccountNumber ? wallet : null;
  const result = await sendPlatformEmail({
    to: user.email,
    user: { id: user.id, role: user.role },
    kind: "transactional",
    subject: "How to top up your Shopinbos Wallet",
    eyebrow: "Wallet",
    heading: "Top up on the Shopinbos website",
    preheader: "Add money to your wallet on the website.",
    bodyHtml: [
      html.p("You asked how to top up your Shopinbos Wallet in the app."),
      html.p("Top-ups are done on the Shopinbos website. Sign in with the same account and open Wallet: pay by card or bank, or transfer to your own top-up account number. Your new balance shows in the app as soon as it's confirmed."),
      ...(account ? [html.p("Or transfer from any bank app to your own wallet account number:"), html.code(account.topUpAccountNumber!, `${account.topUpBankName ?? "Bank"} · ${account.topUpAccountName ?? ""}`)] : []),
    ].join(""),
    cta: { label: "Open Wallet", url: `${appBase()}${walletUrlFor(user.role)}` },
    reason: "You tapped Top up in the Shopinbos app.",
  }).catch(() => ({ success: false }));
  if (!result.success) return apiError("UNAVAILABLE", "We couldn't send the email just now. Try again in a moment.", 503);
  return ok({ sent: true as const });
}, ["seller", "supplier", "logistics_partner"]);
