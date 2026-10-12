import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Screen } from "@/components/Screen";
import { Field, Label, Notice, PillButton, T } from "@/components/ui";
import { parseRiderToken } from "@/lib/partner-pure";
import { fetchRider, forgetRiderToken, saveRiderToken } from "@/lib/rider";
import { colors } from "@/theme";

// Riders don't make an account: their dispatcher sends a private Riders app link. Opening the link on the phone
// lands here through shopinbos://rider/<token>; otherwise paste it.

export default function RiderLink() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function paste() {
    const value = await Clipboard.getStringAsync().catch(() => "");
    setText(value);
  }

  async function open() {
    const token = parseRiderToken(text);
    if (!token) return setError("That doesn't look like a Riders app link. Copy the whole link your company sent you.");
    setBusy(true);
    setError(null);
    saveRiderToken(token);
    try {
      await fetchRider();
      router.replace("/rider");
    } catch (linkError) {
      forgetRiderToken();
      setError(linkError instanceof Error ? linkError.message : "That link didn't work. Ask your company for a new one.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Open your Riders app"
      sub="Your company sends you a private link on WhatsApp. Paste it here once and your deliveries show up every day."
      footer={<PillButton title="Open my deliveries" busy={busy} onPress={() => void open()} />}
    >
      {error ? <Notice>{error}</Notice> : null}
      <View>
        <Label>Your Riders app link</Label>
        <Field value={text} onChangeText={setText} placeholder="https://app.shopinbos.com/rider/…" autoCapitalize="none" autoCorrect={false} />
      </View>
      <PillButton title="Paste from clipboard" tone="white" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => void paste()} />
      <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>Keep the link to yourself: anyone with it can see your drops. Lost it? Ask your company for a new one.</T>
    </Screen>
  );
}
