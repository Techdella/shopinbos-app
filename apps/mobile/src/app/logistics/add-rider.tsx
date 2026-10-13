import { useState } from "react";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import { AppIcon } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { Field, Label, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { addRider } from "@/lib/logistics";
import { colors, radii } from "@/theme";

// Add a rider (spec 8A): only a name and a WhatsApp number. We make their private Riders app link and open
// WhatsApp with the invite ready to send.

export default function AddRider() {
  const t = useT("m_partner", "common");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ name: string; inviteUrl: string } | null>(null);

  async function send() {
    setError(null);
    if (name.trim().length < 2) return setError(t("addRider.needName"));
    if (whatsapp.replace(/\D/g, "").length < 7) return setError(t("addRider.needPhone"));
    setBusy(true);
    try {
      const result = await addRider({ name: name.trim(), whatsapp: whatsapp.trim() });
      setInvite({ name: result.name, inviteUrl: result.inviteUrl });
      void Linking.openURL(result.inviteUrl);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("error.retry"));
    } finally {
      setBusy(false);
    }
  }

  if (invite) {
    return (
      <Screen title={t("addRider.ready")} footer={<PillButton title={t("done")} onPress={() => router.back()} />}>
        <View style={{ backgroundColor: colors.successTint, borderRadius: radii.card, padding: 18, gap: 8 }}>
          <AppIcon name="check" size={28} color={colors.success} />
          <T weight="extrabold" style={{ fontSize: 20 }}>{t("addRider.onTeam", { name: invite.name })}</T>
          <T style={{ fontSize: 15, lineHeight: 22 }}>{t("addRider.sendIt")}</T>
        </View>
        <PillButton tone="white" size="md" onPress={() => void Linking.openURL(invite.inviteUrl)}>
          <AppIcon name="chat" size={18} />
          <T weight="bold" style={{ fontSize: 15 }}>{t("addRider.openAgain")}</T>
        </PillButton>
      </Screen>
    );
  }

  return (
    <Screen title={t("riders.add")} sub={t("addRider.sub")} footer={<PillButton title={t("addRider.send")} busy={busy} onPress={() => void send()} />}>
      <View>
        <Label>{t("addRider.name")}</Label>
        <Field value={name} onChangeText={setName} placeholder="Musa Bello" autoCapitalize="words" autoComplete="name" accessibilityLabel={t("addRider.name")} />
      </View>
      <View>
        <Label>{t("addRider.phone")}</Label>
        <Field value={whatsapp} onChangeText={setWhatsapp} placeholder="0803 123 4567" keyboardType="phone-pad" textContentType="telephoneNumber" accessibilityLabel={t("addRider.phone")} />
      </View>
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}
