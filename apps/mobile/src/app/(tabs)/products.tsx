import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { ChipRow } from "@/components/kit";
import { Card, Chip, Notice, PillButton, T } from "@/components/ui";
import { TabScreen } from "@/components/TabScreen";
import { categoryChips, type StoreCategory } from "@/lib/categories-pure";
import { fetchProducts, type ProductItem } from "@/lib/dashboard";
import { fetchStoreCategories } from "@/lib/products";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// My products (web /products): the newest 50, with category chips (web /home/categories) that show how many
// products each has and list only that category's products.

export default function Products() {
  const t = useT("m_products", "common");
  const [products, setProducts] = useState<ProductItem[] | null>(null);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const chips = useMemo(() => categoryChips(categories), [categories]);

  const load = useCallback(async (categoryId: string) => {
    try {
      const [list, cats] = await Promise.all([fetchProducts(categoryId || undefined), fetchStoreCategories().catch(() => null)]);
      setProducts(list);
      if (cats) setCategories(cats);
      // The picked category has no products any more (moved on the web): show everything again.
      if (categoryId && cats && !categoryChips(cats).some((chip) => chip.id === categoryId)) setCategory("");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("list.loadFailed"));
    }
  }, []);

  // Loads on first open, again when coming back (after editing a product) and when the category changes.
  useFocusEffect(
    useCallback(() => {
      void load(category);
    }, [load, category]),
  );

  function pick(next: string) {
    setProducts(null);
    setCategory(next);
  }

  const picked = chips.find((chip) => chip.id === category);

  return (
    <TabScreen
      title={t("list.title")}
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(category); setRefreshing(false); }}
    >
      <PillButton title={t("add.title")} onPress={() => router.push("/add-products")} style={{ marginBottom: 14 }} />
      {chips.length ? (
        <View style={{ marginBottom: 14 }}>
          <ChipRow>
            <Chip label={t("cat.all")} on={category === ""} onPress={() => pick("")} />
            {chips.map((chip) => (
              <Chip key={chip.id} label={t("cat.chip", { name: chip.name, count: chip.productCount })} on={category === chip.id} onPress={() => pick(category === chip.id ? "" : chip.id)} />
            ))}
          </ChipRow>
        </View>
      ) : null}
      {error && <Notice>{error}</Notice>}
      {products && !products.length && (
        <Card style={{ gap: 12 }}>
          <T style={{ fontSize: 15, lineHeight: 22 }}>{category ? t("cat.empty", { name: picked?.name ?? "" }) : t("list.empty")}</T>
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
