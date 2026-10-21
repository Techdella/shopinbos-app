import { useState } from "react";
import { Linking } from "react-native";
import { router } from "expo-router";
import { AppIcon } from "@/components/icons";
import { DoneScreen, LabeledInput } from "@/components/PartnerKit";
import { Screen } from "@/components/Screen";
import { Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { addRider } from "@/lib/logistics";

// Add a rider ("Delivery partner app" prototype `addRider` and `riderAdded`): their name, phone number and bike or
// van plate. We make their private Riders app link and open WhatsApp with the invite ready to send.

export default function AddRider() {
  const t = useT("m_partner", "common");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [plate, setPlate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ name: string; inviteUrl: string } | null>(null);

  async function send() {
    setError(null);
    if (name.trim().length < 2) return setError(t("addRider.needName"));
    if (whatsapp.replace(/\D/g, "").length < 7) return setError(t("addRider.needPhone"));
    setBusy(true);
    try {
      const result = await addRider({ name: name.trim(), whatsapp: whatsapp.trim(), plate: plate.trim() || undefined });
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
      <DoneScreen
        icon="send"
        title={t("addRider.sent")}
        sub={t("addRider.sentBody", { name: invite.name })}
        footer={
          <>
            <PillButton tone="forest" title={t("done")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/logistics/team"))} />
            <PillButton tone="white" onPress={() => void Linking.openURL(invite.inviteUrl)}>
              <AppIcon name="chat" size={18} />
              <T weight="bold" style={{ fontSize: 15 }}>{t("addRider.openAgain")}</T>
            </PillButton>
          </>
        }
      />
    );
  }

  return (
    <Screen
      title={t("riders.add")}
      sub={t("addRider.subWa")}
      footer={
        <PillButton tone="forest" busy={busy} onPress={() => void send()}>
          <AppIcon name="send" size={20} color="#FFFFFF" />
          <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 17 }}>{t("addRider.sendInvite")}</T>
        </PillButton>
      }
    >
      <LabeledInput label={t("addRider.theirName")} value={name} onChangeText={setName} placeholder="Musa Bello" autoCapitalize="words" autoComplete="name" />
      <LabeledInput label={t("addRider.theirPhone")} value={whatsapp} onChangeText={setWhatsapp} placeholder="0803 123 4567" keyboardType="phone-pad" textContentType="telephoneNumber" />
      <LabeledInput label={t("addRider.plate")} value={plate} onChangeText={(text) => setPlate(text.toUpperCase())} placeholder="LSR 482 KJ" autoCapitalize="characters" />
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}
