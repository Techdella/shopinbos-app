import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { List, Small } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ChipRow } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { StockRow, useStockSaver } from "@/components/seller/StockRows";
import { Chip, Notice, PillButton, T } from "@/components/ui";
import { categoryChips, type StoreCategory } from "@/lib/categories-pure";
import { fetchProducts, type ProductItem } from "@/lib/dashboard";
import { fetchStoreCategories } from "@/lib/products";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Products ("Seller app" prototype `on.products`, opened from My shop): one card of rows, each with − and + to
// change the stock when the seller sells or restocks (saved a moment after the last tap, PATCH
// /api/store/products/[id] { currentStock }), category chips (web /home/categories) and "Add a product" at the
// bottom. Tap a product to open it. Dropship products show the supplier's stock words but no steppers.

function back() {
  if (router.canGoBack()) router.back();
  else router.replace("/shop");
}

export default function Products() {
  const t = useT("m_products", "common");
  const [products, setProducts] = useState<ProductItem[] | null>(null);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const chips = useMemo(() => categoryChips(categories), [categories]);

  // A pushed screen in the prototype: no tab bar, one main button at the bottom.
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: { display: "none" } });
  }, [navigation]);

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
  }, [t]);

  // Loads on first open, again when coming back (after editing a product) and when the category changes.
  useFocusEffect(
    useCallback(() => {
      void load(category);
    }, [load, category]),
  );

  const setStock = useStockSaver(setProducts, setError);

  function pick(next: string) {
    setProducts(null);
    setCategory(next);
  }

  const picked = chips.find((chip) => chip.id === category);

  return (
    <Screen
      title={t("list.title")}
      onBack={back}
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(category); setRefreshing(false); }}
      footer={
        <PillButton tone="accent" accessibilityLabel={t("add.title")} onPress={() => router.push("/add-products")}>
          <AppIcon name="plus" size={20} color={colors.ink} />
          <T weight="extrabold" style={{ fontSize: 17 }}>{t("add.title")}</T>
        </PillButton>
      }
    >
      {chips.length ? (
        <ChipRow>
          <Chip label={t("cat.all")} on={category === ""} onPress={() => pick("")} />
          {chips.map((chip) => (
            <Chip key={chip.id} label={t("cat.chip", { name: chip.name, count: chip.productCount })} on={category === chip.id} onPress={() => pick(category === chip.id ? "" : chip.id)} />
          ))}
        </ChipRow>
      ) : null}
      {error && <Notice>{error}</Notice>}
      {products && !products.length && (
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
          <T style={{ fontSize: 15, lineHeight: 22 }}>{category ? t("cat.empty", { name: picked?.name ?? "" }) : t("list.empty")}</T>
        </View>
      )}
      {products?.length ? (
        <List>
          {products.map((product) => <StockRow key={product.id} product={product} onStock={setStock} />)}
        </List>
      ) : null}
      {products?.length ? <Small>{t("list.stockHint")}</Small> : null}
    </Screen>
  );
}
