import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Row, Small, Stepper } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ChipRow } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Thumb } from "@/components/seller/bits";
import { Chip, Notice, PillButton, T } from "@/components/ui";
import { categoryChips, type StoreCategory } from "@/lib/categories-pure";
import { fetchProducts, type ProductItem } from "@/lib/dashboard";
import { fetchStoreCategories, saveProduct } from "@/lib/products";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Products ("Seller app" prototype `on.products`, opened from My shop): one card of rows, each with − and + to
// change the stock when the seller sells or restocks (saved a moment after the last tap, PATCH
// /api/store/products/[id] { currentStock }), category chips (web /home/categories) and "Add a product" at the
// bottom. Tap a product to open it. Dropship products show the supplier's stock words but no steppers.

const SAVE_AFTER_MS = 700;

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
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

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

  // Each product's newest count waits a moment (the seller may tap a few times), then saves once.
  const pending = useRef(new Map<string, { next: number; before: number }>());
  const flush = useCallback(
    (id: string) => {
      const change = pending.current.get(id);
      timers.current.delete(id);
      pending.current.delete(id);
      if (!change) return;
      saveProduct(id, { currentStock: change.next }).catch((saveError) => {
        setProducts((current) => current?.map((row) => (row.id === id ? { ...row, currentStock: change.before } : row)) ?? current);
        setError(saveError instanceof Error ? saveError.message : t("list.stockFailed"));
      });
    },
    [t],
  );

  // Leaving the screen sends any change still waiting.
  useEffect(() => {
    const waiting = timers.current;
    const changes = pending.current;
    return () => {
      waiting.forEach((timer) => clearTimeout(timer));
      changes.forEach((change, id) => void saveProduct(id, { currentStock: change.next }).catch(() => null));
      changes.clear();
    };
  }, []);

  function setStock(product: ProductItem, next: number) {
    const before = pending.current.get(product.id)?.before ?? product.currentStock;
    pending.current.set(product.id, { next, before });
    setProducts((current) => current?.map((row) => (row.id === product.id ? { ...row, currentStock: next } : row)) ?? current);
    const waiting = timers.current.get(product.id);
    if (waiting) clearTimeout(waiting);
    timers.current.set(product.id, setTimeout(() => flush(product.id), SAVE_AFTER_MS));
  }

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
          {products.map((product) => {
            const own = !product.inventoryType || product.inventoryType === "seller";
            const low = product.currentStock <= (product.lowStockThreshold ?? 3);
            const stock = product.currentStock <= 0 ? t("list.soldOut") : low ? t("list.runningLow", { count: product.currentStock }) : t("drafts.inStock", { count: product.currentStock });
            const words = [naira(Number(product.retailPrice)), stock, product.status !== "published" ? t("status.draft") : null].filter(Boolean).join(" · ");
            return (
              <Row
                key={product.id}
                lead={<Thumb uri={product.images[0]} fallback={product.name} />}
                title={product.name}
                sub={
                  // The stepper sits under the name and price, so both get the row's full width.
                  <View style={{ gap: 8 }}>
                    <T style={{ fontSize: 14, lineHeight: 19, color: low && own ? colors.accentInk : colors.inkSoft }}>{words}</T>
                    {own ? <Stepper value={product.currentStock} label={product.name} onChange={(next) => setStock(product, next)} /> : null}
                  </View>
                }
                accessibilityLabel={`${product.name}. ${words}`}
                onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
              />
            );
          })}
        </List>
      ) : null}
      {products?.length ? <Small>{t("list.stockHint")}</Small> : null}
    </Screen>
  );
}
