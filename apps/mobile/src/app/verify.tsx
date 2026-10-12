import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatE164, OTP_LENGTH, OTP_RESEND_SECONDS } from "@shared/phone";
import { sendCode, syncAccount, verifyCode, type CodeTarget } from "@/lib/auth";
import { asSignupRole } from "@/lib/partner-pure";
import { rememberSignedInRole } from "@/lib/role";
import { BackButton, CodeInput, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { colors } from "@/theme";

export default function Verify() {
  const params = useLocalSearchParams<{ target: string; mode: string; name?: string; role?: string }>();
  const initialTarget = useMemo(() => JSON.parse(params.target ?? "{}") as CodeTarget, [params.target]);
  const [target, setTarget] = useState<CodeTarget>(initialTarget);
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
      setError(verifyError instanceof Error ? verifyError.message : "Couldn't check that code.");
      setBusy(false);
    }
  }

  async function resend(next: CodeTarget) {
    setError(null);
    try {
      await sendCode(next, { create: params.mode === "signup", fullName: params.name, role: asSignupRole(params.role) });
      setTarget(next);
      startCountdown();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Couldn't send a new code.");
    }
  }

  const where = target.kind === "phone" ? `${target.via === "whatsapp" ? "WhatsApp" : "SMS"} on ${formatE164(target.phone)}` : target.email;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 22 }}>
      <View style={{ paddingTop: 10, marginBottom: 24 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6 }} accessibilityRole="header">Enter the code</T>
      <T style={{ color: colors.inkSoft, marginTop: 8, marginBottom: 24 }}>We sent it to {where}</T>
      <CodeInput value={code} onChange={setCode} onComplete={(value) => void submit(value)} />
      {seconds > 0 ? (
        <T style={{ color: colors.inkSoft, marginTop: 16 }}>Didn&apos;t get it? Resend in 0:{String(seconds).padStart(2, "0")}</T>
      ) : (
        <View style={{ flexDirection: "row", columnGap: 18, flexWrap: "wrap" }}>
          <LinkButton title="Resend code" onPress={() => void resend(target)} />
          {target.kind === "phone" && target.via === "whatsapp" && <LinkButton title="Send it by SMS instead" onPress={() => void resend({ ...target, via: "sms" })} />}
        </View>
      )}
      {error && <View style={{ marginTop: 18 }}><Notice>{error}</Notice></View>}
      <View style={{ flex: 1 }} />
      <PillButton title="Verify" busy={busy} disabled={code.length !== OTP_LENGTH} onPress={() => void submit()} style={{ marginBottom: 12 }} />
    </SafeAreaView>
  );
}
