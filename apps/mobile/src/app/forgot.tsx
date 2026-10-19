import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { isValidEmail } from "@shared/phone";
import { sendPasswordReset } from "@/lib/auth";
import { BackButton, Field, Label, Mascot, Notice, PillButton, T } from "@/components/ui";
import { colors } from "@/theme";
import { HelpButton } from "@/components/Help";
import { useT } from "@/lib/i18n";

export default function Forgot() {
  const t = useT("m_auth");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setError(null);
    if (!isValidEmail(email)) return setError(t("forgot.needEmail"));
    setBusy(true);
    try {
      await sendPasswordReset(email.trim().toLowerCase());
      setSent(true);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : t("forgot.sendFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 22 }}>
      <View style={{ paddingTop: 10, marginBottom: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <BackButton onPress={() => router.back()} />
        <HelpButton />
      </View>
      {sent ? (
        <>
          <Mascot name="peggyWave" size={96} />
          <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6, marginTop: 12 }} accessibilityRole="header">{t("forgot.checkEmail")}</T>
          <T style={{ color: colors.inkSoft, marginTop: 8, lineHeight: 21 }}>
            {t("forgot.sent", { email: email.trim() })}
          </T>
          <View style={{ flex: 1 }} />
          <PillButton title={t("forgot.backToLogin")} onPress={() => router.replace("/login")} style={{ marginBottom: 12 }} />
        </>
      ) : (
        <>
          <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6 }} accessibilityRole="header">{t("forgot.title")}</T>
          <T style={{ color: colors.inkSoft, marginTop: 8, marginBottom: 24, lineHeight: 21 }}>{t("forgot.sub")}</T>
          <Label>{t("form.email")}</Label>
          <Field placeholder="you@yourshop.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} autoFocus />
          {error && <View style={{ marginTop: 18 }}><Notice>{error}</Notice></View>}
          <View style={{ flex: 1 }} />
          <PillButton title={t("forgot.submit")} busy={busy} onPress={() => void submit()} style={{ marginBottom: 12 }} />
        </>
      )}
    </SafeAreaView>
  );
}
