import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatE164, OTP_LENGTH, OTP_RESEND_SECONDS } from "@shared/phone";
import { sendCode, syncAccount, verifyCode, type CodeChannel, type CodeTarget } from "@/lib/auth";
import { asSignupRole } from "@/lib/partner-pure";
import { rememberSignedInRole } from "@/lib/role";
import { BackButton, CodeInput, LinkButton, Notice, PillButton, T } from "@/components/ui";
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
      const actual = await syncAccount({ fullName: params.name || undefined, phone: target.kind === "phone" ? target.phone : undefined, signup: params.mode === "signup", role });
      await rememberSignedInRole(actual);
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
      startCountdown();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("verify.resendFailed"));
    }
  }

  const where = target.kind === "phone"
    ? channel === "whatsapp" ? t("verify.whatsappOn", { phone: formatE164(target.phone) }) : t("verify.smsOn", { phone: formatE164(target.phone) })
    : target.email;
  const title = channel === "whatsapp" ? t("verify.titleWhatsapp") : channel === "email" ? t("verify.titleEmail") : t("verify.titleSms");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 22 }}>
      <View style={{ paddingTop: 10, marginBottom: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <BackButton onPress={() => router.back()} />
        <HelpButton />
      </View>
      <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6 }} accessibilityRole="header">{title}</T>
      <T style={{ color: colors.inkSoft, marginTop: 8, marginBottom: 24 }}>{t("verify.sentTo", { where })}</T>
      <CodeInput value={code} onChange={setCode} onComplete={(value) => void submit(value)} />
      {seconds > 0 ? (
        <T style={{ color: colors.inkSoft, marginTop: 16 }}>{t("verify.resendIn", { time: `0:${String(seconds).padStart(2, "0")}` })}</T>
      ) : (
        <View style={{ flexDirection: "row", columnGap: 18, flexWrap: "wrap" }}>
          <LinkButton title={t("verify.resend")} onPress={() => void resend(target)} />
        </View>
      )}
      {target.kind === "phone" && channel === "whatsapp" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6 }}>
          <T style={{ color: colors.inkSoft }}>{t("verify.noWhatsapp")}</T>
          <LinkButton title={t("verify.sendSms")} onPress={() => void resend({ kind: "phone", phone: target.phone, via: "sms" })} />
        </View>
      ) : null}
      {error && <View style={{ marginTop: 18 }}><Notice>{error}</Notice></View>}
      <View style={{ flex: 1 }} />
      <PillButton title={t("verify.submit")} busy={busy} disabled={code.length !== OTP_LENGTH} onPress={() => void submit()} style={{ marginBottom: 12 }} />
    </SafeAreaView>
  );
}
