import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { LoadingBlock } from "@/components/kit";
import { Sheet } from "@/components/Sheet";
import { Field, T } from "@/components/ui";
import type { PickProduct } from "@/lib/paylinks";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Pick one of the shop's published products (a new payment link, a product block on the link in bio page).

export function ProductPickSheet({
  visible,
  onClose,
  title,
  products,
  loading,
  onPick,
  exclude = [],
  header,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  products: PickProduct[] | null;
  loading: boolean;
  onPick: (product: PickProduct) => void;
  exclude?: string[];
  /** Shown above the search (e.g. the "Buy now" switch). */
  header?: ReactNode;
}) {
  const t = useT("m_paylinks");
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products ?? []).filter((product) => !exclude.includes(product.id) && (!q || product.name.toLowerCase().includes(q))).slice(0, 40);
  }, [products, query, exclude]);

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {header}
      {products?.length ? <Field value={query} onChangeText={setQuery} placeholder={t("create.search")} autoCorrect={false} accessibilityLabel={t("create.search")} /> : null}
      {loading && !products ? <LoadingBlock /> : null}
      {products && products.length === 0 ? <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 22 }}>{t("create.noProducts")}</T> : null}
      {products?.length && matches.length === 0 ? <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("create.noMatch")}</T> : null}
      <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          {matches.map((product) => (
            <Pressable
              key={product.id}
              accessibilityRole="button"
              accessibilityLabel={product.name}
              onPress={() => {
                setQuery("");
                onPick(product);
              }}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingHorizontal: 8, borderRadius: 16, backgroundColor: pressed ? colors.canvas : "transparent" })}
            >
              {product.images[0] ? (
                <Image source={{ uri: product.images[0] }} style={{ width: 44, height: 44, borderRadius: 10 }} contentFit="cover" />
              ) : (
                <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name="box" size={18} color={colors.inkSoft} />
                </View>
              )}
              <T weight="semibold" style={{ flex: 1, fontSize: 15.5 }} numberOfLines={2}>{product.name}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{naira(Number(product.retailPrice) || 0)}</T>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Sheet>
  );
}
