import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Row } from "@/components/design";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Pic } from "@/components/SupplierKit";
import { useT } from "@/lib/i18n";
import { fetchSupplierProducts } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";

// Wholesale price tiers (Account): each product with its tiers ("20+ ₦10,500 · 50+ ₦9,800"), tap to change them
// (the product editor opened on its tiers). Tiers live on each product (pricingTiers).

export default function SupplierTiers() {
  const t = useT("m_supplier", "common");
  const products = useLoad(fetchSupplierProducts);
  const list = products.data ?? [];

  return (
    <Screen title={t("money.tiers")} refreshing={products.refreshing} onRefresh={() => void products.refresh()}>
      {products.loading && !products.data ? <LoadingBlock /> : null}
      {products.error && !products.data ? <ErrorState message={products.error} onRetry={() => void products.reload()} /> : null}
      {products.data && !list.length ? <EmptyState icon="tag" title={t("tiers.empty")} /> : null}
      {list.length ? (
        <List>
          {list.map((product) => {
            const tiers = [...(product.pricingTiers ?? [])].sort((a, b) => a.minQty - b.minQty);
            return (
              <Row
                key={product.id}
                lead={<Pic uri={product.images[0]} size={44} />}
                title={product.name}
                sub={tiers.length ? tiers.map((tier) => `${tier.minQty}+ ${naira(tier.price)}`).join(" · ") : t("tiers.none", { price: naira(product.wholesalePrice) })}
                onPress={() => router.push({ pathname: "/supplier/product/edit", params: { id: product.id, focus: "tiers" } })}
              />
            );
          })}
        </List>
      ) : null}
    </Screen>
  );
}
