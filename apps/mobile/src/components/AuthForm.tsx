import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { DEFAULT_DIAL_COUNTRY, DIAL_COUNTRIES, isValidEmail, toE164, type DialCountry } from "@shared/phone";
import { appleSignInAvailable, explainSignupConflict, fetchWhatsAppCodes, sendCode, signInWithApple, signInWithGoogle, signInWithPassword, signOutNow, syncAccount, type CodeTarget } from "@/lib/auth";
import { BackButton, Field, Label, LinkButton, Notice, PhoneField, PillButton, Segmented, T } from "@/components/ui";
import { AppIcon } from "@/components/icons";
import { MascotVideo } from "@/components/MascotVideo";
import { ROLE_ICON, type SignupRole } from "@/lib/partner-pure";
import { rememberSignedInRole } from "@/lib/role";
import { colors } from "@/theme";
import { HelpButton } from "@/components/Help";
import { LanguageButton } from "@/components/LanguagePicker";
import { useT } from "@/lib/i18n";
import { PRIVACY_URL, TERMS_URL } from "@/lib/support";

const legalLink = { color: colors.ink, textDecorationLine: "underline" } as const;

type Mode = "signup" | "login";
type Method = "phone" | "email";

function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  );
}

/** Back to the three "What do you do?" cards on Welcome. */
function changeRole() {
  if (router.canGoBack()) router.back();
  else router.replace("/welcome");
}

export function AuthForm({ mode, initialMethod = "phone", initialRole = "seller" }: { mode: Mode; initialMethod?: Method; initialRole?: SignupRole }) {
  const t = useT("m_auth");
  const tLegal = useT("auth");
  const [method, setMethod] = useState<Method>(initialMethod);
  // Who is signing up, picked on the Welcome cards (seller, supplier, delivery partner). Sets a new account's role.
  const role = initialRole;
  // Phone codes go on WhatsApp when the server has it on (GET /api/auth/otp), else SMS; null while asking.
  const [whatsapp, setWhatsapp] = useState<boolean | null>(null);
  // Sign in with Apple: iPhone only (see appleSignInAvailable).
  const [apple, setApple] = useState(false);
  useEffect(() => {
    let live = true;
    void fetchWhatsAppCodes().then((value) => live && setWhatsapp(value));
    void appleSignInAvailable().then((value) => live && setApple(value));
    return () => {
      live = false;
    };
  }, []);
  const via = whatsapp ? ("whatsapp" as const) : ("sms" as const);
  const [emailMode, setEmailMode] = useState<"code" | "password">("code");
  const [name, setName] = useState("");
  const [country, setCountry] = useState<DialCountry>(DEFAULT_DIAL_COUNTRY);
  const [picking, setPicking] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "send" | "google" | "apple">(null);
  const [error, setError] = useState<string | null>(null);

  const usingPassword = mode === "login" && method === "email" && emailMode === "password";

  async function finish(signedUp: boolean, phoneNumber?: string, fullName?: string) {
    const actual = await syncAccount({ fullName: name.trim() || fullName || undefined, phone: phoneNumber, signup: signedUp, role });
    await rememberSignedInRole(actual);
    // Google sign-up with an email that already has another kind of account: nothing changed; say so plainly.
    if (signedUp && actual && actual !== role && (await explainSignupConflict(actual, role, "email")) === "different") {
      await signOutNow();
      return;
    }
    // Each role opens its own tabs: the launch gate sends sellers home, suppliers to /supplier, delivery to /logistics.
    router.replace("/");
  }

  async function submit() {
    setError(null);
    if (mode === "signup" && !name.trim()) return setError(t("form.needName"));
    if (usingPassword) {
      if (!isValidEmail(email) || !password) return setError(t("form.needEmailPassword"));
      setBusy("send");
      try {
        await signInWithPassword(email.trim().toLowerCase(), password);
        await finish(false);
      } catch (signInError) {
        setError(signInError instanceof Error ? signInError.message : t("form.loginFailed"));
        setBusy(null);
      }
      return;
    }
    let target: CodeTarget;
    if (method === "phone") {
      const e164 = toE164(phone, country);
      if (!e164) return setError(t("form.badPhone", { country: country.name, example: country.example }));
      target = { kind: "phone", phone: e164, via };
    } else {
      if (!isValidEmail(email)) return setError(t("form.badEmail"));
      target = { kind: "email", email: email.trim().toLowerCase() };
    }
    setBusy("send");
    try {
      const channel = await sendCode(target, { create: mode === "signup", fullName: name, role });
      router.push({ pathname: "/verify", params: { target: JSON.stringify(target), mode, name: name.trim(), role, channel } });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("form.sendFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function signInApple() {
    setError(null);
    setBusy("apple");
    try {
      const result = await signInWithApple();
      if (result?.session) await finish(mode === "signup", undefined, result.fullName);
    } catch (appleError) {
      setError(appleError instanceof Error ? appleError.message : t("form.appleFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    setError(null);
    setBusy("google");
    try {
      const session = await signInWithGoogle();
      if (session) await finish(mode === "signup");
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : t("form.googleFailed"));
    } finally {
      setBusy(null);
    }
  }

  const primary = usingPassword
    ? t("form.logIn")
    : method === "phone" && whatsapp
      ? t("form.whatsappCode")
      : mode === "signup" ? t("form.sendCode") : method === "phone" ? t("form.smsCode") : t("form.emailCode");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <LinkButton title={mode === "signup" ? t("form.logIn") : t("form.createShop")} onPress={() => router.replace(mode === "signup" ? "/login" : "/welcome")} />
              <LanguageButton />
              <HelpButton />
            </View>
          </View>
          {/* Returning sellers: Peggy waves hello (Prototype 10, "Welcome back"). */}
          {mode === "login" && <MascotVideo clip="peggy-hello" size={132} decorative fadeTo={colors.canvas} style={{ marginTop: -12, marginBottom: 6, marginLeft: -10 }} />}
          {mode === "signup" && (
            // The chosen role, always in sight: "Supplier · Not a supplier? Change".
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.peach, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                <AppIcon name={ROLE_ICON[role]} size={16} color={colors.accentInk} />
                <T weight="bold" style={{ fontSize: 13.5 }}>{t(`card.${role}.title`)}</T>
              </View>
              <LinkButton title={t(`change.${role}`)} onPress={changeRole} style={{ minHeight: 44 }} />
            </View>
          )}
          <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6, lineHeight: 33 }} accessibilityRole="header">
            {mode === "signup" ? t(`as.${role}`) : t("form.welcomeBack")}
          </T>
          {mode === "signup" && role === "logistics_partner" && (
            <Pressable accessibilityRole="link" onPress={() => router.push("/rider/link")} hitSlop={6} style={{ marginTop: 10 }}>
              <T weight="bold" style={{ color: colors.inkSoft, fontSize: 13 }}>{t("form.riderHint")}</T>
            </Pressable>
          )}
          {mode === "login" && <T style={{ color: colors.inkSoft, marginTop: 8, lineHeight: 21 }}>{t("form.loginSub")} {t("form.loginRoles")}</T>}
          <View style={{ marginTop: 22, marginBottom: 22 }}>
            <Segmented value={method} onChange={(value) => { setError(null); setMethod(value); }} options={[{ value: "phone", label: t("form.phone") }, { value: "email", label: t("form.email") }]} />
          </View>
          {mode === "signup" && (
            <View style={{ marginBottom: 18 }}>
              <Label>{t("form.name")}</Label>
              <Field placeholder="Adaeze Okafor" autoComplete="name" textContentType="name" value={name} onChangeText={setName} />
            </View>
          )}
          {method === "phone" ? (
            <>
              <Label>{t("form.phoneNumber")}</Label>
              <PhoneField country={country} onCountryPress={() => setPicking(true)} value={phone} onChangeText={setPhone} />
              <T style={{ color: colors.inkSoft, fontSize: 13, marginTop: 12, lineHeight: 19 }}>
                {whatsapp ? t("form.whatsappHint") : t("form.smsHint")}
              </T>
            </>
          ) : (
            <>
              <Label>{t("form.email")}</Label>
              <Field placeholder="you@yourshop.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" value={email} onChangeText={setEmail} />
              {usingPassword && (
                <View style={{ marginTop: 18 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Label>{t("form.password")}</Label>
                    <Pressable onPress={() => router.push("/forgot")} hitSlop={8}><T weight="bold" style={{ color: colors.inkSoft, fontSize: 13 }}>{t("form.forgot")}</T></Pressable>
                  </View>
                  <Field placeholder={t("form.passwordPlaceholder")} secureTextEntry autoComplete="current-password" textContentType="password" value={password} onChangeText={setPassword} />
                </View>
              )}
            </>
          )}
          {error && <View style={{ marginTop: 18 }}><Notice>{error}</Notice></View>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 18, marginTop: 10 }}>
            {method === "phone" ? (
              <>
                <LinkButton title={t("form.useEmail")} color={colors.inkSoft} onPress={() => setMethod("email")} />
              </>
            ) : (
              <>
                <LinkButton title={t("form.usePhone")} color={colors.inkSoft} onPress={() => setMethod("phone")} />
                {mode === "login" && <LinkButton title={emailMode === "code" ? t("form.usePassword") : t("form.useCode")} color={colors.inkSoft} onPress={() => setEmailMode(emailMode === "code" ? "password" : "code")} />}
              </>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 14 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            <T weight="bold" style={{ color: colors.inkFaint, fontSize: 12, letterSpacing: 1.4 }}>{t("form.or")}</T>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          </View>
          {apple && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={mode === "signup" ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={999}
              style={{ height: 50, marginBottom: 10, opacity: busy ? 0.6 : 1 }}
              onPress={() => !busy && void signInApple()}
            />
          )}
          <PillButton tone="white" size="md" busy={busy === "google"} disabled={Boolean(busy)} onPress={() => void google()}>
            <GoogleMark />
            <T weight="bold" style={{ fontSize: 15 }}>{t("form.google")}</T>
          </PillButton>
        </ScrollView>
        <View style={{ paddingHorizontal: 22, paddingBottom: 12, paddingTop: 8 }}>
          {mode === "signup" && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <AppIcon name="shield" size={14} color={colors.inkSoft} />
                <T style={{ flex: 1, fontSize: 12, color: colors.inkSoft, lineHeight: 18 }}>{t("form.noPassword")}</T>
              </View>
              <T style={{ fontSize: 12, color: colors.inkSoft, lineHeight: 18, marginBottom: 12 }}>
                {tLegal("terms.before")}{" "}
                <T style={legalLink} onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}>{tLegal("terms.terms")}</T>{" "}
                {tLegal("terms.and")}{" "}
                <T style={legalLink} onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}>{tLegal("terms.privacy")}</T>
                {tLegal("terms.after")}
              </T>
            </>
          )}
          <PillButton title={primary} busy={busy === "send"} disabled={Boolean(busy)} onPress={() => void submit()} />
        </View>
      </KeyboardAvoidingView>
      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={() => setPicking(false)}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 36 }}>
            <T weight="extrabold" style={{ fontSize: 18, marginBottom: 10 }}>{t("form.country")}</T>
            {DIAL_COUNTRIES.map((item) => (
              <Pressable key={item.code} accessibilityRole="button" onPress={() => { setCountry(item); setPicking(false); }} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <T weight={item.code === country.code ? "bold" : "regular"} style={{ fontSize: 16 }}>{item.name}</T>
                <T style={{ fontSize: 16, color: colors.inkSoft }}>{item.dial}</T>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
