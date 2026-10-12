import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { isValidEmail } from "@shared/phone";
import { sendPasswordReset } from "@/lib/auth";
import { BackButton, Field, Label, Mascot, Notice, PillButton, T } from "@/components/ui";
import { colors } from "@/theme";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setError(null);
    if (!isValidEmail(email)) return setError("Enter the email you use for Shopinbos.");
    setBusy(true);
    try {
      await sendPasswordReset(email.trim().toLowerCase());
      setSent(true);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Couldn't send the link. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 22 }}>
      <View style={{ paddingTop: 10, marginBottom: 24 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      {sent ? (
        <>
          <Mascot name="peggyWave" size={96} />
          <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6, marginTop: 12 }} accessibilityRole="header">Check your email</T>
          <T style={{ color: colors.inkSoft, marginTop: 8, lineHeight: 21 }}>
            If {email.trim()} has a Shopinbos account, we&apos;ve sent a link to choose a new password. Or log in with an email code instead.
          </T>
          <View style={{ flex: 1 }} />
          <PillButton title="Back to log in" onPress={() => router.replace("/login")} style={{ marginBottom: 12 }} />
        </>
      ) : (
        <>
          <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6 }} accessibilityRole="header">Reset your password</T>
          <T style={{ color: colors.inkSoft, marginTop: 8, marginBottom: 24, lineHeight: 21 }}>We&apos;ll email you a link to choose a new one.</T>
          <Label>Email</Label>
          <Field placeholder="you@yourshop.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} autoFocus />
          {error && <View style={{ marginTop: 18 }}><Notice>{error}</Notice></View>}
          <View style={{ flex: 1 }} />
          <PillButton title="Send reset link" busy={busy} onPress={() => void submit()} style={{ marginBottom: 12 }} />
        </>
      )}
    </SafeAreaView>
  );
}
