import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router } from "expo-router";
import { canonicalState } from "@shared/delivery-market";
import { ID_TYPES, ITEM_SCREEN, type FlowScreen, type IdType } from "@shared/partner-tiers";
import { Choice } from "@/components/design";
import { LabeledInput } from "@/components/PartnerKit";
import { TonePill } from "@/components/partner";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { acceptTerms, checkNin, saveBase, saveIdDocument, sendPhoneCode, sendSelfie, submitKyc, verifyPhoneCode, type KycState } from "@/lib/kyc";
import { birthDate, digitsUpTo, itemsWhereOpen, selfieDataUri } from "@/lib/kyc-pure";
import { colors } from "@/theme";
import { ItemStatus, Question, openOnWeb, useStepAction, type ScreenProps, type StepProps } from "./KycKit";
import { LIVENESS_ON, useKoraLiveness, type LivenessPass } from "./KoraLiveness";
import { livenessStartProblem } from "@shared/liveness-name";

// Screens 8–11 of the partner sign-up on the phone: where they're based (the phone's location, the address, an
// optional photo), a photo of their ID, the selfie (Korapay's liveness check first when it's switched on), then
// review and send ("You're in review" once sent, their status after).

/** NIN details typed on the ID screen, checked with the selfie on the next one. */
export type NinDraft = { nin: string; firstName: string; lastName: string; dob: string };

/** A photo from the camera as a data URI the kyc routes take; null when cancelled, an error word when it can't be used. */
async function snap(front: boolean): Promise<{ uri: string; dataUri: string } | "denied" | "tooBig" | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return "denied";
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back, quality: 0.4, base64: true, ...(front ? { allowsEditing: true, aspect: [1, 1] as [number, number] } : {}) });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const dataUri = selfieDataUri(asset.base64, asset.mimeType);
  return dataUri ? { uri: asset.uri, dataUri } : "tooBig";
}

export function BaseScreen({ state, onState, onDone }: ScreenProps) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const base = state.identity.base;
  const [address, setAddress] = useState(base?.address ?? state.identity.address?.value ?? "");
  const [baseState, setBaseState] = useState(base?.state ?? state.flow.answers.homeState ?? "");
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(base?.lat !== undefined && base.lng !== undefined ? { lat: base.lat, lng: base.lng } : null);
  const [locating, setLocating] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; dataUri: string } | null>(null);

  async function locate() {
    action.setError(null);
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return action.setError(t("q.base.locateFailed"));
      const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { lat: Math.round(here.coords.latitude * 1e6) / 1e6, lng: Math.round(here.coords.longitude * 1e6) / 1e6 };
      setSpot(point);
      // Fill the address from the phone when it's still empty (they can correct it).
      const [place] = await Location.reverseGeocodeAsync({ latitude: point.lat, longitude: point.lng }).catch(() => []);
      if (place) {
        if (!address.trim()) setAddress([place.name, place.street, place.district ?? place.city].filter(Boolean).join(", "));
        const named = canonicalState(place.region ?? "");
        if (named && !baseState) setBaseState(named);
      }
    } catch {
      action.setError(t("q.base.locateFailed"));
    } finally {
      setLocating(false);
    }
  }

  async function takePhoto() {
    const shot = await snap(false);
    if (shot === "denied") return action.setError(t("selfie.cameraOff"));
    if (shot === "tooBig") return action.setError(t("selfie.tooBig"));
    if (shot) setPhoto(shot);
  }

  const hasPhoto = state.docs.some((doc) => doc.type === "base-photo" && doc.filePath);
  return (
    <Question
      title={t("q.base.title")}
      sub={t("q.base.sub")}
      error={action.error}
      busy={action.busy === "base"}
      canContinue={address.trim().length >= 5}
      onContinue={() => void action.run("base", () => saveBase({ address: address.trim(), state: baseState || undefined, ...(spot ?? {}), ...(photo ? { photo: photo.dataUri } : {}) }), onDone)}
    >
      <PillButton title={locating ? t("q.base.locating") : spot ? t("q.base.located") : t("q.base.locate")} icon={spot ? "check" : "pin"} tone="white" busy={locating} onPress={() => void locate()} />
      <LabeledInput label={t("q.base.address")} value={address} onChangeText={setAddress} autoCapitalize="words" multiline />
      {baseState ? <T style={{ color: colors.inkSoft }}>{t("q.base.inState", { state: baseState })}</T> : null}
      <Card style={{ gap: 10 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>{t("q.base.photo")}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14 }}>{hasPhoto && !photo ? t("q.base.photoSent") : t("q.base.photoHint")}</T>
        {photo ? <Image source={{ uri: photo.uri }} style={{ width: "100%", height: 180, borderRadius: 14 }} accessibilityLabel={t("q.base.photo")} /> : null}
        <PillButton title={photo ? t("q.photo.retake") : t("q.base.takePhoto")} icon="camera" size="sm" tone="white" style={{ alignSelf: "flex-start" }} onPress={() => void takePhoto()} />
      </Card>
    </Question>
  );
}

function NinFields({ draft, onDraft }: { draft: NinDraft; onDraft: (draft: NinDraft) => void }) {
  const t = useT("m_kyc");
  return (
    <Card style={{ gap: 10 }}>
      <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("q.id.ninHint")}</T>
      <LabeledInput label={t("nin.number")} value={draft.nin} onChangeText={(text) => onDraft({ ...draft, nin: digitsUpTo(text, 11) })} keyboardType="number-pad" />
      <LabeledInput label={t("identity.first")} value={draft.firstName} onChangeText={(text) => onDraft({ ...draft, firstName: text })} autoCapitalize="words" />
      <LabeledInput label={t("identity.last")} value={draft.lastName} onChangeText={(text) => onDraft({ ...draft, lastName: text })} autoCapitalize="words" />
      <LabeledInput label={t("dob.label")} value={draft.dob} onChangeText={(text) => onDraft({ ...draft, dob: text })} placeholder={t("dob.placeholder")} keyboardType="numbers-and-punctuation" />
    </Card>
  );
}

const ninReady = (draft: NinDraft) => draft.nin.length === 11 && draft.firstName.trim().length >= 2 && draft.lastName.trim().length >= 2 && Boolean(birthDate(draft.dob));

export function IdScreen({ state, onState, onDone, draft, onDraft }: ScreenProps & { draft: NinDraft; onDraft: (draft: NinDraft) => void }) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const [idType, setIdType] = useState<IdType | null>(state.identity.idDocument?.type ?? null);
  const [photo, setPhoto] = useState<{ uri: string; dataUri: string } | null>(null);
  const sent = (state.tier1.idDocument === "approved" || state.tier1.idDocument === "pending") && idType === state.identity.idDocument?.type;
  const ninNeeded = idType === "nin_slip" && state.identity.nin?.status !== "approved";

  async function takePhoto() {
    action.setError(null);
    const shot = await snap(false);
    if (shot === "denied") return action.setError(t("selfie.cameraOff"));
    if (shot === "tooBig") return action.setError(t("selfie.tooBig"));
    if (shot) setPhoto(shot);
  }

  return (
    <Question
      title={t("q.id.title")}
      sub={t("q.id.sub")}
      error={action.error}
      busy={action.busy === "id"}
      canContinue={Boolean(idType) && (Boolean(photo) || sent) && (!ninNeeded || ninReady(draft))}
      onContinue={() => (photo && idType ? void action.run("id", () => saveIdDocument(idType, photo.dataUri), onDone) : onDone())}
    >
      {ID_TYPES.map((type) => <Choice key={type} title={t(`idType.${type}`)} on={idType === type} onPress={() => setIdType(type)} />)}
      {idType ? (
        <>
          {sent && !photo ? <Notice tone="success">{t("q.id.sent")}</Notice> : null}
          {photo ? <Image source={{ uri: photo.uri }} style={{ width: "100%", height: 200, borderRadius: 14 }} accessibilityLabel={t("q.id.title")} /> : null}
          <PillButton title={photo ? t("q.photo.retake") : t("q.id.take")} icon="camera" tone="white" onPress={() => void takePhoto()} />
          {ninNeeded ? <NinFields draft={draft} onDraft={onDraft} /> : null}
        </>
      ) : null}
    </Question>
  );
}

export function SelfieScreen({ state, onState, onDone, draft, onDraft }: ScreenProps & { draft: NinDraft; onDraft: (draft: NinDraft) => void }) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const [selfie, setSelfie] = useState<{ uri: string; dataUri: string } | null>(null);
  const liveness = useKoraLiveness();
  const [passed, setPassed] = useState<LivenessPass | null>(null);
  /** Korapay refused to start the check: the selfie goes without it, and the team checks it. */
  const [livenessOff, setLivenessOff] = useState(false);
  const [checking, setChecking] = useState(false);
  const byNin = state.identity.idDocument?.type === "nin_slip" && state.identity.nin?.status !== "approved";
  const sent = state.tier1.selfie === "approved" || state.tier1.selfie === "pending";
  const selfieDoc = state.docs.find((doc) => doc.type === "selfie");

  async function faceCheck() {
    action.setError(null);
    setChecking(true);
    try {
      const result = await liveness.start({ firstName: draft.firstName, lastName: draft.lastName });
      if (result) setPassed(result);
      else action.setError(t("selfie.livenessFailed"));
    } catch (error) {
      if (livenessStartProblem(error) === "service") {
        setLivenessOff(true);
        action.setError(t("selfie.livenessOff"));
      } else action.setError(t("selfie.livenessUnavailable"));
    } finally {
      setChecking(false);
    }
  }

  async function takeSelfie() {
    action.setError(null);
    const shot = await snap(true);
    if (shot === "denied") return action.setError(t("selfie.cameraOff"));
    if (shot === "tooBig") return action.setError(t("selfie.tooBig"));
    if (shot) setSelfie(shot);
  }

  function send() {
    if (!selfie) return onDone();
    if (LIVENESS_ON && !passed && !livenessOff) return action.setError(t("selfie.livenessFirst"));
    const extra = passed ? { liveness: passed } : {};
    if (byNin) {
      const born = birthDate(draft.dob);
      if (!born || !ninReady(draft)) return action.setError(t("dob.invalid"));
      void action.run("selfie", () => checkNin({ nin: draft.nin, firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), dateOfBirth: born, selfie: selfie.dataUri, ...extra }), () => { setSelfie(null); onDone(); });
    } else {
      void action.run("selfie", () => sendSelfie({ selfie: selfie.dataUri, ...extra }), () => { setSelfie(null); onDone(); });
    }
  }

  return (
    <Question title={t("q.selfie.title")} sub={t("q.selfie.sub")} error={action.error} busy={action.busy === "selfie"} canContinue={Boolean(selfie) || sent} onContinue={send}>
      {state.tier1.selfie === "rejected" && selfieDoc?.rejectionReason ? <Notice>{selfieDoc.rejectionReason}</Notice> : null}
      {sent && !selfie ? <Notice tone="success">{state.tier1.selfie === "approved" ? t("selfie.matched") : t("selfie.waiting")}</Notice> : null}
      <View style={{ alignItems: "center", gap: 10, borderRadius: 22, backgroundColor: colors.ink, padding: 22 }}>
        {selfie ? (
          <Image source={{ uri: selfie.uri }} style={{ width: 140, height: 180, borderRadius: 90 }} accessibilityLabel={t("selfie.taken")} />
        ) : (
          <View style={{ width: 140, height: 180, borderRadius: 90, borderWidth: 4, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.7)" }} />
        )}
        <T style={{ color: "#FFFFFF", textAlign: "center" }}>{t("q.selfie.how")}</T>
      </View>
      {LIVENESS_ON && !livenessOff ? (
        passed ? (
          <T weight="bold" style={{ color: colors.success }}>{t("selfie.livenessPassed")}</T>
        ) : (
          <PillButton title={t("selfie.livenessStart")} tone="white" busy={checking} onPress={() => void faceCheck()} />
        )
      ) : null}
      <PillButton title={selfie ? t("selfie.retake") : t("selfie.take")} icon="camera" tone="white" disabled={LIVENESS_ON && !passed && !livenessOff} onPress={() => void takeSelfie()} />
      {byNin && !ninReady(draft) ? <NinFields draft={draft} onDraft={onDraft} /> : null}
      {byNin && !state.idChecksReady ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("nin.manual")}</T> : null}
      {liveness.screen}
    </Question>
  );
}

const STATE_TONE = { unverified: "muted", pending_review: "info", tier1_verified: "success", tier2_verified: "success", rejected: "danger", suspended: "danger" } as const;

/** Screen 11: what's still needed (phone, terms), Send, then "You're in review" and the status after. */
export function ReviewScreen({ state, onState, goTo }: StepProps & { goTo: (screen: FlowScreen) => void }) {
  const t = useT("m_kyc");
  const action = useStepAction(onState);
  const [agreed, setAgreed] = useState(state.termsCurrent);
  const [phone, setPhone] = useState(state.identity.phone?.value ?? "");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const open = itemsWhereOpen(state.tier1).filter((item) => item.key !== "terms");
  const verified = state.state === "tier1_verified" || state.state === "tier2_verified";
  const showStatus = Boolean(state.submittedAt) && open.length === 0 && state.state !== "rejected" && state.state !== "unverified";

  async function send() {
    if (!agreed) return action.setError(t("terms.needed"));
    await action.run("send", async () => {
      if (!state.termsCurrent) await acceptTerms();
      return submitKyc();
    });
  }

  if (showStatus) {
    return (
      <View style={{ gap: 16 }}>
        <Card style={{ gap: 10 }}>
          <TonePill tone={STATE_TONE[state.state]} label={verified ? t(`state.${state.state}`) : t("q.done.title")} />
          <T weight="extrabold" style={{ fontSize: 26 }}>{verified ? t(`state.${state.state}`) : state.state === "suspended" ? t("state.suspended") : t("q.done.title")}</T>
          <T style={{ color: colors.inkSoft, lineHeight: 22 }}>{verified ? t(`state.${state.state}.hint`) : state.state === "suspended" ? t("state.suspended.hint") : t("q.done.body")}</T>
          {state.badges.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {state.badges.map((badge) => <TonePill key={badge} tone="success" label={t.dynamic(`badge.${badge}`, badge)} />)}
            </View>
          ) : null}
        </Card>
        <T weight="extrabold" style={{ fontSize: 17 }}>{t("q.extra.title")}</T>
        {state.tier !== "tier2" ? <Choice title={t("q.extra.cac")} sub={t("q.extra.cacSub")} on={false} onPress={() => goTo("cac")} /> : null}
        {!state.docs.some((doc) => doc.type === "base-photo" && doc.filePath) ? <Choice title={t("q.extra.base")} sub={t("q.extra.baseSub")} on={false} onPress={() => goTo("base")} /> : null}
        {!state.badges.includes("payout_ready") ? <Choice title={t("q.extra.bank")} sub={t("q.extra.bankSub")} on={false} onPress={() => router.push("/wallet")} /> : null}
        <Pressable accessibilityRole="link" onPress={() => openOnWeb("/logistics/cac-help")}>
          <T weight="bold" style={{ color: colors.forest }}>{t("noCac.link")}</T>
        </Pressable>
      </View>
    );
  }

  return (
    <Question
      title={state.state === "rejected" ? t("state.rejected") : t("q.review.title")}
      sub={state.state === "rejected" ? state.statusReason ?? t("state.rejected.hint") : t("q.review.sub")}
      error={action.error}
      busy={action.busy === "send"}
      canContinue={open.length === 0 && state.state !== "suspended"}
      continueLabel={state.submittedAt ? t("review.sendAgain") : t("review.send")}
      onContinue={() => void send()}
    >
      <Card style={{ gap: 12 }}>
        {Object.entries(state.tier1).map(([key, value]) => (
          <View key={key} style={{ gap: 6 }}>
            <ItemStatus label={t.dynamic(`item.name.${key}`, key)} state={key === "terms" && agreed ? "approved" : value} />
            {(value === "missing" || value === "rejected") && key !== "terms" && key !== "phone" ? (
              <Pressable accessibilityRole="button" onPress={() => goTo(ITEM_SCREEN[key as keyof typeof ITEM_SCREEN])}>
                <T weight="bold" style={{ textDecorationLine: "underline" }}>{t("review.fix")}</T>
              </Pressable>
            ) : null}
          </View>
        ))}
      </Card>
      {state.tier1.phone !== "approved" ? (
        <Card style={{ gap: 10 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{t("q.review.phone")}</T>
          <LabeledInput label={t("contact.phone")} value={phone} onChangeText={(text) => { setPhone(text); setChallenge(null); }} keyboardType="phone-pad" autoComplete="tel" />
          {challenge ? (
            <>
              <LabeledInput label={t("contact.code")} value={code} onChangeText={(text) => setCode(digitsUpTo(text, 6))} keyboardType="number-pad" />
              <PillButton title={t("contact.confirm")} size="sm" style={{ alignSelf: "flex-start" }} busy={action.busy === "verify"} disabled={code.length !== 6} onPress={() => void action.run("verify", () => verifyPhoneCode(phone, challenge, code), () => { setChallenge(null); setCode(""); })} />
            </>
          ) : null}
          <PillButton title={challenge ? t("contact.resend") : t("contact.sendCode")} size="sm" tone="white" style={{ alignSelf: "flex-start" }} busy={action.busy === "code"} disabled={!phone.trim()} onPress={() => void action.run("code", () => sendPhoneCode(phone), (result) => setChallenge(result.challenge))} />
        </Card>
      ) : null}
      {!state.termsCurrent ? (
        <Choice title={t("terms.agree")} on={agreed} multi onPress={() => setAgreed(!agreed)} />
      ) : null}
      <Pressable accessibilityRole="link" onPress={() => openOnWeb("/logistics/terms")}>
        <T weight="bold" style={{ color: colors.forest }}>{t("terms.read")}</T>
      </Pressable>
    </Question>
  );
}

export type { KycState };
