import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { ChipRow, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Thumb, TonePill } from "@/components/partner";
import { TabScreen } from "@/components/TabScreen";
import { Chip, Field, PillButton, T } from "@/components/ui";
import { HelpButton } from "@/components/Help";
import { productStage } from "@/lib/partner-pure";
import { fetchSupplierProducts, type SupplierProduct } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Supplier products: how many you have, your price to shops and whether shops can see it. Tap one for quick
// changes; "Add a product" starts with a photo. Bulk catalogue changes are on the web.

const LOW = 5;

const FILTERS: { key: string; label: string; test: (product: SupplierProduct) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "live", label: "Live", test: (product) => product.status === "published" },
  { key: "low", label: "Low stock", test: (product) => product.stockQuantity <= LOW && product.status !== "unpublished" },
  { key: "review", label: "In review", test: (product) => product.status === "pending_review" },
  { key: "hidden", label: "Drafts and hidden", test: (product) => ["draft", "unpublished", "rejected"].includes(product.status) },
];

export default function SupplierProducts() {
  const products = useLoad(fetchSupplierProducts);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const test = FILTERS.find((item) => item.key === filter)?.test ?? (() => true);
    const query = q.trim().toLowerCase();
    return (products.data ?? []).filter((product) => test(product) && (!query || product.name.toLowerCase().includes(query)));
  }, [products.data, filter, q]);

  return (
    <TabScreen title="My products" action={<HelpButton />} refreshing={products.refreshing} onRefresh={() => void products.refresh()}>
      <PillButton title="Add a product" onPress={() => router.push("/supplier/product/new")} style={{ marginBottom: 12 }} />
      <Field value={q} onChangeText={setQ} placeholder="Find a product" returnKeyType="search" accessibilityLabel="Search products" style={{ height: 48, marginBottom: 12 }} />
      <ChipRow>
        {FILTERS.map((item) => <Chip key={item.key} label={item.label} on={filter === item.key} onPress={() => setFilter(item.key)} />)}
      </ChipRow>
      <View style={{ marginTop: 14, gap: 8 }}>
        {products.loading && !products.data ? <LoadingBlock label="Loading products…" /> : null}
        {products.error && !products.data ? <ErrorState message={products.error} onRetry={() => void products.reload()} /> : null}
        {products.data && !shown.length ? (
          <EmptyState icon="box" title={products.data.length ? "No products here" : "No products yet"} action={products.data.length ? null : <PillButton title="Add your first product" size="sm" onPress={() => router.push("/supplier/product/new")} />}>
            {products.data.length ? "Tap another button above to see more." : "Take a photo, set your wholesale price and stock, and shops can start selling it for you."}
          </EmptyState>
        ) : null}
        {shown.map((product) => {
          const stage = productStage(product.status);
          const low = product.stockQuantity <= LOW;
          return (
            <Pressable
              key={product.id}
              accessibilityRole="button"
              accessibilityLabel={`${product.name}, ${stage.label}, ${product.stockQuantity} in stock`}
              onPress={() => router.push({ pathname: "/supplier/product/[id]", params: { id: product.id } })}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12, opacity: pressed ? 0.8 : 1 })}
            >
              <Thumb uri={product.images[0]} size={56} />
              <View style={{ flex: 1, gap: 4 }}>
                <T weight="extrabold" style={{ fontSize: 14.5 }} numberOfLines={1}>{product.name}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>
                  {naira(product.wholesalePrice)} wholesale · MOQ {product.moq}{product._count?.storeProducts ? ` · ${product._count.storeProducts} shops sell it` : ""}
                </T>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TonePill tone={stage.tone} label={stage.label} />
                  <TonePill tone={product.stockQuantity === 0 ? "danger" : low ? "warning" : "muted"} label={product.stockQuantity === 0 ? "Sold out" : `${product.stockQuantity.toLocaleString("en-NG")} in stock`} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </TabScreen>
  );
}
