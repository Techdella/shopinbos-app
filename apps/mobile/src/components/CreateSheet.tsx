import { router } from "expo-router";
import { List, Row, Tile } from "@/components/design";
import { Sheet } from "@/components/Sheet";
import { useT } from "@/lib/i18n";

// The big orange "+" in the tab bar ("Familiar app" prototype `sh.create`): Make a post or reel with Rex first, then
// the three things a seller does most (m_home "create.*"). Getting more customers is in My shop (Sell) and sharing
// the shop is on Home and My shop.
export const CREATE_ACTIONS = ["create.addProduct", "create.recordSale", "create.payLink"] as const;

export function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT("m_home");
  function go(path: "/create" | "/add-products" | "/record-sale" | "/payment-links/new") {
    onClose();
    router.push(path as never);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t("create.title")} testID="create-sheet">
      <List>
        <Row testID="create-post" lead={<Tile icon="sparkle" tone="lime" />} title={t("create.post")} sub={t("create.postSub")} onPress={() => go("/create")} />
        <Row testID="create-add-product" lead={<Tile icon="camera" tone="peach" />} title={t(CREATE_ACTIONS[0])} sub={t("create.addProductSub")} onPress={() => go("/add-products")} />
        <Row testID="create-record-sale" lead={<Tile icon="coin" tone="ok" />} title={t(CREATE_ACTIONS[1])} sub={t("create.recordSaleSub")} onPress={() => go("/record-sale")} />
        <Row testID="create-pay-link" lead={<Tile icon="link" tone="mint" />} title={t(CREATE_ACTIONS[2])} sub={t("create.payLinkSub")} onPress={() => go("/payment-links/new")} />
      </List>
    </Sheet>
  );
}
