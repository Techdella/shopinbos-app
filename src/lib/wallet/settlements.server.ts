import "server-only";

import { db } from "@/lib/db/client";
import { fetchPaystackSubaccount, listPaystackSettlements, shopinbosSubaccountName, updatePaystackSubaccount } from "@/lib/paystack";
import { paystackSecretReady } from "@shared/checkout-payments";

// "Shopinbos paid ₦12,400 into your bank": Paystack pays each business's share (store sales, transfers to their wallet account
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
    const subaccount = await fetchPaystackSubaccount(wallet.subaccountCode!);
    if (!subaccount) continue;
    // Subaccounts made before their names led with "Shopinbos" get it now, once.
    if (subaccount.businessName && shopinbosSubaccountName(subaccount.businessName) !== subaccount.businessName) {
      await updatePaystackSubaccount(wallet.subaccountCode!, { businessName: subaccount.businessName }).catch((error) => console.error("[settlements] rename failed", error));
    }
    const settlements = await listPaystackSettlements(wallet.subaccountCode!, 10, subaccount.id);
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
        title: `Shopinbos paid ${formatNaira(paidKobo)} into your bank`,
        description: `Paystack paid ${formatNaira(paidKobo)} into ${bank} for Shopinbos${settlement.totalFees ? `, after ${formatNaira(settlement.totalFees)} in Paystack fees` : ""}. It's on your wallet statement.`,
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

const SETTLED = ["success", "processed", "paid", "failed", "reversed"];

/**
 * The business's next payout, for its one simple number ("To be paid ₦X · reaches your bank Fri 7 Nov"): what Paystack
 * hasn't paid into their bank yet and the earliest date it will. Null when nothing is waiting or Paystack can't say.
 */
export async function nextPayout(userId: string): Promise<{ amountKobo: number; date: string | null } | null> {
  if (!paystackSecretReady(process.env.PAYSTACK_SECRET_KEY)) return null;
  const wallet = await db.wallet.findFirst({ where: { userId, subaccountCode: { not: null } }, select: { subaccountCode: true } });
  if (!wallet?.subaccountCode) return null;
  const waiting = (await listPaystackSettlements(wallet.subaccountCode, 10)).filter((row) => row.totalAmount > 0 && !SETTLED.includes(row.status.toLowerCase()));
  if (!waiting.length) return null;
  const dates = waiting.map((row) => row.settlementDate).filter((date): date is string => !!date).sort();
  return { amountKobo: waiting.reduce((sum, row) => sum + row.totalAmount, 0), date: dates[0] ?? null };
}
