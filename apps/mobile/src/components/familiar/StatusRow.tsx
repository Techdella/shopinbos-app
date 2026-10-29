import { Alert, Pressable, ScrollView, View } from "react-native";
import { Picture } from "@/components/kit";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import type { StatusAuthor } from "@/lib/familiar";
import { useT } from "@/lib/i18n";
import { hideShopinbosStatus, seenHere, useShopinbosHere } from "@/lib/shopinbos";
import { colors } from "@/theme";
import { ShopinbosMark } from "./ShopinbosMark";

// The row of Status rings under the Home header ("Familiar app" prototype `.stories`): "Your status" first (a dashed
// ring with an orange +), then the businesses with live posts, unseen ones in orange, seen ones in grey.
// Shopinbos's own getting-started posts (author.official) show the brand logo; a long-press hides them for good.

const RING = 64;

function Ring({ seen, dashed, children }: { seen?: boolean; dashed?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ width: RING, height: RING, borderRadius: RING / 2, padding: 2.5, borderWidth: 2.5, borderStyle: dashed ? "dashed" : "solid", borderColor: dashed ? "#C9C5D4" : seen ? "#D3D0DB" : colors.accent, alignItems: "center", justifyContent: "center" }}>
      {children}
    </View>
  );
}

export function StatusRow({
  authors,
  myName,
  myPicture,
  hasMine,
  onNew,
  onOpenMine,
  onOpen,
  showMine = true,
  leading,
}: {
  authors: StatusAuthor[];
  myName: string;
  myPicture: string | null;
  /** You have a live status: tapping your ring shows it (the + still adds another). */
  hasMine?: boolean;
  onNew: () => void;
  onOpenMine?: () => void;
  onOpen: (index: number) => void;
  /** Leave out "Your status" (a row that only shows other businesses, like Discover's suppliers). */
  showMine?: boolean;
  /** Rings shown right after "Your status" (the Shopinbos team's weekly updates, TeamUpdatesRing). */
  leading?: React.ReactNode;
}) {
  const t = useT("m_familiar");
  const here = useShopinbosHere();

  function askHide() {
    Alert.alert(t("sib.hideTitle"), t("sib.hideBody"), [
      { text: t("sib.cancel"), style: "cancel" },
      { text: t("sib.hide"), style: "destructive", onPress: () => void hideShopinbosStatus() },
    ]);
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
      {showMine ? (
      <Pressable accessibilityRole="button" accessibilityLabel={hasMine ? t("status.yoursOpen") : t("status.add")} onPress={hasMine && onOpenMine ? onOpenMine : onNew} style={{ width: 68, alignItems: "center", gap: 6 }}>
        <View>
          <Ring dashed={!hasMine}>
            <Picture uri={myPicture} name={myName} size={RING - 13} />
          </Ring>
          <Pressable accessibilityRole="button" accessibilityLabel={t("status.add")} onPress={onNew} hitSlop={6} style={{ position: "absolute", right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="plus" size={13} color={colors.onAccent} strokeWidth={3} />
          </Pressable>
        </View>
        <T weight="semibold" numberOfLines={1} style={{ fontSize: 12, color: colors.inkSoft }}>{t("status.yours")}</T>
      </Pressable>
      ) : null}
      {/* Shopinbos's own ring first (the feed puts it first), then the team's weekly updates, then businesses. */}
      {here.hidden
        ? null
        : authors.map((author, index) =>
            author.official ? (
              <Pressable
                key={author.userId}
                testID="shopinbos-ring"
                accessibilityRole="button"
                accessibilityLabel={t("status.openOf", { name: author.name })}
                accessibilityHint={t("sib.hold")}
                onPress={() => onOpen(index)}
                onLongPress={askHide}
                style={{ width: 68, alignItems: "center", gap: 6 }}
              >
                <Ring seen={author.seen || author.posts.every(seenHere)}>
                  <ShopinbosMark size={RING - 13} />
                </Ring>
                <T weight="semibold" numberOfLines={1} style={{ fontSize: 12, color: colors.inkSoft, maxWidth: 68 }}>{author.name}</T>
              </Pressable>
            ) : null,
          )}
      {leading}
      {authors.map((author, index) =>
        author.official ? null : (
          <Pressable key={author.userId} accessibilityRole="button" accessibilityLabel={t("status.openOf", { name: author.name })} onPress={() => onOpen(index)} style={{ width: 68, alignItems: "center", gap: 6 }}>
            <Ring seen={author.seen}>
              <Picture uri={author.logoUrl} name={author.name} size={RING - 13} />
            </Ring>
            <T weight="semibold" numberOfLines={1} style={{ fontSize: 12, color: colors.inkSoft, maxWidth: 68 }}>{author.name}</T>
          </Pressable>
        ),
      )}
    </ScrollView>
  );
}
