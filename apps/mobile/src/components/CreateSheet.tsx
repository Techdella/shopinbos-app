import { Alert } from "react-native";
import { router } from "expo-router";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { shareShop } from "@/lib/share";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// The big orange "+" in the tab bar (build spec 8A): the four things a seller does most (m_home "create.*").
export const CREATE_ACTIONS = ["create.addProduct", "create.recordSale", "create.customers", "create.share"] as const;

export function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT("m_home");
  function go(path: "/add-products" | "/record-sale" | "/marketing") {
    onClose();
    router.push(path);
  }

  async function share() {
    onClose();
    if ((await shareShop().catch(() => "no-link" as const)) === "no-link") {
      Alert.alert(t("create.noLinkTitle"), t("create.noLinkBody"), [
        { text: t("create.notNow"), style: "cancel" },
        { text: t("create.startHere"), onPress: () => router.push("/start") },
      ]);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t("create.title")} testID="create-sheet">
      <ChoiceRow testID="create-add-product" icon="camera" tint={colors.peach} iconColor={colors.accentInk} title={t(CREATE_ACTIONS[0])} sub={t("create.addProductSub")} onPress={() => go("/add-products")} />
      <ChoiceRow testID="create-record-sale" icon="receipt" tint={colors.successTint} iconColor={colors.success} title={t(CREATE_ACTIONS[1])} sub={t("create.recordSaleSub")} onPress={() => go("/record-sale")} />
      <ChoiceRow testID="create-customers" icon="megaphone" tint={colors.mintTint} iconColor={colors.forest} title={t(CREATE_ACTIONS[2])} sub={t("create.customersSub")} onPress={() => go("/marketing")} />
      <ChoiceRow testID="create-share" icon="share" tint={colors.lilac} title={t(CREATE_ACTIONS[3])} sub={t("create.shareSub")} onPress={() => void share()} />
    </Sheet>
  );
}
