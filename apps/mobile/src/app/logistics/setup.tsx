import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { LOGISTICS_DOC_TYPES } from "@shared/verification-docs";
import { Eyebrow, List, Row, Seg, Small, Sub, Tile, Title } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { CallPeggyButton } from "@/components/CallPeggyButton";
import { LoadingBlock } from "@/components/kit";
import { ChipWrap, LabeledInput, StepHeader } from "@/components/PartnerKit";
import { CoverageEditor, RateCardEditor, ServicesEditor } from "@/components/PartnerSetup";
import { Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import {
  fetchLogisticsMe,
  fetchMarket,
  fetchOnboarding,
  finishOnboarding,
  saveBusiness,
  saveCoverage,
  saveRateCard,
  submitVerification,
  uploadVerificationDoc,
  type MarketData,
} from "@/lib/logistics";
import { deliverModeOf, deliveryAreasFor, draftFromRow, nairaInput, pickupAreasFor, priceText, rowsToSave, starterRates, statesIn, type DeliverMode, type DraftRate } from "@/lib/logistics-pure";
import { checkWalletAccount, fetchWallet, linkWalletBank, type WalletData } from "@/lib/wallet";
import { colors } from "@/theme";

// Set-up for a new delivery company ("Delivery partner app" prototype pWelcome … pReview, "N of 6"): the company
// (PUT market { section: "business" }), documents (the existing verification upload, the existing document types),
// where you cover and what you offer, the rate card, the bank delivery fees are paid to (Shopinbos Wallet), then
// "Send for review": set-up is marked done (the web set-up's call), coverage and prices are saved, the bank linked
// and the documents sent to be checked. Shown while the company isn't set up (/logistics/home sends it here).

type Step = "welcome" | "biz" | "docs" | "cover" | "services" | "rates" | "payout" | "review";
const ORDER: Step[] = ["welcome", "biz", "docs", "cover", "services", "rates", "payout", "review"];

function Frame({ step, onBack, children, footer }: { step: number; onBack?: () => void; children: ReactNode; footer: ReactNode }) {
  const t = useT("m_partner", "common");
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 20 }}>
          {onBack ? <StepHeader step={step} total={6} label={t("setup.step", { step, total: 6 })} onBack={onBack} backLabel={t("back")} /> : null}
          {children}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10, gap: 10 }}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Wizard({ market, wallet, docsDone: initialDocs }: { market: MarketData; wallet: WalletData | null; docsDone: string[] }) {
  const t = useT("m_partner", "common");
  const partner = market.partner;
  const [step, setStep] = useState<Step>("welcome");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 1. Company
  const [company, setCompany] = useState(partner.companyName ?? partner.name ?? "");
  const [cac, setCac] = useState(partner.cacNumber ?? "");
  const [contact, setContact] = useState(partner.contactName ?? "");
  const [phone, setPhone] = useState(partner.contactPhone ?? "");
  const [email, setEmail] = useState(partner.contactEmail ?? "");
  const [address, setAddress] = useState(partner.address ?? "");
  // 2. Documents
  const [docsDone, setDocsDone] = useState<string[]>(initialDocs);
  // 3–4. Coverage and services
  const [pickup, setPickup] = useState<string[]>(statesIn(partner.pickupAreas));
  const [mode, setMode] = useState<DeliverMode>(deliverModeOf(partner.pickupAreas, partner.deliveryAreas));
  const [deliver, setDeliver] = useState<string[]>(statesIn(partner.deliveryAreas));
  const [services, setServices] = useState<string[]>(partner.services.length ? partner.services : ["doorstep"]);
  // 5. Rate card
  const card = market.rateCard;
  const [rows, setRows] = useState<DraftRate[]>(card?.rows.length ? card.rows.map(draftFromRow) : []);
  const [fail, setFail] = useState(priceText(card?.failedAttemptFee ?? null));
  const [ret, setRet] = useState(priceText(card?.returnFee ?? null));
  const [notes, setNotes] = useState(card?.notes ?? "");
  // 6. Payout
  const [bank, setBank] = useState<string | null>(wallet?.view.bank?.bankName ?? null);
  const [acct, setAcct] = useState("");
  const [acctName, setAcctName] = useState<string | null>(null);
  const digits = acct.replace(/\D/g, "");

  useEffect(() => {
    if (!bank || digits.length !== 10) {
      setAcctName(null);
      return;
    }
    let live = true;
    checkWalletAccount({ bankName: bank, accountNumber: digits })
      .then((result) => live && setAcctName(result.status === "resolved" ? result.accountName : null))
      .catch(() => live && setAcctName(null));
    return () => {
      live = false;
    };
  }, [bank, digits]);

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };
  const back = () => go(ORDER[Math.max(0, ORDER.indexOf(step) - 1)]);

  async function saveCompany() {
    setBusy("biz");
    setError(null);
    try {
      await saveBusiness({ companyName: company.trim(), cacNumber: cac.trim(), contactName: contact.trim(), contactPhone: phone.trim(), contactEmail: email.trim(), address: address.trim() });
      go("docs");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("error.retry"));
    } finally {
      setBusy(null);
    }
  }

  async function upload(type: string) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError(t("docs.photosOff"));
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setBusy(`doc:${type}`);
    setError(null);
    try {
      await uploadVerificationDoc(type, { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
      setDocsDone((was) => [...new Set([...was, type])]);
    } catch (uploadError) {
      setError(uploadError instanceof Error && uploadError.message ? uploadError.message : t("docs.failed"));
    } finally {
      setBusy(null);
    }
  }

  function toRates() {
    if (!rows.length) setRows(starterRates(pickup, mode, deliver, services));
    go("rates");
  }

  async function sendForReview() {
    const priced = rowsToSave(rows);
    if (!priced.length) return setError(t("rates.needOne"));
    setBusy("review");
    setError(null);
    try {
      // Set-up done (the web set-up's call; it needs a zone, a vehicle and a delivery type, so earlier answers are
      // kept and the first pickup states stand in for zones).
      const before = await fetchOnboarding().catch(() => null);
      await finishOnboarding({
        displayName: company.trim().length >= 2 ? company.trim() : undefined,
        coverageZones: (pickup.length ? pickup : ["Lagos"]).slice(0, 4),
        vehicleTypes: before?.vehicleTypes.length ? before.vehicleTypes : ["bike"],
        deliveryTypes: before?.deliveryTypes.length ? before.deliveryTypes : services.includes("same_day") ? ["same_day", "next_day"] : ["next_day"],
        basePrice: Math.min(...priced.map((row) => row.price)),
      });
      await saveCoverage({ services, pickupAreas: pickupAreasFor(pickup, partner.pickupAreas), deliveryAreas: deliveryAreasFor(mode, pickup, deliver, partner.deliveryAreas), offersPayOnDelivery: partner.offersPayOnDelivery });
      await saveRateCard({ rows: priced, failedAttemptFee: nairaInput(fail) ?? 0, returnFee: nairaInput(ret) ?? 0, notes });
      if (bank && digits.length === 10) await linkWalletBank({ bankName: bank, accountNumber: digits });
      // Sent to be checked once the required documents are in; otherwise they can upload them from Verification.
      await submitVerification().catch(() => null);
      go("review");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("error.retry"));
    } finally {
      setBusy(null);
    }
  }

  const next = (onPress: () => void, key = "next") => <PillButton title={t("next")} busy={busy === key} disabled={Boolean(busy)} onPress={onPress} />;
  const note = error ? <Notice>{error}</Notice> : null;

  if (step === "welcome") {
    return (
      <Frame
        step={0}
        footer={
          <>
            <PillButton tone="forest" title={t("setup.start")} onPress={() => go("biz")} />
            <Small style={{ textAlign: "center" }}>{t("setup.free")}</Small>
            <CallPeggyButton style={{ marginTop: 6 }} />
          </>
        }
      >
        <View style={{ alignItems: "center", gap: 18, paddingTop: 80 }}>
          <View style={{ width: 96, height: 96, borderRadius: 32, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="truck" size={46} color={colors.forest} strokeWidth={1.8} />
          </View>
          <Eyebrow>{t("setup.eyebrow")}</Eyebrow>
          <Title style={{ textAlign: "center" }}>{t("setup.title")}</Title>
          <Sub style={{ textAlign: "center" }}>{t("setup.sub")}</Sub>
        </View>
      </Frame>
    );
  }

  if (step === "biz") {
    return (
      <Frame step={1} onBack={back} footer={next(() => void saveCompany(), "biz")}>
        <Title>{t("setup.bizTitle")}</Title>
        <LabeledInput label={t("setup.company")} value={company} onChangeText={setCompany} autoCapitalize="words" />
        <LabeledInput label={t("setup.cac")} value={cac} onChangeText={setCac} autoCapitalize="characters" />
        <LabeledInput label={t("setup.contact")} value={contact} onChangeText={setContact} autoCapitalize="words" autoComplete="name" />
        <LabeledInput label={t("setup.phone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <LabeledInput label={t("setup.email")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <LabeledInput label={t("setup.office")} value={address} onChangeText={setAddress} autoCapitalize="words" />
        {note}
      </Frame>
    );
  }

  if (step === "docs") {
    return (
      <Frame step={2} onBack={back} footer={next(() => go("cover"))}>
        <View style={{ gap: 8 }}>
          <Title>{t("docs.title")}</Title>
          <Sub>{t("docs.sub")}</Sub>
        </View>
        <List>
          {LOGISTICS_DOC_TYPES.map((doc) => {
            const done = docsDone.includes(doc.type);
            return (
              <Row
                key={doc.type}
                lead={<Tile icon={done ? "check" : "doc"} tone={done ? "ok" : "gray"} />}
                title={t.dynamic(`docs.${doc.type}`, doc.label)}
                sub={done ? t("docs.uploaded") : doc.required ? t("docs.photo") : t("docs.optional")}
                right={done ? undefined : <PillButton tone="white" size="sm" title={t("docs.upload")} busy={busy === `doc:${doc.type}`} disabled={Boolean(busy)} onPress={() => void upload(doc.type)} />}
              />
            );
          })}
        </List>
        {note}
      </Frame>
    );
  }

  if (step === "cover") {
    return (
      <Frame step={3} onBack={back} footer={next(() => (!pickup.length ? setError(t("cover.needPickup")) : mode === "some" && !deliver.length ? setError(t("cover.needDeliver")) : go("services")))}>
        <Title>{t("setup.coverTitle")}</Title>
        <CoverageEditor wizard pickup={pickup} onPickup={setPickup} mode={mode} onMode={setMode} deliver={deliver} onDeliver={setDeliver} />
        <Small>{t("setup.coverNote")}</Small>
        {note}
      </Frame>
    );
  }

  if (step === "services") {
    return (
      <Frame step={4} onBack={back} footer={next(() => (services.length ? toRates() : setError(t("svc.needOne"))))}>
        <View style={{ gap: 8 }}>
          <Title>{t("setup.svcTitle")}</Title>
          <Sub>{t("setup.svcSub")}</Sub>
        </View>
        <ServicesEditor services={services} onServices={setServices} />
        {note}
      </Frame>
    );
  }

  if (step === "rates") {
    return (
      <Frame step={5} onBack={back} footer={next(() => (rowsToSave(rows).length ? go("payout") : setError(t("rates.needOne"))))}>
        <View style={{ gap: 8 }}>
          <Title>{t("rates.title")}</Title>
          <Sub>{`${t("rates.sub")} ${t("rates.subStarter")}`}</Sub>
        </View>
        <RateCardEditor rows={rows} onRows={setRows} fail={fail} onFail={setFail} ret={ret} onRet={setRet} notes={notes} onNotes={setNotes} />
        {note}
      </Frame>
    );
  }

  if (step === "payout") {
    const linked = wallet?.view.bank;
    return (
      <Frame step={6} onBack={back} footer={<PillButton tone="forest" title={t("setup.sendReview")} busy={busy === "review"} disabled={Boolean(busy)} onPress={() => void sendForReview()} />}>
        <View style={{ gap: 8 }}>
          <Title>{t("setup.payTitle")}</Title>
          <Sub>{t("setup.paySub")}</Sub>
        </View>
        {linked ? (
          <List>
            <Row lead={<Tile icon="wallet" tone="ok" />} title={`${linked.bankName} ••• ${linked.accountEnding}`} sub={linked.accountName} />
          </List>
        ) : null}
        {wallet?.banks.length ? (
          <ChipWrap label={t("setup.bank")}>
            {wallet.banks.map((name) => (
              <Seg key={name} label={name} on={bank === name} onPress={() => setBank(name)} />
            ))}
          </ChipWrap>
        ) : null}
        <LabeledInput label={t("setup.acct")} value={acct} onChangeText={(text) => setAcct(text.replace(/\D/g, "").slice(0, 10))} keyboardType="number-pad" placeholder={t("setup.acctPlaceholder")} />
        {acctName ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.successTint, borderRadius: 24, padding: 20 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="check" size={22} color={colors.success} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <T weight="bold" style={{ fontSize: 16 }}>{acctName}</T>
              <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("setup.isThisYou")}</T>
            </View>
          </View>
        ) : null}
        {note}
      </Frame>
    );
  }

  return (
    <Frame step={6} footer={<PillButton tone="forest" title={t("setup.toDashboard")} onPress={() => router.replace("/logistics/jobs")} />}>
      <View style={{ alignItems: "center", gap: 14, paddingTop: 80 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.successTint, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="clock" size={44} color={colors.success} strokeWidth={2.2} />
        </View>
        <Title style={{ textAlign: "center" }}>{t("setup.checking")}</Title>
        <Sub style={{ textAlign: "center" }}>{t("setup.checkingSub")}</Sub>
      </View>
    </Frame>
  );
}

export default function LogisticsSetup() {
  const t = useT("common");
  const [state, setState] = useState<{ market: MarketData; wallet: WalletData | null; docs: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([fetchMarket(), fetchWallet().catch(() => null), fetchLogisticsMe().catch(() => null)])
      .then(([market, wallet, me]) => {
        if (!live) return;
        const docs = (me?.partner.verificationDocuments ?? []).filter((doc) => doc.filePath || doc.registry?.verified).map((doc) => doc.type as string);
        setState({ market, wallet, docs });
      })
      .catch((loadError: unknown) => live && setError(loadError instanceof Error ? loadError.message : ""));
    return () => {
      live = false;
    };
  }, []);

  if (state) return <Wizard market={state.market} wallet={state.wallet} docsDone={state.docs} />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, padding: 20, justifyContent: "center", gap: 14 }}>
      {error !== null ? (
        <>
          <Notice>{error || " "}</Notice>
          <PillButton tone="white" title={t("back")} onPress={() => router.replace("/logistics/jobs")} />
        </>
      ) : (
        <LoadingBlock />
      )}
    </SafeAreaView>
  );
}
