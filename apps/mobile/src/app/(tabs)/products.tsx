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
      setError(loadError instanceof Error ? loadError.message : "Couldn't load products. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <TabScreen
      title="My products"
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
    >
      <PillButton title="Add a product" onPress={() => router.push("/add-products")} style={{ marginBottom: 14 }} />
      {error && <Notice>{error}</Notice>}
      {products && !products.length && (
        <Card style={{ gap: 12 }}>
          <T style={{ fontSize: 15, lineHeight: 22 }}>No products yet. Tap &quot;Add a product&quot;, take a photo, and Rex writes the rest.</T>
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
                    {product.currentStock <= 0 ? "Sold out" : `${product.currentStock} left`}
                  </T>
                </View>
              </View>
              <T weight="bold" style={{ marginTop: 8, fontSize: 14 }} numberOfLines={1}>{product.name}</T>
              <T weight="extrabold" style={{ fontSize: 14 }}>{naira(Number(product.retailPrice))}</T>
              {product.status !== "published" && <T style={{ fontSize: 14, color: colors.inkSoft }}>Hidden from customers</T>}
            </Pressable>
          );
        })}
      </View>
    </TabScreen>
  );
}
