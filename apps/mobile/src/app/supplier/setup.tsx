import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Choice, Seg, Small } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { FieldLabel, FlowFrame, NoteCard } from "@/components/SupplierKit";
import { SupplierJoinFlow } from "@/components/supplier/SupplierJoinFlow";
import { Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { useVerificationDocs, VerificationDocList } from "@/components/VerificationScreen";
import { useT } from "@/lib/i18n";
import { fetchDeliveryWhere, fetchSupplierMe, fetchSupplierOverview, fetchSupplierSetup, saveDeliveryWhere, saveSupplierProfile, saveSupplierSetup } from "@/lib/supplier";
import { popularBanks, SELL_AREAS, SELL_STATES, SETUP_CITIES, SUPPLY_CATEGORIES, type SellAreaKey } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { checkWalletAccount, fetchWallet, linkWalletBank } from "@/lib/wallet";
import { usePeggySaved } from "@/lib/peggy-call";
import { colors } from "@/theme";
import { StatePicker } from "@/components/StatePicker";

// Supplier set-up. A new supplier gets onboarding, one question per screen (SupplierJoinFlow: business name, CAC,
// what they supply, how shops buy, where goods leave from, ID photo and selfie, first product; no bank account until
// the first payout). Account, Home and Money open one thing to change with ?edit=biz|pickup|where|bank|docs: the
// business name and what it supplies and the address parcels leave from go to PATCH /api/supplier/onboarding (PATCH
// /api/supplier/profile once set up, so a check in progress isn't reset); where it sells to the delivery settings
// (PUT /api/mobile/delivery/settings); the bank to the Shopinbos Wallet (check the account name, then link it); the
// documents are the Verification screen's own pieces.

type Step = "biz" | "pickup" | "where" | "bank" | "docs";
const EDITABLE: Step[] = ["biz", "pickup", "where", "bank", "docs"];

export default function SupplierSetup() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = EDITABLE.includes(edit as Step) ? (edit as Step) : null;
  return editing ? <SupplierSetupEditor editing={editing} /> : <SupplierJoinFlow />;
}

function SupplierSetupEditor({ editing }: { editing: Step }) {
  const t = useT("m_supplier", "common");
  const loaded = useLoad(async () => {
    const [setup, overview, where, wallet] = await Promise.all([fetchSupplierSetup(), fetchSupplierOverview().catch(() => null), fetchDeliveryWhere().catch(() => null), fetchWallet().catch(() => null)]);
    return { setup, onboarded: overview?.supplier.onboarded ?? false, where, wallet };
  });
  const data = loaded.data;
  // Documents step: the same upload and "Send for review" as Account → Verification.
  const docs = useVerificationDocs("supplier", async () => {
    const me = await fetchSupplierMe();
    return { status: me.supplier.verificationStatus, docs: me.supplier.verificationDocuments, trustScore: me.supplier.trustScore };
  });

  const step = editing;
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

  // On a call with Peggy: what she saves (pickup address, where they sell) fills the screen here as she goes.
  usePeggySaved(() => {
    setFilled(false);
    void loaded.reload();
  });

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

  // Each screen saves one thing, then goes back to where it was opened from.
  function go() {
    setError(null);
    router.back();
  }

  function back() {
    setError(null);
    router.back();
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
      go();
    });
  }

  function savePickup() {
    if (!city) return setError(t("setup.needCity"));
    if (address.trim().length < 3) return setError(t("setup.needAddress"));
    void attempt(async () => {
      await saveBusiness({ city, address: address.trim() });
      await saveDeliveryWhere({ originState: city, originArea: city, originAddress: address.trim() });
      go();
    });
  }

  function saveWhere() {
    if (area === "selected" && !states.length) return setError(t("setup.needStates"));
    if (area === "one_state" && !city) return setError(t("setup.needCity"));
    void attempt(async () => {
      await saveDeliveryWhere({ sellArea: area, sellStates: area === "one_state" ? [city || data!.where?.originState || ""] : area === "selected" ? states : [] });
      // The app opens for the business now; documents can follow (Account → Verification).
      if (!onboarded) await saveSupplierSetup({ docsLater: true });
      go();
    });
  }

  function saveBank() {
    if (walletBank && !newBank) return go();
    if (!bankName) return setBankError(t("setup.needBank"));
    if (account.length !== 10) return setBankError(t("setup.needAccount"));
    setBusy(true);
    setBankError(null);
    linkWalletBank({ bankName, accountNumber: account })
      .then(() => go())
      .catch((failure) => setBankError(failure instanceof Error ? failure.message : t("product.saveFailed")))
      .finally(() => setBusy(false));
  }

  const nextButton = (onPress: () => void, _accent = false) => <PillButton title={t("setup.save")} tone="accent" busy={busy} disabled={busy} onPress={onPress} />;

  if (step === "biz") {
    return (
      <FlowFrame onBack={back} title={t("setup.bizTitle")} footer={nextButton(saveBiz)}>
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
      <FlowFrame onBack={back} title={t("setup.pickupTitle")} footer={nextButton(savePickup)}>
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
      <FlowFrame onBack={back} title={t("setup.whereTitle")} tip={t("setup.whereSub", { city: city || t("setup.yourCity") })} footer={nextButton(saveWhere)}>
        {error ? <Notice>{error}</Notice> : null}
        <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
          {SELL_AREAS.map((key) => <Choice key={key} title={t.dynamic(`where.${key}`)} sub={t.dynamic(`where.${key}.sub`)} on={area === key} onPress={() => setArea(key)} />)}
        </View>
        {area === "selected" ? (
          <StatePicker
            testID="supplier-states"
            options={SELL_STATES}
            selected={states}
            onToggle={(value) => setStates(states.includes(value) ? states.filter((item) => item !== value) : [...states, value])}
          />
        ) : null}
      </FlowFrame>
    );
  }

  if (step === "docs") {
    const verified = docs.data.data?.status === "verified";
    const sendDocs = async () => {
      if (await docs.send()) {
        go();
      }
    };
    return (
      <FlowFrame
       
       
        onBack={back}
        title={t("setup.docsTitle")}
        tip={t("setup.docsSub")}
        footer={
          verified || docs.sent ? (
            <PillButton title={t("done")} tone="accent" onPress={() => go()} />
          ) : (
            <>
              <PillButton title={t("setup.docsSend")} tone="accent" busy={docs.busy === "send"} disabled={Boolean(docs.busy)} onPress={() => void sendDocs()} />
              <LinkButton title={t("setup.later")} color={colors.inkSoft} onPress={() => go()} />
            </>
          )
        }
      >
        {docs.note ? <Notice tone={docs.note.tone}>{docs.note.text}</Notice> : null}
        {docs.sent ? <NoteCard tone="ok" title={t("setup.docsInTitle")}>{t("setup.docsInSub")}</NoteCard> : null}
        {docs.data.loading && !docs.data.data ? <LoadingBlock /> : null}
        {docs.data.error && !docs.data.data ? <ErrorState message={docs.data.error} onRetry={() => void docs.data.reload()} /> : null}
        {docs.data.data ? <VerificationDocList role="supplier" v={docs} /> : null}
      </FlowFrame>
    );
  }

  // Bank
  const pickingBank = !walletBank || newBank;
  return (
    <FlowFrame
     
     
      onBack={back}
      title={t("setup.bankTitle")}
      sub={t("setup.bankSub")}
      footer={
        <>
          {nextButton(saveBank, true)}
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
