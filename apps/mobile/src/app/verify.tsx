import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatE164, OTP_LENGTH, OTP_RESEND_SECONDS } from "@shared/phone";
import { explainSignupConflict, sendCode, signOutNow, syncAccount, verifyCode, type CodeChannel, type CodeTarget } from "@/lib/auth";
import { asSignupRole } from "@/lib/partner-pure";
import { rememberSignedInRole } from "@/lib/role";
import { BackButton, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { Keypad, Small, Sub, Title } from "@/components/design";
import { colors } from "@/theme";
import { HelpButton } from "@/components/Help";
import { useT } from "@/lib/i18n";

export default function Verify() {
  const t = useT("m_auth");
  const params = useLocalSearchParams<{ target: string; mode: string; name?: string; role?: string; channel?: string }>();
  const initialTarget = useMemo(() => JSON.parse(params.target ?? "{}") as CodeTarget, [params.target]);
  const [target, setTarget] = useState<CodeTarget>(initialTarget);
  // The channel the server really used (WhatsApp, SMS or email), so the screen says where to look.
  const [channel, setChannel] = useState<CodeChannel>(params.channel === "whatsapp" ? "whatsapp" : initialTarget.kind === "email" ? "email" : "sms");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(OTP_RESEND_SECONDS);
  const [resent, setResent] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCountdown() {
    setSeconds(OTP_RESEND_SECONDS);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
  }

  useEffect(() => {
    startCountdown();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  async function submit(value = code) {
    if (value.length !== OTP_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyCode(target, value);
      const role = asSignupRole(params.role);
      const signup = params.mode === "signup";
      const actual = await syncAccount({ fullName: params.name || undefined, phone: target.kind === "phone" ? target.phone : undefined, signup, role });
      await rememberSignedInRole(actual);
      // This email or phone already has another kind of account (a seller signing up as a supplier): nothing was
      // changed. "Use a different email" logs out and goes back to the form; otherwise their own account opens.
      if (signup && actual && actual !== role && (await explainSignupConflict(actual, role, target.kind)) === "different") {
        await signOutNow();
        router.replace({ pathname: "/signup", params: { role, method: target.kind } });
        return;
      }
      // Each role opens its own tabs: the launch gate sends sellers home, suppliers to /supplier, delivery to /logistics.
      router.replace("/");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : t("verify.checkFailed"));
      setBusy(false);
    }
  }

  async function resend(next: CodeTarget) {
    setError(null);
    try {
      const used = await sendCode(next, { create: params.mode === "signup", fullName: params.name, role: asSignupRole(params.role) });
      setTarget(next);
      setChannel(used);
      setCode("");
      setResent(true);
      startCountdown();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("verify.resendFailed"));
    }
  }

  const sentTo = target.kind === "phone"
    ? channel === "whatsapp" ? t("code.sentWhatsapp", { phone: formatE164(target.phone) }) : t("code.sentSms", { phone: formatE164(target.phone) })
    : t("code.sentEmail", { email: target.email });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <BackButton onPress={() => router.back()} />
          <HelpButton />
        </View>
        <View style={{ gap: 12 }}>
          <Title>{t("verify.title")}</Title>
          <Sub>{sentTo}</Sub>
        </View>
        <Keypad value={code} length={OTP_LENGTH} onChange={(next) => { setError(null); setCode(next); }} />
        {resent ? <Small style={{ textAlign: "center" }}>{t("code.newSent")}</Small> : null}
        {seconds > 0 ? (
          <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 14 }}>{t("verify.resendIn", { time: `0:${String(seconds).padStart(2, "0")}` })}</T>
        ) : (
          <LinkButton title={t("code.resend")} onPress={() => void resend(target)} />
        )}
        {target.kind === "phone" && channel === "whatsapp" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 6 }}>
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("verify.noWhatsapp")}</T>
            <LinkButton title={t("verify.sendSms")} onPress={() => void resend({ kind: "phone", phone: target.phone, via: "sms" })} />
          </View>
        ) : null}
        {error && <Notice>{error}</Notice>}
      </ScrollView>
      {code.length === OTP_LENGTH ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10 }}>
          <PillButton tone="accent" title={t("code.continue")} busy={busy} onPress={() => void submit()} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
