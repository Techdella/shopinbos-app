import { useState } from "react";
import { Image, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { LabeledInput } from "@/components/PartnerKit";
import { PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { checkNin, saveIdentity, sendEmailCode, sendPhoneCode, verifyEmailCode, verifyPhoneCode } from "@/lib/kyc";
import { birthDate, digitsUpTo, selfieDataUri } from "@/lib/kyc-pure";
import { colors } from "@/theme";
import { ItemStatus, StepCard, useStepAction, type StepProps } from "./KycKit";
import { LIVENESS_ON, useKoraLiveness, type LivenessPass } from "./KoraLiveness";

// Identity: name and address, phone and email codes, then the selfie with the NIN. The server matches the selfie to
// the NIN photo (Korapay) in the same check, so the two are always sent together; a new selfie means checking the
// NIN again. Only the last 4 digits of the NIN ever come back. With Korapay's liveness check switched on
// (EXPO_PUBLIC_KORAPAY_PUBLIC_KEY), the face check comes first and its reference goes with the selfie.

function nameParts(full: string | null) {
  const words = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return { first: words[0] ?? "", last: words.length > 1 ? words[words.length - 1] : "" };
}

export function IdentityStep({ state, onState }: StepProps) {
  const t = useT("m_kyc");
  const { tier1 } = state;
  const identity = state.identity;
  const name = nameParts(identity.fullName);
  const selfieDoc = state.docs.find((doc) => doc.type === "selfie");

  // Name and address
  const details = useStepAction(onState);
  const [first, setFirst] = useState(name.first);
  const [last, setLast] = useState(name.last);
  const [address, setAddress] = useState(identity.address?.value ?? "");
  const ninLocked = identity.nin?.status === "approved";

  // Phone and email codes
  const codes = useStepAction(onState);
  const [phone, setPhone] = useState(identity.phone?.value ?? "");
  const [phoneChallenge, setPhoneChallenge] = useState<string | null>(null);
  const [phoneCode, setPhoneCode] = useState("");
  const [email, setEmail] = useState(identity.email?.value ?? "");
  const [emailChallenge, setEmailChallenge] = useState<string | null>(null);
  const [emailCode, setEmailCode] = useState("");

  // Selfie and NIN
  const id = useStepAction(onState);
  const [selfie, setSelfie] = useState<{ uri: string; dataUri: string } | null>(null);
  const liveness = useKoraLiveness();
  const [passed, setPassed] = useState<LivenessPass | null>(null);
  const [checking, setChecking] = useState(false);
  const [nin, setNin] = useState("");
  const [dob, setDob] = useState("");

  async function faceCheck() {
    id.setError(null);
    setChecking(true);
    try {
      const result = await liveness.start({ firstName: first, lastName: last });
      if (result) setPassed(result);
      else id.setError(t("selfie.livenessFailed"));
    } catch {
      id.setError(t("selfie.livenessUnavailable"));
    } finally {
      setChecking(false);
    }
  }

  async function takeSelfie() {
    id.setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return id.setError(t("selfie.cameraOff"));
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], cameraType: ImagePicker.CameraType.front, allowsEditing: true, aspect: [1, 1], quality: 0.35, base64: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    const dataUri = selfieDataUri(asset.base64, asset.mimeType);
    if (!dataUri) return id.setError(t("selfie.tooBig"));
    setSelfie({ uri: asset.uri, dataUri });
  }

  function sendNin() {
    const born = birthDate(dob);
    if (LIVENESS_ON && !passed) return id.setError(t("selfie.livenessFirst"));
    if (!selfie) return id.setError(t("selfie.needed"));
    if (nin.length !== 11) return id.setError(t("nin.length"));
    if (!first.trim() || !last.trim()) return id.setError(t("name.needed"));
    if (!born) return id.setError(t("dob.invalid"));
    void id.run("nin", () => checkNin({ nin, firstName: first.trim(), lastName: last.trim(), dateOfBirth: born, selfie: selfie.dataUri, ...(passed ? { liveness: passed } : {}) }), () => {
      setNin("");
      setSelfie(null);
      setPassed(null);
      id.setDone(t("nin.checked"));
    });
  }

  return (
    <>
      <StepCard title={t("identity.title")} sub={t("identity.sub")}>
        <ItemStatus label={t("item.name.fullName")} state={tier1.fullName} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <LabeledInput label={t("identity.first")} value={first} onChangeText={setFirst} autoCapitalize="words" editable={!ninLocked} />
          </View>
          <View style={{ flex: 1 }}>
            <LabeledInput label={t("identity.last")} value={last} onChangeText={setLast} autoCapitalize="words" editable={!ninLocked} />
          </View>
        </View>
        <ItemStatus label={t("item.name.address")} state={tier1.address} />
        <LabeledInput label={t("identity.address")} value={address} onChangeText={setAddress} autoCapitalize="words" multiline />
        <PillButton
          title={t("save")}
          size="sm"
          tone="white"
          style={{ alignSelf: "flex-start" }}
          busy={details.busy === "save"}
          disabled={Boolean(details.busy)}
          onPress={() => void details.run("save", () => saveIdentity({ ...(ninLocked ? {} : { firstName: first.trim(), lastName: last.trim() }), address: address.trim() }), () => details.setDone(t("saved")))}
        />
        {details.notes}
      </StepCard>

      <StepCard title={t("contact.title")} sub={t("contact.sub")}>
        <ItemStatus label={t("item.name.phone")} state={tier1.phone} />
        {tier1.phone !== "approved" ? (
          <>
            <LabeledInput label={t("contact.phone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
            {phoneChallenge ? (
              <>
                <LabeledInput label={t("contact.code")} value={phoneCode} onChangeText={(text) => setPhoneCode(digitsUpTo(text, 6))} keyboardType="number-pad" />
                <PillButton
                  title={t("contact.confirm")}
                  size="sm"
                  style={{ alignSelf: "flex-start" }}
                  busy={codes.busy === "phoneVerify"}
                  disabled={Boolean(codes.busy) || phoneCode.length !== 6}
                  onPress={() => void codes.run("phoneVerify", () => verifyPhoneCode(phone, phoneChallenge, phoneCode), () => { setPhoneChallenge(null); setPhoneCode(""); })}
                />
              </>
            ) : null}
            <PillButton
              title={phoneChallenge ? t("contact.resend") : t("contact.sendCode")}
              size="sm"
              tone="white"
              style={{ alignSelf: "flex-start" }}
              busy={codes.busy === "phoneSend"}
              disabled={Boolean(codes.busy) || !phone.trim()}
              onPress={() => void codes.run("phoneSend", () => sendPhoneCode(phone), (result) => setPhoneChallenge("challenge" in result ? result.challenge : null))}
            />
          </>
        ) : (
          <T style={{ color: colors.inkSoft }}>{identity.phone?.value}</T>
        )}

        <ItemStatus label={t("item.name.email")} state={tier1.email} />
        {tier1.email !== "approved" ? (
          <>
            <LabeledInput label={t("contact.email")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            {emailChallenge ? (
              <>
                <LabeledInput label={t("contact.code")} value={emailCode} onChangeText={(text) => setEmailCode(digitsUpTo(text, 6))} keyboardType="number-pad" />
                <PillButton
                  title={t("contact.confirm")}
                  size="sm"
                  style={{ alignSelf: "flex-start" }}
                  busy={codes.busy === "emailVerify"}
                  disabled={Boolean(codes.busy) || emailCode.length !== 6}
                  onPress={() => void codes.run("emailVerify", () => verifyEmailCode(email.trim(), emailChallenge, emailCode), () => { setEmailChallenge(null); setEmailCode(""); })}
                />
              </>
            ) : null}
            <PillButton
              title={emailChallenge ? t("contact.resend") : t("contact.sendCode")}
              size="sm"
              tone="white"
              style={{ alignSelf: "flex-start" }}
              busy={codes.busy === "emailSend"}
              disabled={Boolean(codes.busy) || !email.trim()}
              onPress={() =>
                void codes.run("emailSend", () => sendEmailCode(email.trim()), (result) => {
                  // The account's own confirmed email is approved at once (the answer is then the whole state).
                  if ("challenge" in result) setEmailChallenge(result.challenge);
                })
              }
            />
          </>
        ) : (
          <T style={{ color: colors.inkSoft }}>{identity.email?.value}</T>
        )}
        {codes.notes}
      </StepCard>

      <StepCard title={t("nin.title")} sub={t("nin.sub")}>
        <ItemStatus label={t("item.name.selfie")} state={tier1.selfie} reason={selfieDoc?.rejectionReason} />
        <ItemStatus label={t("item.name.nin")} state={tier1.nin} reason={identity.nin?.rejectionReason} />
        {identity.nin ? <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("nin.ending", { last4: identity.nin.last4 })}</T> : null}
        {tier1.nin !== "approved" || tier1.selfie !== "approved" ? (
          <>
            {LIVENESS_ON ? (
              passed ? (
                <T style={{ color: colors.success, fontWeight: "700" }}>{t("selfie.livenessPassed")}</T>
              ) : (
                <>
                  <PillButton title={t("selfie.livenessStart")} size="sm" tone="white" style={{ alignSelf: "flex-start" }} busy={checking} disabled={Boolean(id.busy) || checking} onPress={() => void faceCheck()} />
                  <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("selfie.livenessFirst")}</T>
                </>
              )
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {selfie ? <Image source={{ uri: selfie.uri }} style={{ width: 72, height: 72, borderRadius: 36 }} accessibilityLabel={t("selfie.taken")} /> : null}
              <PillButton title={selfie ? t("selfie.retake") : t("selfie.take")} size="sm" tone="white" onPress={() => void takeSelfie()} disabled={Boolean(id.busy) || (LIVENESS_ON && !passed)} />
            </View>
            <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("selfie.hint")}</T>
            <LabeledInput label={t("nin.number")} value={nin} onChangeText={(text) => setNin(digitsUpTo(text, 11))} keyboardType="number-pad" />
            <LabeledInput label={t("dob.label")} value={dob} onChangeText={setDob} placeholder={t("dob.placeholder")} keyboardType="numbers-and-punctuation" />
            {!state.idChecksReady ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("nin.manual")}</T> : null}
            <PillButton title={t("nin.check")} busy={id.busy === "nin"} disabled={Boolean(id.busy)} onPress={sendNin} />
          </>
        ) : null}
        {id.notes}
      </StepCard>
      {liveness.screen}
    </>
  );
}

