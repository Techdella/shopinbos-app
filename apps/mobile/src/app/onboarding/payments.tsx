import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { DEFAULT_DELIVERY_ZONES, DEFAULT_PAYMENT_METHODS, naira, PAYMENT_METHODS, type DeliveryZone, type PaymentMethodKey } from "@shared/onboarding";
import { Card, Field, Label, Notice, PillButton, T, Toggle } from "@/components/ui";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { useOnboarding } from "@/components/OnboardingContext";
import { fetchPayoutBank, linkPayoutBank, savePayments, startLaunchPayment } from "@/lib/onboarding";
import { colors, fonts } from "@/theme";

export default function Payments() {
  const { status, refresh, waitForBuild, startBuild } = useOnboarding();
  const [methods, setMethods] = useState<Record<PaymentMethodKey, boolean>>(DEFAULT_PAYMENT_METHODS);
  const [zones, setZones] = useState<DeliveryZone[]>(DEFAULT_DELIVERY_ZONES);
  const [banks, setBanks] = useState<string[]>([]);
  const [bankLinked, setBankLinked] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [launchOpen, setLaunchOpen] = useState(false);
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
      setError(bankError instanceof Error ? bankError.message : "Couldn't add that bank account. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function goLive() {
    setBusy(true);
    setError(null);
    try {
      await savePayments(methods, zones);
      setNote("Finishing your shop design…");
      await (status?.memory?.storeName ? waitForBuild() : startBuild(status?.store.name ?? "My Shop"));
      setNote(null);
      if (status?.store.live) router.replace("/onboarding/live");
      else setLaunchOpen(true);
    } catch (liveError) {
      setError(liveError instanceof Error ? liveError.message : "Couldn't save your settings. Check your connection and try again.");
    } finally {
      setBusy(false);
      setNote(null);
    }
  }

  async function pay(option: "full" | "installment") {
    setBusy(true);
    setError(null);
    try {
      const result = await startLaunchPayment(option);
      if (result.authorizationUrl) await WebBrowser.openBrowserAsync(result.authorizationUrl);
      // Paystack's callback publishes the shop; check once the browser closes.
      const next = await refresh();
      setLaunchOpen(false);
      if (next?.store.live) router.replace("/onboarding/live");
      else setError("We haven't seen the payment yet. If you paid, wait a moment and tap Put my shop live again.");
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : "Couldn't open Paystack. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingFrame
      step="payments"
      footer={
        <>
          {error && !launchOpen && <View style={{ marginBottom: 10 }}><Notice>{error}</Notice></View>}
          {note && <T style={{ textAlign: "center", color: colors.inkSoft, marginBottom: 8 }}>{note}</T>}
          <PillButton title="Put my shop live" busy={busy} onPress={() => void goLive()} />
        </>
      }
    >
      <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6, lineHeight: 33 }} accessibilityRole="header">Getting paid and delivering</T>
      <T weight="bold" style={{ fontSize: 15, marginTop: 22, marginBottom: 10 }}>How customers can pay</T>
      <Card style={{ paddingVertical: 4 }}>
        {PAYMENT_METHODS.map((method, index) => (
          <View key={method.key} style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 13, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
            <View style={{ flex: 1 }}>
              <T weight="extrabold" style={{ fontSize: 15 }}>{method.label}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 18 }}>{method.hint}</T>
            </View>
            <Toggle label={method.label} on={methods[method.key]} onChange={(on) => setMethods((current) => ({ ...current, [method.key]: on }))} />
          </View>
        ))}
      </Card>
      <T weight="bold" style={{ fontSize: 15, marginTop: 22, marginBottom: 10 }}>Where your money goes</T>
      <Card>
        {bankLinked ? (
          <T weight="bold" style={{ color: colors.success, fontSize: 15 }}>✓ Your bank is saved</T>
        ) : (
          <>
            <T style={{ fontSize: 15, lineHeight: 22 }}>You can add your bank later. Until then, your money is safe here with Shopinbos.</T>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <PillButton title="Add bank now" size="md" style={{ flex: 1 }} onPress={() => setBankOpen(true)} />
              <PillButton title="Later" tone="white" size="md" style={{ flex: 1 }} onPress={() => setNote("No problem. It's on your checklist.")} />
            </View>
          </>
        )}
      </Card>
      <T weight="bold" style={{ fontSize: 15, marginTop: 22, marginBottom: 10 }}>Delivery</T>
      <Card style={{ paddingVertical: 4 }}>
        {zones.map((zone, index) => (
          <View key={zone.name} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 15, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
            <T style={{ flex: 1, fontSize: 15 }}>{zone.name}</T>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <T weight="extrabold" style={{ fontSize: 15 }}>₦</T>
              <TextInput
                accessibilityLabel={`Delivery fee for ${zone.name}`}
                keyboardType="number-pad"
                value={zone.fee.toLocaleString("en-NG")}
                onChangeText={(value) => setZones((current) => current.map((row, i) => (i === index ? { ...row, fee: Number(value.replace(/\D/g, "")) || 0 } : row)))}
                style={{ fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink, minWidth: 48, textAlign: "right", padding: 0 }}
              />
            </View>
          </View>
        ))}
      </Card>
      {!status?.store.live && status && (
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 19, marginTop: 14, paddingHorizontal: 4 }}>
          Going live costs {naira(status.launch.totalNgn)} once, or {naira(status.launch.depositNgn)} now and the rest by month end. You pay on Paystack next.
        </T>
      )}

      <Modal visible={bankOpen} transparent animationType="slide" onRequestClose={() => setBankOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={() => !busy && setBankOpen(false)}>
          <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 36, maxHeight: "85%" }} onPress={() => undefined}>
            <T weight="extrabold" style={{ fontSize: 22, marginBottom: 14 }}>Where should we send your money?</T>
            <Label>Bank</Label>
            <ScrollView style={{ maxHeight: 180, borderWidth: 1, borderColor: colors.line, borderRadius: 16 }}>
              {banks.map((bank) => (
                <Pressable key={bank} onPress={() => setBankName(bank)} style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: bankName === bank ? colors.lilac : "transparent" }}>
                  <T weight={bankName === bank ? "bold" : "regular"}>{bank}</T>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ marginTop: 14 }}>
              <Label>Account number</Label>
              <Field keyboardType="number-pad" maxLength={10} placeholder="10 digits" value={accountNumber} onChangeText={setAccountNumber} />
            </View>
            <View style={{ marginTop: 14 }}>
              <Label>Account name</Label>
              <Field placeholder="As it appears at your bank" value={accountName} onChangeText={setAccountName} />
            </View>
            {error && <View style={{ marginTop: 12 }}><Notice>{error}</Notice></View>}
            <PillButton title="Save bank" busy={busy} style={{ marginTop: 18 }} disabled={!bankName || accountNumber.replace(/\D/g, "").length !== 10 || !accountName.trim()} onPress={() => void addBank()} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={launchOpen} transparent animationType="slide" onRequestClose={() => setLaunchOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={() => !busy && setLaunchOpen(false)}>
          <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 }} onPress={() => undefined}>
            <T weight="extrabold" style={{ fontSize: 24, letterSpacing: -0.4 }}>Put {status?.store.name} live</T>
            <T style={{ color: colors.inkSoft, marginTop: 8, marginBottom: 18, lineHeight: 21 }}>A one-off launch fee. Your shop opens as soon as Paystack says you paid.</T>
            {status && (
              <>
                <PillButton title={`Pay ${naira(status.launch.totalNgn)}`} busy={busy} onPress={() => void pay("full")} />
                {status.launch.depositNgn < status.launch.totalNgn && (
                  <PillButton
                    title={`Pay ${naira(status.launch.depositNgn)} now, ${naira(status.launch.totalNgn - status.launch.depositNgn)} by month end`}
                    tone="white"
                    size="md"
                    style={{ marginTop: 10 }}
                    disabled={busy}
                    onPress={() => void pay("installment")}
                  />
                )}
              </>
            )}
            {error && <View style={{ marginTop: 12 }}><Notice>{error}</Notice></View>}
            <T style={{ color: colors.inkFaint, fontSize: 13.5, textAlign: "center", marginTop: 14 }}>Paystack handles the payment. Shopinbos never sees your card.</T>
          </Pressable>
        </Pressable>
      </Modal>
    </OnboardingFrame>
  );
}
