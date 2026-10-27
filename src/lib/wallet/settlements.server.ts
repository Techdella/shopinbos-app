import "server-only";

import { db } from "@/lib/db/client";
import { listPaystackSettlements } from "@/lib/paystack";
import { paystackSecretReady } from "@shared/checkout-payments";

// "₦12,400 is in your bank": Paystack pays each business's share (store sales, transfers to their wallet account
// number, supplier and delivery shares) into their own bank in settlements, and sends no webhook for it. Every hour
// (with the lifecycle job) this reads each business's recent settlements, records each paid one on their statement
// once (WalletEntry "settlement", status "settled", so it never counts twice in "paid to you") and tells them. One
// first seen long after it was paid is recorded quietly.

const NOTIFY_WITHIN_MS = 3 * 24 * 60 * 60 * 1000;
const PAID = new Set(["success", "successful", "processed", "settled", "paid"]);

const formatNaira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

function walletPath(role: string) {
  return role === "supplier" ? "/supplier/wallet" : role === "logistics_partner" ? "/logistics/wallet" : "/home/wallet";
}

export async function recordSettlements(limit = 200) {
  if (!paystackSecretReady(process.env.PAYSTACK_SECRET_KEY)) return { checked: 0, recorded: 0 };
  const wallets = await db.wallet.findMany({
    where: { subaccountCode: { not: null }, subaccountStatus: "active" },
    select: { id: true, userId: true, role: true, subaccountCode: true, bankName: true, accountNumber: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  let recorded = 0;
  for (const wallet of wallets) {
    const settlements = await listPaystackSettlements(wallet.subaccountCode!, 10);
    for (const settlement of settlements) {
      if (!settlement.id || !PAID.has(settlement.status.toLowerCase())) continue;
      const paidKobo = settlement.effectiveAmount ?? settlement.totalAmount;
      if (!paidKobo || paidKobo <= 0) continue;
      const bank = wallet.accountNumber ? `${wallet.bankName ?? "your bank"} ••${wallet.accountNumber.slice(-4)}` : "your bank";
      const created = await db.walletEntry.createMany({
        data: [{
          walletId: wallet.id,
          reference: `settlement:${settlement.id}`,
          kind: "settlement",
          amountKobo: paidKobo,
          status: "settled",
          description: `Paid into ${bank}${settlement.totalFees ? ` (after ${formatNaira(settlement.totalFees)} Paystack fees)` : ""}`,
          paystackReference: settlement.id,
        }],
        skipDuplicates: true,
      });
      if (!created.count) continue;
      recorded += 1;
      const paidAt = Date.parse(String(settlement.settlementDate ?? ""));
      if (Number.isFinite(paidAt) && Date.now() - paidAt > NOTIFY_WITHIN_MS) continue;
      const { notify } = await import("@/lib/notifications/notify.server");
      await notify({
        userId: wallet.userId,
        event: "payout.sent",
        priority: "success",
        title: `${formatNaira(paidKobo)} is in your bank`,
        description: `Paystack paid ${formatNaira(paidKobo)} into ${bank}${settlement.totalFees ? `, after ${formatNaira(settlement.totalFees)} in Paystack fees` : ""}. It's on your wallet statement.`,
        link: walletPath(wallet.role),
        actionLabel: "Open wallet",
        metadata: { settlementId: settlement.id, amountKobo: paidKobo, feesKobo: settlement.totalFees },
        dedupeKey: `settlement:${settlement.id}`,
        email: "transactional",
      }).catch((error) => console.error("[settlements] notify failed", error));
    }
  }
  return { checked: wallets.length, recorded };
}
