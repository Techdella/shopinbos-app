import { useEffect, useRef, useState, type ReactElement } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { koraLivenessService, type IdLookupResult, type LivenessResult } from "kora-identity-react-native-sdk";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { confirmFaceCheck, fetchWallet, startFaceCheck, verifyNin } from "@/lib/wallet";
import { colors } from "@/theme";

// "Verify it's you" for the Shopinbos Wallet, powered by Kora Identity: first the NIN with the name and date of birth
// on it (checked on the server), then Kora's liveness check, which matches the live face to the photo on that NIN.
// Biometric data needs an explicit yes (NDPA s.30): the camera only opens after the person ticks the consent box.
// Kora handles the video; the app only passes Kora's reference to the server, which asks Kora for the result
// (web src/lib/wallet/identity.server.ts) and keeps only the outcome.

/** The SDK sends the ID match result after liveness (it polls Kora for up to ~90 s); don't wait longer than this. */
const ID_RESULT_WAIT_MS = 100_000;

type Phase = { kind: "form" } | { kind: "camera"; element: ReactElement } | { kind: "checking" } | { kind: "done"; tone: "success" | "info" | "error"; message: string };

export default function FaceCheck() {
  const t = useT("m_money");
  const loaded = useLoad(fetchWallet);
  const identity = loaded.data?.view.identity;
  const [nin, setNin] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const reference = useRef<string | null>(null);
  const confirmed = useRef(false);
  const waiting = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (waiting.current) clearTimeout(waiting.current);
  }, []);

  async function confirm() {
    if (confirmed.current) return;
    confirmed.current = true;
    if (waiting.current) clearTimeout(waiting.current);
    const ref = reference.current;
    if (!ref) {
      setPhase({ kind: "done", tone: "error", message: t("face.notFinished") });
      return;
    }
    setPhase({ kind: "checking" });
    try {
      const result = await confirmFaceCheck(ref);
      setPhase({ kind: "done", tone: result.outcome === "passed" ? "success" : result.outcome === "review" ? "info" : "error", message: result.message });
      void loaded.reload();
    } catch (confirmError) {
      setPhase({ kind: "done", tone: "error", message: confirmError instanceof Error ? confirmError.message : t("face.notFinished") });
    }
  }

  async function start() {
    setError(null);
    const digits = nin.replace(/\D/g, "");
    if (digits.length !== 11) return setError(t("face.needNin"));
    if (!consent) return setError(t("face.needConsent"));
    setBusy(true);
    try {
      if (identity?.nin !== "verified") {
        if (!firstName.trim() || !lastName.trim()) throw new Error(t("face.needName"));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth.trim())) throw new Error(t("face.needDob"));
        await verifyNin({ nin: digits, firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth: dateOfBirth.trim() });
        void loaded.reload();
      }
      const config = await startFaceCheck(digits);
      reference.current = null;
      confirmed.current = false;
      const element = await koraLivenessService.checkLiveness({
        publicKey: config.publicKey,
        sandboxEnvironment: config.sandbox,
        user: config.user,
        idLookup: config.idLookup,
        presentation: "page",
        branding: { color: colors.forest },
        onSuccess: (result: LivenessResult) => {
          reference.current = typeof result.data?.reference === "string" ? result.data.reference : reference.current;
          setPhase({ kind: "checking" });
          // The face match result follows; if it never arrives, ask the server anyway.
          waiting.current = setTimeout(() => void confirm(), ID_RESULT_WAIT_MS);
        },
        onIdLookupResult: (result: IdLookupResult) => {
          reference.current = result.reference || reference.current;
          void confirm();
        },
        onFailure: (result: LivenessResult) => {
          const ref = typeof result.data?.reference === "string" ? result.data.reference : null;
          if (ref) {
            reference.current = ref;
            void confirm();
          } else {
            setPhase({ kind: "done", tone: "error", message: result.error || t("face.notFinished") });
          }
        },
        onClose: () => setPhase((current) => (current.kind === "camera" ? { kind: "form" } : current)),
      });
      setPhase({ kind: "camera", element });
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : t("face.notFinished"));
    } finally {
      setBusy(false);
    }
  }

  if (phase.kind === "camera") {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>{phase.element}</SafeAreaView>;
  }

  const ninDone = identity?.nin === "verified";
  return (
    <Screen title={t("face.title")} heading={t("face.heading")} sub={t("face.sub")} fallback="/wallet">
      {loaded.loading && !loaded.data ? <LoadingBlock /> : null}
      {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {phase.kind === "checking" ? <Notice tone="info">{t("face.checking")}</Notice> : null}
      {phase.kind === "done" ? <Notice tone={phase.tone}>{phase.message}</Notice> : null}
      {loaded.data && identity?.face === "passed" ? (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <AppIcon name="shield" size={22} color={colors.success} />
            <T weight="bold" style={{ flex: 1, fontSize: 16 }}>{t("face.alreadyDone")}</T>
          </View>
          <PillButton tone="white" size="md" style={{ marginTop: 14 }} onPress={() => router.back()}>{t("face.backToMoney")}</PillButton>
        </Card>
      ) : loaded.data && !identity?.faceReady ? (
        <Notice tone="info">{t("face.notOn")}</Notice>
      ) : loaded.data && phase.kind !== "checking" ? (
        <View style={{ gap: 16 }}>
          {identity?.face === "review" ? <Notice tone="info">{t("face.inReview")}</Notice> : null}
          <View>
            <Label>{ninDone ? t("face.ninAgain", { last4: identity?.ninLast4 ?? "" }) : t("face.nin")}</Label>
            <Field value={nin} onChangeText={setNin} keyboardType="number-pad" maxLength={11} placeholder="12345678901" autoComplete="off" secureTextEntry={ninDone} />
          </View>
          {!ninDone ? (
            <>
              <View>
                <Label>{t("face.firstName")}</Label>
                <Field value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
              </View>
              <View>
                <Label>{t("face.lastName")}</Label>
                <Field value={lastName} onChangeText={setLastName} autoComplete="family-name" />
              </View>
              <View>
                <Label>{t("face.dob")}</Label>
                <Field value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="1990-05-21" keyboardType="numbers-and-punctuation" maxLength={10} />
              </View>
            </>
          ) : null}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            onPress={() => { setConsent((value) => !value); setError(null); }}
            testID="face-consent"
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, minHeight: 44 }}
          >
            <View style={{ marginTop: 2, width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: consent ? colors.ink : colors.line, backgroundColor: consent ? colors.ink : colors.surface, alignItems: "center", justifyContent: "center" }}>
              {consent ? <AppIcon name="check" size={15} color={colors.surface} /> : null}
            </View>
            <T style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.ink }}>{t("face.consent")}</T>
          </Pressable>
          {error ? <Notice>{error}</Notice> : null}
          <PillButton tone="accent" busy={busy} disabled={busy} onPress={() => void start()}>
            <AppIcon name="camera" size={19} color={colors.ink} />
            <T weight="extrabold" style={{ color: colors.ink, fontSize: 17 }}>{t("face.start")}</T>
          </PillButton>
          <T style={{ fontSize: 12.5, lineHeight: 18, color: colors.inkSoft }}>{t("face.privacy")}</T>
        </View>
      ) : null}
    </Screen>
  );
}
