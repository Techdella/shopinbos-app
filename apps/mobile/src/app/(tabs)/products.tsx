import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { fetchProducts, type ProductItem } from "@/lib/dashboard";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

export default function Products() {
  const t = useT("m_products", "common");
  const [products, setProducts] = useState<ProductItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setProducts(await fetchProducts());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("list.loadFailed"));
    }
  }, []);

  // Loads on first open and again when coming back (after editing a product).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <TabScreen
      title={t("list.title")}
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
    >
      <PillButton title={t("add.title")} onPress={() => router.push("/add-products")} style={{ marginBottom: 14 }} />
      {error && <Notice>{error}</Notice>}
      {products && !products.length && (
        <Card style={{ gap: 12 }}>
          <T style={{ fontSize: 15, lineHeight: 22 }}>{t("list.empty")}</T>
        </Card>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 }}>
        {products?.map((product) => {
          const low = product.currentStock <= 5;
          return (
            <Pressable key={product.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })} style={{ width: "48.3%" }}>
              <View style={{ aspectRatio: 1, borderRadius: 18, backgroundColor: colors.lilac, overflow: "hidden" }}>
                {product.images[0] && <Image source={{ uri: product.images[0] }} style={{ width: "100%", height: "100%" }} contentFit="cover" />}
                <View style={{ position: "absolute", left: 8, bottom: 8, backgroundColor: low ? colors.peach : colors.surface, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4 }}>
                  <T weight="bold" style={{ fontSize: 13, color: low ? colors.accentInk : colors.ink }}>
                    {product.currentStock <= 0 ? t("list.soldOut") : low ? t("list.left", { count: product.currentStock }) : t("drafts.inStock", { count: product.currentStock })}
                  </T>
                </View>
              </View>
              <T weight="bold" style={{ marginTop: 8, fontSize: 14 }} numberOfLines={1}>{product.name}</T>
              <T weight="extrabold" style={{ fontSize: 14 }}>{naira(Number(product.retailPrice))}</T>
              {product.status !== "published" && <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("status.draft")}</T>}
            </Pressable>
          );
        })}
      </View>
    </TabScreen>
  );
}
