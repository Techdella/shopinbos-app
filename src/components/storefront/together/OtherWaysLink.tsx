import "server-only";
import { db } from "@/lib/db/client";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { featureOnForStore, tablesMissing } from "@/lib/pay-together/common.server";

// "Other ways to buy" on a product page (pilots pay_small_small, group_buy, ajo): a small pill fixed at the bottom
// left, shown only when the shop has one of them on for this product (the shop owner's switch) and the product is the
// shop's own stock. It opens /buy/<productId>, which checks everything again (the seller's bank, the price rules).
// Rendered inside Suspense so it never slows the product page. Never throws.

export async function OtherWaysLink({ storeId, productId, storeBasePath }: { storeId: string; productId: string; storeBasePath: string }) {
  try {
    const [option, ajoGroups] = await Promise.all([
      db.productPayOption.findUnique({ where: { productId }, select: { storeId: true, paySmallOn: true, groupBuyOn: true } }),
      db.ajoGroup.count({ where: { storeId, productId, status: "forming" } }),
    ]);
    const wanted: Array<"pay_small_small" | "group_buy" | "ajo"> = [];
    if (option?.storeId === storeId && option.paySmallOn) wanted.push("pay_small_small");
    if (option?.storeId === storeId && option.groupBuyOn) wanted.push("group_buy");
    if (ajoGroups > 0) wanted.push("ajo");
    if (!wanted.length) return null;
    const on = await Promise.all(wanted.map((key) => featureOnForStore(storeId, key)));
    if (!on.some(Boolean)) return null;
    const names = { pay_small_small: "Pay small small", group_buy: "Buy with friends", ajo: "Ajo" } as const;
    const label = wanted.filter((_, index) => on[index]).map((key) => names[key]).join(" · ");
    return (
      <a
        href={getPublicStorefrontPath(storeBasePath, `/buy/${productId}`)}
        className="fixed bottom-24 left-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0E2A38] px-4 text-[14px] font-semibold text-white no-underline shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span aria-hidden>₦</span> Other ways to buy: {label}
      </a>
    );
  } catch (error) {
    if (!tablesMissing(error)) console.error("[other ways to buy] link failed", error);
    return null;
  }
}
