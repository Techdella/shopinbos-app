import { z } from "zod";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { featureOnForRequest, tablesMissing } from "@/lib/pay-together/common.server";
import { payOptionView } from "@/lib/pay-together/instalments.server";
import { sellerSubaccount } from "@/lib/paystack/plans.server";
import { cleanRefundRule, cleanWeeksList, PAY_SMALL_WEEKS } from "@shared/instalments";
import { groupSettingsProblem, GROUP_DEFAULT_HOURS } from "@shared/group-buy";
import { normalizeVariants, variantPrice } from "@shared/product-variants";

export const dynamic = "force-dynamic";

// A product's other ways to buy, set by the seller (pilots pay_small_small and group_buy; ajo groups are made from
// the same card with POST /api/app/together { action: "ajo.create" }).
//   GET → { data: { features, walletReady, sellable, price, variants, option } }
//   PUT { paySmallOn, paySmallWeeks, priceLock, refundRule, groupBuyOn, groupPrice, groupSize, groupHours } → the same
// Only the parts whose pilot is on for this account on this app are saved. 404 when none is on or the product isn't
// the shop's. Turning one on needs the seller's Shopinbos Wallet (an active Paystack subaccount): every payment is
// split straight to the seller's bank.

async function ownProduct(userId: string, productId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  if (!store) return null;
  const product = await db.storeProduct.findFirst({ where: { id: productId, storeId: store.id }, select: { id: true, name: true, retailPrice: true, variants: true, status: true, fulfillmentType: true, supplierProductId: true } });
  return product ? { storeId: store.id, product } : null;
}

async function featuresFor(req: NextRequest, userId: string) {
  const [paySmall, groupBuy, ajo] = await Promise.all([featureOnForRequest(req, userId, "pay_small_small"), featureOnForRequest(req, userId, "group_buy"), featureOnForRequest(req, userId, "ajo")]);
  return { paySmall, groupBuy, ajo };
}

async function view(storeId: string, product: NonNullable<Awaited<ReturnType<typeof ownProduct>>>["product"], features: Awaited<ReturnType<typeof featuresFor>>) {
  const [row, wallet] = await Promise.all([db.productPayOption.findUnique({ where: { productId: product.id } }), sellerSubaccount(storeId)]);
  const dropship = product.fulfillmentType === "dropship" || Boolean(product.supplierProductId);
  return {
    features,
    walletReady: Boolean(wallet),
    sellable: !dropship && product.status === "published",
    dropship,
    published: product.status === "published",
    price: product.retailPrice,
    variants: normalizeVariants(product.variants).filter((variant) => variant.enabled).map((variant) => ({ id: variant.id, name: variant.name, price: variantPrice(variant, product.retailPrice) })),
    option: payOptionView(row),
  };
}

export const GET = withSeller(async (req, { user, params }) => {
  const features = await featuresFor(req, user.id);
  if (!features.paySmall && !features.groupBuy && !features.ajo) return apiError("NOT_FOUND", "These features aren't on for your shop.", 404);
  const own = await ownProduct(user.id, String(params.id ?? ""));
  if (!own) return apiError("NOT_FOUND", "Product not found", 404);
  try {
    return ok(await view(own.storeId, own.product, features));
  } catch (error) {
    if (tablesMissing(error)) return apiError("NOT_READY", "Not ready yet. Try again later.", 503);
    throw error;
  }
});

const SaveSchema = z.object({
  paySmallOn: z.boolean().optional(),
  paySmallWeeks: z.array(z.number().int()).max(3).optional(),
  priceLock: z.boolean().optional(),
  refundRule: z.string().max(2000).optional(),
  groupBuyOn: z.boolean().optional(),
  groupPrice: z.number().nonnegative().max(100_000_000).nullable().optional(),
  groupSize: z.number().int().nullable().optional(),
  groupHours: z.number().int().nullable().optional(),
});

export const PUT = withSeller(async (req, { user, params }) => {
  const features = await featuresFor(req, user.id);
  if (!features.paySmall && !features.groupBuy) return apiError("NOT_FOUND", "These features aren't on for your shop.", 404);
  const own = await ownProduct(user.id, String(params.id ?? ""));
  if (!own) return apiError("NOT_FOUND", "Product not found", 404);
  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Check the settings and try again.");
  const input = parsed.data;
  try {
    const current = payOptionView(await db.productPayOption.findUnique({ where: { productId: own.product.id } }));
    const turningOn = (features.paySmall && input.paySmallOn && !current.paySmallOn) || (features.groupBuy && input.groupBuyOn && !current.groupBuyOn);
    if (turningOn) {
      if (own.product.fulfillmentType === "dropship" || own.product.supplierProductId) return apiError("BAD_REQUEST", "Products that ship from a supplier can't be sold this way yet.");
      if (!(await sellerSubaccount(own.storeId))) return apiError("WALLET_NEEDED", "Set up your Shopinbos Wallet first (verified ID and bank account), so each payment goes straight to your bank.", 409);
    }
    const data: Record<string, unknown> = {};
    if (features.paySmall) {
      if (input.paySmallOn !== undefined) data.paySmallOn = input.paySmallOn;
      if (input.paySmallWeeks !== undefined) {
        const weeks = cleanWeeksList(input.paySmallWeeks);
        if (!weeks) return apiError("BAD_REQUEST", "Pick at least one length: 4, 6 or 8 weeks.");
        data.paySmallWeeks = weeks;
      }
      if (input.priceLock !== undefined) data.priceLock = input.priceLock;
      if (input.refundRule !== undefined) data.refundRule = cleanRefundRule(input.refundRule);
    }
    if (features.groupBuy) {
      const groupBuyOn = input.groupBuyOn ?? current.groupBuyOn;
      const groupPriceKobo = input.groupPrice === undefined ? (current.groupPrice === null ? null : Math.round(current.groupPrice * 100)) : input.groupPrice === null ? null : Math.round(input.groupPrice) * 100;
      const groupSize = input.groupSize === undefined ? current.groupSize : input.groupSize;
      const groupHours = input.groupHours === undefined ? current.groupHours ?? GROUP_DEFAULT_HOURS : input.groupHours;
      if (groupBuyOn) {
        const problem = groupSettingsProblem({ groupPriceKobo: groupPriceKobo ?? 0, retailKobo: Math.round(own.product.retailPrice * 100), size: groupSize ?? 0, hours: groupHours ?? 0 });
        if (problem) return apiError("BAD_REQUEST", problem);
      }
      Object.assign(data, { groupBuyOn, groupPriceKobo, groupSize, groupHours });
    }
    await db.productPayOption.upsert({
      where: { productId: own.product.id },
      create: { productId: own.product.id, storeId: own.storeId, paySmallWeeks: [...PAY_SMALL_WEEKS], ...data },
      update: data,
    });
    return ok(await view(own.storeId, own.product, features));
  } catch (error) {
    if (tablesMissing(error)) return apiError("NOT_READY", "Not ready yet. Try again later.", 503);
    throw error;
  }
});
