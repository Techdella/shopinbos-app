import { Alert } from "react-native";
import { router } from "expo-router";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { shareShop } from "@/lib/share";
import { colors } from "@/theme";

// The big orange "+" in the tab bar (build spec 8A): the four things a seller does most.
export const CREATE_ACTIONS = ["Add a product", "Record a sale", "Get more customers", "Share my shop"] as const;

export function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  function go(path: "/add-products" | "/record-sale" | "/marketing") {
    onClose();
    router.push(path);
  }

  async function share() {
    onClose();
    if ((await shareShop().catch(() => "no-link" as const)) === "no-link") {
      Alert.alert("Your shop link isn't ready yet", "Finish setting up your shop first. Start here shows what's left.", [
        { text: "Not now", style: "cancel" },
        { text: "Start here", onPress: () => router.push("/start") },
      ]);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="What do you want to do?" testID="create-sheet">
      <ChoiceRow testID="create-add-product" icon="camera" tint={colors.peach} iconColor={colors.accentInk} title={CREATE_ACTIONS[0]} sub="Take a photo. Rex does the rest." onPress={() => go("/add-products")} />
      <ChoiceRow testID="create-record-sale" icon="receipt" tint={colors.successTint} iconColor={colors.success} title={CREATE_ACTIONS[1]} sub="Someone bought from you in person or on chat" onPress={() => go("/record-sale")} />
      <ChoiceRow testID="create-customers" icon="megaphone" tint={colors.mintTint} iconColor={colors.forest} title={CREATE_ACTIONS[2]} sub="Show your products to more people" onPress={() => go("/marketing")} />
      <ChoiceRow testID="create-share" icon="share" tint={colors.lilac} title={CREATE_ACTIONS[3]} sub="Send your link on WhatsApp or Status" onPress={() => void share()} />
    </Sheet>
  );
}
