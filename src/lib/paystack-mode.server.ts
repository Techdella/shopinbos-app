import "server-only";

import { db } from "@/lib/db/client";
import { createPaystackPlan, paystackRecordExists } from "@/lib/paystack";
import { clearPlanCatalogCache } from "@/lib/plans/catalog.server";
import { paystackPlanName, type PlanBilling, type PlanTier } from "@shared/plan-catalog";
import { reopenWalletSubaccount } from "@/lib/wallet/wallet.server";

// Paystack's test and live modes are separate accounts: plans, subaccounts and customers made with test keys don't
// exist on live. When PAYSTACK_SECRET_KEY changes mode (sk_test_ → sk_live_), everything Shopinbos made on the other
// mode is made again here, once: the current subscription plans (same prices, new codes), each live wallet's
// subaccount (same bank), and wallet top-up and delivery partner pay-in accounts (asked for again on next visit).
// Records that still exist are left alone, so it's safe to run again. Called before anything uses those codes
// (store checkout, plan pages, the wallet) through ensurePaystackModeSynced.

const MODE_KEY = "paystack.mode";
const g = globalThis as typeof globalThis & { __shopinbosPaystackMode?: string };

export function paystackKeyMode(): "live" | "test" | null {
  const key = process.env.PAYSTACK_SECRET_KEY ?? "";
  return key.startsWith("sk_live_") ? "live" : key.startsWith("sk_test_") ? "test" : null;
}

export interface PaystackModeSync {
  mode: "live" | "test";
  plans: number;
  subaccounts: number;
  topUpAccounts: number;
  payInAccounts: number;
  /** Records Paystack didn't answer for (outage): the sync isn't marked done. */
  unchecked: number;
  problems: string[];
}

/** Once per key mode: re-creates what was made on the other mode. Never throws; cheap after the first time. */
export async function ensurePaystackModeSynced(): Promise<void> {
  const mode = paystackKeyMode();
  if (!mode || g.__shopinbosPaystackMode === mode) return;
  try {
    const saved = await db.platformSetting.findUnique({ where: { key: MODE_KEY }, select: { value: true } });
    if ((saved?.value as { mode?: string } | null)?.mode === mode) {
      g.__shopinbosPaystackMode = mode;
      return;
    }
    // Claim the run so two servers don't both make plans; a run that fails lets go so the next call retries.
    const claim = `${MODE_KEY}.syncing.${mode}`;
    const claimed = await db.platformSetting.create({ data: { key: claim, value: { at: new Date().toISOString() } } }).then(() => true, () => false);
    if (!claimed) {
      // Another server is on it, or one died mid-run: a claim older than 10 minutes is let go for the next call.
      const held = await db.platformSetting.findUnique({ where: { key: claim }, select: { value: true } });
      const at = Date.parse(String((held?.value as { at?: string } | null)?.at ?? ""));
      if (!Number.isFinite(at) || Date.now() - at > 600_000) await db.platformSetting.delete({ where: { key: claim } }).catch(() => null);
      return;
    }
    try {
      const result = await syncPaystackMode(mode);
      // Paystack didn't answer for some records: not done, the next call checks again.
      if (result.unchecked) {
        console.warn(`[paystack mode] ${result.unchecked} records unchecked; trying again on the next call`, result);
        return;
      }
      await db.platformSetting.upsert({
        where: { key: MODE_KEY },
        create: { key: MODE_KEY, value: { ...result, at: new Date().toISOString() } },
        update: { value: { ...result, at: new Date().toISOString() } },
      });
      g.__shopinbosPaystackMode = mode;
      console.info(`[paystack mode] synced to ${mode}`, result);
    } finally {
      await db.platformSetting.delete({ where: { key: claim } }).catch(() => null);
    }
  } catch (error) {
    console.error("[paystack mode] sync failed; it runs again on the next call", error);
  }
}

export async function syncPaystackMode(mode: "live" | "test"): Promise<PaystackModeSync> {
  const result: PaystackModeSync = { mode, plans: 0, subaccounts: 0, topUpAccounts: 0, payInAccounts: 0, unchecked: 0, problems: [] };
  const exists = async (kind: "plan" | "subaccount" | "customer" | "transferrecipient", code: string) => {
    const found = await paystackRecordExists(kind, code);
    if (found === null) result.unchecked += 1;
    return found;
  };

  // Subscription plans: the current price of each tier gets a plan on this mode (old codes stay known for history).
  const plans = await db.subscriptionPlanVersion.findMany({ where: { current: true, amountNgn: { not: null } }, select: { code: true, tier: true, billing: true, amountNgn: true } });
  for (const plan of plans) {
    if ((await exists("plan", plan.code)) !== false) continue;
    try {
      const billing = plan.billing as PlanBilling;
      const code = await createPaystackPlan({
        name: paystackPlanName(plan.tier as PlanTier, billing, plan.amountNgn!),
        amountKobo: plan.amountNgn! * 100,
        interval: billing === "annual" ? "annually" : "monthly",
        description: `Shopinbos (${mode} mode)`,
      });
      await db.$transaction([
        db.subscriptionPlanVersion.update({ where: { code: plan.code }, data: { current: false, retiredAt: new Date() } }),
        db.subscriptionPlanVersion.create({ data: { code, tier: plan.tier, billing: plan.billing, amountNgn: plan.amountNgn, current: true } }),
      ]);
      result.plans += 1;
    } catch (error) {
      result.problems.push(`plan ${plan.tier} ${plan.billing}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  if (result.plans) clearPlanCatalogCache();

  // Split payments: each live wallet's subaccount, same bank.
  const wallets = await db.wallet.findMany({ where: { subaccountCode: { not: null }, subaccountStatus: "active" }, select: { id: true, subaccountCode: true } });
  for (const wallet of wallets) {
    if ((await exists("subaccount", wallet.subaccountCode!)) !== false) continue;
    const reopened = await reopenWalletSubaccount(wallet.id);
    if (reopened.ok) result.subaccounts += 1;
    else result.problems.push(`wallet ${wallet.id}: ${reopened.error}`);
  }

  // Top-up account numbers: a customer from the other mode is forgotten, so the next visit asks for a new account.
  const topUps = await db.wallet.findMany({ where: { topUpCustomerCode: { not: null } }, select: { id: true, topUpCustomerCode: true } });
  for (const wallet of topUps) {
    if ((await exists("customer", wallet.topUpCustomerCode!)) !== false) continue;
    await db.wallet.update({ where: { id: wallet.id }, data: { topUpCustomerCode: null, topUpAccountNumber: null, topUpAccountName: null, topUpBankName: null, topUpStatus: "none", topUpError: null } });
    result.topUpAccounts += 1;
  }
  // Ones that failed on the other mode (or before a fix) get a fresh try.
  result.topUpAccounts += (await db.wallet.updateMany({ where: { topUpStatus: { in: ["failed", "unavailable"] } }, data: { topUpStatus: "none", topUpError: null } })).count;

  const payIns = await db.partnerPayInAccount.findMany({ where: { customerCode: { not: null } }, select: { id: true, customerCode: true } });
  for (const account of payIns) {
    if ((await exists("customer", account.customerCode!)) !== false) continue;
    await db.partnerPayInAccount.update({ where: { id: account.id }, data: { customerCode: null, customerId: null, providerAccountId: null, accountNumber: null, accountName: null, bankName: null, bankSlug: null, status: "pending", lastError: null } });
    result.payInAccounts += 1;
  }
  result.payInAccounts += (await db.partnerPayInAccount.updateMany({ where: { status: { in: ["failed", "unavailable"] } }, data: { status: "pending", lastError: null } })).count;

  return result;
}
