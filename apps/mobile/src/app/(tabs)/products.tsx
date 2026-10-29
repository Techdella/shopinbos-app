import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { List, Seg, Small } from "@/components/design";
import { FilterBar, FilterGroup, FilterSheet } from "@/components/FilterBar";
import { Screen } from "@/components/Screen";
import { StockRow, useStockSaver } from "@/components/seller/StockRows";
import { Chip, Notice, PillButton, T } from "@/components/ui";
import { categoryChips, type StoreCategory } from "@/lib/categories-pure";
import type { ProductItem } from "@/lib/dashboard";
import { DEFAULT_PRODUCT_QUERY, PRODUCT_SHOWS, PRODUCT_SORTS, productFilterCount, type ProductListQuery } from "@/lib/product-filters-pure";
import { fetchProductList, fetchStoreCategories } from "@/lib/products";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Products ("Seller app" prototype `on.products`, opened from My shop): one card of rows, each with − and + to
// change the stock when the seller sells or restocks (saved a moment after the last tap, PATCH
// /api/store/products/[id] { currentStock }) and "Add a product" at the bottom. Tap a product to open it. Dropship
// products show the supplier's stock words but no steppers. Filters like the web's /products: a chip row (All, Live,
// Draft, Low stock, Dropship, Archived) and a Filters sheet with the category (web /home/categories) and the order.

function back() {
  if (router.canGoBack()) router.back();
  else router.replace("/shop");
}

export default function Products() {
  const t = useT("m_products", "common");
  const tBulk = useT("bulkAdd");
  const [products, setProducts] = useState<ProductItem[] | null>(null);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [query, setQuery] = useState<ProductListQuery>(DEFAULT_PRODUCT_QUERY);
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const chips = useMemo(() => categoryChips(categories), [categories]);

  // A pushed screen in the prototype: no tab bar, one main button at the bottom.
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: { display: "none" } });
  }, [navigation]);

  const load = useCallback(async (next: ProductListQuery) => {
    try {
      const [list, cats] = await Promise.all([fetchProductList(next), fetchStoreCategories().catch(() => null)]);
      setProducts(list);
      if (cats) setCategories(cats);
      // The picked category has no products any more (moved on the web): show everything again.
      if (next.categoryId && cats && !categoryChips(cats).some((chip) => chip.id === next.categoryId)) setQuery((now) => ({ ...now, categoryId: "" }));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("list.loadFailed"));
    }
  }, [t]);

  // Loads on first open, again when coming back (after editing a product) and when a filter changes.
  useFocusEffect(
    useCallback(() => {
      void load(query);
    }, [load, query]),
  );

  const setStock = useStockSaver(setProducts, setError);

  function pick(patch: Partial<ProductListQuery>) {
    setProducts(null);
    setQuery((now) => ({ ...now, ...patch }));
  }

  const filtered = query.show !== "all" || query.categoryId !== "";
  const picked = chips.find((chip) => chip.id === query.categoryId);

  return (
    <Screen
      title={t("list.title")}
      onBack={back}
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(query); setRefreshing(false); }}
      footer={
        <>
          <PillButton tone="accent" accessibilityLabel={t("add.title")} onPress={() => router.push("/add-products")} icon="plus" title={t("add.title")} />
          <PillButton testID="products-bulk-add" tone="white" size="md" onPress={() => router.push("/bulk-add")} icon="sparkle" title={tBulk("entry.title")} />
        </>
      }
    >
      <FilterBar testID="products-filters" onMore={() => setSheet(true)} moreLabel={t("filters.title")} moreCount={productFilterCount(query)}>
        {PRODUCT_SHOWS.map((show) => (
          <Seg key={show} label={t(`filters.show.${show}`)} on={query.show === show} onPress={() => pick({ show })} />
        ))}
      </FilterBar>
      {query.show === "preorder" ? (
        // Pre-order products: tap one to change its ship date, limit and deposit; orders and buyers live on Pre-orders.
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 }}>
          <T style={{ fontSize: 14.5, lineHeight: 21, color: colors.inkSoft }}>{t("list.preorderBar")}</T>
          <PillButton testID="products-preorders" size="sm" tone="white" icon="clock" title={t("list.preorderManage")} onPress={() => router.push("/preorders")} />
        </View>
      ) : null}
      {error && <Notice>{error}</Notice>}
      {products && !products.length && (
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 12 }}>
          <T style={{ fontSize: 15, lineHeight: 22 }}>{query.categoryId && query.show === "all" ? t("cat.empty", { name: picked?.name ?? "" }) : filtered ? t("filters.none") : t("list.empty")}</T>
          {filtered ? <PillButton title={t("filters.clear")} size="sm" tone="white" onPress={() => pick(DEFAULT_PRODUCT_QUERY)} /> : null}
        </View>
      )}
      {products?.length ? (
        <List>
          {products.map((product) => <StockRow key={product.id} product={product} onStock={setStock} section={query.show === "preorder" ? "preorder" : undefined} />)}
        </List>
      ) : null}
      {products?.length ? <Small>{t("list.stockHint")}</Small> : null}

      <FilterSheet visible={sheet} onClose={() => setSheet(false)} title={t("filters.title")} doneLabel={t("filters.done")} clearLabel={t("filters.clear")} onClear={() => pick({ categoryId: "", sort: "newest" })}>
        {chips.length ? (
          <FilterGroup label={t("filters.category")}>
            <Chip label={t("cat.all")} on={query.categoryId === ""} onPress={() => pick({ categoryId: "" })} />
            {chips.map((chip) => (
              <Chip key={chip.id} label={t("cat.chip", { name: chip.name, count: chip.productCount })} on={query.categoryId === chip.id} onPress={() => pick({ categoryId: query.categoryId === chip.id ? "" : chip.id })} />
            ))}
          </FilterGroup>
        ) : null}
        <FilterGroup label={t("filters.sort")}>
          {PRODUCT_SORTS.map((sort) => (
            <Chip key={sort} label={t(`filters.sort.${sort}`)} on={query.sort === sort} onPress={() => pick({ sort })} />
          ))}
        </FilterGroup>
      </FilterSheet>
    </Screen>
  );
}
