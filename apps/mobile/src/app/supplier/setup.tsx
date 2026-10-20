import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Choice, Eyebrow, Seg, Small, Sub, Title } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { DoneView, FieldLabel, FlowFrame, NoteCard } from "@/components/SupplierKit";
import { Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchDeliveryWhere, fetchSupplierOverview, fetchSupplierSetup, saveDeliveryWhere, saveSupplierProfile, saveSupplierSetup } from "@/lib/supplier";
import { popularBanks, SELL_AREAS, SELL_STATES, SETUP_CITIES, SUPPLY_CATEGORIES, type SellAreaKey } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { checkWalletAccount, fetchWallet, linkWalletBank } from "@/lib/wallet";
import { colors } from "@/theme";

// Setting up a supplier ("Simple app, end to end" supplier prototype: sWelcome → sBiz → sPickup → sWhere → sBank →
// sReady). The business name and what it supplies, and the city and address parcels leave from, go to PATCH
// /api/supplier/onboarding (PATCH /api/supplier/profile once set up, so a check in progress isn't reset); where it
// sells and ships from to the delivery settings (PUT /api/mobile/delivery/settings); the bank to the Shopinbos
// Wallet (check the account name, then link it). After "Where do you sell?" the app opens for the business (its
// documents can follow: Account → Verification). Account opens one step on its own with ?edit=biz|pickup|where|bank.

type Step = "welcome" | "biz" | "pickup" | "where" | "bank" | "ready";
const NUMBERED: Step[] = ["biz", "pickup", "where", "bank"];
const EDITABLE: Step[] = ["biz", "pickup", "where", "bank"];

export default function SupplierSetup() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = EDITABLE.includes(edit as Step) ? (edit as Step) : null;
  const t = useT("m_supplier", "common");
  const loaded = useLoad(async () => {
    const [setup, overview, where, wallet] = await Promise.all([fetchSupplierSetup(), fetchSupplierOverview().catch(() => null), fetchDeliveryWhere().catch(() => null), fetchWallet().catch(() => null)]);
    return { setup, onboarded: overview?.supplier.onboarded ?? false, where, wallet };
  });
  const data = loaded.data;

  const [step, setStep] = useState<Step>(editing ?? "welcome");
  const [filled, setFilled] = useState(false);
  const [name, setName] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState<SellAreaKey>("nationwide");
  const [states, setStates] = useState<string[]>([]);
  const [bankName, setBankName] = useState("");
  const [otherBank, setOtherBank] = useState(false);
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState("");
  const [newBank, setNewBank] = useState(false);
  const [holder, setHolder] = useState<{ key: string; name: string | null; missing: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);

  // Start from what's saved.
  useEffect(() => {
    if (!data || filled) return;
    setFilled(true);
    setName(data.setup.displayName || data.setup.businessName || "");
    setCats(data.setup.categories ?? []);
    setCity(data.setup.city ?? "");
    setAddress(data.setup.address ?? data.where?.originAddress ?? "");
    if (data.where && (SELL_AREAS as readonly string[]).includes(data.where.sellArea)) setArea(data.where.sellArea as SellAreaKey);
    setStates(data.where?.sellStates ?? []);
  }, [data, filled]);

  // Whose account it is, looked up once the 10 digits are in, so the person confirms before saving.
  const lookupKey = bankName && account.length === 10 ? `${bankName}:${account}` : "";
  useEffect(() => {
    if (!lookupKey) return;
    let alive = true;
    checkWalletAccount({ bankName, accountNumber: account })
      .then((result) => alive && setHolder({ key: lookupKey, name: result.status === "resolved" ? result.accountName : null, missing: result.status === "not_found" }))
      .catch(() => alive && setHolder({ key: lookupKey, name: null, missing: false }));
    return () => {
      alive = false;
    };
  }, [lookupKey, bankName, account]);
  const shownHolder = holder && holder.key === lookupKey ? holder : null;

  if (!data) {
    return (
      <FlowFrame onBack={() => router.back()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </FlowFrame>
    );
  }

  const onboarded = data.onboarded;
  const saveBusiness = onboarded ? saveSupplierProfile : saveSupplierSetup;
  const cities: string[] = [...SETUP_CITIES];
  if (data.setup.city && !cities.includes(data.setup.city)) cities.push(data.setup.city);
  const banks = data.wallet?.banks ?? [];
  const popular = popularBanks(banks);
  const walletBank = data.wallet?.view.bank ?? null;
  const matches = search.trim() ? banks.filter((bank) => bank.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8) : [];

  function go(next: Step) {
    setError(null);
    if (editing) router.back();
    else setStep(next);
  }

  function back() {
    setError(null);
    if (editing || step === "welcome") return router.back();
    const order: Step[] = ["welcome", ...NUMBERED];
    setStep(order[Math.max(0, order.indexOf(step) - 1)]);
  }

  async function attempt(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("product.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function saveBiz() {
    const business = name.trim();
    if (business.length < 2) return setError(t("setup.needName"));
    void attempt(async () => {
      const same = !data!.setup.displayName || data!.setup.displayName === data!.setup.businessName;
      await saveBusiness({ businessName: business, ...(same ? { displayName: business } : {}), ...(cats.length ? { categories: cats } : {}) });
      go("pickup");
    });
  }

  function savePickup() {
    if (!city) return setError(t("setup.needCity"));
    if (address.trim().length < 3) return setError(t("setup.needAddress"));
    void attempt(async () => {
      await saveBusiness({ city, address: address.trim() });
      await saveDeliveryWhere({ originState: city, originArea: city, originAddress: address.trim() });
      go("where");
    });
  }

  function saveWhere() {
    if (area === "selected" && !states.length) return setError(t("setup.needStates"));
    if (area === "one_state" && !city) return setError(t("setup.needCity"));
    void attempt(async () => {
      await saveDeliveryWhere({ sellArea: area, sellStates: area === "one_state" ? [city || data!.where?.originState || ""] : area === "selected" ? states : [] });
      // The app opens for the business now; documents can follow (Account → Verification).
      if (!onboarded) await saveSupplierSetup({ docsLater: true });
      go("bank");
    });
  }

  function saveBank() {
    if (walletBank && !newBank) return go("ready");
    if (!bankName) return setBankError(t("setup.needBank"));
    if (account.length !== 10) return setBankError(t("setup.needAccount"));
    setBusy(true);
    setBankError(null);
    linkWalletBank({ bankName, accountNumber: account })
      .then(() => go("ready"))
      .catch((failure) => setBankError(failure instanceof Error ? failure.message : t("product.saveFailed")))
      .finally(() => setBusy(false));
  }

  const stepLabel = editing || !NUMBERED.includes(step) ? undefined : t("setup.stepOf", { step: NUMBERED.indexOf(step) + 1, total: NUMBERED.length });
  const nextButton = (onPress: () => void, accent = false) => <PillButton title={editing ? t("setup.save") : step === "bank" ? t("setup.finish") : t("next")} tone={accent || editing ? "accent" : "ink"} busy={busy} disabled={busy} onPress={onPress} />;

  if (step === "welcome") {
    return (
      <FlowFrame
        footer={
          <>
            <PillButton title={t("setup.start")} tone="accent" onPress={() => setStep("biz")} />
            <Small style={{ textAlign: "center" }}>{t("setup.free")}</Small>
          </>
        }
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 18, paddingTop: 60 }}>
          <View style={{ width: 96, height: 96, borderRadius: 32, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="box" size={46} color={colors.accentInk} />
          </View>
          <Eyebrow>{t("setup.forSuppliers")}</Eyebrow>
          <Title style={{ textAlign: "center" }}>{t("setup.welcomeTitle")}</Title>
          <Sub style={{ textAlign: "center" }}>{t("setup.welcomeSub")}</Sub>
        </View>
      </FlowFrame>
    );
  }

  if (step === "ready") {
    return (
      <DoneView
        title={t("setup.readyTitle")}
        sub={t("setup.readySub")}
        footer={
          <>
            <PillButton tone="accent" onPress={() => router.replace("/supplier/product/new")} accessibilityLabel={t("setup.addFirst")}>
              <AppIcon name="plus" size={20} color={colors.ink} strokeWidth={2.4} />
              <T weight="extrabold" style={{ fontSize: 17, color: colors.ink }}>{t("setup.addFirst")}</T>
            </PillButton>
            <PillButton title={t("setup.later")} tone="white" onPress={() => router.replace("/supplier/home")} />
          </>
        }
      />
    );
  }

  if (step === "biz") {
    return (
      <FlowFrame step={stepLabel} onBack={back} title={t("setup.bizTitle")} footer={nextButton(saveBiz)}>
        {error ? <Notice>{error}</Notice> : null}
        <View>
          <FieldLabel>{t("setup.bizName")}</FieldLabel>
          <Field value={name} onChangeText={setName} maxLength={120} placeholder="Aba Leatherworks" accessibilityLabel={t("setup.bizName")} />
        </View>
        <View>
          <FieldLabel>{t("setup.supply")}</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SUPPLY_CATEGORIES.map((category, index) => {
              const on = cats.includes(category);
              return <Seg key={category} label={t.dynamic(`setup.cat.${index}`, category)} on={on} onPress={() => setCats(on ? cats.filter((item) => item !== category) : [...cats, category])} />;
            })}
          </View>
        </View>
      </FlowFrame>
    );
  }

  if (step === "pickup") {
    return (
      <FlowFrame step={stepLabel} onBack={back} title={t("setup.pickupTitle")} footer={nextButton(savePickup)}>
        {error ? <Notice>{error}</Notice> : null}
        <View>
          <FieldLabel>{t("setup.city")}</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {cities.map((option) => <Seg key={option} label={option} on={city === option} onPress={() => setCity(option)} />)}
          </View>
        </View>
        <View>
          <FieldLabel>{t("setup.address")}</FieldLabel>
          <Field value={address} onChangeText={setAddress} maxLength={300} placeholder={t("setup.addressPlaceholder")} accessibilityLabel={t("setup.address")} />
        </View>
      </FlowFrame>
    );
  }

  if (step === "where") {
    return (
      <FlowFrame step={stepLabel} onBack={back} title={t("setup.whereTitle")} sub={t("setup.whereSub", { city: city || t("setup.yourCity") })} footer={nextButton(saveWhere)}>
        {error ? <Notice>{error}</Notice> : null}
        <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
          {SELL_AREAS.map((key) => <Choice key={key} title={t.dynamic(`where.${key}`)} sub={t.dynamic(`where.${key}.sub`)} on={area === key} onPress={() => setArea(key)} />)}
        </View>
        {area === "selected" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SELL_STATES.map((state) => {
              const on = states.includes(state.value);
              return <Seg key={state.value} label={state.label} on={on} onPress={() => setStates(on ? states.filter((item) => item !== state.value) : [...states, state.value])} />;
            })}
          </View>
        ) : null}
      </FlowFrame>
    );
  }

  // Bank
  const pickingBank = !walletBank || newBank;
  return (
    <FlowFrame
      step={stepLabel}
      onBack={back}
      title={t("setup.bankTitle")}
      sub={t("setup.bankSub")}
      footer={
        <>
          {nextButton(saveBank, true)}
          {editing ? null : <LinkButton title={t("setup.later")} color={colors.inkSoft} onPress={() => setStep("ready")} />}
        </>
      }
    >
      {bankError ? (
        <View style={{ gap: 10 }}>
          <Notice>{t("setup.bankFailed", { reason: bankError })}</Notice>
          <Small>{t("setup.walletExplain")}</Small>
          <PillButton title={t("money.openWallet")} tone="white" size="md" onPress={() => router.push("/supplier/wallet")} />
        </View>
      ) : null}

      {data.wallet ? null : <Notice tone="info">{t("setup.walletDown")}</Notice>}

      {!pickingBank && walletBank ? (
        <>
          <NoteCard tone="ok" title={walletBank.accountName}>{t("setup.paidTo", { bank: walletBank.bankName, ending: walletBank.accountEnding })}</NoteCard>
          <LinkButton title={t("setup.changeBank")} onPress={() => setNewBank(true)} />
        </>
      ) : null}

      {pickingBank ? (
        <>
          <View>
            <FieldLabel>{t("setup.bank")}</FieldLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {popular.map((bank) => <Seg key={bank.name} label={bank.label} on={!otherBank && bankName === bank.name} onPress={() => { setOtherBank(false); setBankName(bank.name); }} />)}
              <Seg label={t("setup.otherBank")} on={otherBank} onPress={() => { setOtherBank(true); setBankName(""); }} />
            </View>
          </View>
          {otherBank ? (
            <View style={{ gap: 8 }}>
              <Field value={search} onChangeText={setSearch} placeholder={t("setup.findBank")} accessibilityLabel={t("setup.findBank")} />
              {bankName ? <T weight="bold" style={{ fontSize: 15 }}>{bankName}</T> : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {matches.map((bank) => <Seg key={bank} label={bank} on={bankName === bank} onPress={() => setBankName(bank)} />)}
              </View>
            </View>
          ) : null}
          <View>
            <FieldLabel>{t("setup.account")}</FieldLabel>
            <Field value={account} onChangeText={(text) => setAccount(text.replace(/\D/g, "").slice(0, 10))} keyboardType="number-pad" placeholder={t("setup.digits")} accessibilityLabel={t("setup.account")} />
          </View>
          {shownHolder?.name ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.successTint, borderRadius: 24, padding: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name="check" size={22} color={colors.success} strokeWidth={2.6} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="bold" style={{ fontSize: 16 }}>{shownHolder.name}</T>
                <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("setup.isThisYou")}</T>
              </View>
            </View>
          ) : null}
          {shownHolder?.missing ? <Notice>{t("setup.notFound")}</Notice> : null}
        </>
      ) : null}
    </FlowFrame>
  );
}
