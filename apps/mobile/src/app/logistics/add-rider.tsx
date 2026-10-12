import { useState } from "react";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import { AppIcon } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { Field, Label, Notice, PillButton, T } from "@/components/ui";
import { addRider } from "@/lib/logistics";
import { colors, radii } from "@/theme";

// Add a rider (spec 8A): only a name and a WhatsApp number. We make their private Riders app link and open
// WhatsApp with the invite ready to send.

export default function AddRider() {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ name: string; inviteUrl: string } | null>(null);

  async function send() {
    setError(null);
    if (name.trim().length < 2) return setError("Type the rider's name.");
    if (whatsapp.replace(/\D/g, "").length < 7) return setError("Type the rider's WhatsApp number, like 0803 123 4567.");
    setBusy(true);
    try {
      const result = await addRider({ name: name.trim(), whatsapp: whatsapp.trim() });
      setInvite({ name: result.name, inviteUrl: result.inviteUrl });
      void Linking.openURL(result.inviteUrl);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (invite) {
    return (
      <Screen title="Invite ready" footer={<PillButton title="Done" onPress={() => router.back()} />}>
        <View style={{ backgroundColor: colors.successTint, borderRadius: radii.card, padding: 18, gap: 8 }}>
          <AppIcon name="check" size={28} color={colors.success} />
          <T weight="extrabold" style={{ fontSize: 20 }}>{invite.name} is on your team</T>
          <T style={{ fontSize: 15, lineHeight: 22 }}>Send them the WhatsApp message we wrote. It has their link to the Riders app. When they open it, they can start taking your jobs.</T>
        </View>
        <PillButton tone="white" size="md" onPress={() => void Linking.openURL(invite.inviteUrl)}>
          <AppIcon name="chat" size={18} />
          <T weight="bold" style={{ fontSize: 15 }}>Open WhatsApp again</T>
        </PillButton>
      </Screen>
    );
  }

  return (
    <Screen title="Add a rider" sub="We'll write them a WhatsApp message with a link to the Riders app." footer={<PillButton title="Send the invite" busy={busy} onPress={() => void send()} />}>
      <View>
        <Label>Rider&apos;s name</Label>
        <Field value={name} onChangeText={setName} placeholder="Musa Bello" autoCapitalize="words" autoComplete="name" accessibilityLabel="Rider's name" />
      </View>
      <View>
        <Label>Rider&apos;s WhatsApp number</Label>
        <Field value={whatsapp} onChangeText={setWhatsapp} placeholder="0803 123 4567" keyboardType="phone-pad" textContentType="telephoneNumber" accessibilityLabel="Rider's WhatsApp number" />
      </View>
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}
