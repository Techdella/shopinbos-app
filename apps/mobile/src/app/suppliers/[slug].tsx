import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { ListScreen } from "@/components/seller/FindKit";
import { SupplierTrustBadges } from "@/components/SupplierTrust";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { fetchFindProducts, type FindProduct } from "@/lib/marketplace";
import { fetchSupplier, setNotifyMe } from "@/lib/suppliers";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// One supplier's products (web /marketplace/suppliers/<slug>), near or far: each opens find/[slug] to add it or ask
// for a price. With none live yet: "No products yet", Notify me when they add products (the supplier hears this shop
// is waiting: src/lib/suppliers/product-requests.server.ts), Ask for a price and Message them (the chat, with the
// question ready to send).

function ProductRow({ product }: { product: FindProduct }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/find/[slug]", params: { slug: product.slug } })} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 10 }}>
      {product.images[0] ? <Image source={{ uri: product.images[0] }} style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: colors.lilac }} contentFit="cover" recyclingKey={product.id} /> : <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: colors.lilac }} />}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T weight="bold" numberOfLines={2} style={{ fontSize: 14.5 }}>{product.name}</T>
        <T numberOfLines={1} style={{ color: colors.inkSoft, fontSize: 12.5 }}>{product.category}</T>
      </View>
      <T weight="extrabold" style={{ fontSize: 15 }}>{naira(product.cost)}</T>
    </Pressable>
  );
}

export default function SupplierProducts() {
  const t = useT("marketplace");
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const key = String(slug ?? "");
  const supplier = useLoad(() => fetchSupplier(key), key);
  const products = useLoad(() => fetchFindProducts("", { supplier: key }), key);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = supplier.data;
  const list = products.data?.products ?? [];
  const isFollowing = following ?? info?.following ?? false;

  async function toggle() {
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await setNotifyMe(info.slug, !isFollowing);
      setFollowing(answer.following);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
    } finally {
      setBusy(false);
    }
  }

  const chat = (draft?: string) => info && router.push({ pathname: "/partners/[id]", params: { id: info.id, name: info.name, ...(draft ? { draft } : {}) } });
  const askPrice = () => info && chat(`${t("price.ask", { name: info.name, what: t("price.yourProducts") })} ${t("price.moqLine")}`);

  const notify = info ? (
    isFollowing ? (
      <View style={{ gap: 6 }}>
        <Notice tone="success">{t("waitlist.on", { name: info.name })}</Notice>
        <PillButton tone="white" size="sm" title={t("waitlist.stop")} busy={busy} onPress={() => void toggle()} />
      </View>
    ) : (
      <PillButton testID="notify-me" tone="accent" size="md" icon="bell" title={list.length ? t("waitlist.joinMore") : t("waitlist.join")} busy={busy} onPress={() => void toggle()} />
    )
  ) : null;

  const header = (
    <View style={{ gap: 12, paddingBottom: 4 }}>
      {supplier.loading && !info ? <LoadingBlock /> : null}
      {supplier.error && !info ? <ErrorState message={supplier.error} onRetry={() => void supplier.reload()} /> : null}
      {info ? (
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {info.logoUrl ? <Image source={{ uri: info.logoUrl }} style={{ width: 60, height: 60, borderRadius: 16, backgroundColor: colors.canvas }} contentFit="cover" /> : <Initials name={info.name} size={60} radius={16} bg={colors.canvas} fg={colors.ink} />}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <T style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 26 }} numberOfLines={2}>{info.name}</T>
              <T numberOfLines={2} style={{ color: colors.inkSoft, fontSize: 13.5 }}>{[[info.city, info.country].filter(Boolean).join(", "), info.businessType.replace(/_/g, " ")].filter(Boolean).join(" · ")}</T>
            </View>
          </View>
          <SupplierTrustBadges supplier={info} />
          {info.description ? <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{info.description}</T> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PillButton style={{ flex: 1 }} tone="ink" size="md" icon="send" title={t("pub.quote")} onPress={askPrice} />
            <PillButton style={{ flex: 1 }} tone="white" size="md" icon="chat" title={t("waitlist.message")} onPress={() => chat()} />
          </View>
        </Card>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {products.loading && !products.data ? <LoadingBlock /> : null}
      {products.error && !products.data ? <ErrorState message={products.error} onRetry={() => void products.reload()} /> : null}
      {info && products.data && !list.length ? (
        <EmptyState icon="box" title={t("waitlist.emptyTitle")} action={notify}>
          {t("waitlist.emptyBody", { name: info.name })}
        </EmptyState>
      ) : null}
      {info && list.length ? (
        <Card style={{ gap: 10 }}>
          <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("waitlist.count", { count: list.length, name: info.name })}</T>
          {notify}
        </Card>
      ) : null}
    </View>
  );

  return (
    <ListScreen<FindProduct>
      title={info?.name ?? t("sup.title")}
      refreshing={supplier.refreshing || products.refreshing}
      onRefresh={() => { void supplier.refresh(); void products.refresh(); }}
      data={list}
      keyExtractor={(product) => product.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => <ProductRow product={item} />}
    />
  );
}
