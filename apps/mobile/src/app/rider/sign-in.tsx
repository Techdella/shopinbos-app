import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEFAULT_DIAL_COUNTRY, formatE164, toE164 } from "@shared/phone";
import { Keypad, Small, Sub, Title } from "@/components/design";
import { HelpButton } from "@/components/Help";
import { TextLink } from "@/components/RiderKit";
import { BackButton, Field, LinkButton, Notice, PillButton, T, WithTip } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { checkRiderSignInCode, saveRiderToken, sendRiderSignInCode, type RiderCodeSent } from "@/lib/rider";
import { useT } from "@/lib/i18n";
import { useRiderStrings } from "@/lib/rider-strings";
import { colors, fonts } from "@/theme";
import { KeyboardShift } from "@/components/KeyboardShift";

// "I'm a rider" (E2E-Start): the rider's phone number → a 6-digit code on WhatsApp → their Riders app, through
// POST /api/mobile/rider-sign-in (only numbers a delivery partner added as a rider). The key it returns is kept like
// a link's token. The private link stays one tap away ("Open my link"): it's the way in when codes are off (503) or
// the number isn't on the partner's list yet.

const CODE_LENGTH = 6;

export default function RiderSignIn() {
  const t = useT("m_auth");
  const { say } = useRiderStrings();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<(RiderCodeSent & { phone: string }) | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  function countdown(from: number) {
    setSeconds(from);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
  }

  async function send(via?: "whatsapp" | "sms", again = false) {
    const e164 = sent?.phone ?? toE164(phone, DEFAULT_DIAL_COUNTRY);
    if (!e164) return setError(t("form.badPhone", { country: DEFAULT_DIAL_COUNTRY.name, example: DEFAULT_DIAL_COUNTRY.example }));
    setBusy(true);
    setError(null);
    try {
      const result = await sendRiderSignInCode(e164, via);
      setSent({ ...result, phone: e164 });
      setCode("");
      setResent(again);
      countdown(result.resendAfter || 30);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("form.sendFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!sent || code.length !== CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      const result = await checkRiderSignInCode(sent.phone, sent.challenge, code);
      saveRiderToken(result.token);
      router.replace("/rider");
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : t("verify.checkFailed"));
      if (checkError instanceof ApiError && checkError.code === "WRONG_CODE") setCode("");
      setBusy(false);
    }
  }

  const back = () => {
    if (sent) {
      setSent(null);
      setError(null);
    } else if (router.canGoBack()) router.back();
    else router.replace("/welcome");
  };

  const top = (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <BackButton onPress={back} />
      <HelpButton />
    </View>
  );
  const openLink = <TextLink title={say("signIn.openLink")} color={colors.inkSoft} onPress={() => router.push("/rider/link")} />;

  if (sent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 20 }}>
          {top}
          <View style={{ gap: 12 }}>
            <Title>{t("verify.title")}</Title>
            <Sub>{sent.channel === "whatsapp" ? t("code.sentWhatsapp", { phone: formatE164(sent.phone) }) : t("code.sentSms", { phone: formatE164(sent.phone) })}</Sub>
          </View>
          <Keypad value={code} length={CODE_LENGTH} onChange={(next) => { setError(null); setCode(next); }} />
          {resent ? <Small style={{ textAlign: "center" }}>{t("code.newSent")}</Small> : null}
          {seconds > 0 ? (
            <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 14 }}>{t("verify.resendIn", { time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` })}</T>
          ) : (
            <LinkButton title={t("code.resend")} onPress={() => void send(undefined, true)} />
          )}
          {sent.channel === "whatsapp" && seconds === 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 6 }}>
              <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("verify.noWhatsapp")}</T>
              <LinkButton title={t("verify.sendSms")} onPress={() => void send("sms", true)} />
            </View>
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
        </ScrollView>
        {code.length === CODE_LENGTH ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10 }}>
            <PillButton tone="accent" title={t("code.continue")} busy={busy} onPress={() => void check()} />
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardShift>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
          {top}
          <View style={{ gap: 12 }}>
            <Title>{t("phone.title")}</Title>
            <Sub>{t("phone.subWhatsapp")}</Sub>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ width: 96, height: 58, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
              <T weight="bold" style={{ fontSize: 18 }}>{DEFAULT_DIAL_COUNTRY.dial}</T>
            </View>
            <Field
              accessibilityLabel={t("form.phoneNumber")}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              placeholder={DEFAULT_DIAL_COUNTRY.example}
              value={phone}
              onChangeText={setPhone}
              style={{ flex: 1, minWidth: 0, height: 58, borderWidth: 1.5, fontSize: 20, fontFamily: fonts.bold }}
            />
          </View>
          {error ? <Notice>{error}</Notice> : null}
          <WithTip title={t("form.phoneNumber")} tip={{ text: say("signIn.linkHint") }}>
            <Small>{say("signIn.linkHintShort")}</Small>
          </WithTip>
          {openLink}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10 }}>
          <PillButton tone="accent" busy={busy} onPress={() => void send()} icon="chat" title={t("form.sendCode")} />
        </View>
      </KeyboardShift>
    </SafeAreaView>
  );
}
