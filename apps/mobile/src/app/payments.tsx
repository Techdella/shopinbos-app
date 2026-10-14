import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { naira, PAYMENT_METHODS, type PaymentMethodKey } from "@shared/onboarding";
import { cleanPaymentBadges, PAYMENT_BADGE_KEYS, PAYMENT_BADGE_LABELS, type PaymentBadgeKey } from "@shared/payment-badges";
import { AppIcon } from "@/components/icons";
import { Badge, ErrorState, LinkRow, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { TONE_COLORS } from "@/lib/dashboard";
import { friendlyTime } from "@/lib/friendly";
import { fetchPayments, resolveAccount, savePaymentSettings, savePayoutBank, type PaymentsOverview } from "@/lib/seller-settings";
import { accountDigits, filterBanks } from "@/lib/settings-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Payments and payouts (web /home/payments): money in over the last 30 days, the payout bank (add or change it,
// with the account name looked up and confirmed before saving), which ways customers can pay, and the latest
// payments. Invoices and the full payouts list stay on the web.

type T_ = ReturnType<typeof useT<["m_settings", "m_onboarding", "m_ui", "common"]>>;

function hoursLabel(hours: number, t: T_) {
  return hours % 24 === 0 && hours >= 48 ? t("money.days", { count: hours / 24 }) : t("money.hours", { count: hours });
}

/** Plain words for the errors this screen's routes send by code. */
function saveMessage(error: unknown, t: T_) {
  if (error instanceof ApiError && error.code === "KEEP_ONE") return t("money.keepOne");
  if (error instanceof ApiError && error.code === "CHOOSE_TIME") return t("money.chooseTime");
  if (error instanceof ApiError && error.code === "BAD_BADGES") return t("money.badBadges");
  return error instanceof Error ? error.message : t("saveFailed");
}

export default function Payments() {
  const t = useT("m_settings", "m_onboarding", "m_ui", "common");
  const loaded = useLoad(fetchPayments);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const data = loaded.data;

  async function save(body: Parameters<typeof savePaymentSettings>[0], optimistic: (current: PaymentsOverview) => PaymentsOverview) {
    if (!data) return;
    const before = data;
    loaded.setData(optimistic(data));
    setNote(null);
    setSaving(true);
    try {
      loaded.setData(await savePaymentSettings(body));
    } catch (saveError) {
      loaded.setData(before);
      setNote({ tone: "error", text: saveMessage(saveError, t) });
    } finally {
      setSaving(false);
    }
  }

  const setMethod = (key: PaymentMethodKey, on: boolean) => {
    if (!data) return;
    const methods = { ...data.methods, [key]: on };
    if (!Object.values(methods).some(Boolean)) return setNote({ tone: "error", text: t("money.keepOne") });
    void save({ methods }, (current) => ({ ...current, methods }));
  };

  const setWindow = (hours: number | null) =>
    void save({ transferWindowHours: hours }, (current) => ({ ...current, transferWindow: { ...current.transferWindow, hours } }));

  /** Show or hide one payment logo on the store (footer and checkout); saved through PATCH paymentBadges. */
  const setBadges = (paymentBadges: PaymentBadgeKey[]) =>
    void save({ paymentBadges }, (current) => ({ ...current, paymentBadges: { ...current.paymentBadges, selected: paymentBadges, chosen: true } }));
  const toggleBadge = (badge: PaymentBadgeKey) => {
    if (!data) return;
    const selected = data.paymentBadges.selected;
    setBadges(cleanPaymentBadges(selected.includes(badge) ? selected.filter((key) => key !== badge) : [...selected, badge]));
  };
  const badgeName = (badge: PaymentBadgeKey) =>
    badge === "transfer" ? t("money.badge.transfer") : badge === "cod" ? t("money.badge.cod") : PAYMENT_BADGE_LABELS[badge];

  if (!data) {
    return (
      <Screen title={t("money.title")} sub={t("money.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/home/payments") }} /> : null}
      </Screen>
    );
  }

  const bank = data.bank;
  const bankTone = !bank ? null : bank.status === "failed" ? "danger" : bank.status === "unconfigured" ? "warning" : "success";
  const bankStatus = !bank ? "" : bank.status === "failed" ? t("money.bankFailed") : bank.status === "unconfigured" ? t("money.bankUnverified") : t("money.bankConnected");

  return (
    <Screen title={t("money.title")} sub={t("money.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <Card style={{ gap: 6 }}>
        <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("money.in30")}</T>
        <T weight="extrabold" style={{ fontSize: 34, letterSpacing: -0.8, lineHeight: 40 }}>{naira(data.money.moneyIn)}</T>
        <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{data.money.paidCount ? t("money.fromOrders", { count: data.money.paidCount }) : t("money.none")}</T>
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
          <MoneyRow label={t("money.online")} hint={t("money.onlineHint")} value={naira(data.money.online)} />
          <MoneyRow label={t("money.collected")} hint={t("money.collectedHint")} value={naira(data.money.offline)} />
          <MoneyRow label={t("money.waiting")} hint={t("count.orders", { count: data.money.waiting.count })} value={naira(data.money.waiting.total)} />
        </View>
      </Card>

      <SectionTitle>{t("money.bankTitle")}</SectionTitle>
      <Card style={{ gap: 12 }}>
        {bank ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="wallet" size={22} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{bank.bankName}</T>
              <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={2}>
                {bank.accountName}{bank.accountEnding ? ` · ${t("money.ending", { digits: bank.accountEnding })}` : ""}
              </T>
              {bankTone ? <Badge label={bankStatus} bg={TONE_COLORS[bankTone].bg} fg={TONE_COLORS[bankTone].fg} /> : null}
            </View>
          </View>
        ) : (
          <T style={{ fontSize: 15, lineHeight: 22 }}>{t("money.bankNone")}</T>
        )}
        {bank?.status === "failed" ? <T style={{ color: colors.danger, fontSize: 15, lineHeight: 21 }}>{t("money.bankFailedNote")}</T> : null}
        <PillButton title={bank ? t("money.changeBank") : t("money.addBank")} tone={bank ? "white" : "ink"} size="md" onPress={() => setBankOpen(true)} />
      </Card>

      <SectionTitle action={saving ? <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("saving")}</T> : undefined}>{t("money.ways")}</SectionTitle>
      <Card style={{ paddingVertical: 2 }}>
        {PAYMENT_METHODS.map((method, index) => {
          const label = t.dynamic(`method.${method.key}.label`, method.label);
          return (
            <View key={method.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
              <View style={{ flex: 1 }}>
                <T weight="bold" style={{ fontSize: 15.5 }}>{label}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 19, marginTop: 2 }}>{t.dynamic(`method.${method.key}.hint`, method.hint)}</T>
              </View>
              <Toggle on={data.methods[method.key]} label={label} onChange={(on) => setMethod(method.key, on)} />
            </View>
          );
        })}
      </Card>
      {data.methods.transfer ? (
        <Card style={{ gap: 10 }}>
          <T weight="bold" style={{ fontSize: 15.5 }}>{t("money.window")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 19 }}>{t("money.windowHint")}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip label={t("money.windowDefault", { label: hoursLabel(data.transferWindow.defaultHours, t) })} on={data.transferWindow.hours === null} onPress={() => setWindow(null)} />
            {data.transferWindow.choices
              .filter((hours) => hours !== data.transferWindow.defaultHours)
              .map((hours) => (
                <Chip key={hours} label={hoursLabel(hours, t)} on={data.transferWindow.hours === hours} onPress={() => setWindow(hours)} />
              ))}
          </View>
        </Card>
      ) : null}
      <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("money.methodsNote")}</T>

      <SectionTitle>{t("money.badgesTitle")}</SectionTitle>
      <Card style={{ gap: 12 }}>
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("money.badgesHint")}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PAYMENT_BADGE_KEYS.map((badge) => (
            <Chip key={badge} label={badgeName(badge)} on={data.paymentBadges.selected.includes(badge)} onPress={() => toggleBadge(badge)} />
          ))}
        </View>
        {!data.paymentBadges.selected.length ? <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("money.badgesNone")}</T> : null}
        {data.paymentBadges.defaults.length > 0 &&
        (data.paymentBadges.selected.length !== data.paymentBadges.defaults.length || data.paymentBadges.selected.some((badge) => !data.paymentBadges.defaults.includes(badge))) ? (
          <LinkButton title={t("money.badgesReset")} onPress={() => setBadges(data.paymentBadges.defaults)} />
        ) : null}
      </Card>

      <SectionTitle>{t("money.latest")}</SectionTitle>
      {data.latestPaid.length ? (
        <Card style={{ paddingVertical: 2 }}>
          {data.latestPaid.map((order, index) => (
            <LinkRow
              key={order.id}
              first={index === 0}
              label={`${order.buyerName || t("money.customer")} · ${naira(order.total)}`}
              hint={`${order.orderNumber} · ${friendlyTime(order.createdAt)}`}
              onPress={() => router.push(`/order/${order.id}`)}
            />
          ))}
        </Card>
      ) : (
        <Card>
          <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("money.latestEmpty")}</T>
        </Card>
      )}

      <Card style={{ paddingVertical: 2 }}>
        <LinkRow first icon="receipt" label={t("money.payouts")} hint={t("money.payoutsHint")} onPress={() => void openWeb("/home/payouts")} />
        <LinkRow icon="doc" label={t("money.invoices")} hint={t("money.invoicesHint")} onPress={() => void openWeb("/home/invoices")} />
      </Card>

      <BankFlow
        visible={bankOpen}
        banks={data.banks}
        current={data.bank?.bankName ?? ""}
        onClose={() => setBankOpen(false)}
        onSaved={() => {
          setBankOpen(false);
          setNote({ tone: "success", text: t("money.bankSaved") });
          void loaded.reload();
        }}
      />
    </Screen>
  );
}

function MoneyRow({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <View style={{ flex: 1 }}>
        <T weight="semibold" style={{ fontSize: 15 }}>{label}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14 }}>{hint}</T>
      </View>
      <T weight="extrabold" style={{ fontSize: 16 }}>{value}</T>
    </View>
  );
}

type Step = "bank" | "number" | "confirm";

/**
 * Add or change the payout bank: pick the bank, type the account number, see the name the bank has for it and
 * confirm. When the name can't be looked up (Paystack not answering), the seller types it, as on the web.
 */
function BankFlow({ visible, banks, current, onClose, onSaved }: { visible: boolean; banks: string[]; current: string; onClose: () => void; onSaved: () => void }) {
  const t = useT("m_settings", "m_ui", "common");
  const [step, setStep] = useState<Step>("bank");
  const [query, setQuery] = useState("");
  const [bankName, setBankName] = useState(current);
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [typedName, setTypedName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("bank");
    setQuery("");
    setBankName(current);
    setNumber("");
    setName("");
    setTypedName(false);
    setError(null);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const result = await resolveAccount(bankName, number);
      if (result.status === "resolved") {
        setName(result.accountName);
        setTypedName(false);
        setStep("confirm");
      } else if (result.status === "not_found") {
        setError(t("bank.notFound", { bank: bankName }));
      } else {
        setTypedName(true);
      }
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : t("bank.checkFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await savePayoutBank(bankName, number, name.trim());
      reset();
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("bank.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const title = step === "bank" ? t("bank.pickTitle") : step === "number" ? t("bank.numberTitle") : t("bank.confirmTitle");
  const shown = filterBanks(banks, query);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={{ paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <T weight="extrabold" style={{ flex: 1, fontSize: 22, lineHeight: 28 }} accessibilityRole="header">{title}</T>
            <Pressable accessibilityRole="button" onPress={close} hitSlop={8} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppIcon name="x" size={16} />
              <T weight="bold" style={{ fontSize: 15 }}>{t("close")}</T>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28, gap: 12 }}>
            {step === "bank" ? (
              <>
                <Field placeholder={t("bank.search")} value={query} onChangeText={setQuery} autoCorrect={false} accessibilityLabel={t("bank.search")} />
                <Card style={{ paddingVertical: 2 }}>
                  {shown.map((bank, index) => (
                    <Pressable
                      key={bank}
                      accessibilityRole="button"
                      accessibilityState={{ selected: bank === bankName }}
                      onPress={() => {
                        setBankName(bank);
                        setError(null);
                        setStep("number");
                      }}
                      style={({ pressed }) => ({ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, opacity: pressed ? 0.7 : 1 })}
                    >
                      <T weight={bank === bankName ? "extrabold" : "regular"} style={{ flex: 1, fontSize: 16 }}>{bank}</T>
                      {bank === bankName ? <AppIcon name="check" size={20} color={colors.success} /> : <AppIcon name="chevron" size={18} color={colors.inkSoft} />}
                    </Pressable>
                  ))}
                  {!shown.length ? <T style={{ color: colors.inkSoft, paddingVertical: 14, fontSize: 15 }}>{t("bank.noMatch")}</T> : null}
                </Card>
              </>
            ) : null}

            {step === "number" ? (
              <>
                <Card style={{ gap: 4 }}>
                  <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("bank.bank")}</T>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <T weight="extrabold" style={{ flex: 1, fontSize: 16 }}>{bankName}</T>
                    <LinkButton title={t("bank.changeBank")} onPress={() => setStep("bank")} />
                  </View>
                </Card>
                <View>
                  <Label>{t("bank.number")}</Label>
                  <Field
                    keyboardType="number-pad"
                    maxLength={10}
                    placeholder={t("bank.tenDigits")}
                    value={number}
                    onChangeText={(text) => {
                      setNumber(accountDigits(text));
                      setTypedName(false);
                      setError(null);
                    }}
                    accessibilityLabel={t("bank.number")}
                    style={{ fontSize: 22, letterSpacing: 2 }}
                  />
                </View>
                {typedName ? (
                  <View>
                    <Notice tone="info">{t("bank.typeName")}</Notice>
                    <View style={{ marginTop: 12 }}>
                      <Label>{t("bank.name")}</Label>
                      <Field placeholder={t("bank.nameHint")} value={name} onChangeText={setName} accessibilityLabel={t("bank.name")} />
                    </View>
                  </View>
                ) : null}
                {error ? <Notice>{error}</Notice> : null}
                {typedName ? (
                  <PillButton title={t("continue")} disabled={name.trim().length < 2} onPress={() => setStep("confirm")} />
                ) : (
                  <PillButton title={t("bank.check")} busy={busy} disabled={number.length !== 10} onPress={() => void check()} />
                )}
              </>
            ) : null}

            {step === "confirm" ? (
              <>
                <T style={{ fontSize: 16, lineHeight: 23 }}>{typedName ? t("bank.confirmTyped") : t("bank.confirmFound")}</T>
                <Card style={{ gap: 6 }}>
                  <T weight="extrabold" style={{ fontSize: 22, lineHeight: 28 }}>{name}</T>
                  <T style={{ fontSize: 16 }}>{bankName}</T>
                  <T weight="semibold" style={{ fontSize: 18, letterSpacing: 1.5 }}>{number}</T>
                </Card>
                {error ? <Notice>{error}</Notice> : null}
                <PillButton title={t("bank.yesSave")} busy={busy} onPress={() => void save()} />
                <PillButton
                  title={t("bank.notMine")}
                  tone="white"
                  size="md"
                  disabled={busy}
                  onPress={() => {
                    setStep("number");
                    setError(null);
                  }}
                />
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
