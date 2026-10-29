"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { endStorePreorders, endSupplierPreorders, storeStockReady, supplierStockReady } from "@/lib/supplier-orders/preorders.server";
import { cancelStoreOrderForUnpaidBalance, markStoreBalancePaidOffline } from "@/lib/commerce/store-balance.server";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";
import { parsePreorderInput, preorderSaveData } from "@shared/preorder";

// The web's preorder buttons (/supplier/preorders and /home/preorders): "Stock is ready" and "End preorders".
// Same services as the phone's APIs (src/lib/supplier-orders/preorders.server.ts).

const id = (formData: FormData) => String(formData.get("productId") ?? "").slice(0, 40);
const ticked = (formData: FormData, name: string) => formData.get(name) === "on" || formData.get(name) === "true";
const back = (path: string, params: Record<string, string | number>) => `${path}?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString()}`;

async function supplierOf() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!supplier) redirect("/supplier/profile");
  return supplier;
}

export async function supplierStockReadyAction(formData: FormData) {
  const supplier = await supplierOf();
  const result = await supplierStockReady(supplier.id, id(formData), { end: ticked(formData, "end") });
  revalidatePath("/supplier/preorders");
  if (!result.ok) redirect(back("/supplier/preorders", { error: result.message }));
  redirect(back("/supplier/preorders", { ready: result.data.marked, ...(result.data.ended ? { ended: 1 } : {}) }));
}

export async function supplierEndPreordersAction(formData: FormData) {
  const supplier = await supplierOf();
  const result = await endSupplierPreorders(supplier.id, id(formData));
  revalidatePath("/supplier/preorders");
  if (!result.ok) redirect(back("/supplier/preorders", { error: result.message }));
  redirect(back("/supplier/preorders", { ended: 1 }));
}

async function storeOf() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!store) redirect("/builder?firstRun=1");
  return store;
}

export async function storeStockReadyAction(formData: FormData) {
  const store = await storeOf();
  const result = await storeStockReady(store, id(formData), { end: ticked(formData, "end") });
  revalidatePath("/home/preorders");
  if (!result.ok) redirect(back("/home/preorders", { view: "shop", error: result.message }));
  redirect(back("/home/preorders", { view: "shop", moved: result.data.moved, asked: result.data.asked, unpaid: result.data.unpaid, ...(result.data.ended ? { ended: 1 } : {}) }));
}

/**
 * "Take pre-orders" from the Preorders page: switch them on for one of the store's own products (not dropship: those
 * follow the supplier), with an optional ship date. It's the seller's promise to their customers: the product page
 * shows "Preorder now" and the date. The rest (cap, deposit, note) is in the product's own settings.
 */
export async function storeStartPreorderAction(formData: FormData) {
  const store = await storeOf();
  const productId = id(formData);
  const product = await db.storeProduct.findFirst({ where: { id: productId, storeId: store.id }, select: { id: true, preorderEnabled: true, preorderShipsAt: true, fulfillmentType: true, inventoryType: true } });
  if (!product) redirect(back("/home/preorders", { view: "shop", error: "Pick one of your products." }));
  if (product.fulfillmentType === "dropship" || product.inventoryType === "dropshipping") redirect(back("/home/preorders", { view: "shop", error: "Dropship products take pre-orders when the supplier does." }));
  const parsed = parsePreorderInput({ enabled: true, shipsAt: String(formData.get("shipsAt") ?? "") || null }, new Date(), product.preorderShipsAt);
  if (!parsed.ok) redirect(back("/home/preorders", { view: "shop", error: parsed.message }));
  await db.storeProduct.update({ where: { id: product.id }, data: preorderSaveData(parsed.value, { wasEnabled: product.preorderEnabled }) });
  await markCatalogDirty(store.id).catch(() => undefined);
  revalidatePath("/home/preorders");
  redirect(back("/home/preorders", { view: "shop", notice: "Pre-orders are on. Shoppers see Preorder now and your ship date." }));
}

export async function storeEndPreordersAction(formData: FormData) {
  const store = await storeOf();
  const result = await endStorePreorders(store.id, id(formData));
  revalidatePath("/home/preorders");
  if (!result.ok) redirect(back("/home/preorders", { view: "shop", error: result.message }));
  redirect(back("/home/preorders", { view: "shop", ended: 1 }));
}

const orderId = (formData: FormData) => String(formData.get("orderId") ?? "").slice(0, 40);

/** A shopper paid the rest of their preorder another way (src/lib/commerce/store-balance.server.ts). */
export async function storeBalancePaidAction(formData: FormData) {
  const store = await storeOf();
  const result = await markStoreBalancePaidOffline(store, orderId(formData));
  revalidatePath("/home/preorders");
  revalidatePath("/home/orders");
  redirect(back("/home/preorders", { view: "shop", ...(result.ok ? { notice: result.message } : { error: result.message }) }));
}

/** The rest wasn't paid in time: cancel the order; the deposit is recorded as owed back to the shopper. */
export async function storeCancelUnpaidBalanceAction(formData: FormData) {
  const store = await storeOf();
  const result = await cancelStoreOrderForUnpaidBalance(store, orderId(formData));
  revalidatePath("/home/preorders");
  revalidatePath("/home/orders");
  redirect(back("/home/preorders", { view: "shop", ...(result.ok ? { notice: result.message } : { error: result.message }) }));
}
