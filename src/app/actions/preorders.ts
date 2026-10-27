"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { endStorePreorders, endSupplierPreorders, storeStockReady, supplierStockReady } from "@/lib/supplier-orders/preorders.server";

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
  redirect(back("/home/preorders", { view: "shop", moved: result.data.moved, unpaid: result.data.unpaid, ...(result.data.ended ? { ended: 1 } : {}) }));
}

export async function storeEndPreordersAction(formData: FormData) {
  const store = await storeOf();
  const result = await endStorePreorders(store.id, id(formData));
  revalidatePath("/home/preorders");
  if (!result.ok) redirect(back("/home/preorders", { view: "shop", error: result.message }));
  redirect(back("/home/preorders", { view: "shop", ended: 1 }));
}
