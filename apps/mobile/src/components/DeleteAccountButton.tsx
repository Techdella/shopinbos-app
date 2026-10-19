import { useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { LinkButton } from "@/components/ui";
import { requestAccountDeletion } from "@/lib/account";
import { signOutNow } from "@/lib/auth";
import { tNow } from "@/lib/app-locale";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// "Delete my account" under Log out, for every role (both app stores require it in the app). Asks first, sends the
// request (the shop closes now; the team deletes the account within 30 days), says so, then logs out everywhere.
export function DeleteAccountButton() {
  const t = useT("m_ui", "common");
  const [busy, setBusy] = useState(false);

  function ask() {
    const tc = tNow("m_ui", "common");
    Alert.alert(tc("account.deleteTitle"), tc("account.deleteBody"), [
      { text: tc("cancel"), style: "cancel" },
      { text: tc("account.deleteConfirm"), style: "destructive", onPress: () => void send() },
    ]);
  }

  async function send() {
    setBusy(true);
    try {
      await requestAccountDeletion();
    } catch (error) {
      setBusy(false);
      Alert.alert(t("account.delete"), error instanceof Error ? error.message : t("error.server"));
      return;
    }
    Alert.alert(t("account.deletedTitle"), t("account.deletedBody"), [
      {
        text: t("ok"),
        onPress: () => void signOutNow("global").finally(() => router.replace("/welcome")),
      },
    ], { cancelable: false });
  }

  return <LinkButton title={t("account.delete")} color={colors.inkSoft} onPress={() => !busy && ask()} />;
}
