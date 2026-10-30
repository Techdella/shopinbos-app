import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { renderShopperPage } from "@/components/storefront/shopper/shopper-page.server";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { db } from "@/lib/db/client";
import { normalizeVariants, variantPrice } from "@shared/product-variants";
import { paySmallOffer, publicPlan } from "@/lib/pay-together/instalments.server";
import { groupOffer, publicGroup } from "@/lib/pay-together/group-buy.server";
import { publicAjoGroup } from "@/lib/pay-together/ajo.server";
import { checkLink, featureOnForStore, tablesMissing } from "@/lib/pay-together/common.server";
import { confirmTogetherPayment, isTogetherReference } from "@/lib/pay-together/payments.server";
import { paymentsReady, sellerSubaccount } from "@/lib/paystack/plans.server";
import { BuyWaysClient } from "@/components/storefront/together/BuyWaysClient";
import { PlanClient } from "@/components/storefront/together/PlanClient";
import { AjoClient } from "@/components/storefront/together/AjoClient";
import { GroupClient } from "@/components/storefront/together/GroupClient";

// The storefront pages of the pilots pay_small_small, ajo and group_buy, for both addresses of a store
// (/s/<slug>/… and the store's own domain). Each follows the SHOP OWNER's switch. English, like the rest of the store.

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

async function basePathFor(slug: string) {
  return getStorefrontBasePathForHost((await headers()).get("host"), slug);
}

async function storeIdFor(slug: string) {
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true } });
  return store?.status === "active" ? store.id : null;
}

/** Back from Paystack (?reference= / ?trxref=): record it now (the webhook may not have arrived yet). Never throws. */
async function confirmReturn(search: Search) {
  const reference = one(search.reference) ?? one(search.trxref);
  if (!isTogetherReference(reference)) return null;
  try {
    const result = await confirmTogetherPayment(reference);
    return result.ok ? "paid" : result.pending ? "pending" : "failed";
  } catch (error) {
    console.error("[together page] could not confirm", error);
    return "pending";
  }
}

/** "Other ways to buy" for one product: Pay small small, Buy with friends, ajo groups taking members. */
export async function renderBuyWaysPage(slug: string, productId: string, signInPath: string | null) {
  const storeId = await storeIdFor(slug);
  if (!storeId) notFound();
  const product = await db.storeProduct.findFirst({ where: { id: productId, storeId, status: "published" }, select: { id: true, name: true, images: true, retailPrice: true, variants: true, fulfillmentType: true, supplierProductId: true } });
  if (!product || product.fulfillmentType === "dropship" || product.supplierProductId) notFound();
  const retailKobo = Math.round(product.retailPrice * 100);
  let paySmall = null;
  let group = null;
  let ajo: Array<{ id: string; size: number; weeklyKobo: number; startDay: string; joined: number; variantLabel: string | null }> = [];
  try {
    [paySmall, group] = await Promise.all([paySmallOffer(storeId, product.id, retailKobo), groupOffer(storeId, product.id, retailKobo)]);
    if ((await featureOnForStore(storeId, "ajo")) && paymentsReady() && (await sellerSubaccount(storeId))) {
      const groups = await db.ajoGroup.findMany({ where: { storeId, productId: product.id, status: "forming" }, orderBy: { startDay: "asc" }, take: 5, include: { members: { where: { status: "active" }, select: { id: true } } } });
      ajo = groups.filter((row) => row.members.length < row.size).map((row) => ({ id: row.id, size: row.size, weeklyKobo: row.weeklyKobo, startDay: row.startDay, joined: row.members.length, variantLabel: row.variantLabel }));
    }
  } catch (error) {
    if (!tablesMissing(error)) throw error;
  }
  if (!paySmall && !group && !ajo.length) notFound();
  const option = paySmall ? await db.productPayOption.findUnique({ where: { productId: product.id }, select: { paySmallWeeks: true } }) : null;
  const variants = normalizeVariants(product.variants).filter((variant) => variant.enabled).map((variant) => ({ id: variant.id, name: variant.name, priceKobo: Math.round(variantPrice(variant, product.retailPrice) * 100) }));
  const basePath = await basePathFor(slug);
  return renderShopperPage({
    slug,
    basePath,
    signInPath,
    render: (store) => (
      <BuyWaysClient
        store={store}
        storeBasePath={basePath}
        product={{ id: product.id, name: product.name, image: product.images[0] ?? null, retailKobo, variants }}
        paySmall={paySmall ? { ...paySmall, allowedWeeks: (option?.paySmallWeeks ?? []).filter((weeks) => paySmall!.weeks.some((entry) => entry.weeks === weeks)) } : null}
        group={group}
        ajo={ajo}
      />
    ),
  });
}

export async function renderPlanPage(slug: string, planId: string, search: Search, signInPath: string | null) {
  const storeId = await storeIdFor(slug);
  const token = one(search.t);
  if (!storeId || !checkLink("plan", planId, token)) notFound();
  const returned = await confirmReturn(search);
  const plan = await publicPlan(storeId, planId).catch((error) => (tablesMissing(error) ? null : Promise.reject(error)));
  if (!plan) notFound();
  const basePath = await basePathFor(slug);
  return renderShopperPage({ slug, basePath, signInPath, render: (store) => <PlanClient store={store} storeBasePath={basePath} plan={plan} token={token!} returned={returned} /> });
}

export async function renderAjoPage(slug: string, groupId: string, search: Search, signInPath: string | null) {
  const storeId = await storeIdFor(slug);
  if (!storeId) notFound();
  const returned = await confirmReturn(search);
  const group = await publicAjoGroup(storeId, groupId, { memberId: one(search.m), token: one(search.t) }).catch((error) => (tablesMissing(error) ? null : Promise.reject(error)));
  if (!group) notFound();
  const on = await featureOnForStore(storeId, "ajo");
  if (!on && !group.me) notFound();
  const basePath = await basePathFor(slug);
  return renderShopperPage({ slug, basePath, signInPath, render: (store) => <AjoClient store={store} storeBasePath={basePath} group={group} returned={returned} /> });
}

export async function renderGroupPage(slug: string, groupId: string, search: Search, signInPath: string | null) {
  const storeId = await storeIdFor(slug);
  if (!storeId) notFound();
  const returned = await confirmReturn(search);
  const group = await publicGroup(storeId, groupId, { memberId: one(search.m), token: one(search.t) }).catch((error) => (tablesMissing(error) ? null : Promise.reject(error)));
  if (!group) notFound();
  if (!(await featureOnForStore(storeId, "group_buy")) && !group.me) notFound();
  const basePath = await basePathFor(slug);
  return renderShopperPage({ slug, basePath, signInPath, render: (store) => <GroupClient store={store} storeBasePath={basePath} group={group} returned={returned} /> });
}
