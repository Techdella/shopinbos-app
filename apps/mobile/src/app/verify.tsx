import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { codeFromText, formatE164, OTP_LENGTH, OTP_RESEND_SECONDS } from "@shared/phone";
import { explainSignupConflict, sendCode, signOutNow, syncAccount, verifyCode, type CodeChannel, type CodeTarget } from "@/lib/auth";
import { pickedSignupRole, ROLE_ICON, type SignupRole } from "@/lib/partner-pure";
import { rememberSignedInRole } from "@/lib/role";
import { BackButton, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { Keypad, Small, Sub, TILE, Title, type TileTone } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { SignupProgress, signupSteps } from "@/components/AuthForm";
import { colors } from "@/theme";
import { HelpButton } from "@/components/Help";
import { useT } from "@/lib/i18n";
import { track } from "@/lib/seller-onboarding";

// "Enter the code we sent you." Then, on a sign-up that came without a role (Welcome's "Get started"), the last
// question: "What brings you to Shopinbos?" (sell · deliver · supply). The account is made at sync-user with the
// picked role (the role sent from sign up wins for a brand-new account).

/** "What do you want to do?" (spec A4): sell online, supply shops, run a delivery company (and "I'm a rider" below). */
const ROLE_ORDER: SignupRole[] = ["seller", "supplier", "logistics_partner"];
const TONE: Record<SignupRole, TileTone> = { seller: "peach", supplier: "blue", logistics_partner: "mint" };

export default function Verify() {
  const t = useT("m_auth");
  // oauth=1: signed in with Google or Apple and there's no account yet, so only "What brings you" is left to ask.
  const params = useLocalSearchParams<{ target: string; mode: string; name?: string; role?: string; channel?: string; oauth?: string }>();
  const initialTarget = useMemo(() => JSON.parse(params.target ?? "{}") as CodeTarget, [params.target]);
  const signup = params.mode === "signup";
  // The role the link or card picked; null on a plain sign up, which asks it after the code.
  const linkRole = pickedSignupRole(params.role);
  const [target, setTarget] = useState<CodeTarget>(initialTarget);
  // The channel the server really used (WhatsApp, SMS or email), so the screen says where to look.
  const [channel, setChannel] = useState<CodeChannel>(params.channel === "whatsapp" ? "whatsapp" : initialTarget.kind === "email" ? "email" : "sms");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<false | true | SignupRole>(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(OTP_RESEND_SECONDS);
  const [resent, setResent] = useState(false);
  // The code is right and the account is signed in; the role is all that's left to ask.
  const [askRole, setAskRole] = useState(params.oauth === "1");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Wrong code: the boxes shake (spec A3). Tries are counted for the otp_verified event.
  const shake = useRef(new Animated.Value(0)).current;
  const attempts = useRef(0);
  function shakeBoxes() {
    shake.setValue(0);
    Animated.sequence([10, -10, 8, -8, 4, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true }))).start();
  }

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

  /** Makes (or opens) the account with this role, then the launch gate opens the role's own tabs. */
  async function openAccount(role: SignupRole) {
    const actual = await syncAccount({ fullName: params.name || undefined, phone: target.kind === "phone" ? target.phone : undefined, signup, role });
    await rememberSignedInRole(actual);
    if ((actual ?? role) === "seller") {
      track("otp_verified", { attempts: attempts.current });
      if (signup) track("role_selected", { role: "seller" });
    }
    // This email or phone already has another kind of account (a seller signing up as a supplier): nothing was
    // changed. "Use a different email" logs out and goes back to the form; otherwise their own account opens.
    if (signup && actual && actual !== role && (await explainSignupConflict(actual, role, target.kind ?? "email")) === "different") {
      await signOutNow();
      // Back to the email or phone step with the name and the role kept: nothing to type again but the new address.
      router.replace({ pathname: "/signup", params: { role, method: target.kind ?? "email", name: params.name ?? "", step: "contact" } });
      return;
    }
    // Each role opens its own tabs: the launch gate sends sellers home, suppliers to /supplier, delivery to /logistics.
    router.replace("/");
  }

  async function submit(value = code) {
    if (value.length !== OTP_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    attempts.current += 1;
    try {
      await verifyCode(target, value);
      if (signup && !linkRole) {
        setBusy(false);
        setAskRole(true);
        return;
      }
      await openAccount(linkRole ?? "seller");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : t("verify.checkFailed"));
      setBusy(false);
      setCode("");
      shakeBoxes();
    }
  }

  /** "I'm a rider": riders sign in with the link their delivery company sends, not with a business account. */
  async function rider() {
    await signOutNow();
    router.replace("/rider/sign-in");
  }

  async function pickRole(role: SignupRole) {
    if (busy) return;
    setBusy(role);
    setError(null);
    try {
      await openAccount(role);
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : t("verify.checkFailed"));
      setBusy(false);
    }
  }

  /** "Paste code": the code copied from the SMS, WhatsApp or email (just the digits, or the whole message). */
  async function pasteCode() {
    const text = await Clipboard.getStringAsync().catch(() => "");
    const pasted = codeFromText(text);
    if (pasted.length !== OTP_LENGTH) {
      setError(t("verify.nothingToPaste", { length: OTP_LENGTH }));
      return;
    }
    setError(null);
    setCode(pasted);
    void submit(pasted);
  }

  async function resend(next: CodeTarget) {
    setError(null);
    try {
      const used = await sendCode(next, { create: signup, fullName: params.name, role: linkRole ?? undefined });
      setTarget(next);
      setChannel(used);
      setCode("");
      setResent(true);
      startCountdown();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("verify.resendFailed"));
    }
  }

  const total = signupSteps(Boolean(linkRole));

  if (askRole) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 }}>
            <SignupProgress step={4} total={total} />
            <HelpButton />
          </View>
          <View style={{ gap: 12 }}>
            <Title>{t("q.roleDo")}</Title>
            <Sub>{t("q.roleSubLater")}</Sub>
          </View>
          <View style={{ gap: 12 }}>
            {ROLE_ORDER.map((role) => (
              <Pressable
                key={role}
                accessibilityRole="button"
                accessibilityLabel={`${t(`pick.${role}.title`)}. ${t(`pick.${role}.line`)}`}
                disabled={Boolean(busy)}
                onPress={() => void pickRole(role)}
                testID={`signup-role-${role}`}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 88, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 20, borderWidth: 1.5, borderColor: pressed || busy === role ? colors.ink : colors.line, backgroundColor: colors.surface, opacity: busy && busy !== role ? 0.6 : 1 })}
              >
                <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: TILE[TONE[role]].bg, alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name={ROLE_ICON[role]} size={24} color={TILE[TONE[role]].fg} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <T weight="extrabold" style={{ fontSize: 19 }}>{t(`pick.${role}.title`)}</T>
                  <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }}>{t(`pick.${role}.line`)}</T>
                </View>
                <AppIcon name="chevron" size={20} color={colors.inkFaint} />
              </Pressable>
            ))}
          </View>
          <LinkButton testID="signup-role-rider" title={t("pick.rider.title")} onPress={() => void rider()} />
          {error && <Notice>{error}</Notice>}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const sentTo = target.kind === "phone"
    ? channel === "whatsapp" ? t("code.sentWhatsapp", { phone: formatE164(target.phone) }) : t("code.sentSms", { phone: formatE164(target.phone) })
    : t("code.sentEmail", { email: target.email });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <BackButton onPress={() => router.back()} />
          {signup ? <SignupProgress step={3} total={total} /> : <View style={{ flex: 1 }} />}
          <HelpButton />
        </View>
        <View style={{ gap: 12 }}>
          <Title>{t("q.code")}</Title>
          <Sub>{sentTo}</Sub>
        </View>
        {/* The 6th digit checks the code straight away (spec A3); a wrong one shakes the boxes. */}
        <Animated.View style={{ transform: [{ translateX: shake }] }}>
          <Keypad
            value={code}
            length={OTP_LENGTH}
            onChange={(next) => {
              setError(null);
              setCode(next);
              if (next.length === OTP_LENGTH) void submit(next);
            }}
          />
        </Animated.View>
        <PillButton tone="white" size="md" title={t("verify.paste")} disabled={Boolean(busy)} onPress={() => void pasteCode()} testID="verify-paste" />
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
          <PillButton tone="accent" title={t("code.continue")} busy={busy === true} onPress={() => void submit()} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
