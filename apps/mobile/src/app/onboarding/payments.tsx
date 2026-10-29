import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { canonicalState } from "@shared/delivery-market";
import { DEFAULT_PAYMENT_METHODS, PAYMENT_METHODS, zonesForSellChoice, type DeliveryZone, type OnboardingSellArea, type PaymentMethodKey } from "@shared/onboarding";
import { Title } from "@/components/design";
import { ButtonRow, Card, Field, Label, Notice, PillButton, T, Toggle, WithTip } from "@/components/ui";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { useOnboarding } from "@/components/OnboardingContext";
import { ApiError } from "@/lib/api";
import { fetchDeliveryHub } from "@/lib/delivery";
import { fetchPayoutBank, linkPayoutBank, savePayments } from "@/lib/onboarding";
import { publishShop } from "@/lib/publish";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// "Getting paid and delivering": how customers pay, the payout bank (optional) and the delivery fees for where the
// shop sells (the "Where do you sell?" step, else the saved delivery settings). The button always moves on once a
// way to pay is on, and if the shop can't go live just now the next screen says why, with its own Publish button.

const SELL_AREAS: OnboardingSellArea[] = ["one_state", "selected", "nationwide"];

export default function Payments() {
  const t = useT("m_onboarding");
  const { status, refresh, waitForBuild, startBuild } = useOnboarding();
  const params = useLocalSearchParams<{ area?: string; states?: string; home?: string }>();
  const [methods, setMethods] = useState<Record<PaymentMethodKey, boolean>>(DEFAULT_PAYMENT_METHODS);
  const [zones, setZones] = useState<DeliveryZone[]>(() => {
    const area = SELL_AREAS.find((entry) => entry === params.area);
    return area ? zonesForSellChoice({ area, states: (params.states ?? "").split(",").filter(Boolean) }, params.home || null) : [];
  });
  const [banks, setBanks] = useState<string[]>([]);
  const [bankLinked, setBankLinked] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Opened without the "Where do you sell?" answer (resumed later): the fees follow the saved delivery settings.
  useEffect(() => {
    if (zones.length) return;
    let alive = true;
    void fetchDeliveryHub()
      .catch(() => null)
      .then((hub) => {
        if (!alive) return;
        const home = canonicalState(hub?.settings.originState ?? null) ?? canonicalState(hub?.city ?? null);
        const saved = { area: SELL_AREAS.find((entry) => entry === hub?.settings.sellArea) ?? "one_state", states: hub?.settings.sellStates ?? [] };
        setZones(zonesForSellChoice(saved, home));
      });
    return () => {
      alive = false;
    };
    // Once, on open.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void fetchPayoutBank()
      .then((data) => {
        setBanks(data.banks);
        setBankLinked(Boolean(data.current?.accountNumberMask));
      })
      .catch(() => null);
  }, []);

  async function addBank() {
    setBusy(true);
    setError(null);
    try {
      await linkPayoutBank(bankName, accountNumber, accountName);
      setBankLinked(true);
      setBankOpen(false);
    } catch (bankError) {
      setError(bankError instanceof Error ? bankError.message : t("pay.bankFailed"));
    } finally {
      setBusy(false);
    }
  }

  // Shoppers see the zone names in English at checkout; here they read in the seller's language.
  const zoneLabel = (zone: DeliveryZone) => (zone.regions.length === 0 ? t("pay.zoneElsewhere") : zone.regions.length > 1 ? t("pay.zoneOthers") : zone.name === "FCT" ? "Abuja (FCT)" : zone.name);

  async function goLive() {
    // The one thing this page needs: a way for customers to pay.
    if (!Object.values(methods).some(Boolean)) return setError(t("pay.needMethod"));
    setBusy(true);
    setError(null);
    try {
      await savePayments(methods, zones);
    } catch (saveError) {
      // A choice on this page the server can't take (pay on delivery alone on a plan without it): say why and stay.
      if (saveError instanceof ApiError && saveError.status >= 400 && saveError.status < 500 && saveError.status !== 401) {
        setError(saveError.message);
        setBusy(false);
        return;
      }
      // Anything else (a bad connection) is set again later in Payments and Delivery: never a wall here.
    }
    let publishError = "";
    try {
      setNote(t("pay.finishing"));
      await (status?.memory?.storeName ? waitForBuild() : startBuild(status?.store.name ?? "My Shop"));
      // Going live is free on every plan, so the shop is published right here.
      if (!status?.store.live) await publishShop();
    } catch (liveError) {
      // The next screen shows the reason, with its own Publish button.
      publishError = liveError instanceof Error ? liveError.message : " ";
    }
    await refresh().catch(() => null);
    setBusy(false);
    setNote(null);
    router.replace({ pathname: "/onboarding/live", params: { ...(publishError ? { publishError } : {}) } });
  }

  return (
    <OnboardingFrame
      step="payments"
      footer={
        <>
          {error && <View style={{ marginBottom: 10 }}><Notice>{error}</Notice></View>}
          {note && <T style={{ textAlign: "center", color: colors.inkSoft, marginBottom: 8 }}>{note}</T>}
          <PillButton title={t("pay.goLive")} busy={busy} onPress={() => void goLive()} />
        </>
      }
    >
      <Title>{t("pay.title")}</Title>
      <T weight="bold" style={{ fontSize: 14, color: colors.inkSoft, marginTop: 24, marginBottom: 10 }}>{t("pay.how")}</T>
      <Card style={{ paddingVertical: 4, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
        {PAYMENT_METHODS.map((method, index) => (
          <View key={method.key} style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 13, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
            <View style={{ flex: 1 }}>
              <T weight="extrabold" style={{ fontSize: 15 }}>{t.dynamic(`method.${method.key}.label`, method.label)}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 18 }}>{t.dynamic(`method.${method.key}.hint`, method.hint)}</T>
            </View>
            <Toggle label={t.dynamic(`method.${method.key}.label`, method.label)} on={methods[method.key]} onChange={(on) => setMethods((current) => ({ ...current, [method.key]: on }))} />
          </View>
        ))}
      </Card>
      <WithTip title={t("pay.payouts")} tip={{ text: t("pay.bankLater") }} style={{ marginTop: 24, marginBottom: 10 }}>
        <T weight="bold" style={{ fontSize: 14, color: colors.inkSoft }}>{t("pay.payouts")}</T>
      </WithTip>
      <Card style={{ padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
        {bankLinked ? (
          <T weight="bold" style={{ color: colors.success, fontSize: 15 }}>{t("pay.bankAdded")}</T>
        ) : (
          <>
            <T style={{ fontSize: 15, lineHeight: 22 }}>{t("pay.bankLaterShort")}</T>
            <ButtonRow labels={[t("pay.addBank"), t("pay.later")]} gap={8} style={{ marginTop: 12 }}>
              <PillButton title={t("pay.addBank")} size="md" style={{ flex: 1 }} onPress={() => setBankOpen(true)} />
              <PillButton title={t("pay.later")} tone="white" size="md" style={{ flex: 1 }} onPress={() => setNote(t("pay.noProblem"))} />
            </ButtonRow>
          </>
        )}
      </Card>
      <T weight="bold" style={{ fontSize: 14, color: colors.inkSoft, marginTop: 24, marginBottom: 10 }}>{t("pay.delivery")}</T>
      <Card style={{ paddingVertical: 4, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
        {zones.map((zone, index) => (
          <View key={zone.name} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 15, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
            <T style={{ flex: 1, fontSize: 15 }}>{zoneLabel(zone)}</T>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <T weight="extrabold" style={{ fontSize: 15 }}>₦</T>
              <TextInput
                accessibilityLabel={t("pay.feeFor", { zone: zoneLabel(zone) })}
                keyboardType="number-pad"
                value={zone.fee.toLocaleString("en-NG")}
                onChangeText={(value) => setZones((current) => current.map((row, i) => (i === index ? { ...row, fee: Number(value.replace(/\D/g, "")) || 0 } : row)))}
                style={{ fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink, minWidth: 48, textAlign: "right", padding: 0 }}
              />
            </View>
          </View>
        ))}
      </Card>

      <Modal visible={bankOpen} transparent animationType="slide" onRequestClose={() => setBankOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={() => !busy && setBankOpen(false)}>
          <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 36, maxHeight: "85%" }} onPress={() => undefined}>
            <T weight="extrabold" style={{ fontSize: 22, marginBottom: 14 }}>{t("pay.bankTitle")}</T>
            <Label>{t("pay.bank")}</Label>
            <ScrollView style={{ maxHeight: 180, borderWidth: 1, borderColor: colors.line, borderRadius: 16 }}>
              {banks.map((bank) => (
                <Pressable key={bank} onPress={() => setBankName(bank)} style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: bankName === bank ? colors.lilac : "transparent" }}>
                  <T weight={bankName === bank ? "bold" : "regular"}>{bank}</T>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ marginTop: 14 }}>
              <Label>{t("pay.accountNumber")}</Label>
              <Field keyboardType="number-pad" maxLength={10} placeholder={t("pay.tenDigits")} value={accountNumber} onChangeText={setAccountNumber} />
            </View>
            <View style={{ marginTop: 14 }}>
              <Label>{t("pay.accountName")}</Label>
              <Field placeholder={t("pay.asAtBank")} value={accountName} onChangeText={setAccountName} />
            </View>
            {error && <View style={{ marginTop: 12 }}><Notice>{error}</Notice></View>}
            <PillButton title={t("pay.saveBank")} busy={busy} style={{ marginTop: 18 }} disabled={!bankName || accountNumber.replace(/\D/g, "").length !== 10 || !accountName.trim()} onPress={() => void addBank()} />
          </Pressable>
        </Pressable>
      </Modal>
    </OnboardingFrame>
  );
}
