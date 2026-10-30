import { View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { List, Row, Tile, type TileTone } from "@/components/design";
import { Mascot, T } from "@/components/ui";
import type { AppIconName } from "@/components/icons";
import { openWeb } from "@/lib/web";
import { WebBadge } from "@/components/WebBadge";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Rex Studio (web /studio): everything Rex makes, in one place, instead of "Rex videos" on its own. Pictures and
// posts, flyers, videos, packaging and labels, banners for the shop, and the logo maker (on the web), plus a chat
// with Rex for anything else.

type Item = { id: "pictures" | "flyers" | "videos" | "packaging" | "banners"; icon: AppIconName; tone: TileTone; go: () => void };

const ITEMS: Item[] = [
  { id: "pictures", icon: "image", tone: "peach", go: () => router.push({ pathname: "/create", params: { format: "post" } }) },
  { id: "flyers", icon: "doc", tone: "butter", go: () => router.push({ pathname: "/create", params: { format: "flyer" } }) },
  { id: "videos", icon: "play", tone: "ink", go: () => router.push("/video") },
  { id: "packaging", icon: "box", tone: "lime", go: () => router.push("/packaging") },
  { id: "banners", icon: "store", tone: "lilac", go: () => router.push("/shop-edit") },
];

export default function Studio() {
  const t = useT("m_grow");
  return (
    <Screen title={t("studio.title")} sub={t("studio.sub")}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.mintTint, borderRadius: 24, padding: 14 }}>
        <Mascot who="rex" mood="wave" size={56} label="" />
        <T style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>{t("studio.intro")}</T>
      </View>
      <List>
        {ITEMS.map((item) => (
          <Row key={item.id} testID={`studio-${item.id}`} lead={<Tile icon={item.icon} tone={item.tone} />} title={t(`studio.${item.id}`)} sub={t(`studio.${item.id}Sub`)} onPress={item.go} chevron />
        ))}
        <Row testID="studio-logo" lead={<Tile icon="sparkle" tone="mint" />} title={t("studio.logo")} sub={t("studio.logoSub")} right={<WebBadge />} onPress={() => void openWeb("/studio/logo")} />
      </List>
      <List>
        <Row testID="studio-chat" lead={<Tile icon="chat" tone="sky" />} title={t("studio.chat")} sub={t("studio.chatSub")} onPress={() => router.push("/rex")} chevron />
      </List>
    </Screen>
  );
}
