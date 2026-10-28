"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/server-auth";
import { QUICK_ADD_MAX, type QuickAddResult } from "@/lib/marketplace/quick-add-core";
import { MINE_MAX, overQuickLimit, quickAddForSeller, removeSupplierProducts, repriceSupplierProducts, saveSellerMarkup, undoQuickAdd } from "@/lib/marketplace/quick-add.server";
import { markupProblem, type Markup } from "@shared/supplier-markup";

// Find products on the web (/marketplace, /marketplace/packs, /marketplace/mine): one-tap and bulk "Add to my
// shop", Undo, the seller's markup and My supplier products. The same rules as the phone's routes
// (src/lib/marketplace/quick-add.server.ts): seller only, zod, rate limits, and never a duplicate.

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

const MarkupSchema = z.object({ kind: z.enum(["percent", "amount"]), value: z.number().positive().max(5_000_000) });
const AddSchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(QUICK_ADD_MAX), markup: MarkupSchema.optional() });
const IdsSchema = z.array(z.string().min(1).max(64)).min(1).max(MINE_MAX);

async function seller() {
  const user = await getCurrentAppUser();
  return user && user.role === "seller" ? user : null;
}

function refresh() {
  revalidatePath("/marketplace");
  revalidatePath("/marketplace/mine");
  revalidatePath("/marketplace/packs");
  revalidatePath("/products");
}

/** One tap or many (up to 60 a call): added, already in the shop, and the rest with why. */
export async function quickAddProducts(input: { ids: string[]; markup?: Markup }): Promise<Result<{ result: QuickAddResult & { markup: Markup } }>> {
  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Pick between 1 and ${QUICK_ADD_MAX} products.` };
  const user = await seller();
  if (!user) return { ok: false, error: "Sign in to your store first." };
  if (await overQuickLimit(user.id, "add")) return { ok: false, error: "That's a lot of adding. Wait a few minutes and try again.", code: "RATE_LIMITED" };
  const result = await quickAddForSeller(user.id, parsed.data.ids, parsed.data.markup);
  if (!result) return { ok: false, error: "Set up your store first." };
  if (result.added.length) refresh();
  return { ok: true, result };
}

export async function undoQuickAddAction(storeProductIds: string[]): Promise<Result<{ removed: number }>> {
  const parsed = z.array(z.string().min(1).max(64)).min(1).max(200).safeParse(storeProductIds);
  if (!parsed.success) return { ok: false, error: "Nothing to undo." };
  const user = await seller();
  if (!user) return { ok: false, error: "Sign in to your store first." };
  if (await overQuickLimit(user.id, "undo")) return { ok: false, error: "Wait a few minutes and try again.", code: "RATE_LIMITED" };
  const result = await undoQuickAdd(user.id, parsed.data);
  if (!result) return { ok: false, error: "Set up your store first." };
  refresh();
  return { ok: true, removed: result.removed };
}

export async function saveMarkupAction(markup: Markup): Promise<Result<{ markup: Markup }>> {
  const parsed = MarkupSchema.safeParse(markup);
  if (!parsed.success) return { ok: false, error: markupProblem(markup) ?? "Pick a markup." };
  const user = await seller();
  if (!user) return { ok: false, error: "Sign in to your store first." };
  if (await overQuickLimit(user.id, "markup")) return { ok: false, error: "Wait a few minutes and try again.", code: "RATE_LIMITED" };
  const saved = await saveSellerMarkup(user.id, parsed.data);
  if (!saved.ok) return { ok: false, error: saved.code === "NOT_FOUND" ? "Set up your store first." : markupProblem(parsed.data) ?? "Pick a markup." };
  revalidatePath("/marketplace/mine");
  return { ok: true, markup: saved.markup };
}

export async function repriceSupplierProductsAction(ids: string[], change: { markup: Markup } | { suggested: true }): Promise<Result<{ updated: number; skipped: Array<{ id: string; name: string; message: string }> }>> {
  const parsedIds = IdsSchema.safeParse(ids);
  if (!parsedIds.success) return { ok: false, error: "Pick the products first." };
  const markup = "markup" in change ? MarkupSchema.safeParse(change.markup) : null;
  if (markup && !markup.success) return { ok: false, error: markupProblem(("markup" in change && change.markup) || null) ?? "Pick a markup." };
  const user = await seller();
  if (!user) return { ok: false, error: "Sign in to your store first." };
  if (await overQuickLimit(user.id, "mine")) return { ok: false, error: "Wait a few minutes and try again.", code: "RATE_LIMITED" };
  const result = await repriceSupplierProducts(user.id, parsedIds.data, markup?.success ? { mode: "markup", markup: markup.data } : { mode: "suggested" });
  if (!result) return { ok: false, error: "Set up your store first." };
  refresh();
  return { ok: true, updated: result.updated.length, skipped: result.skipped };
}

export async function removeSupplierProductsAction(ids: string[]): Promise<Result<{ removed: number }>> {
  const parsed = IdsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Pick the products first." };
  const user = await seller();
  if (!user) return { ok: false, error: "Sign in to your store first." };
  if (await overQuickLimit(user.id, "mine")) return { ok: false, error: "Wait a few minutes and try again.", code: "RATE_LIMITED" };
  const result = await removeSupplierProducts(user.id, parsed.data);
  if (!result) return { ok: false, error: "Set up your store first." };
  refresh();
  return { ok: true, removed: result.removed };
}
