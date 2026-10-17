import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { buildDirectStorefrontPath } from "@/lib/domains/storefront";
import { checkoutPaymentOptions, checkoutPaymentSettings, paystackSecretReady } from "@shared/checkout-payments";
import { readCheckoutSettings } from "@shared/cart-checkout";
import { hostedGatewaysReady } from "@/lib/hosted-gateways";
import { CheckoutSettings } from "./CheckoutSettings";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("payments");
  return { title: t("co.title") };
}

export default async function CheckoutPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("payments", "orders");
  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      brandSettings: true,
      checkoutConfig: { select: { requirePhone: true, enableNotes: true, enableGiftNote: true, enableCoupon: true, enableUpsells: true, enableTrustBadges: true, upsellProducts: true } },
    },
  });

  const [products, zones] = store
    ? await Promise.all([
        db.storeProduct.findMany({
          where: { storeId: store.id, status: "published" },
          select: { id: true, name: true, images: true, retailPrice: true, variants: true },
          orderBy: { updatedAt: "desc" },
          take: 200,
        }),
        db.shippingZone.findMany({ where: { storeId: store.id, active: true }, orderBy: { sortOrder: "asc" }, select: { name: true, regions: true, rates: true } }),
      ])
    : [[], []];

  // What shoppers will actually be offered right now (same rules as the storefront checkout).
  const payments = checkoutPaymentOptions(checkoutPaymentSettings(store?.brandSettings, zones, paystackSecretReady(process.env.PAYSTACK_SECRET_KEY), hostedGatewaysReady())).map((option) => t.dynamic(`method.${option.key}`, option.label));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("co.title")}
      sub={t("co.sub")}
      actions={store ? <PillLink href={buildDirectStorefrontPath(store.slug, "/checkout")} icon="eye">{t("co.see")}</PillLink> : undefined}
    >
      <CheckoutSettings
        initial={readCheckoutSettings(store?.checkoutConfig ?? null)}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          image: product.images[0] ?? null,
          price: product.retailPrice,
          hasOptions: Array.isArray(product.variants) && product.variants.length > 0,
        }))}
        paymentLabels={payments}
        zoneCount={zones.length}
      />
    </SellerPage>
  );
}
