import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Screen } from "@/components/Screen";
import { Field, Label, Notice, PillButton, T } from "@/components/ui";
import { parseRiderToken } from "@/lib/partner-pure";
import { useT } from "@/lib/i18n";
import { fetchRider, forgetRiderToken, saveRiderToken } from "@/lib/rider";
import { colors } from "@/theme";

// Riders don't make an account: their dispatcher sends a private Riders app link. Opening the link on the phone
// lands here through shopinbos://rider/<token>; otherwise paste it.

export default function RiderLink() {
  const t = useT("m_rider");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function paste() {
    const value = await Clipboard.getStringAsync().catch(() => "");
    setText(value);
  }

  async function open() {
    const token = parseRiderToken(text);
    if (!token) return setError(t("link.bad"));
    setBusy(true);
    setError(null);
    saveRiderToken(token);
    try {
      await fetchRider();
      router.replace("/rider");
    } catch (linkError) {
      forgetRiderToken();
      setError(linkError instanceof Error ? linkError.message : t("link.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={t("link.title")}
      sub={t("link.subShort")}
      tip={t("link.sub")}
      footer={<PillButton title={t("link.open")} busy={busy} onPress={() => void open()} />}
    >
      {error ? <Notice>{error}</Notice> : null}
      <View>
        <Label tip={{ text: t("link.private") }}>{t("link.label")}</Label>
        <Field value={text} onChangeText={setText} placeholder="https://app.shopinbos.com/rider/…" autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("link.label")} />
      </View>
      <PillButton title={t("link.paste")} tone="white" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => void paste()} />
      {/* Keeping it private stays on screen in one line; why is in the tip on the label. */}
      <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("link.privateShort")}</T>
    </Screen>
  );
}
