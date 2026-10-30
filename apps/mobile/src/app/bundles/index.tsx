import { View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { List, Pill, Row, Small, Tile } from "@/components/design";
import { LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Notice, PillButton, T } from "@/components/ui";
import { fetchBundles, type SellerBundle } from "@/lib/bundles";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, surfaceCard } from "@/theme";

// Bundles ("Buy together", shared/bundles.ts), opened from Products: the shop's bundles with what's inside, the
// price and how many can sell with the items' stock now. "Make a bundle" at the bottom; tap one to change it.

function stockLine(bundle: SellerBundle, t: ReturnType<typeof useT<["bundles"]>>) {
  if (bundle.items.some((item) => item.missing)) return t("row.missing");
  if (bundle.available === null) return t("row.unlimited");
  return bundle.available <= 0 ? t("row.soldOut") : t("row.canSell", { count: bundle.available });
}

export default function Bundles() {
  const t = useT("bundles");
  const data = useLoad(fetchBundles);
  const bundles = data.data?.bundles ?? null;

  return (
    <Screen
      title={t("title")}
      sub={t("sub")}
      fallback="/products"
      refreshing={data.refreshing}
      onRefresh={() => void data.refresh()}
      footer={<PillButton testID="bundles-make" tone="accent" icon="plus" title={t("make")} accessibilityLabel={t("make")} onPress={() => router.push("/bundles/edit")} />}
    >
      {data.error ? <Notice>{data.error}</Notice> : null}
      {!bundles && data.loading ? <LoadingBlock /> : null}
      {bundles && !bundles.length ? (
        <View style={{ ...surfaceCard(), padding: 20, gap: 8 }}>
          <T weight="bold" style={{ fontSize: 16 }}>{t("empty")}</T>
          <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("emptySub")}</T>
        </View>
      ) : null}
      {bundles?.length ? (
        <List>
          {bundles.map((bundle) => (
            <Row
              key={bundle.id}
              testID={`bundle-${bundle.id}`}
              title={bundle.name}
              sub={`${naira(bundle.price)} · ${t("row.items", { count: bundle.items.length })} · ${stockLine(bundle, t)}`}
              lead={bundle.image ? <Image source={{ uri: bundle.image }} style={{ width: 44, height: 44, borderRadius: 12 }} contentFit="cover" /> : <Tile icon="box" tone="peach" />}
              right={<Pill label={bundle.status === "published" ? t("status.live") : t("status.draft")} tone={bundle.status === "published" ? "ok" : "gray"} />}
              onPress={() => router.push({ pathname: "/bundles/edit", params: { id: bundle.id } })}
              accessibilityLabel={bundle.name}
              chevron
            />
          ))}
        </List>
      ) : null}
      {bundles?.length ? <Small>{t("sub")}</Small> : null}
    </Screen>
  );
}
