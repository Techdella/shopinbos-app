import { ScrollView, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { List, Row, Small, Tile } from "@/components/design";
import { Sheet } from "@/components/Sheet";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// The big orange "+" in the tab bar ("Familiar app" prototype `sh.create`, A-Seller-Create): Make a post or reel with
// Rex first, a 15-second video with Rex, then the three things a seller does most (m_home "create.*"), then "More
// ways to sell" (canvas board A-Seller-Create): post to Status, an ad, an email Rex writes, an automation, a pop-up,
// a sale with a countdown (seasonal campaigns) and pre-orders, and the board's line that everything works on the
// phone and on shopinbos.com too. Getting more customers is in the Menu (Grow) and sharing the shop is on the Menu.
export const CREATE_ACTIONS = ["create.addProduct", "create.recordSale", "create.payLink"] as const;

type CreatePath =
  | "/create"
  | "/video"
  | "/add-products"
  | "/bulk-add"
  | "/record-sale"
  | "/payment-links/new"
  | "/status/new"
  | "/ads/new"
  | "/marketing/email/new"
  | "/marketing/automations"
  | "/marketing/popup/new"
  | "/campaigns/new"
  | "/preorders";

export function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT("m_home");
  const { height } = useWindowDimensions();
  const tBulk = useT("bulkAdd");
  function go(path: CreatePath) {
    onClose();
    router.push(path as never);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t("create.title")} testID="create-sheet">
      <ScrollView style={{ maxHeight: height * 0.72 }} showsVerticalScrollIndicator={false}>
        <List>
          <Row testID="create-post" lead={<Tile icon="sparkle" tone="lime" />} title={t("create.post")} sub={t("create.postSub")} onPress={() => go("/create")} />
          <Row testID="create-video" lead={<Tile icon="play" tone="ink" />} title={t("create.video")} sub={t("create.videoSub")} onPress={() => go("/video")} />
          <Row testID="create-add-product" lead={<Tile icon="camera" tone="peach" />} title={t(CREATE_ACTIONS[0])} sub={t("create.addProductSub")} onPress={() => go("/add-products")} />
          <Row testID="create-bulk-add" lead={<Tile icon="sparkle" tone="lilac" />} title={tBulk("entry.title")} sub={tBulk("entry.sub")} onPress={() => go("/bulk-add")} />
          <Row testID="create-record-sale" lead={<Tile icon="coin" tone="ok" />} title={t(CREATE_ACTIONS[1])} sub={t("create.recordSaleSub")} onPress={() => go("/record-sale")} />
          <Row testID="create-pay-link" lead={<Tile icon="link" tone="mint" />} title={t(CREATE_ACTIONS[2])} sub={t("create.payLinkSub")} onPress={() => go("/payment-links/new")} />
        </List>
        <T weight="bold" style={{ fontSize: 13, color: colors.inkSoft, marginTop: 16, marginBottom: 8 }}>{t("create.more")}</T>
        <List>
          <Row testID="create-status" lead={<Tile icon="image" tone="lime" />} title={t("create.status")} sub={t("create.statusSub")} onPress={() => go("/status/new")} />
          <Row testID="create-ad" lead={<Tile icon="megaphone" tone="blue" />} title={t("create.ad")} sub={t("create.adSub")} onPress={() => go("/ads/new")} />
          <Row testID="create-email" lead={<Tile icon="mail" tone="butter" />} title={t("create.email")} sub={t("create.emailSub")} onPress={() => go("/marketing/email/new")} />
          <Row testID="create-automation" lead={<Tile icon="zap" tone="lilac" />} title={t("create.automation")} sub={t("create.automationSub")} onPress={() => go("/marketing/automations")} />
          <Row testID="create-popup" lead={<Tile icon="popup" tone="peach" />} title={t("create.popup")} sub={t("create.popupSub")} onPress={() => go("/marketing/popup/new")} />
          <Row testID="create-sale" lead={<Tile icon="clock" tone="warn" />} title={t("create.sale")} sub={t("create.saleSub")} onPress={() => go("/campaigns/new")} />
          <Row testID="create-preorders" lead={<Tile icon="bag" tone="lilac" />} title={t("create.preorders")} sub={t("create.preordersSub")} onPress={() => go("/preorders")} />
        </List>
        <Small style={{ marginTop: 12, textAlign: "center" }}>{t("create.web")}</Small>
      </ScrollView>
    </Sheet>
  );
}
