import { View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { List, Row, Tile, type TileTone } from "@/components/design";
import { Mascot, T } from "@/components/ui";
import type { AppIconName } from "@/components/icons";
import { openWeb } from "@/lib/web";
import { WebBadge } from "@/components/WebBadge";
import { useT } from "@/lib/i18n";
import { useRole } from "@/lib/role";
import { colors } from "@/theme";

// Rex Studio (web /studio): everything Rex makes, in one place, instead of "Rex videos" on its own. Pictures and
// posts, flyers, videos, packaging and labels, banners for the shop, and the logo maker (on the web), plus a chat
// with Rex for anything else. Delivery partners open the same screen at /logistics/studio with what Rex makes for
// them (pictures and posts, flyers, status posts through Create with Rex, and videos: their VideoProject's owner is
// their LogisticsPartner, see shared/video-owner.ts). Packaging, banners, the logo and the chat work on a shop, so
// they stay seller-only.

type Item = { id: "pictures" | "flyers" | "status" | "videos" | "packaging" | "banners"; icon: AppIconName; tone: TileTone; go: () => void; partnerSub?: "studio.picturesSubPartner" | "studio.flyersSubPartner" | "studio.statusSubPartner" | "studio.videosSubPartner" };

const ITEMS: Item[] = [
  { id: "pictures", icon: "image", tone: "peach", go: () => router.push({ pathname: "/create", params: { format: "post" } }) },
  { id: "flyers", icon: "doc", tone: "butter", go: () => router.push({ pathname: "/create", params: { format: "flyer" } }) },
  { id: "videos", icon: "play", tone: "ink", go: () => router.push("/video") },
  { id: "packaging", icon: "box", tone: "lime", go: () => router.push("/packaging") },
  { id: "banners", icon: "store", tone: "lilac", go: () => router.push("/shop-edit") },
];

const PARTNER_ITEMS: Item[] = [
  { id: "pictures", icon: "image", tone: "peach", go: () => router.push({ pathname: "/create", params: { format: "post" } }), partnerSub: "studio.picturesSubPartner" },
  { id: "flyers", icon: "doc", tone: "butter", go: () => router.push({ pathname: "/create", params: { format: "flyer" } }), partnerSub: "studio.flyersSubPartner" },
  { id: "status", icon: "megaphone", tone: "lilac", go: () => router.push({ pathname: "/create", params: { format: "status" } }), partnerSub: "studio.statusSubPartner" },
  { id: "videos", icon: "play", tone: "ink", go: () => router.push("/video"), partnerSub: "studio.videosSubPartner" },
];

export default function Studio() {
  const t = useT("m_grow");
  const { role } = useRole();
  const partner = role === "logistics_partner";
  const items = partner ? PARTNER_ITEMS : ITEMS;
  return (
    <Screen title={t("studio.title")} sub={partner ? t("studio.partnerSub") : t("studio.sub")}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.mintTint, borderRadius: 24, padding: 14 }}>
        <Mascot who="rex" mood="wave" size={56} label="" />
        <T style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>{partner ? t("studio.partnerIntro") : t("studio.intro")}</T>
      </View>
      <List>
        {items.map((item) => (
          <Row key={item.id} testID={`studio-${item.id}`} lead={<Tile icon={item.icon} tone={item.tone} />} title={t(`studio.${item.id}`)} sub={item.partnerSub ? t(item.partnerSub) : t.dynamic(`studio.${item.id}Sub`)} onPress={item.go} chevron />
        ))}
        {partner ? null : <Row testID="studio-logo" lead={<Tile icon="sparkle" tone="mint" />} title={t("studio.logo")} sub={t("studio.logoSub")} right={<WebBadge />} onPress={() => void openWeb("/studio/logo")} />}
      </List>
      {partner ? (
        <List>
          <Row testID="studio-posts" lead={<Tile icon="clock" tone="sky" />} title={t("studio.posts")} sub={t("studio.postsSub")} onPress={() => router.push("/posts")} chevron />
        </List>
      ) : (
        <List>
          <Row testID="studio-chat" lead={<Tile icon="chat" tone="sky" />} title={t("studio.chat")} sub={t("studio.chatSub")} onPress={() => router.push("/rex")} chevron />
        </List>
      )}
    </Screen>
  );
}
