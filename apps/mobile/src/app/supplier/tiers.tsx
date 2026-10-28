import { router } from "expo-router";
import { List, Row } from "@/components/design";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Pic } from "@/components/SupplierKit";
import { useWords } from "@/components/supplier/DropshipKit";
import { priceSummary } from "@/lib/dropship-pure";
import { useT } from "@/lib/i18n";
import { fetchSupplierProducts } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";

// Prices (Account › Wholesale price tiers): each product with its prices per channel ("₦9,000 for all", or "Dropship
// ₦9,500 · Wholesale ₦9,000 · 6–23 ₦8,200 · 24+ ₦7,500"), tap to change them on the Prices screen (P-Pricing, the
// product editor opened on its prices). Prices and quantity breaks live on each product (priceMode, pricingTiers).

export default function SupplierTiers() {
  const t = useT("m_supplier", "common");
  const words = useWords();
  const products = useLoad(fetchSupplierProducts);
  const list = products.data ?? [];

  return (
    <Screen title={t("money.tiers")} refreshing={products.refreshing} onRefresh={() => void products.refresh()}>
      {products.loading && !products.data ? <LoadingBlock /> : null}
      {products.error && !products.data ? <ErrorState message={products.error} onRetry={() => void products.reload()} /> : null}
      {products.data && !list.length ? <EmptyState icon="tag" title={t("tiers.empty")} /> : null}
      {list.length ? (
        <List>
          {list.map((product) => (
            <Row
              key={product.id}
              lead={<Pic uri={product.images[0]} size={44} />}
              title={product.name}
              sub={priceSummary(product, words)}
              onPress={() => router.push({ pathname: "/supplier/product/edit", params: { id: product.id, focus: "tiers" } })}
            />
          ))}
        </List>
      ) : null}
    </Screen>
  );
}
