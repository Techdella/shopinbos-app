import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Sub } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Pic, PlusMinus } from "@/components/SupplierKit";
import { TabScreen } from "@/components/TabScreen";
import { Field, Notice, PillButton, T } from "@/components/ui";
import { AppIcon } from "@/components/icons";
import { useT } from "@/lib/i18n";
import { productStage } from "@/lib/partner-pure";
import { fetchSupplierProducts, quickEditProduct, type SupplierProduct } from "@/lib/supplier";
import { LOW_STOCK } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Supplier Products ("Simple app, end to end" supplier prototype): each product with its price to shops and how
// many are left, and − / + to change the stock right there (saved a moment after the last tap, through PATCH
// /api/mobile/supplier/products/[id]; stock changes don't send a live product back for review). Tap a product for
// its page; "Add a product" starts with a photo.

const SAVE_AFTER_MS = 700;

/** Past this many products a search box shows above the list. */
const SEARCH_FROM = 8;

export default function SupplierProducts() {
  const t = useT("m_supplier", "m_partner");
  const products = useLoad(fetchSupplierProducts);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const stockLine = (stock: number) => (stock <= LOW_STOCK ? t("products.runningLow", { count: stock }) : t("products.inStock", { count: stock }));
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  function setStock(product: SupplierProduct, next: number) {
    products.setData((current) => current?.map((item) => (item.id === product.id ? { ...item, stockQuantity: next } : item)) ?? current);
    const old = timers.current.get(product.id);
    if (old) clearTimeout(old);
    timers.current.set(
      product.id,
      setTimeout(() => {
        timers.current.delete(product.id);
        quickEditProduct(product.id, { stockQuantity: next })
          .then(() => setError(null))
          .catch((saveError) => {
            setError(saveError instanceof Error ? saveError.message : t("product.saveFailed"));
            void products.reload();
          });
      }, SAVE_AFTER_MS),
    );
  }

  const all = products.data ?? [];
  const query = q.trim().toLowerCase();
  const list = query ? all.filter((product) => product.name.toLowerCase().includes(query)) : all;

  return (
    <TabScreen title={t("products.tab")} refreshing={products.refreshing} onRefresh={() => void products.refresh()}>
      {products.loading && !products.data ? <LoadingBlock label={t("products.loading")} /> : null}
      {products.error && !products.data ? <ErrorState message={products.error} onRetry={() => void products.reload()} /> : null}
      {error ? <Notice>{error}</Notice> : null}

      {all.length > SEARCH_FROM ? <Field value={q} onChangeText={setQ} placeholder={t("products.find")} returnKeyType="search" accessibilityLabel={t("products.search")} style={{ height: 48 }} /> : null}

      {products.data && !all.length ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{t("products.none")}</T>
          <Sub>{t("products.noneBody")}</Sub>
        </View>
      ) : null}

      {list.length ? (
        <List>
          {list.map((product) => {
            const live = product.status === "published";
            const line = [t("products.toShops", { price: naira(product.wholesalePrice) }), stockLine(product.stockQuantity), live ? null : productStage(product.status, t).label].filter(Boolean).join(" · ");
            return (
              <View key={product.id} style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 68, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Pic uri={product.images[0]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${product.name}. ${line}`}
                  onPress={() => router.push({ pathname: "/supplier/product/[id]", params: { id: product.id } })}
                  style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 3, opacity: pressed ? 0.7 : 1 })}
                >
                  <T weight="bold" style={{ fontSize: 16, lineHeight: 21 }} numberOfLines={2}>{product.name}</T>
                  <T style={{ fontSize: 14, lineHeight: 19, color: product.stockQuantity <= LOW_STOCK ? colors.warnInk : colors.inkSoft }} numberOfLines={2}>{line}</T>
                </Pressable>
                <PlusMinus value={product.stockQuantity} onChange={(next) => setStock(product, next)} lessLabel={t("product.oneLessOf", { name: product.name })} moreLabel={t("product.oneMoreOf", { name: product.name })} />
              </View>
            );
          })}
        </List>
      ) : null}

      <PillButton tone="accent" onPress={() => router.push("/supplier/product/new")} accessibilityLabel={t("products.add")}>
        <AppIcon name="plus" size={20} color={colors.ink} strokeWidth={2.4} />
        <T weight="extrabold" style={{ fontSize: 17, color: colors.ink }}>{t("products.add")}</T>
      </PillButton>
    </TabScreen>
  );
}
