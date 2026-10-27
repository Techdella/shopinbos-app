import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eyebrow, List, Row, Seg, Small, Sub, Tile, Title } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { CallPeggyButton } from "@/components/CallPeggyButton";
import { LoadingBlock } from "@/components/kit";
import { ChipWrap, LabeledInput, StepHeader } from "@/components/PartnerKit";
import { CoverageEditor, RateCardEditor, ServicesEditor } from "@/components/PartnerSetup";
import { Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import {
  fetchMarket,
  fetchOnboarding,
  finishOnboarding,
  saveBusiness,
  saveCoverage,
  saveRateCard,
  type MarketData,
} from "@/lib/logistics";
import { deliverModeOf, deliveryAreasFor, draftFromRow, nairaInput, pickupAreasFor, priceText, rowsToSave, starterRates, statesIn, type DeliverMode, type DraftRate } from "@/lib/logistics-pure";
import { checkWalletAccount, fetchWallet, linkWalletBank, type WalletData } from "@/lib/wallet";
import { usePeggyContinue, usePeggySaved } from "@/lib/peggy-call";
import { partnerWizardStep } from "@/lib/peggy-call-pure";
import { colors } from "@/theme";
import { KeyboardShift } from "@/components/KeyboardShift";

// Set-up for a new delivery company ("Delivery partner app" prototype pWelcome … pReview, "N of 6"): the company
// (PUT market { section: "business" }), what verification will ask for (no CAC needed to start: shared/
// partner-tiers.ts), where you cover and what you offer, the rate card, the bank delivery fees are paid to
// (Shopinbos Wallet), then "Finish set-up": set-up is marked done (the web set-up's call), coverage and prices are
// saved and the bank linked. Verification itself (ID, selfie, bank, vehicles, guarantor, optional CAC) is its own
// stepped screen (/logistics/verification), which the last screen opens. Shown while the company isn't set up
// (/logistics/home sends it here). "Call Peggy" is on every step: while she's on the call, the areas and starting
// price she saves fill the steps here as she goes, and after the call it opens the first step that's still missing.

type Step = "welcome" | "biz" | "docs" | "cover" | "services" | "rates" | "payout" | "review";const ORDER: Step[] = ["welcome", "biz", "docs", "cover", "services", "rates", "payout", "review"];

function Frame({ step, onBack, children, footer }: { step: number; onBack?: () => void; children: ReactNode; footer: ReactNode }) {
  const t = useT("m_partner", "common");
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardShift>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 20 }}>
          {onBack ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <StepHeader step={step} total={6} label={t("setup.step", { step, total: 6 })} onBack={onBack} backLabel={t("back")} />
              </View>
              <CallPeggyButton variant="compact" />
            </View>
          ) : null}
          {children}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10, gap: 10 }}>{footer}</View>
      </KeyboardShift>
    </SafeAreaView>
  );
}

function Wizard({ market, wallet }: { market: MarketData; wallet: WalletData | null }) {
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
  // 3–4. Coverage and services
  const [pickup, setPickup] = useState<string[]>(statesIn(partner.pickupAreas));
  const [mode, setMode] = useState<DeliverMode>(deliverModeOf(partner.pickupAreas, partner.deliveryAreas));
  const [deliver, setDeliver] = useState<string[]>(statesIn(partner.deliveryAreas));
  const [services, setServices] = useState<string[]>(partner.services.length ? partner.services : ["doorstep"]);
  // The saved areas (Peggy can add to them on a call; area tokens the chips don't show are kept when saving).
  const [savedAreas, setSavedAreas] = useState({ pickupAreas: partner.pickupAreas, deliveryAreas: partner.deliveryAreas });
  // A starting price Peggy saved on a call, for the city rows of the rate card.
  const [peggyPrice, setPeggyPrice] = useState<string | null>(null);
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

  // Peggy saving on a call: the areas and price show here straight away.
  usePeggySaved((item) => {
    if (item.kind === "coverage") {
      fetchMarket()
        .then((fresh) => {
          setSavedAreas({ pickupAreas: fresh.partner.pickupAreas, deliveryAreas: fresh.partner.deliveryAreas });
          setPickup(statesIn(fresh.partner.pickupAreas));
          setDeliver(statesIn(fresh.partner.deliveryAreas));
          setMode(deliverModeOf(fresh.partner.pickupAreas, fresh.partner.deliveryAreas));
        })
        .catch(() => null);
    } else if (item.kind === "price") {
      const price = item.detail.replace(/\D/g, "");
      if (!price) return;
      setPeggyPrice(price);
      setRows((current) => current.map((row) => (!row.price && row.from === row.to ? { ...row, price } : row)));
    }
  });
  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };
  const back = () => go(ORDER[Math.max(0, ORDER.indexOf(step) - 1)]);

  // After the call: the first step that's still missing.
  usePeggyContinue((status) => {
    if (status) go(partnerWizardStep(status.steps));
    return true;
  });

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

  function toRates() {
    if (!rows.length) setRows(starterRates(pickup, mode, deliver, services).map((row) => (peggyPrice && row.from === row.to ? { ...row, price: peggyPrice } : row)));
    go("rates");
  }

  async function finishSetup() {
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
      await saveCoverage({ services, pickupAreas: pickupAreasFor(pickup, savedAreas.pickupAreas), deliveryAreas: deliveryAreasFor(mode, pickup, deliver, savedAreas.deliveryAreas), offersPayOnDelivery: partner.offersPayOnDelivery });
      await saveRateCard({ rows: priced, failedAttemptFee: nairaInput(fail) ?? 0, returnFee: nairaInput(ret) ?? 0, notes });
      if (bank && digits.length === 10) await linkWalletBank({ bankName: bank, accountNumber: digits });
      // Verification is sent from its own screen, once the ID, bank, vehicle and guarantor steps are in.
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

  // What verification asks for, before the rest of set-up: no CAC needed to start (Tier 1, Verified Individual).
  if (step === "docs") {
    const needs = ["kyc.need.id", "kyc.need.bank", "kyc.need.vehicle", "kyc.need.guarantor"] as const;
    return (
      <Frame step={2} onBack={back} footer={next(() => go("cover"))}>
        <View style={{ gap: 8 }}>
          <Title>{t("kyc.introTitle")}</Title>
          <Sub>{t("kyc.introSub")}</Sub>
        </View>
        <List>
          {needs.map((key) => (
            <Row key={key} lead={<Tile icon="check" tone="mint" />} title={t(key)} />
          ))}
        </List>
        <Small>{t("kyc.introCac")}</Small>
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
      <Frame step={6} onBack={back} footer={<PillButton tone="forest" title={t("setup.finishNoDocs")} busy={busy === "review"} disabled={Boolean(busy)} onPress={() => void finishSetup()} />}>
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

  // Set-up is done; verification is next (the partner can take jobs once Tier 1 is checked).
  return (
    <Frame
      step={6}
      footer={
        <>
          <PillButton tone="forest" title={t("kyc.start")} onPress={() => router.replace("/logistics/verification")} />
          <PillButton tone="white" title={t("setup.toDashboard")} onPress={() => router.replace("/logistics/jobs")} />
        </>
      }
    >
      <View style={{ alignItems: "center", gap: 14, paddingTop: 60 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.successTint, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="shield" size={44} color={colors.success} strokeWidth={2.2} />
        </View>
        <Title style={{ textAlign: "center" }}>{t("kyc.doneTitle")}</Title>
        <Sub style={{ textAlign: "center" }}>{t("kyc.doneSub")}</Sub>
      </View>
    </Frame>
  );
}

export default function LogisticsSetup() {
  const t = useT("common");
  const [state, setState] = useState<{ market: MarketData; wallet: WalletData | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([fetchMarket(), fetchWallet().catch(() => null)])
      .then(([market, wallet]) => {
        if (live) setState({ market, wallet });
      })
      .catch((loadError: unknown) => live && setError(loadError instanceof Error ? loadError.message : ""));
    return () => {
      live = false;
    };
  }, []);

  if (state) return <Wizard market={state.market} wallet={state.wallet} />;
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
