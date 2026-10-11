import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { fetchProducts, type ProductItem } from "@/lib/dashboard";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

export default function Products() {
  const [products, setProducts] = useState<ProductItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setProducts(await fetchProducts());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn't load products.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <TabScreen
      title="Products"
      action={<PillButton title="Add" size="sm" onPress={() => router.push("/add-products")} />}
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
    >
      {error && <Notice>{error}</Notice>}
      {products && !products.length && (
        <Card style={{ gap: 12 }}>
          <T style={{ color: colors.inkSoft }}>No products yet. Snap a few photos and Rex lists them for you.</T>
          <PillButton title="Add products" onPress={() => router.push("/add-products")} />
        </Card>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 }}>
        {products?.map((product) => {
          const low = product.currentStock <= 5;
          return (
            <Pressable key={product.id} accessibilityRole="button" onPress={() => void openWeb(`/products/${product.id}`)} style={{ width: "48.3%" }}>
              <View style={{ aspectRatio: 1, borderRadius: 18, backgroundColor: colors.lilac, overflow: "hidden" }}>
                {product.images[0] && <Image source={{ uri: product.images[0] }} style={{ width: "100%", height: "100%" }} contentFit="cover" />}
                <View style={{ position: "absolute", left: 8, bottom: 8, backgroundColor: low ? colors.peach : colors.surface, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4 }}>
                  <T weight="bold" style={{ fontSize: 11.5, color: low ? colors.accentInk : colors.ink }}>
                    {product.currentStock <= 0 ? "Sold out" : low ? `${product.currentStock} left` : `${product.currentStock} in stock`}
                  </T>
                </View>
              </View>
              <T weight="bold" style={{ marginTop: 8, fontSize: 14 }} numberOfLines={1}>{product.name}</T>
              <T weight="extrabold" style={{ fontSize: 14 }}>{naira(Number(product.retailPrice))}</T>
              {product.status !== "published" && <T style={{ fontSize: 12, color: colors.inkSoft }}>Draft</T>}
            </Pressable>
          );
        })}
      </View>
    </TabScreen>
  );
}
