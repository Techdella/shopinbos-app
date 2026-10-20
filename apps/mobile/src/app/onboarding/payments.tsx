import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { DEFAULT_DELIVERY_ZONES, DEFAULT_PAYMENT_METHODS, PAYMENT_METHODS, type DeliveryZone, type PaymentMethodKey } from "@shared/onboarding";
import { Card, Field, Label, Notice, PillButton, T, Toggle } from "@/components/ui";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { useOnboarding } from "@/components/OnboardingContext";
import { fetchPayoutBank, linkPayoutBank, publishStore, savePayments } from "@/lib/onboarding";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

export default function Payments() {
  const t = useT("m_onboarding");
  const { status, refresh, waitForBuild, startBuild } = useOnboarding();
  const [methods, setMethods] = useState<Record<PaymentMethodKey, boolean>>(DEFAULT_PAYMENT_METHODS);
  const [zones, setZones] = useState<DeliveryZone[]>(DEFAULT_DELIVERY_ZONES);
  const [banks, setBanks] = useState<string[]>([]);
  const [bankLinked, setBankLinked] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function goLive() {
    setBusy(true);
    setError(null);
    try {
      await savePayments(methods, zones);
      setNote(t("pay.finishing"));
      await (status?.memory?.storeName ? waitForBuild() : startBuild(status?.store.name ?? "My Shop"));
      // Going live is free on every plan, so the shop is published right here.
      if (!status?.store.live) {
        await publishStore();
        await refresh();
      }
      setNote(null);
      router.replace("/onboarding/live");
    } catch (liveError) {
      setError(liveError instanceof Error ? liveError.message : t("pay.saveFailed"));
    } finally {
      setBusy(false);
      setNote(null);
    }
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
      <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6, lineHeight: 33 }} accessibilityRole="header">{t("pay.title")}</T>
      <T weight="bold" style={{ fontSize: 15, marginTop: 22, marginBottom: 10 }}>{t("pay.how")}</T>
      <Card style={{ paddingVertical: 4 }}>
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
      <T weight="bold" style={{ fontSize: 15, marginTop: 22, marginBottom: 10 }}>{t("pay.payouts")}</T>
      <Card>
        {bankLinked ? (
          <T weight="bold" style={{ color: colors.success, fontSize: 15 }}>{t("pay.bankAdded")}</T>
        ) : (
          <>
            <T style={{ fontSize: 15, lineHeight: 22 }}>{t("pay.bankLater")}</T>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <PillButton title={t("pay.addBank")} size="md" style={{ flex: 1 }} onPress={() => setBankOpen(true)} />
              <PillButton title={t("pay.later")} tone="white" size="md" style={{ flex: 1 }} onPress={() => setNote(t("pay.noProblem"))} />
            </View>
          </>
        )}
      </Card>
      <T weight="bold" style={{ fontSize: 15, marginTop: 22, marginBottom: 10 }}>{t("pay.delivery")}</T>
      <Card style={{ paddingVertical: 4 }}>
        {zones.map((zone, index) => (
          <View key={zone.name} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 15, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
            <T style={{ flex: 1, fontSize: 15 }}>{zone.name}</T>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <T weight="extrabold" style={{ fontSize: 15 }}>₦</T>
              <TextInput
                accessibilityLabel={t("pay.feeFor", { zone: zone.name })}
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
