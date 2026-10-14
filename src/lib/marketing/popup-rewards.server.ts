import "server-only";

import { randomBytes } from "node:crypto";
import type { DiscountType } from "@prisma/client";
import { db } from "@/lib/db/client";
import { describeDiscount, redemptionError } from "@/lib/discounts";
import { readPopupConfig, readReward, type FormReward, type RewardKind } from "./forms";
import { saveDiscount } from "./discounts";
import { MarketingError } from "./segments";
import { decideIssue, formRewardCode, readFormMarker, rewardExpiry, sharedCodeFor, uniqueCodeMarker, uniqueDiscountInput } from "./popup-rewards";

// Sign-up rewards on the server: checking and saving the reward when the seller saves a form (a shared code
// is a real Discount made with the same saveDiscount() /home/discounts uses), handing out a code when a
// shopper signs up, and counting how many of a form's codes were used.

const SAFE_SUBTOTAL = Number.MAX_SAFE_INTEGER; // checking a code before there is a bag: ignore the minimum order

/** Checks the reward from the editor and makes or updates its shared code. Returns what to store on the form. */
export async function prepareFormReward(storeId: string, form: { id: string; name: string }, raw: unknown, previous: FormReward | null): Promise<FormReward | null> {
  const reward = readReward(raw);
  if (!reward) return null;

  if (reward.source === "existing") {
    const discount = await db.discount.findFirst({ where: { id: reward.discountId!, storeId }, select: { id: true, code: true, type: true, value: true, minOrder: true, status: true } });
    if (!discount) throw new MarketingError("That discount code doesn't exist any more. Pick another one.");
    if (discount.status !== "active") throw new MarketingError(`${discount.code} is switched off. Turn it on in Discounts first, or pick another code.`);
    return { ...reward, type: discount.type as RewardKind, value: discount.value, minOrder: discount.minOrder ?? 0, code: discount.code, days: 0 };
  }

  if (reward.type === "percentage" && (reward.value < 1 || reward.value > 100)) throw new MarketingError("A percentage must be between 1 and 100");
  if (reward.type === "fixed_amount" && reward.value <= 0) throw new MarketingError("Add the amount off");

  if (reward.unique) return { ...reward, discountId: null, code: "" };

  // One shared code. Keep the same Discount when the seller edits the form; its end date only moves when they
  // change the number of days.
  const keep = previous && previous.source === "new" && !previous.unique && previous.discountId && previous.discountId === reward.discountId ? previous.discountId : null;
  const current = keep ? await db.discount.findFirst({ where: { id: keep, storeId }, select: { id: true, expiresAt: true } }) : null;
  const expiresAt = current && previous?.days === reward.days ? current.expiresAt : rewardExpiry(reward.days);
  const typed = Boolean(reward.code);
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = attempt === 0 ? sharedCodeFor(reward) : `${sharedCodeFor(reward)}-${randomBytes(2).toString("hex").toUpperCase()}`;
    try {
      const saved = await saveDiscount(
        storeId,
        current?.id ?? null,
        {
          name: `Sign-up reward: ${form.name}`,
          code,
          type: reward.type as DiscountType,
          value: reward.value,
          minOrder: reward.minOrder || 0,
          maxUses: 0,
          startsAt: null,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          status: "active",
          config: { automatic: false, oncePerCustomer: true },
        },
        { form: { formId: form.id, shared: true } },
      );
      return { ...reward, discountId: saved.id, code: saved.code };
    } catch (error) {
      // A code the seller typed that is taken: tell them. One we made up: try another.
      if (error instanceof MarketingError && /already have a code/.test(error.message) && !typed) continue;
      throw error;
    }
  }
  throw new MarketingError("Couldn't make the code. Type your own code, like WELCOME10.");
}

export interface IssuedReward {
  code: string;
  label: string;
  expiresAt: string | null;
  minOrder: number;
  /** The same person signed up again: this is the code they already had. */
  again: boolean;
}

export type IssueResult = { issued: IssuedReward } | { spent: true } | null;

/** Hands out the form's reward to someone who just signed up (at most one unique code per email per form). */
export async function issueFormReward(storeId: string, form: { id: string; name: string; popupConfig: unknown }, email: string): Promise<IssueResult> {
  const reward = readPopupConfig(form.popupConfig).reward;
  if (!reward) return null;
  const key = email.trim().toLowerCase();

  const earlier =
    reward.source === "new" && reward.unique
      ? await db.discount.findFirst({
          where: { storeId, AND: [{ config: { path: ["form", "formId"], equals: form.id } }, { config: { path: ["form", "email"], equals: key } }] },
          orderBy: { createdAt: "asc" },
          select: { code: true, status: true, expiresAt: true, maxUses: true, usedCount: true, minOrder: true, type: true, value: true },
        })
      : null;
  const decision = decideIssue(reward, earlier);

  switch (decision.action) {
    case "none":
      return null;
    case "spent":
      return { spent: true };
    case "reuse":
      return { issued: { code: decision.code, label: describeDiscount(earlier!), expiresAt: earlier!.expiresAt?.toISOString() ?? null, minOrder: earlier!.minOrder ?? 0, again: true } };
    case "shared": {
      const discount = await db.discount.findFirst({ where: { id: decision.discountId, storeId } });
      if (!discount || redemptionError(discount, SAFE_SUBTOTAL)) return null; // switched off, ended or used up
      return { issued: { code: discount.code, label: describeDiscount(discount), expiresAt: discount.expiresAt?.toISOString() ?? null, minOrder: discount.minOrder ?? 0, again: false } };
    }
    case "create": {
      for (let attempt = 0; attempt < 6; attempt++) {
        const code = formRewardCode(reward.prefix, randomBytes(8));
        try {
          const created = await saveDiscount(storeId, null, { ...uniqueDiscountInput(reward, form.name, code), type: reward.type as DiscountType }, uniqueCodeMarker(form.id, key));
          return { issued: { code: created.code, label: describeDiscount(created), expiresAt: created.expiresAt?.toISOString() ?? null, minOrder: created.minOrder ?? 0, again: false } };
        } catch (error) {
          const taken = (error instanceof MarketingError && /already have a code/.test(error.message)) || (error as { code?: string })?.code === "P2002";
          if (!taken) throw error;
        }
      }
      console.error("[forms] couldn't make a unique sign-up code", form.id);
      return null;
    }
  }
}

/** How many times each form's codes were used (its unique codes plus the shared code it made). */
export async function formCodesUsed(storeId: string, formIds: string[]): Promise<Map<string, number>> {
  const used = new Map<string, number>();
  if (!formIds.length) return used;
  const rows = await db.discount.findMany({
    where: { storeId, usedCount: { gt: 0 }, OR: formIds.map((id) => ({ config: { path: ["form", "formId"], equals: id } })) },
    select: { usedCount: true, config: true },
  });
  for (const row of rows) {
    const marker = readFormMarker(row.config);
    if (marker) used.set(marker.formId, (used.get(marker.formId) ?? 0) + row.usedCount);
  }
  return used;
}

/** Public reward line for the storefront (no code: that is only given out on sign-up). */
export async function publicRewardSummary(storeId: string, reward: FormReward | null): Promise<{ label: string; type: RewardKind; value: number; minOrder: number } | null> {
  if (!reward) return null;
  if (reward.source === "existing" || !reward.unique) {
    const discount = reward.discountId ? await db.discount.findFirst({ where: { id: reward.discountId, storeId }, select: { type: true, value: true, minOrder: true, status: true, startsAt: true, expiresAt: true, maxUses: true, usedCount: true, config: true } }) : null;
    if (!discount || redemptionError(discount, SAFE_SUBTOTAL)) return null;
    return { label: describeDiscount(discount), type: discount.type as RewardKind, value: discount.value, minOrder: discount.minOrder ?? 0 };
  }
  return { label: describeDiscount(reward), type: reward.type, value: reward.value, minOrder: reward.minOrder };
}
