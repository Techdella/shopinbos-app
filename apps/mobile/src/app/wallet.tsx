import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { Badge, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, Notice, PillButton, Segmented, T, Toggle } from "@/components/ui";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { checkWalletAccount, confirmCashReceived, fetchWallet, linkWalletBank, nairaFromKobo, verifyWalletId, type WalletData } from "@/lib/wallet";
import { colors, radii } from "@/theme";

// Shopinbos Wallet (web /home/wallet, /supplier/wallet, /logistics/wallet), the same screen for sellers, suppliers
// and delivery partners: two steps to set up (verify a BVN or NIN, then the bank Paystack settles to), then what
// Paystack paid in and settled. Shopinbos never holds the money: each card payment is split at checkout and every
// share settles straight to the business's own bank. Sellers also see cash on delivery a partner still owes them.

type TFn = ReturnType<typeof useT<["m_money", "m_ui"]>>;

function statusBadge(view: WalletData["view"], t: TFn) {
  if (view.settlement.frozen) return <Badge label={t("w.paused")} bg={colors.dangerTint} fg={colors.danger} />;
  if (view.settlement.status === "active") return <Badge label={t("w.receiving")} bg={colors.successTint} fg={colors.success} />;
  if (view.settlement.status === "review") return <Badge label={t("w.checking")} bg="#FDF0D5" fg="#8A5A00" />;
  if (view.settlement.status === "failed") return <Badge label={t("w.needsAttention")} bg={colors.dangerTint} fg={colors.danger} />;
  return <Badge label={t("w.notSetUp")} />;
}

export default function Wallet() {
  const t = useT("m_money", "m_ui");
  const loaded = useLoad(fetchWallet);
  const data = loaded.data;

  return (
    <Screen title={t("w.title")} sub={t("w.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading && !data ? <LoadingBlock /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {data ? <WalletBody data={data} t={t} reload={() => void loaded.reload()} /> : null}
    </Screen>
  );
}

function WalletBody({ data, t, reload }: { data: WalletData; t: TFn; reload: () => void }) {
  const { view, role } = data;
  const kycDone = view.kyc.status === "verified";
  const active = view.settlement.status === "active" && !view.settlement.frozen;

  return (
    <View style={{ gap: 14 }}>
      {active ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Card style={{ flex: 1, gap: 4, padding: 14 }}>
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("w.last30")}</T>
            <T weight="extrabold" style={{ fontSize: 20 }}>{nairaFromKobo(view.totals.last30Kobo)}</T>
          </Card>
          <Card style={{ flex: 1, gap: 4, padding: 14 }}>
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("w.allTime")}</T>
            <T weight="extrabold" style={{ fontSize: 20 }}>{nairaFromKobo(view.totals.paidKobo)}</T>
          </Card>
        </View>
      ) : role === "seller" ? (
        <Notice tone="info">{t("w.sellerNotReady")}</Notice>
      ) : null}

      {data.cashToReceive.length ? <CashToReceiveCard rows={data.cashToReceive} t={t} onDone={reload} /> : null}

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <T weight="extrabold" style={{ flex: 1, fontSize: 17 }} accessibilityRole="header">{t("w.getPaid")}</T>
          {statusBadge(view, t)}
        </View>
        {view.settlement.frozen ? <Notice>{view.settlement.frozenReason ? t("w.pausedWhy", { reason: view.settlement.frozenReason }) : t("w.pausedSupport")}</Notice> : null}

        {/* Getting paid comes first (like Shopify Payments): the bank, then the ID check, which no longer gates it. */}
        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
          <T weight="extrabold" style={{ fontSize: 15.5 }}>{t("w.bankStep")}{active ? " ✓" : ""}</T>
          {view.bank ? <T style={{ fontSize: 15 }}>{`${view.bank.accountName} · ${view.bank.bankName} ${view.bank.accountEnding}`}</T> : null}
          {view.settlement.status === "review" ? <Notice tone="info">{t("w.review")}</Notice> : null}
          {view.settlement.status === "failed" && view.settlement.error ? <Notice>{t("w.failed", { reason: view.settlement.error })}</Notice> : null}
          {!view.settlement.frozen ? <BankForm banks={data.banks} hasBank={Boolean(view.bank)} t={t} onDone={reload} /> : null}
        </View>

        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
          <T weight="extrabold" style={{ fontSize: 15.5 }}>{t("w.idStep")}{kycDone ? " ✓" : ""}</T>
          {kycDone ? (
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>
              {t("w.verified", { name: view.kyc.name ?? "", id: view.kyc.idType === "nin" ? "NIN" : "BVN", last4: view.kyc.idLast4 ?? "" })}
            </T>
          ) : (
            <>
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{role === "seller" ? t("w.idWhySeller") : t("w.idWhyBusiness")}</T>
              {view.kyc.checksReady ? <KycForm ownerName={data.ownerName} t={t} onDone={reload} /> : <Notice tone="info">{t("w.checksSoon")}</Notice>}
            </>
          )}
        </View>

        <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>{t("w.never")}</T>
      </Card>

      {view.toReturn.length ? (
        <Card style={{ gap: 8 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{role === "supplier" ? t("w.payBack") : t("w.toReturn")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{role === "supplier" ? t("w.payBackSub") : t("w.toReturnSub")}</T>
          {view.toReturn.map((row) => (
            <Row key={`${row.orderId}-${row.otherParty}`} label={t("w.order", { number: row.orderNumber })} hint={row.otherParty} amount={nairaFromKobo(row.amountKobo)} onPress={role === "seller" ? () => router.push({ pathname: "/order/[id]", params: { id: row.orderId } }) : undefined} />
          ))}
        </Card>
      ) : null}

      {view.sellerSettles.length ? (
        <Card style={{ gap: 8 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{t("w.paySuppliers")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("w.paySuppliersSub")}</T>
          {view.sellerSettles.map((row) => (
            <Row key={row.orderId} label={t("w.order", { number: row.orderNumber })} amount={nairaFromKobo(row.amountKobo)} onPress={() => router.push({ pathname: "/order/[id]", params: { id: row.orderId } })} />
          ))}
        </Card>
      ) : null}

      <SectionTitle>{t("w.payments")}</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {view.entries.length ? (
          view.entries.map((entry) => (
            <Row
              key={entry.id}
              label={entry.description}
              hint={`${new Date(entry.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}${entry.status === "refunded" ? ` · ${t("w.refunded")}` : ""}`}
              amount={nairaFromKobo(entry.amountKobo)}
              onPress={role === "seller" && entry.orderId ? () => router.push({ pathname: "/order/[id]", params: { id: entry.orderId as string } }) : undefined}
            />
          ))
        ) : (
          <T style={{ color: colors.inkSoft, fontSize: 15, paddingVertical: 10 }}>{t("w.noPayments")}</T>
        )}
      </Card>

      {view.settlements.length ? (
        <>
          <SectionTitle>{t("w.settlements")}</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {view.settlements.map((row) => (
              <Row key={row.id} label={row.date ? new Date(row.date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : t("w.scheduled")} hint={row.status || t("w.pending")} amount={nairaFromKobo(row.amountKobo)} />
            ))}
          </Card>
        </>
      ) : null}
    </View>
  );
}

function Row({ label, hint, amount, onPress }: { label: string; hint?: string; amount: string; onPress?: () => void }) {
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="bold" style={{ fontSize: 15 }} numberOfLines={1}>{label}</T>
        {hint ? <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{hint}</T> : null}
      </View>
      <T weight="extrabold" style={{ fontSize: 15 }}>{amount}</T>
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress}>{body}</Pressable> : body;
}

function KycForm({ ownerName, t, onDone }: { ownerName: string; t: TFn; onDone: () => void }) {
  const [first = "", ...rest] = ownerName.trim().split(/\s+/);
  const [idType, setIdType] = useState<"bvn" | "nin">("nin");
  const [idNumber, setIdNumber] = useState("");
  const [firstName, setFirstName] = useState(first);
  const [lastName, setLastName] = useState(rest.join(" "));
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await verifyWalletId({ idType, idNumber, firstName, lastName, dateOfBirth, consent });
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("w.tryAgain"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <Segmented options={[{ value: "nin", label: "NIN" }, { value: "bvn", label: "BVN" }]} value={idType} onChange={setIdType} />
      <View>
        <Label>{idType === "bvn" ? t("w.bvn") : t("w.nin")}</Label>
        <Field keyboardType="number-pad" maxLength={11} value={idNumber} onChangeText={(text) => setIdNumber(text.replace(/\D/g, ""))} accessibilityLabel={idType === "bvn" ? t("w.bvn") : t("w.nin")} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>{t("w.firstName")}</Label>
          <Field value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>{t("w.lastName")}</Label>
          <Field value={lastName} onChangeText={setLastName} autoComplete="family-name" />
        </View>
      </View>
      <View>
        <Label>{t("w.dob")}</Label>
        <Field placeholder="1990-05-31" keyboardType="numbers-and-punctuation" maxLength={10} value={dateOfBirth} onChangeText={setDateOfBirth} accessibilityLabel={t("w.dob")} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <T style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{t("w.consent")}</T>
        <Toggle on={consent} onChange={setConsent} label={t("w.consent")} />
      </View>
      {error ? <Notice>{error}</Notice> : null}
      <PillButton title={t("w.verify")} size="md" busy={busy} disabled={!consent || idNumber.length !== 11 || !dateOfBirth} onPress={() => void submit()} />
    </View>
  );
}

function BankForm({ banks, hasBank, t, onDone }: { banks: string[]; hasBank: boolean; t: TFn; onDone: () => void }) {
  const [open, setOpen] = useState(!hasBank);
  const [search, setSearch] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = search.trim() ? banks.filter((bank) => bank.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8) : [];
  // Whose account it is, looked up once the 10 digits are in, so the person confirms before saving.
  const [holder, setHolder] = useState<{ key: string; name: string | null; missing: boolean } | null>(null);
  const lookupKey = bankName && accountNumber.length === 10 ? `${bankName}:${accountNumber}` : "";
  useEffect(() => {
    if (!lookupKey) return;
    let alive = true;
    checkWalletAccount({ bankName, accountNumber })
      .then((result) => alive && setHolder({ key: lookupKey, name: result.status === "resolved" ? result.accountName : null, missing: result.status === "not_found" }))
      .catch(() => alive && setHolder({ key: lookupKey, name: null, missing: false }));
    return () => {
      alive = false;
    };
  }, [lookupKey, bankName, accountNumber]);
  const shown = holder && holder.key === lookupKey ? holder : null;

  if (!open) return <PillButton title={t("w.changeBank")} tone="white" size="md" onPress={() => setOpen(true)} />;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await linkWalletBank({ bankName, accountNumber });
      setOpen(false);
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("w.tryAgain"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <View>
        <Label>{t("w.bank")}</Label>
        {bankName ? (
          <Pressable accessibilityRole="button" onPress={() => setBankName("")} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, padding: 14 }}>
            <AppIcon name="wallet" size={18} />
            <T weight="bold" style={{ flex: 1, fontSize: 15 }}>{bankName}</T>
            <T style={{ color: colors.accentInk, fontSize: 14 }}>{t("w.change")}</T>
          </Pressable>
        ) : (
          <>
            <Field placeholder={t("w.searchBank")} value={search} onChangeText={setSearch} accessibilityLabel={t("w.bank")} />
            {matches.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {matches.map((bank) => <Chip key={bank} label={bank} on={false} onPress={() => { setBankName(bank); setSearch(""); }} />)}
              </View>
            ) : null}
          </>
        )}
      </View>
      <View>
        <Label>{t("w.accountNumber")}</Label>
        <Field keyboardType="number-pad" maxLength={10} value={accountNumber} onChangeText={(text) => setAccountNumber(text.replace(/\D/g, ""))} accessibilityLabel={t("w.accountNumber")} />
      </View>
      {lookupKey && !shown ? <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("w.lookingUp")}</T> : null}
      {shown?.name ? (
        <View style={{ backgroundColor: colors.canvas, borderRadius: radii.card, padding: 12, gap: 2 }}>
          <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("w.accountName")}</T>
          <T weight="extrabold" style={{ fontSize: 16 }}>{shown.name}</T>
        </View>
      ) : null}
      {shown?.missing ? <Notice>{t("w.noSuchAccount")}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      <PillButton title={shown?.name ? t("w.payMeHere") : t("w.saveBank")} size="md" busy={busy} disabled={!bankName || accountNumber.length !== 10 || Boolean(shown?.missing)} onPress={() => void submit()} />
    </View>
  );
}

function CashToReceiveCard({ rows, t, onDone }: { rows: WalletData["cashToReceive"]; t: TFn; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm(partnerId: string) {
    setBusy(partnerId);
    setError(null);
    try {
      await confirmCashReceived(partnerId);
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("w.tryAgain"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      <T weight="extrabold" style={{ fontSize: 16 }}>{t("w.cashTitle")}</T>
      <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("w.cashSub")}</T>
      {rows.map((row) => (
        <View key={row.partnerId} style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <T weight="bold" style={{ fontSize: 15 }}>{row.partnerName}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("w.jobs", { count: row.jobs })}</T>
            </View>
            <T weight="extrabold" style={{ fontSize: 15 }}>{naira(row.amount)}</T>
          </View>
          <PillButton title={t("w.gotIt")} tone="white" size="sm" busy={busy === row.partnerId} disabled={busy !== null} onPress={() => void confirm(row.partnerId)} />
        </View>
      ))}
      {error ? <Notice>{error}</Notice> : null}
    </Card>
  );
}
