import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { markupLabel } from "@shared/supplier-markup";
import { Badge, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { ListScreen, PackCard } from "@/components/seller/FindKit";
import { useQuickAdd } from "@/components/seller/QuickAdd";
import { Card, InfoTip, LinkButton, PillButton, T } from "@/components/ui";
import { fetchPacks, type PackItem, type StarterPack } from "@/lib/quick-add";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// Starter packs (shared/starter-packs.ts, worked out on the server from the supplier products near the seller:
// top-rated, in stock, verified suppliers, not already in the shop). Without ?id: every pack as a card. With ?id: the
// pack's preview — each product with what you pay and the price it goes in at (the supplier's suggested price, else
// your markup), the totals, which suppliers need the Dropship agreement first — and "Add all 25 to my shop", one tap
// (components/seller/QuickAdd.tsx: progress, then what went in and why the rest didn't). Opened from Find products'
// top and from the seller sign-up's "Do you have products ready?" step.

function ItemRow({ item }: { item: PackItem }) {
  const t = useT("m_find");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 10 }}>
      {item.image ? <Image source={{ uri: item.image }} style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.lilac }} contentFit="cover" recyclingKey={item.id} /> : <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.lilac }} />}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T weight="bold" numberOfLines={1} style={{ fontSize: 14.5 }}>{item.name}</T>
        <T numberOfLines={1} style={{ color: colors.inkSoft, fontSize: 12.5 }}>{item.supplierName}</T>
        {item.ready ? null : <T weight="semibold" style={{ color: colors.warnInk, fontSize: 12 }}>{t("packs.agreeFirst")}</T>}
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <T weight="extrabold" style={{ fontSize: 15 }}>{naira(item.price)}</T>
        <T style={{ color: colors.inkSoft, fontSize: 12 }}>{t("packs.youPay", { cost: naira(item.cost) })}</T>
      </View>
    </View>
  );
}

export default function StarterPacks() {
  const t = useT("m_find");
  const { id } = useLocalSearchParams<{ id?: string }>();
  const loaded = useLoad(() => fetchPacks());
  const quick = useQuickAdd({ onChange: () => void loaded.refresh() });
  const packs = loaded.data?.packs ?? [];
  const pack: StarterPack | null = id ? packs.find((entry) => entry.id === id) ?? null : null;
  const markup = quick.markup?.markup ?? loaded.data?.markup ?? null;

  const status = (
    <>
      {loaded.loading && !loaded.data ? <LoadingBlock label={t("packs.loading")} /> : null}
      {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
    </>
  );

  if (!id || (loaded.data && !pack)) {
    return (
      <ListScreen<StarterPack>
        title={t("packs.heading")}
        refreshing={loaded.refreshing}
        onRefresh={() => void loaded.refresh()}
        data={packs}
        keyExtractor={(entry) => entry.id}
        ListHeaderComponent={
          <View style={{ gap: 10, paddingBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <T style={{ flexShrink: 1, fontFamily: fonts.display, fontSize: 28, lineHeight: 32 }}>{t("packs.pageTitle")}</T>
              <InfoTip title={t("packs.pageTitle")} text={t("packs.pageSub")} size={20} />
            </View>
            {status}
            {loaded.data && !packs.length ? <EmptyState icon="box" title={t("packs.emptyTitle")}>{t("packs.emptyBody")}</EmptyState> : null}
          </View>
        }
        renderItem={({ item }) => <PackCard pack={item} width="100%" onPress={() => router.push({ pathname: "/find/packs", params: { id: item.id } })} />}
      />
    );
  }

  const name = pack ? t.dynamic(`pack.${pack.id}`, pack.title) : "";
  const footer = pack ? (
    <>
      {quick.toast}
      <PillButton testID="pack-add-all" tone="accent" icon="plus" title={t("packs.addAll", { count: pack.count })} onPress={() => quick.addMany(pack.items.map((item) => item.id))} />
    </>
  ) : undefined;

  return (
    <ListScreen<PackItem>
      title={t("packs.heading")}
      refreshing={loaded.refreshing}
      onRefresh={() => void loaded.refresh()}
      footer={footer}
      data={pack?.items ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={{ gap: 12, paddingBottom: 4 }}>
          {status}
          {pack ? (
            <>
              <T style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 32 }}>{t("packs.title", { name, count: pack.count })}</T>
              <Card style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T weight="extrabold" style={{ fontSize: 11, letterSpacing: 0.4, color: colors.inkSoft }}>{t("packs.totalCost")}</T>
                    <T style={{ fontFamily: fonts.display, fontSize: 20 }}>{naira(pack.totalCost)}</T>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T weight="extrabold" style={{ fontSize: 11, letterSpacing: 0.4, color: colors.inkSoft }}>{t("packs.totalPrice")}</T>
                    <T style={{ fontFamily: fonts.display, fontSize: 20, color: colors.success }}>{naira(pack.totalPrice)}</T>
                  </View>
                </View>
                <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("packs.totalNote")}</T>
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  {markup ? <Badge label={t("packs.markup", { markup: markupLabel(markup, naira) })} bg={colors.mintTint} fg={colors.forest} /> : null}
                  <LinkButton title={t("packs.changeMarkup")} onPress={() => router.push("/find/markup")} />
                </View>
              </Card>
              {pack.needsAgreement.length ? (
                <Card style={{ gap: 6, backgroundColor: colors.warnTint }}>
                  <T weight="bold" style={{ fontSize: 14.5, color: colors.warnInk }}>{t("packs.readyCount", { ready: pack.readyCount, count: pack.count })}</T>
                  <T style={{ fontSize: 13.5, lineHeight: 19, color: colors.warnInk }}>{t("packs.agreeWith", { names: pack.needsAgreement.map((entry) => entry.name).join(", ") })}</T>
                </Card>
              ) : null}
            </>
          ) : null}
          {quick.ui}
        </View>
      }
      renderItem={({ item }) => <ItemRow item={item} />}
    />
  );
}
