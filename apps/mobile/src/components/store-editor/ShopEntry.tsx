import { useCallback, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { TILE, type TileTone } from "@/components/design";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Picture } from "@/components/kit";
import { IconButton } from "@/components/seller/bits";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { openShop } from "@/lib/share";
import { fetchScheduledPublish, shownHost, type ScheduledPublish } from "@/lib/store-editor";
import { colors, fonts, radii, surfaceCard } from "@/theme";
import { canvasBackground } from "./parts";
import { useScheduleWords } from "./rex-publish";
import { StorePreview } from "./StorePreview";

// The Shop tab's store area (design SE-01): the shop's logo, name and address; a big preview of the real shop with
// "Edit shop" (orange, opens the editor, app/store-editor.tsx) and "View"; then Colours and fonts, Pages and Web
// address, each one tap from what they change.

export function ShopEntry({
  store,
  live,
  logoUrl,
  onShare,
  below,
}: {
  store: { name: string; url: string | null };
  /** Customers can see the shop (null while unknown). */
  live: boolean | null;
  logoUrl: string | null;
  onShare: () => void;
  /** Under the buttons: "Put my shop live" while it isn't. */
  below?: ReactNode;
}) {
  const t = useT("storeEditor", "m_shop");
  // The preview reloads when the tab comes back into view (after publishing, the new look shows).
  const [stamp, setStamp] = useState(() => Date.now());
  // A publish set for later in the editor (SE-13): "Scheduled for Sat 9:00" on the card.
  const [scheduled, setScheduled] = useState<ScheduledPublish | null>(null);
  const scheduleWords = useScheduleWords();
  useFocusEffect(useCallback(() => {
    setStamp(Date.now());
    let gone = false;
    fetchScheduledPublish().then((next) => !gone && setScheduled(next), () => undefined);
    return () => {
      gone = true;
    };
  }, []));
  const host = shownHost(store.url);
  const edit = () => router.push("/store-editor" as never);

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Picture uri={logoUrl} name={store.name} size={46} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T numberOfLines={1} style={{ fontFamily: fonts.displayBold, fontSize: 22, letterSpacing: -0.4 }}>{store.name}</T>
          <T numberOfLines={1} style={{ fontSize: 13, color: colors.inkSoft }}>{host || t("linkLater")}</T>
        </View>
        {store.url ? <IconButton testID="shop-link-qr" icon="link" label={t("entry.link")} onPress={() => router.push("/shop-link")} /> : null}
        {store.url ? <IconButton testID="share-shop" icon="share" label={t("entry.share")} onPress={onShare} /> : null}
      </View>

      <View style={{ ...surfaceCard(22), padding: 12 }}>
        <Pressable testID="shop-preview" accessibilityRole="button" accessibilityLabel={`${t("entry.preview")}. ${t("entry.edit")}`} onPress={edit} style={{ height: 280, overflow: "hidden", borderRadius: 16, backgroundColor: canvasBackground(), paddingTop: 10, paddingHorizontal: 10 }}>
          {store.url && live ? (
            <StorePreview url={`${store.url}${store.url.includes("?") ? "&" : "?"}v=${stamp.toString(36)}`} accessibilityLabel={t("entry.preview")} style={{ flex: 1, borderTopLeftRadius: 14, borderTopRightRadius: 14 }} />
          ) : (
            <View style={{ flex: 1, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 10, padding: 20 }}>
              <Picture uri={logoUrl} name={store.name} size={56} />
              <T weight="extrabold" style={{ fontSize: 17, textAlign: "center" }}>{store.name}</T>
              <T style={{ fontSize: 13.5, color: colors.inkSoft, textAlign: "center" }}>{t("entry.notLiveBody")}</T>
            </View>
          )}
        </Pressable>
        {live !== null ? (
          <View style={{ position: "absolute", top: 24, right: 24, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: live ? colors.successTint : colors.peach }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: live ? colors.success : colors.accentInk }} />
            <T weight="bold" style={{ fontSize: 12, color: live ? colors.success : colors.accentInk }}>{live ? t("entry.live") : t("entry.notLive")}</T>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable testID="shop-edit-open" accessibilityRole="button" onPress={edit} style={({ pressed }) => ({ flex: 1.4, minHeight: 54, borderRadius: radii.pill, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: pressed ? 0.85 : 1 })}>
            <AppIcon name="palette" size={20} color={colors.onAccent} strokeWidth={2} />
            <T weight="bold" numberOfLines={1} style={{ fontSize: 16, color: colors.onAccent }}>{t("entry.edit")}</T>
          </Pressable>
          <Pressable
            testID="menu-see-store"
            accessibilityRole="link"
            accessibilityLabel={`${store.name}. ${t("entry.view")}`}
            disabled={!store.url}
            onPress={() => (store.url ? void openShop(store.url) : undefined)}
            style={({ pressed }) => ({ flex: 1, minHeight: 54, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: !store.url ? 0.5 : pressed ? 0.85 : 1 })}
          >
            <AppIcon name="eye" size={20} color={colors.ink} strokeWidth={2} />
            <T weight="bold" numberOfLines={1} style={{ fontSize: 16 }}>{t("entry.view")}</T>
          </Pressable>
        </View>
        {scheduled ? (
          <Pressable testID="shop-scheduled" accessibilityRole="button" onPress={edit} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, borderRadius: radii.pill, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.warnTint }}>
            <AppIcon name="clock" size={15} color={colors.warnInk} />
            <T weight="bold" numberOfLines={1} style={{ fontSize: 13, color: colors.warnInk }}>{t("schedule.badge", { when: scheduleWords(scheduled.runAt) })}</T>
          </Pressable>
        ) : null}
        <T style={{ fontSize: 12.5, lineHeight: 18, color: colors.inkSoft, textAlign: "center", marginTop: 10, marginBottom: 2 }}>{t("entry.hint")}</T>
        {below}
      </View>

      <View style={{ ...surfaceCard(22), paddingVertical: 4, paddingHorizontal: 14 }}>
        <EntryRow testID="shop-colours" icon="palette" tone="lilac" label={t("entry.colours")} onPress={() => router.push({ pathname: "/store-editor", params: { sheet: "theme" } } as never)} first />
        <EntryRow testID="shop-pages" icon="doc" tone="mint" label={t("entry.pages")} onPress={() => router.push({ pathname: "/store-editor", params: { sheet: "pages" } } as never)} />
        <EntryRow testID="shop-address" icon="link" tone="butter" label={t("entry.address")} onPress={() => router.push("/domain")} />
      </View>
    </View>
  );
}

function EntryRow({ icon, tone, label, onPress, first, testID }: { icon: AppIconName; tone: TileTone; label: string; onPress: () => void; first?: boolean; testID?: string }) {
  const { bg, fg } = TILE[tone];
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4, minHeight: 60, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name={icon} size={20} color={fg} strokeWidth={2} />
      </View>
      <T weight="bold" style={{ flex: 1, fontSize: 14.5 }}>{label}</T>
      <AppIcon name="chevron" size={18} color={colors.inkFaint} />
    </Pressable>
  );
}
