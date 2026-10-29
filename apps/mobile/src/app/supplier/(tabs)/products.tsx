import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { Sub, Title } from "@/components/design";
import { HelpButton } from "@/components/Help";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { Field, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { productStage } from "@/lib/partner-pure";
import { fetchSupplierProducts, type SupplierProduct } from "@/lib/supplier";
import { LOW_STOCK } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Supplier Products ("Familiar app" supplier prototype `products`): a two-column grid of product cards (the photo,
// the name, the price to shops and how many are left), the first card being "Add a product · Take a photo to
// start". The search button in the header shows a search box. Tap a product for its page, where − / + changes the
// stock (saved through PATCH /api/mobile/supplier/products/[id]).

type Cell = { kind: "add" } | { kind: "product"; product: SupplierProduct };

function pairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));
  return rows;
}

export default function SupplierProducts() {
  const t = useT("m_supplier", "m_partner", "common");
  const tBulk = useT("bulkAdd");
  const products = useLoad(fetchSupplierProducts);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const stockLine = (stock: number) => (stock <= 0 ? t("products.soldOut") : stock <= LOW_STOCK ? t("products.runningLow", { count: stock }) : t("products.inStock", { count: stock }));

  const all = products.data ?? [];
  const query = q.trim().toLowerCase();
  const list = query ? all.filter((product) => product.name.toLowerCase().includes(query)) : all;
  const cells: Cell[] = [...(query ? [] : [{ kind: "add" } as Cell]), ...list.map((product): Cell => ({ kind: "product", product }))];

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46 }}>
      <Title style={{ flex: 1 }}>{t("products.tab")}</Title>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("products.search")}
        accessibilityState={{ expanded: searching }}
        onPress={() => {
          if (searching) setQ("");
          setSearching(!searching);
        }}
        hitSlop={6}
        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
      >
        <AppIcon name={searching ? "x" : "search"} size={21} />
      </Pressable>
      <HelpButton />
    </View>
  );

  return (
    <TabScreen header={header} refreshing={products.refreshing} onRefresh={() => void products.refresh()}>
      {searching ? <Field value={q} onChangeText={setQ} placeholder={t("products.find")} returnKeyType="search" autoFocus accessibilityLabel={t("products.search")} style={{ height: 48 }} /> : null}
      {products.loading && !products.data ? <LoadingBlock label={t("products.loading")} /> : null}
      {products.error && !products.data ? <ErrorState message={products.error} onRetry={() => void products.reload()} /> : null}

      {products.data && query && !list.length ? <Sub>{t("products.noneHere")}</Sub> : null}

      {products.data ? <PillButton testID="supplier-bulk-add" tone="white" size="md" icon="sparkle" title={tBulk("entry.title")} onPress={() => router.push("/bulk-add")} /> : null}

      {products.data ? (
        <View style={{ gap: 12 }}>
          {pairs(cells).map((row, index) => (
            <View key={index} style={{ flexDirection: "row", gap: 12 }}>
              {row.map((cell) => (cell.kind === "add" ? <AddCard key="add" /> : <ProductCard key={cell.product.id} product={cell.product} stock={stockLine(cell.product.stockQuantity)} />))}
              {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </View>
      ) : null}

      {products.data && !all.length ? <Sub style={{ textAlign: "center" }}>{t("products.noneBodyShort")}</Sub> : null}
    </TabScreen>
  );
}

function AddCard() {
  const t = useT("m_supplier");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("products.add")}. ${t("products.addSub")}`}
      onPress={() => router.push("/supplier/product/new")}
      style={({ pressed }) => ({ flex: 1, minHeight: 236, borderRadius: 22, borderWidth: 2, borderStyle: "dashed", borderColor: colors.lineStrong, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 10, padding: 14, opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name="camera" size={26} color={colors.accentInk} />
      </View>
      <T weight="extrabold" style={{ fontSize: 16, textAlign: "center" }}>{t("products.add")}</T>
      <T style={{ fontSize: 13.5, lineHeight: 18, color: colors.inkSoft, textAlign: "center" }}>{t("products.addSub")}</T>
    </Pressable>
  );
}

function ProductCard({ product, stock }: { product: SupplierProduct; stock: string }) {
  const t = useT("m_supplier", "m_partner");
  const live = product.status === "published";
  const stage = live ? null : productStage(product.status, t).label;
  const price = naira(product.wholesalePrice);
  const low = product.stockQuantity <= LOW_STOCK;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[product.name, t("products.toShops", { price }), stock, stage].filter(Boolean).join(". ")}
      onPress={() => router.push({ pathname: "/supplier/product/[id]", params: { id: product.id } })}
      style={({ pressed }) => ({ flex: 1, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: "hidden", opacity: pressed ? 0.85 : 1 })}
    >
      {product.images[0] ? (
        <Image source={{ uri: product.images[0] }} style={{ width: "100%", aspectRatio: 1, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityIgnoresInvertColors />
      ) : (
        <View style={{ width: "100%", aspectRatio: 1, backgroundColor: colors.grayTint, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="box" size={34} color={colors.inkSoft} />
        </View>
      )}
      <View style={{ padding: 12, gap: 3 }}>
        <T weight="bold" style={{ fontSize: 15, lineHeight: 19 }} numberOfLines={2}>{product.name}</T>
        <T weight="extrabold" style={{ fontSize: 15 }}>{price}</T>
        <T style={{ fontSize: 13, lineHeight: 17, color: low ? colors.warnInk : colors.inkSoft }} numberOfLines={1}>{stock}</T>
        {stage ? <T style={{ fontSize: 12.5, color: colors.inkSoft }} numberOfLines={1}>{stage}</T> : null}
      </View>
    </Pressable>
  );
}
