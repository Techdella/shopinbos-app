import type { ReactNode } from "react";
import { FlatList, Pressable, RefreshControl, View, type FlatListProps } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { naira } from "@shared/onboarding";
import { ScreenHeader } from "@/components/Screen";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { PromoCarousel, type PromoSlide } from "@/components/visual";
import type { StarterPack } from "@/lib/quick-add";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// Pieces shared by Find products, Starter packs and My supplier products: a pushed screen whose body is one
// virtualised list (only the rows on screen are drawn, so 300 products scroll smoothly), the round tick used in
// "Select" mode, and the starter-pack cards.

/** A pushed screen like Screen, but the body is a FlatList; `header` scrolls with it, `footer` stays pinned. */
export function ListScreen<I>({ title, headerRight, footer, refreshing, onRefresh, ...list }: { title: string; headerRight?: ReactNode; footer?: ReactNode; refreshing?: boolean; onRefresh?: () => void } & Omit<FlatListProps<I>, "refreshControl">) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScreenHeader title={title} right={headerRight} />
      <FlatList
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 12 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        {...list}
      />
      {footer ? <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10, gap: 10, backgroundColor: colors.canvas }}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** The round tick on a card in Select mode. */
export function Tick({ on, size = 28 }: { on: boolean; size?: number }) {
  return (
    // A white ring both ways, so the tick shows on a dark photo too.
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: on ? colors.inkFill : "rgba(22,20,31,0.28)", alignItems: "center", justifyContent: "center" }}>
      {on ? <AppIcon name="check" size={size * 0.55} color="#FFFFFF" strokeWidth={3} /> : null}
    </View>
  );
}

/** One starter pack as a card: icon, "Ankara starter – 25 products", four photos and what one of each costs. */
export function PackCard({ pack, width = 248, onPress }: { pack: StarterPack; width?: number | "100%"; onPress?: () => void }) {
  const t = useT("m_find");
  const photos = pack.items.filter((item) => item.image).slice(0, 4);
  return (
    <Pressable
      testID={`pack-${pack.id}`}
      accessibilityRole="button"
      accessibilityLabel={t("packs.cardLabel", { name: t.dynamic(`pack.${pack.id}`, pack.title), count: pack.count })}
      onPress={onPress ?? (() => router.push({ pathname: "/find/packs", params: { id: pack.id } }))}
      style={({ pressed }) => ({ width, backgroundColor: colors.surface, borderRadius: 20, padding: 12, gap: 10, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ flexDirection: "row", gap: 4, height: 54 }}>
        {photos.map((item) => <Image key={item.id} source={{ uri: item.image! }} style={{ flex: 1, height: 54, borderRadius: 10, backgroundColor: colors.lilac }} contentFit="cover" />)}
        {photos.length < 4 ? Array.from({ length: 4 - photos.length }, (_, i) => <View key={i} style={{ flex: 1, height: 54, borderRadius: 10, backgroundColor: colors.lilac }} />) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name={pack.icon} size={16} color={colors.accentInk} />
        </View>
        <T weight="extrabold" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>{t("packs.title", { name: t.dynamic(`pack.${pack.id}`, pack.title), count: pack.count })}</T>
      </View>
      <T style={{ color: colors.inkSoft, fontSize: 13 }} numberOfLines={1}>{t("packs.cardSub", { cost: naira(pack.totalCost), price: naira(pack.totalPrice) })}</T>
    </Pressable>
  );
}

/** Starter packs in a sideways row (Find products' top). */
export function PackStrip({ packs, onAll }: { packs: StarterPack[]; onAll: () => void }) {
  const t = useT("m_find");
  if (!packs.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <T style={{ fontFamily: fonts.display, fontSize: 19 }} accessibilityRole="header">{t("packs.heading")}</T>
        <Pressable accessibilityRole="button" onPress={onAll} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
          <T weight="bold" style={{ color: colors.accentInk, fontSize: 14.5 }}>{t("packs.seeAll")}</T>
        </Pressable>
      </View>
      {/* One promo banner per pack that swipes sideways, with dots under them. */}
      <PromoCarousel
        testID="pack-carousel"
        label={t("packs.heading")}
        slides={packs.map((pack, index): PromoSlide => {
          const name = t.dynamic(`pack.${pack.id}`, pack.title);
          return {
            key: pack.id,
            title: t("packs.title", { name, count: pack.count }),
            body: t("packs.cardSub", { cost: naira(pack.totalCost), price: naira(pack.totalPrice) }),
            cta: t("packs.see"),
            tone: PACK_TONES[index % PACK_TONES.length],
            art: <PackPhotos pack={pack} />,
            onPress: () => router.push({ pathname: "/find/packs", params: { id: pack.id } }),
          };
        })}
      />
    </View>
  );
}

const PACK_TONES = ["ink", "forest", "mint", "peach"] as const;

/** Four of the pack's photos in a rounded 2×2 square (blank tiles when it has fewer). */
function PackPhotos({ pack }: { pack: StarterPack }) {
  const photos = pack.items.filter((item) => item.image).slice(0, 4);
  return (
    <View style={{ width: 84, height: 84, flexDirection: "row", flexWrap: "wrap", gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 4 }, (_, index) => {
        const photo = photos[index];
        return photo ? <Image key={photo.id} source={{ uri: photo.image! }} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.lilac }} contentFit="cover" /> : <View key={`blank-${index}`} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)" }} />;
      })}
    </View>
  );
}

