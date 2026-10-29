import { useEffect, useState, type ReactNode } from "react";
import { Image, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { canonicalState, NG_STATES } from "@shared/delivery-market";
import {
  BUY_MODES,
  SUPPLIER_ID_TYPES,
  SUPPLY_SOURCES,
  isSupplierStep,
  nextStep,
  previousStep,
  stepPosition,
  supplierTierBadges,
  type BuyMode,
  type CacAnswer,
  type SupplierIdType,
  type SupplierOnboardingStep,
} from "@shared/supplier-onboarding";
import { Choice, Pill, Seg, type PillTone } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { CallPeggyButton } from "@/components/CallPeggyButton";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { FlowFrame, NoteCard } from "@/components/SupplierKit";
import { StatePicker } from "@/components/StatePicker";
import { Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { LIVENESS_ON, useKoraLiveness, type LivenessPass } from "@/components/kyc/KoraLiveness";
import { useT } from "@/lib/i18n";
import { birthDate, selfieDataUri } from "@/lib/kyc-pure";
import { openSupportWhatsApp } from "@/lib/support";
import {
  addFirstSupplierProduct,
  checkSupplierCac,
  fetchSupplierJoin,
  saveSupplierJoin,
  sendSupplierId,
  sendSupplierSelfie,
  type SupplierJoin,
} from "@/lib/supplier";
import { usePeggyContinue, usePeggySaved } from "@/lib/peggy-call";
import { useLoad } from "@/lib/useLoad";
import { supplierReviewItems, type ReviewItemState } from "@/lib/supplier-pure";
import { colors } from "@/theme";
import { livenessStartProblem } from "@shared/liveness-name";

// Supplier onboarding on the phone, one question per screen (the web's /supplier/onboarding does the same;
// shared/supplier-onboarding.ts has the order): business name · CAC · what they supply · make, import or resell · how
// shops can buy · minimum order (with Wholesale) · where goods leave from · a photo of their ID · a selfie (Korapay's
// face check first when EXPO_PUBLIC_KORAPAY_PUBLIC_KEY is set) · first product · "You're in review". Every Continue
// saves with the next screen, so leaving and coming back resumes there. No bank account here: it's asked at the
// first payout.

const STATE_OPTIONS = NG_STATES.map((state) => ({ label: state === "FCT" ? "Abuja (FCT)" : state, value: state }));

type Picked = { uri: string; dataUri: string };

/** S11-Review's pills: DONE green, CHECKING amber, IN PROGRESS teal, OPTIONAL grey, NEEDED orange. */
const REVIEW_TONE: Record<ReviewItemState, PillTone> = { done: "ok", checking: "warn", progress: "teal", optional: "gray", needed: "org" };

async function takePhoto(front: boolean): Promise<Picked | "denied" | "big" | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return "denied";
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back, allowsEditing: front, ...(front ? { aspect: [1, 1] as [number, number] } : {}), quality: front ? 0.35 : 0.45, base64: true });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const dataUri = selfieDataUri(asset.base64, asset.mimeType);
  return dataUri ? { uri: asset.uri, dataUri } : "big";
}

export function SupplierJoinFlow() {
  const t = useT("supplierJoin", "common");
  const loaded = useLoad(fetchSupplierJoin);
  const [view, setView] = useState<SupplierJoin | null>(null);
  const [step, setStep] = useState<SupplierOnboardingStep>("name");
  const [cacPhase, setCacPhase] = useState<"ask" | "number" | "confirm">("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [cacNumber, setCacNumber] = useState("");
  const [cacFound, setCacFound] = useState<{ name: string; verified: boolean } | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [modes, setModes] = useState<BuyMode[]>([]);
  const [moq, setMoq] = useState(10);
  const [state, setState] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [idType, setIdType] = useState<SupplierIdType | null>(null);
  const [idPhoto, setIdPhoto] = useState<Picked | null>(null);
  const [nin, setNin] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [selfie, setSelfie] = useState<Picked | null>(null);
  const liveness = useKoraLiveness();
  const [passed, setPassed] = useState<LivenessPass | null>(null);
  /** Korapay refused to start the check: the selfie goes without it, and the team checks it. */
  const [livenessOff, setLivenessOff] = useState(false);
  const [checking, setChecking] = useState(false);
  const [productPhoto, setProductPhoto] = useState<Picked | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");

  // Start from what's saved, on the screen saved last.
  useEffect(() => {
    const data = loaded.data;
    if (!data || view) return;
    setView(data);
    setStep(data.completed ? "review" : isSupplierStep(data.step) ? data.step : "name");
    setName(data.displayName || data.businessName || "");
    setCacNumber(data.cac?.number ?? "");
    setCats(data.categories);
    setModes(BUY_MODES.filter((mode) => data.buyModes.includes(mode) && !(mode === "preorder" && data.preorderLocked !== false)));
    setMoq(data.minimumOrder ?? 10);
    setState(data.originState ?? "");
    setArea(data.city && data.city !== data.originState ? data.city : "");
    setAddress(data.address ?? "");
    if (data.pickupLat !== null && data.pickupLng !== null) setCoords({ lat: data.pickupLat, lng: data.pickupLng });
    setIdType(data.idType);
    setFirstName(data.owner.firstName);
    setLastName(data.owner.lastName);
  }, [loaded.data, view]);

  // On a call with Peggy, what she saves fills the screens here; after the call it opens the screen saved last.
  usePeggySaved(() => {
    setView(null);
    void loaded.reload();
  });
  usePeggyContinue(() => {
    void fetchSupplierJoin()
      .then((fresh) => {
        setView(fresh);
        if (!fresh.completed && isSupplierStep(fresh.step)) setStep(fresh.step);
      })
      .catch(() => undefined);
    return true;
  });

  if (!view) {
    return (
      <FlowFrame onBack={() => router.back()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </FlowFrame>
    );
  }
  const current = view;
  // Older servers don't say: the server drops Pre-order below Established anyway, so show it locked.
  const preorderIsLocked = current.preorderLocked !== false;
  const { index, total } = stepPosition(step, modes);

  function go(next: SupplierOnboardingStep) {
    setError(null);
    setStep(next);
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError((failure instanceof Error && failure.message) || t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function save(patch: Record<string, unknown>, next: SupplierOnboardingStep) {
    void run(async () => {
      setView(await saveSupplierJoin({ ...patch, step: next }));
      setNote(null);
      go(next);
    });
  }

  function back() {
    if (step === "cac" && cacPhase !== "ask") return setCacPhase(cacPhase === "confirm" ? "number" : "ask");
    const previous = previousStep(step, modes);
    if (previous) go(previous);
    else router.back();
  }

  async function snap(front: boolean, set: (value: Picked) => void) {
    const picked = await takePhoto(front);
    if (picked === "denied") return setError(t("selfie.cameraOff"));
    if (picked === "big") return setError(t("selfie.badPhoto"));
    if (picked) set(picked);
  }

  async function useMyLocation() {
    setLocating(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") throw new Error("denied");
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      const [place] = await Location.reverseGeocodeAsync(position.coords).catch(() => []);
      const found = canonicalState(place?.region ?? place?.subregion ?? place?.city ?? null);
      if (found && !state) setState(found);
      if (place && !area) setArea(place.district ?? place.subregion ?? place.city ?? "");
      if (place && !address.trim()) setAddress([place.name, place.street].filter(Boolean).join(", "));
      setNote(t("loc.found"));
    } catch {
      setError(t("loc.denied"));
    } finally {
      setLocating(false);
    }
  }

  const ninProblem = () => {
    if (nin.replace(/\D/g, "").length !== 11) return t("id.needNin");
    if (firstName.trim().length < 2 || lastName.trim().length < 2) return t("id.needName");
    if (!birthDate(dob)) return t("id.needDob");
    return null;
  };

  const ninFields = (
    <View style={{ gap: 10 }}>
      <T weight="bold" style={{ fontSize: 16 }}>{t("id.ninTitle")}</T>
      <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("id.ninHint")}</T>
      <Field value={nin} onChangeText={(text) => setNin(text.replace(/\D/g, "").slice(0, 11))} keyboardType="number-pad" placeholder={t("id.nin")} accessibilityLabel={t("id.nin")} />
      <Field value={firstName} onChangeText={setFirstName} placeholder={t("id.firstName")} accessibilityLabel={t("id.firstName")} />
      <Field value={lastName} onChangeText={setLastName} placeholder={t("id.lastName")} accessibilityLabel={t("id.lastName")} />
      <Field value={dob} onChangeText={setDob} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" accessibilityLabel={t("id.dob")} />
    </View>
  );

  let title = "";
  let sub: string | undefined;
  let body: ReactNode = null;
  let action: { label: string; onPress: () => void } | null = null;
  let skip: (() => void) | null = null;

  if (step === "name") {
    title = t("name.title");
    sub = t("name.hint");
    // S01-Name: the field, then what's in it for them.
    body = (
      <View style={{ gap: 16 }}>
        <Field value={name} onChangeText={setName} autoFocus maxLength={120} placeholder={t("name.placeholder")} accessibilityLabel={t("name.title")} />
        <NoteCard tone="mint">{t("name.pitch")}</NoteCard>
      </View>
    );
    action = { label: t("continue"), onPress: () => (name.trim().length < 2 ? setError(t("name.need")) : save({ businessName: name.trim() }, "cac")) };
  } else if (step === "cac" && cacPhase === "ask") {
    title = t("cac.title");
    const answer = (value: CacAnswer) => {
      if (value !== "yes") return save({ cacAnswer: value }, "categories");
      void run(async () => {
        setView(await saveSupplierJoin({ cacAnswer: "yes", step: "cac" }));
        setCacPhase("number");
      });
    };
    body = (
      <View style={{ gap: 10 }}>
        {(["yes", "no", "registering"] as const).map((value) => <Choice key={value} title={t(`cac.${value}`)} on={current.cacAnswer === value} onPress={() => answer(value)} />)}
        <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("cac.noteNo")}</T>
      </View>
    );
  } else if (step === "cac" && cacPhase === "number") {
    title = t("cac.numberTitle");
    sub = current.cacCheckEnabled ? t("cac.numberHint") : t("cac.off");
    body = current.cacCheckEnabled ? <Field value={cacNumber} onChangeText={(text) => setCacNumber(text.toUpperCase())} autoCapitalize="characters" autoFocus placeholder={t("cac.numberPlaceholder")} accessibilityLabel={t("cac.numberTitle")} /> : null;
    action = current.cacCheckEnabled
      ? {
          label: t("cac.check"),
          onPress: () => {
            if (cacNumber.trim().length < 3) return setError(t("cac.needNumber"));
            void run(async () => {
              const result = await checkSupplierCac({ businessName: current.businessName || name, number: cacNumber.trim() });
              if (!result.registeredName) throw new Error(result.message);
              setCacFound({ name: result.registeredName, verified: result.outcome === "verified" });
              setCacPhase("confirm");
            });
          },
        }
      : { label: t("continue"), onPress: () => go("categories") };
    skip = () => go("categories");
  } else if (step === "cac") {
    title = t("cac.confirmTitle");
    body = (
      <View style={{ gap: 12 }}>
        <NoteCard tone="ok" title={cacFound?.name ?? ""}>{cacFound?.verified ? t("cac.verified") : ""}</NoteCard>
        <PillButton title={t("cac.confirmNo")} tone="white" size="md" onPress={() => setCacPhase("number")} />
      </View>
    );
    action = { label: t("cac.confirmYes"), onPress: () => save({}, "categories") };
  } else if (step === "categories") {
    title = t("cats.title");
    sub = t("cats.hint");
    body = (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {current.categoryOptions.map((option) => {
          const on = cats.includes(option);
          return <Seg key={option} label={option} on={on} onPress={() => setCats(on ? cats.filter((item) => item !== option) : [...cats, option])} />;
        })}
      </View>
    );
    action = { label: t("continue"), onPress: () => (cats.length ? save({ categories: cats }, "source") : setError(t("cats.need"))) };
  } else if (step === "source") {
    title = t("source.title");
    body = (
      <View style={{ gap: 10 }}>
        {SUPPLY_SOURCES.map((value) => <Choice key={value} title={t(`source.${value}`)} on={current.source === value} onPress={() => save({ source: value }, "buyModes")} />)}
      </View>
    );
  } else if (step === "buyModes") {
    title = t("buy.title");
    sub = t("buy.hint");
    body = (
      <View style={{ gap: 10 }}>
        {BUY_MODES.map((mode) => {
          const on = modes.includes(mode);
          // Pre-order opens at Established (shared/supplier-onboarding.ts preorderLocked; the server drops it too):
          // shown locked with what unlocks it, and not selectable.
          if (mode === "preorder" && preorderIsLocked) return <LockedChoice key={mode} title={t("buy.preorder")} sub={t("buy.preorderLocked")} badge={t("buy.locked")} />;
          return <ModeChoice key={mode} title={t(`buy.${mode}`)} sub={t(`buy.${mode}Sub`)} on={on} onPress={() => setModes(on ? modes.filter((item) => item !== mode) : BUY_MODES.filter((item) => item === mode || modes.includes(item)))} />;
        })}
      </View>
    );
    action = { label: t("continue"), onPress: () => (modes.length ? save({ buyModes: modes }, nextStep("buyModes", modes)) : setError(t("buy.need"))) };
  } else if (step === "moq") {
    title = t("moq.title");
    sub = t("moq.hint");
    const by = moq >= 100 ? 10 : 1;
    const round = (label: string, icon: "plus" | "x", onPress: () => void) => (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        {icon === "plus" ? <AppIcon name="plus" size={26} /> : <T weight="bold" style={{ fontSize: 30, lineHeight: 32 }}>−</T>}
      </Pressable>
    );
    body = (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, paddingTop: 20 }}>
        {round(t("moq.less"), "x", () => setMoq(Math.max(1, moq - by)))}
        <View style={{ minWidth: 120, alignItems: "center" }}>
          <Field value={String(moq)} onChangeText={(text) => setMoq(Math.max(1, Math.min(100_000, Number(text.replace(/\D/g, "")) || 1)))} keyboardType="number-pad" accessibilityLabel={t("moq.title")} style={{ fontSize: 40, fontWeight: "800", textAlign: "center", borderWidth: 0, backgroundColor: "transparent" }} />
          <T style={{ color: colors.inkSoft }}>{t("moq.items", { count: moq })}</T>
        </View>
        {round(t("moq.more"), "plus", () => setMoq(Math.min(100_000, moq + by)))}
      </View>
    );
    action = { label: t("continue"), onPress: () => save({ minimumOrder: moq }, "location") };
  } else if (step === "location") {
    title = t("loc.title");
    body = (
      <View style={{ gap: 14 }}>
        <PillButton title={coords ? t("loc.found") : t("loc.useMine")} icon={coords ? "check" : "pin"} tone={coords ? "white" : "ink"} size="md" busy={locating} onPress={() => void useMyLocation()} />
        <StatePicker single title={t("loc.state")} placeholder={t("loc.statePick")} options={STATE_OPTIONS} selected={state ? [state] : []} onToggle={(value) => setState(value)} testID="supplier-origin-state" />
        <Field value={area} onChangeText={setArea} placeholder={t("loc.areaPlaceholder")} accessibilityLabel={t("loc.area")} />
        <Field value={address} onChangeText={setAddress} maxLength={200} placeholder={t("loc.addressPlaceholder")} accessibilityLabel={t("loc.address")} />
      </View>
    );
    action = {
      label: t("continue"),
      onPress: () => {
        if (!state) return setError(t("loc.needState"));
        if (address.trim().length < 3) return setError(t("loc.needAddress"));
        save({ pickup: { state, area: area.trim() || undefined, address: address.trim(), lat: coords?.lat ?? null, lng: coords?.lng ?? null } }, "id");
      },
    };
  } else if (step === "id") {
    title = t("id.title");
    sub = t("id.hint");
    const saved = Boolean(current.idDocument && current.idDocument.status !== "rejected" && current.idType === idType);
    body = (
      <View style={{ gap: 14 }}>
        <View style={{ gap: 10 }}>
          {SUPPLIER_ID_TYPES.map((value) => <Choice key={value} title={t(`id.type.${value}`)} on={idType === value} onPress={() => setIdType(value)} />)}
        </View>
        {idType ? (
          <View style={{ alignItems: "center", gap: 10 }}>
            {idPhoto ? <Image source={{ uri: idPhoto.uri }} style={{ width: "100%", height: 200, borderRadius: 16 }} resizeMode="contain" accessibilityLabel={t("id.preview")} /> : saved ? <Notice tone="success">{t("id.saved")}</Notice> : null}
            <PillButton title={idPhoto || saved ? t("id.retake") : t("id.take")} icon="camera" tone={idPhoto || saved ? "white" : "ink"} size="md" onPress={() => void snap(false, setIdPhoto)} />
          </View>
        ) : null}
        {idType === "nin_slip" ? ninFields : null}
      </View>
    );
    action = {
      label: t("continue"),
      onPress: () => {
        if (!idType) return setError(t("id.needType"));
        if (!idPhoto && !saved) return setError(t("id.needPhoto"));
        const problem = idType === "nin_slip" ? ninProblem() : null;
        if (problem) return setError(problem);
        void run(async () => {
          if (idPhoto) setView(await sendSupplierId({ idType, photo: idPhoto.dataUri }));
          setIdPhoto(null);
          setView(await saveSupplierJoin({ step: "selfie" }));
          go("selfie");
        });
      },
    };
    skip = () => save({ docsLater: true }, "product");
  } else if (step === "selfie") {
    title = t("selfie.title");
    sub = t("selfie.hint");
    const needsNin = current.idType === "nin_slip" && ninProblem() !== null;
    const faceCheck = async () => {
      setChecking(true);
      setError(null);
      try {
        const result = await liveness.start({ firstName: firstName.trim(), lastName: lastName.trim() });
        if (result) setPassed(result);
        else setError(t("selfie.livenessFailed"));
      } catch (error) {
        if (livenessStartProblem(error) === "service") {
          setLivenessOff(true);
          setError(t("selfie.livenessOff"));
        } else setError(t("selfie.livenessUnavailable"));
      } finally {
        setChecking(false);
      }
    };
    body = (
      <View style={{ gap: 16, alignItems: "center" }}>
        {liveness.screen}
        <View style={{ width: 170, height: 170, borderRadius: 85, borderWidth: 3, borderStyle: "dashed", borderColor: colors.line, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
          {selfie ? <Image source={{ uri: selfie.uri }} style={{ width: 170, height: 170 }} accessibilityLabel={t("selfie.preview")} /> : <AppIcon name="user" size={64} color={colors.inkSoft} />}
        </View>
        {LIVENESS_ON && !livenessOff ? (
          passed ? (
            <T weight="bold" style={{ color: colors.success }}>{t("selfie.livenessPassed")}</T>
          ) : (
            <PillButton title={t("selfie.livenessStart")} tone="ink" size="md" busy={checking} onPress={() => void faceCheck()} />
          )
        ) : null}
        <PillButton title={selfie ? t("selfie.retake") : t("selfie.take")} icon="camera" tone={LIVENESS_ON && !passed && !livenessOff ? "white" : "ink"} size="md" disabled={LIVENESS_ON && !passed && !livenessOff} onPress={() => void snap(true, setSelfie)} />
        {LIVENESS_ON && !passed && !livenessOff ? <T style={{ color: colors.inkSoft, fontSize: 14, textAlign: "center" }}>{t("selfie.livenessFirst")}</T> : null}
        {current.selfie?.status === "rejected" && current.selfie.reason ? <Notice>{current.selfie.reason}</Notice> : null}
        {needsNin ? <View style={{ alignSelf: "stretch" }}>{ninFields}</View> : null}
      </View>
    );
    action = {
      label: t("continue"),
      onPress: () => {
        if (!selfie) return setError(t("selfie.need"));
        const withNin = current.idType === "nin_slip";
        const problem = withNin ? ninProblem() : null;
        if (problem) return setError(problem);
        void run(async () => {
          const next = await sendSupplierSelfie({
            selfie: selfie.dataUri,
            liveness: passed,
            ...(withNin ? { nin, firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth: birthDate(dob) ?? "" } : {}),
          });
          setView(next);
          if (next.selfie?.status === "rejected") {
            setSelfie(null);
            throw new Error(next.selfie.reason || t("selfie.badPhoto"));
          }
          setView(await saveSupplierJoin({ step: "product" }));
          setNote(next.selfie?.status === "approved" ? t("selfie.approved") : t("selfie.pending"));
          go("product");
        });
      },
    };
    skip = () => save({ docsLater: true }, "product");
  } else if (step === "product") {
    title = t("product.title");
    sub = t("product.hint");
    body = (
      <View style={{ gap: 14 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          {productPhoto ? <Image source={{ uri: productPhoto.uri }} style={{ width: "100%", height: 220, borderRadius: 16 }} resizeMode="contain" accessibilityLabel={t("product.preview")} /> : null}
          <PillButton title={productPhoto ? t("product.retake") : t("product.take")} icon="camera" tone={productPhoto ? "white" : "ink"} size="md" onPress={() => void snap(false, setProductPhoto)} />
        </View>
        {productPhoto ? (
          <>
            <Field value={productName} onChangeText={setProductName} maxLength={200} placeholder={t("product.namePlaceholder")} accessibilityLabel={t("product.name")} />
            <Field value={productPrice} onChangeText={(text) => setProductPrice(text.replace(/\D/g, ""))} keyboardType="number-pad" placeholder={t("product.price")} accessibilityLabel={t("product.price")} />
          </>
        ) : null}
        <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("product.whatsappLater")}</T>
      </View>
    );
    action = {
      label: t("product.add"),
      onPress: () => {
        if (!productPhoto) return setError(t("product.needPhoto"));
        if (productName.trim().length < 2) return setError(t("product.needName"));
        if (!Number(productPrice)) return setError(t("product.needPrice"));
        void run(async () => {
          const product = await addFirstSupplierProduct({ photo: productPhoto.dataUri, name: productName.trim(), price: Number(productPrice) });
          setView(await saveSupplierJoin({ step: "review" }));
          setNote(t("product.added", { name: product.name }));
          setProductPhoto(null);
          go("review");
        });
      },
    };
    skip = () => save({}, "review");
  } else {
    const idSent = Boolean(current.idDocument && current.selfie && current.idDocument.status !== "rejected" && current.selfie.status !== "rejected");
    const verified = current.verificationStatus === "verified";
    const badges = supplierTierBadges(current.tiers);
    title = current.completed ? (verified ? t("review.verifiedTitle") : t("review.title")) : idSent ? t("review.readyTitle") : t("review.missingTitle");
    sub = current.completed ? (verified ? t("review.verifiedSub") : t("review.sub")) : idSent ? t("review.readySub") : t("review.missingSub");
    // S11-Review: one row per piece, with where it stands.
    const items = supplierReviewItems(current);
    body = (
      <View style={{ gap: 14 }}>
        <View testID="supplier-review-items" style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16 }}>
          {items.map((item, position) => (
            <View key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: position ? 1 : 0, borderTopColor: colors.line }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: item.state === "done" ? colors.successTint : colors.grayTint }}>
                <AppIcon name={item.state === "done" ? "check" : item.key === "id" ? "user" : item.key === "catalogue" ? "chat" : "shield"} size={18} color={item.state === "done" ? colors.success : colors.inkSoft} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="bold" style={{ fontSize: 15 }}>{t(`review.item.${item.key}`)}</T>
                <T style={{ fontSize: 13, lineHeight: 18, color: colors.inkSoft }}>{t(`review.item.${item.key}.${item.state === "done" ? "done" : "sub"}`)}</T>
              </View>
              <Pill label={t(`review.state.${item.state}`)} tone={REVIEW_TONE[item.state]} />
            </View>
          ))}
        </View>
        {current.completed && !verified ? <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("review.once")}</T> : null}
        {badges.length ? (
          <View style={{ gap: 8 }}>
            <T weight="bold">{t("review.badges")}</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {badges.map((badge) => (
                <View key={badge} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                  <AppIcon name="check" size={15} color="#FFFFFF" />
                  <T weight="bold" style={{ color: "#FFFFFF", fontSize: 14 }}>{t.dynamic(`badge.${badge}`, badge)}</T>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {!current.completed && !idSent ? <PillButton title={t("review.addId")} tone="white" size="md" onPress={() => go("id")} /> : null}
        <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("review.payoutLater")}</T>
      </View>
    );
    action = current.completed
      ? { label: verified ? t("review.open") : t("review.lookAround"), onPress: () => router.replace("/supplier/home") }
      : idSent
        ? { label: t("review.send"), onPress: () => void run(async () => setView(await saveSupplierJoin({ completed: true, step: "review" }))) }
        : {
            label: t("review.later"),
            onPress: () =>
              void run(async () => {
                await saveSupplierJoin({ docsLater: true, step: "review" });
                router.replace("/supplier/home");
              }),
          };
  }

  const canGoBack = step !== "name" && !(step === "review" && current.completed);
  return (
    <FlowFrame
      step={t("progress", { step: index + 1, total })}
      onBack={canGoBack ? back : undefined}
      aside={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <LinkButton title={t("help")} onPress={() => void openSupportWhatsApp(t("helpMessage"))} />
          <CallPeggyButton variant="compact" />
        </View>
      }
      title={title}
      sub={sub}
      footer={
        action || skip ? (
          <>
            {step === "buyModes" && modes.length ? <T style={{ fontSize: 14, textAlign: "center", color: colors.inkSoft }}>{t.dynamic("buy.picked", "{count} picked", { count: modes.length })}</T> : null}
            {action ? <PillButton title={action.label} tone="accent" busy={busy} disabled={busy} onPress={action.onPress} /> : null}
            {skip ? <LinkButton title={t("skip")} color={colors.inkSoft} onPress={skip} /> : null}
          </>
        ) : undefined
      }
    >
      {note ? <Notice tone="success">{note}</Notice> : null}
      {body}
      {error ? <Notice>{error}</Notice> : null}
    </FlowFrame>
  );
}

/** A way to buy (S05-HowBuy `.opt`): peach with an orange ring and an orange tick box when picked. */
function ModeChoice({ title, sub, on, onPress }: { title: string; sub?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 76, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 22, borderWidth: 2, borderColor: on ? colors.accent : colors.line, backgroundColor: on ? colors.peach : colors.surface, opacity: pressed ? 0.9 : 1 })}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <T weight="extrabold" style={{ fontSize: 17 }}>{title}</T>
        {sub ? <T style={{ fontSize: 13, lineHeight: 19, color: colors.inkSoft }}>{sub}</T> : null}
      </View>
      <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: on ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: on ? colors.accent : colors.surface, alignItems: "center", justifyContent: "center" }}>
        {on ? <AppIcon name="check" size={15} color={colors.ink} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

/** A choice the supplier can't pick yet (S05-HowBuy's locked Pre-order: grey, a dashed edge and a lock), like the web. */
function LockedChoice({ title, sub, badge }: { title: string; sub: string; badge: string }) {
  return (
    <View
      accessible
      accessibilityRole="checkbox"
      accessibilityState={{ checked: false, disabled: true }}
      accessibilityLabel={`${title}. ${sub}. ${badge}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 76, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 22, borderWidth: 2, borderStyle: "dashed", borderColor: colors.line, backgroundColor: colors.grayTint }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <T weight="extrabold" style={{ fontSize: 17 }}>{title}</T>
        <T style={{ fontSize: 13, lineHeight: 19, color: colors.inkSoft }}>{sub}</T>
      </View>
      <AppIcon name="lock" size={18} color={colors.inkSoft} />
    </View>
  );
}
