import { useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { DEFAULT_DIAL_COUNTRY, DIAL_COUNTRIES, isValidEmail, toE164, type DialCountry } from "@shared/phone";
import { sendCode, signInWithGoogle, signInWithPassword, syncAccount, type CodeTarget } from "@/lib/auth";
import { BackButton, Chip, Field, Label, LinkButton, Notice, PhoneField, PillButton, Segmented, T } from "@/components/ui";
import { SIGNUP_ROLES, type SignupRole } from "@/lib/partner-pure";
import { rememberSignedInRole } from "@/lib/role";
import { colors } from "@/theme";

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

const ROLE_HEADING: Record<SignupRole, string> = { seller: "Create your account", supplier: "Create your supplier account", logistics_partner: "Create your delivery partner account" };

export function AuthForm({ mode, initialMethod = "phone", initialRole = "seller" }: { mode: Mode; initialMethod?: Method; initialRole?: SignupRole }) {
  const [method, setMethod] = useState<Method>(initialMethod);
  // Who is signing up: "I sell / I supply shops / I deliver" (like the web sign-up). Sets the account's role.
  const [role, setRole] = useState<SignupRole>(initialRole);
  // Phone codes go by SMS (the server's Send SMS hook has no WhatsApp path).
  const via = "sms" as const;
  const [emailMode, setEmailMode] = useState<"code" | "password">("code");
  const [name, setName] = useState("");
  const [country, setCountry] = useState<DialCountry>(DEFAULT_DIAL_COUNTRY);
  const [picking, setPicking] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "send" | "google">(null);
  const [error, setError] = useState<string | null>(null);

  const usingPassword = mode === "login" && method === "email" && emailMode === "password";

  async function finish(signedUp: boolean, phoneNumber?: string) {
    const actual = await syncAccount({ fullName: name.trim() || undefined, phone: phoneNumber, signup: signedUp, role });
    await rememberSignedInRole(actual);
    if (signedUp && actual && actual !== role) Alert.alert("You already have an account", "We've opened the account you made before with this login.");
    router.replace("/");
  }

  async function submit() {
    setError(null);
    if (mode === "signup" && !name.trim()) return setError("Tell us your name so Rex knows what to call you.");
    if (usingPassword) {
      if (!isValidEmail(email) || !password) return setError("Enter your email and password.");
      setBusy("send");
      try {
        await signInWithPassword(email.trim().toLowerCase(), password);
        await finish(false);
      } catch (signInError) {
        setError(signInError instanceof Error ? signInError.message : "Couldn't log you in.");
        setBusy(null);
      }
      return;
    }
    let target: CodeTarget;
    if (method === "phone") {
      const e164 = toE164(phone, country);
      if (!e164) return setError(`Enter your ${country.name} phone number, like ${country.example}.`);
      target = { kind: "phone", phone: e164, via };
    } else {
      if (!isValidEmail(email)) return setError("Enter a valid email address.");
      target = { kind: "email", email: email.trim().toLowerCase() };
    }
    setBusy("send");
    try {
      await sendCode(target, { create: mode === "signup", fullName: name, role });
      router.push({ pathname: "/verify", params: { target: JSON.stringify(target), mode, name: name.trim(), role } });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Couldn't send the code.");
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
      setError(googleError instanceof Error ? googleError.message : "Google sign-in didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const primary = usingPassword ? "Log in" : mode === "signup" ? "Send code" : method === "phone" ? "Send me a code by SMS" : "Email me a code";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))} />
            <LinkButton title={mode === "signup" ? "Log in" : "Create a shop"} onPress={() => router.replace(mode === "signup" ? "/login" : "/signup")} />
          </View>
          <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6, lineHeight: 33 }} accessibilityRole="header">
            {mode === "signup" ? ROLE_HEADING[role] : "Welcome back"}
          </T>
          {mode === "signup" && (
            <View style={{ marginTop: 16, gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel="What do you do?">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {SIGNUP_ROLES.map((item) => <Chip key={item.role} label={item.tab} on={role === item.role} onPress={() => { setError(null); setRole(item.role); }} />)}
              </View>
              {role === "logistics_partner" && (
                <Pressable accessibilityRole="link" onPress={() => router.push("/rider/link")} hitSlop={6}>
                  <T weight="bold" style={{ color: colors.inkSoft, fontSize: 13 }}>Riding for a delivery company? Open your Riders app link instead.</T>
                </Pressable>
              )}
            </View>
          )}
          {mode === "login" && <T style={{ color: colors.inkSoft, marginTop: 8, lineHeight: 21 }}>Log in with the phone or email you signed up with.</T>}
          <View style={{ marginTop: 22, marginBottom: 22 }}>
            <Segmented value={method} onChange={(value) => { setError(null); setMethod(value); }} options={[{ value: "phone", label: "Phone" }, { value: "email", label: "Email" }]} />
          </View>
          {mode === "signup" && (
            <View style={{ marginBottom: 18 }}>
              <Label>Your name</Label>
              <Field placeholder="Adaeze Okafor" autoComplete="name" textContentType="name" value={name} onChangeText={setName} />
            </View>
          )}
          {method === "phone" ? (
            <>
              <Label>Phone number</Label>
              <PhoneField country={country} onCountryPress={() => setPicking(true)} value={phone} onChangeText={setPhone} />
              <T style={{ color: colors.inkSoft, fontSize: 13, marginTop: 12, lineHeight: 19 }}>
                We'll send a 6-digit code by SMS.
              </T>
            </>
          ) : (
            <>
              <Label>Email</Label>
              <Field placeholder="you@yourshop.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" value={email} onChangeText={setEmail} />
              {usingPassword && (
                <View style={{ marginTop: 18 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Label>Password</Label>
                    <Pressable onPress={() => router.push("/forgot")} hitSlop={8}><T weight="bold" style={{ color: colors.inkSoft, fontSize: 13 }}>Forgot password?</T></Pressable>
                  </View>
                  <Field placeholder="Your password" secureTextEntry autoComplete="current-password" textContentType="password" value={password} onChangeText={setPassword} />
                </View>
              )}
            </>
          )}
          {error && <View style={{ marginTop: 18 }}><Notice>{error}</Notice></View>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 18, marginTop: 10 }}>
            {method === "phone" ? (
              <>
                <LinkButton title="Use email instead" color={colors.inkSoft} onPress={() => setMethod("email")} />
              </>
            ) : (
              <>
                <LinkButton title="Use my phone instead" color={colors.inkSoft} onPress={() => setMethod("phone")} />
                {mode === "login" && <LinkButton title={emailMode === "code" ? "Use my password" : "Email me a code instead"} color={colors.inkSoft} onPress={() => setEmailMode(emailMode === "code" ? "password" : "code")} />}
              </>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 14 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            <T weight="bold" style={{ color: colors.inkFaint, fontSize: 12, letterSpacing: 1.4 }}>OR</T>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          </View>
          <PillButton tone="white" size="md" busy={busy === "google"} disabled={Boolean(busy)} onPress={() => void google()}>
            <GoogleMark />
            <T weight="bold" style={{ fontSize: 15 }}>Continue with Google</T>
          </PillButton>
        </ScrollView>
        <View style={{ paddingHorizontal: 22, paddingBottom: 12, paddingTop: 8 }}>
          {mode === "signup" && (
            <T style={{ fontSize: 12, color: colors.inkSoft, lineHeight: 18, marginBottom: 12 }}>
              By continuing you agree to the Shopinbos terms and privacy policy, including how we handle your data under the NDPA.
            </T>
          )}
          <PillButton title={primary} busy={busy === "send"} disabled={Boolean(busy)} onPress={() => void submit()} />
        </View>
      </KeyboardAvoidingView>
      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={() => setPicking(false)}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 36 }}>
            <T weight="extrabold" style={{ fontSize: 18, marginBottom: 10 }}>Your country</T>
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
