import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { ListScreen } from "@/components/seller/FindKit";
import { SupplierTrustBadges } from "@/components/SupplierTrust";
import { Card, Field, PillButton, T } from "@/components/ui";
import { fetchSuppliers, type DirectorySupplier } from "@/lib/suppliers";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// Suppliers (web /marketplace/suppliers): every supplier, near or far, nearest first; where they are, verified or
// not and their risk score. "See their products" opens their page (suppliers/[slug]); Chat opens the chat with them.
// Opened from Find products.

function SupplierCard({ supplier }: { supplier: DirectorySupplier }) {
  const t = useT("marketplace");
  const open = () => router.push({ pathname: "/suppliers/[slug]", params: { slug: supplier.slug } });
  const where = [[supplier.city, supplier.country].filter(Boolean).join(", "), supplier.businessType.replace(/_/g, " ")].filter(Boolean).join(" · ");
  return (
    <Card style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={open} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {supplier.logoUrl ? (
          <Image source={{ uri: supplier.logoUrl }} style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.canvas }} contentFit="cover" recyclingKey={supplier.id} />
        ) : (
          <Initials name={supplier.name} size={52} radius={14} bg={colors.canvas} fg={colors.ink} />
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T weight="extrabold" numberOfLines={2} style={{ fontSize: 16 }}>{supplier.name}</T>
          <T numberOfLines={2} style={{ color: colors.inkSoft, fontSize: 13 }}>{where}</T>
        </View>
      </Pressable>
      <SupplierTrustBadges supplier={supplier} />
      {supplier.description ? <T numberOfLines={2} style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{supplier.description}</T> : null}
      <PillButton tone="ink" size="md" title={supplier.products > 0 ? `${t("sup.theirProducts")} · ${supplier.products}` : t("sup.theirProducts")} onPress={open} />
      <PillButton tone="white" size="md" icon="chat" title={t("chat")} onPress={() => router.push({ pathname: "/partners/[id]", params: { id: supplier.id, name: supplier.name } })} />
    </Card>
  );
}

export default function Suppliers() {
  const t = useT("marketplace");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const loaded = useLoad(() => fetchSuppliers(search), search);
  const suppliers = loaded.data?.suppliers ?? [];
  return (
    <ListScreen<DirectorySupplier>
      title={t("sup.title")}
      refreshing={loaded.refreshing}
      onRefresh={() => void loaded.refresh()}
      data={suppliers}
      keyExtractor={(supplier) => supplier.id}
      ListHeaderComponent={
        <View style={{ gap: 10, paddingBottom: 4 }}>
          <T style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 32 }}>{t("sup.title")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("pub.lead")}</T>
          <Field value={q} onChangeText={setQ} placeholder={t("sup.search")} returnKeyType="search" onSubmitEditing={() => setSearch(q.trim())} accessibilityLabel={t("sup.search")} />
          {loaded.loading && !loaded.data ? <LoadingBlock /> : null}
          {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
          {loaded.data && !suppliers.length ? <EmptyState icon="users" title={search ? t("sup.noMatch") : t("sup.noneYet")}>{search ? t("sup.tryDifferent") : t("sup.showOnce")}</EmptyState> : null}
        </View>
      }
      renderItem={({ item }) => <SupplierCard supplier={item} />}
    />
  );
}
