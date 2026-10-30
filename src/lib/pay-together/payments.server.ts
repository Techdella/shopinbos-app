import "server-only";

import { INSTALMENT_REF_PREFIX } from "@shared/instalments";
import { AJO_REF_PREFIX } from "@shared/ajo";
import { GROUP_CHARGE_PREFIX, GROUP_VERIFY_PREFIX } from "@shared/group-buy";
import { tablesMissing } from "./common.server";

// One entry for the Paystack webhook and the shoppers' return pages: records a Pay small small part, an ajo
// contribution, a group-buy card check or a group-buy payment by its reference. Each is idempotent on the reference
// (verified with Paystack first), so a replayed webhook or the return page racing the webhook records nothing twice.

export const TOGETHER_PREFIXES = [INSTALMENT_REF_PREFIX, AJO_REF_PREFIX, GROUP_VERIFY_PREFIX, GROUP_CHARGE_PREFIX] as const;

export function isTogetherReference(reference: unknown): reference is string {
  return typeof reference === "string" && TOGETHER_PREFIXES.some((prefix) => reference.startsWith(prefix));
}

export type TogetherConfirm = { ok: true; fresh: boolean } | { ok: false; error: string; retry?: boolean; pending?: boolean };

export async function confirmTogetherPayment(reference: string): Promise<TogetherConfirm> {
  try {
    if (reference.startsWith(INSTALMENT_REF_PREFIX)) return await (await import("./instalments.server")).confirmInstalmentPayment(reference);
    if (reference.startsWith(AJO_REF_PREFIX)) return await (await import("./ajo.server")).confirmAjoContribution(reference);
    if (reference.startsWith(GROUP_VERIFY_PREFIX)) return await (await import("./group-buy.server")).confirmGroupVerify(reference);
    if (reference.startsWith(GROUP_CHARGE_PREFIX)) return await (await import("./group-buy.server")).confirmGroupCharge(reference);
    return { ok: false, error: "Unknown reference." };
  } catch (error) {
    if (tablesMissing(error)) return { ok: false, error: "Not set up yet (run docs/migrations/2026-12-17-pay-small-ajo-groupbuy.sql)." };
    throw error;
  }
}

/** The hourly job: reminders, autopay, defaults / removals, group-buy deadlines. Each part runs even if another fails. */
export async function runTogetherSweep(now = new Date()) {
  const run = async <T>(name: string, work: () => Promise<T>) => {
    try {
      return await work();
    } catch (error) {
      if (tablesMissing(error)) return { skipped: "not set up" };
      console.error(`[pay-together] ${name} sweep failed`, error);
      return { error: String(error instanceof Error ? error.message : error).slice(0, 200) };
    }
  };
  return {
    paySmall: await run("pay small small", async () => (await import("./instalments.server")).runInstalmentSweep(now)),
    ajo: await run("ajo", async () => (await import("./ajo.server")).runAjoSweep(now)),
    groupBuy: await run("group buy", async () => (await import("./group-buy.server")).runGroupBuySweep(now)),
  };
}
