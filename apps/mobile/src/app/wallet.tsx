import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { DarkCard, List, Row as ListRow, Small, Tile } from "@/components/design";
import { Badge, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, Notice, PillButton, Segmented, T, Toggle } from "@/components/ui";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { upcomingPayout } from "@/lib/delivery-pure";
import { capitalise, friendlyDay } from "@/lib/friendly";
import { checkWalletAccount, confirmCashReceived, fetchWallet, linkWalletBank, nairaFromKobo, PREPAID_BALANCE_IN_APP, type WalletData } from "@/lib/wallet";
import { colors, radii } from "@/theme";
import { MoneyOwedCard } from "@/components/MoneyOwedCard";
import { WalletBalanceCard } from "@/components/WalletBalanceCard";

// Shopinbos Wallet (web /home/wallet, /supplier/wallet, /logistics/wallet), the same screen for sellers, suppliers
// and delivery partners: set up in steps (add the bank, Paystack checks it and opens the subaccount, then card
// payments are on; suppliers and delivery partners also verify their CAC or BN; nobody is asked for a BVN or NIN
// now, src/lib/wallet/wallet.server.ts), then what
// Paystack paid in and settled. Shopinbos never holds the money: each card payment is split at checkout and every
// share settles straight to the business's own bank. Sellers also see cash on delivery a partner still owes them,
// and everyone sees money owed between businesses (components/MoneyOwedCard.tsx).
// Restyled to the "Familiar app" prototype `on.money`: a dark "Coming to your bank" card with the next Paystack
// settlement (never a balance to take out: the money is never held), "This week", the bank with Change, and the
// recent payments, then the set-up steps and everything else as before.

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
    <Screen title={t("w.money")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading && !data ? <LoadingBlock /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {PREPAID_BALANCE_IN_APP ? <WalletBalanceCard /> : null}
      {data ? <WalletBody data={data} t={t} reload={() => void loaded.reload()} /> : null}
    </Screen>
  );
}

function WalletBody({ data, t, reload }: { data: WalletData; t: TFn; reload: () => void }) {
  const { view, role } = data;
  // Sellers have no check; a supplier's or delivery partner's is its CAC or BN registration.
  const check = view.check ?? { kind: "none" as const };
  const active = view.settlement.status === "active" && !view.settlement.frozen;
  // "Change" on the bank row opens the bank form in the set-up card.
  const [changingBank, setChangingBank] = useState(false);

  // The next Paystack settlement not paid out yet (its day), and this week's payments.
  const coming = upcomingPayout(view.settlements);
  const now = new Date();
  const comingDay = coming?.date && new Date(coming.date).getTime() > now.getTime() ? capitalise(friendlyDay(coming.date, now, t)) : null;
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const week = view.entries.filter((entry) => entry.amountKobo > 0 && entry.status !== "refunded" && new Date(entry.createdAt).getTime() >= weekAgo);
  const weekKobo = week.reduce((sum, entry) => sum + entry.amountKobo, 0);

  return (
    <View style={{ gap: 14 }}>
      <DarkCard
        eyebrow={t("w.coming")}
        amount={naira(coming?.amount ?? 0)}
        line={coming ? (comingDay ? t("w.comingDay", { day: comingDay }) : t("w.comingSoon")) : t("w.comingNone")}
      />

      {active ? (
        <Card style={{ gap: 4, padding: 16 }}>
          <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("w.thisWeek")}</T>
          <T weight="extrabold" style={{ fontSize: 22 }}>{t("w.weekLine", { amount: nairaFromKobo(weekKobo), count: week.length })}</T>
          <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("w.last30Line", { amount: nairaFromKobo(view.totals.last30Kobo) })}</T>
        </Card>
      ) : view.cardsReady === false ? (
        // Only while Paystack is off for Shopinbos (older servers don't say: then it's on).
        <Notice tone="info">{t("w.cards.off")}</Notice>
      ) : role === "seller" && !view.bank ? (
        <Notice tone="info">{t("w.cards.needsBank")}</Notice>
      ) : null}

      {view.bank ? (
        <List>
          <ListRow
            lead={<Tile icon="wallet" tone="ok" />}
            title={`${view.bank.bankName} ${view.bank.accountEnding}`}
            sub={view.bank.accountName}
            right={!view.settlement.frozen ? <PillButton testID="change-bank" title={t("w.change")} tone="white" size="sm" onPress={() => setChangingBank(true)} /> : undefined}
          />
        </List>
      ) : null}

      {data.cashToReceive.length ? <CashToReceiveCard rows={data.cashToReceive} t={t} onDone={reload} /> : null}

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <T weight="extrabold" style={{ flex: 1, fontSize: 17 }} accessibilityRole="header">{t("w.getPaid")}</T>
          {statusBadge(view, t)}
        </View>
        {view.settlement.frozen ? <Notice>{view.settlement.frozenReason ? t("w.pausedWhy", { reason: view.settlement.frozenReason }) : t("w.pausedSupport")}</Notice> : null}
        {!view.settlement.frozen ? <SetupSteps view={view} role={role} t={t} /> : null}

        {/* Getting paid comes first (like Shopify Payments): the bank, then a supplier's or delivery partner's CAC or BN. */}
        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
          <T weight="extrabold" style={{ fontSize: 15.5 }}>{t("w.bankStep")}{active ? " ✓" : ""}</T>
          {view.bank ? <T style={{ fontSize: 15 }}>{`${view.bank.accountName} · ${view.bank.bankName} ${view.bank.accountEnding}`}</T> : null}
          {view.settlement.status === "review" ? <Notice tone="info">{t("w.review")}</Notice> : null}
          {view.settlement.status === "failed" && view.settlement.error ? <Notice>{t("w.failed", { reason: view.settlement.error })}</Notice> : null}
          {!view.settlement.frozen ? (
            <BankForm
              key={changingBank ? "change" : "view"}
              banks={data.banks}
              hasBank={Boolean(view.bank) && !changingBank}
              t={t}
              onDone={() => {
                setChangingBank(false);
                reload();
              }}
            />
          ) : null}
        </View>

        {check.kind === "business" ? (
          <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
            <T weight="extrabold" style={{ fontSize: 15.5 }}>{t("w.businessStep")}{check.status === "approved" ? " ✓" : ""}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t.dynamic(`w.business.${check.status}`, "")}</T>
            {check.status !== "approved" ? (
              <PillButton title={check.status === "pending" ? t("w.businessView") : t("w.businessGo")} size="sm" style={{ alignSelf: "flex-start" }} onPress={() => router.push(role === "supplier" ? "/supplier/verification" : "/logistics/verification")} />
            ) : null}
          </View>
        ) : null}

        <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>{view.fee ? t("w.fee", { fee: feeText(view.fee) }) : t("w.never")}</T>
      </Card>

      {view.owed ? (
        <MoneyOwedCard owed={view.owed} role={role} onChanged={reload} />
      ) : view.toReturn.length ? (
        // An older server without money owed: the not-sent dropship orders only.
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

      <SectionTitle>{t("w.recent")}</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {view.entries.length ? (
          view.entries.map((entry) => (
            <Row
              key={entry.id}
              label={entry.description}
              hint={`${new Date(entry.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}${entry.status === "refunded" ? ` · ${t("w.refunded")}` : ""}`}
              // Money taken for what this business owes (who pays when things go wrong): the whole line, with why.
              amount={entry.kind === "deduction" ? `−${nairaFromKobo(Math.abs(entry.amountKobo))}` : nairaFromKobo(entry.amountKobo)}
              lines={entry.kind === "deduction" ? 6 : 1}
              color={entry.kind === "deduction" ? colors.danger : undefined}
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

      <Small>{t("w.sub")}</Small>
    </View>
  );
}

/**
 * Where getting paid by card stands, step by step: the bank is added, Paystack checked it (the subaccount is active),
 * card payments are on. The step still to do is in bold; done steps are ticked.
 */
function SetupSteps({ view, role, t }: { view: WalletData["view"]; role: WalletData["role"]; t: TFn }) {
  const active = view.settlement.status === "active";
  const steps = [
    { key: "bank", label: t("w.steps.bank"), done: Boolean(view.bank) },
    { key: "check", label: t("w.steps.check"), done: active },
    { key: "cards", label: t("w.steps.cards"), done: active && view.cardsReady !== false },
  ];
  const next = steps.findIndex((step) => !step.done);
  return (
    <View style={{ gap: 8 }} accessibilityRole="list">
      {steps.map((step, index) => (
        <View key={step.key} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: step.done ? colors.successTint : index === next ? colors.ink : colors.canvas }}>
            <T weight="extrabold" style={{ fontSize: 12.5, color: step.done ? colors.success : index === next ? "#FFFFFF" : colors.inkSoft }}>{step.done ? "✓" : String(index + 1)}</T>
          </View>
          <T weight={index === next ? "extrabold" : "semibold"} style={{ flex: 1, fontSize: 15, color: step.done || index === next ? colors.ink : colors.inkSoft }}>{step.label}</T>
        </View>
      ))}
      {next === -1 ? <T style={{ color: colors.success, fontSize: 14, lineHeight: 20 }}>{role === "seller" ? t("w.cards.live.seller") : t("w.cards.live.business")}</T> : null}
    </View>
  );
}

function Row({ label, hint, amount, onPress, lines = 1, color }: { label: string; hint?: string; amount: string; onPress?: () => void; lines?: number; color?: string }) {
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="bold" style={{ fontSize: 15 }} numberOfLines={lines}>{label}</T>
        {hint ? <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{hint}</T> : null}
      </View>
      <T weight="extrabold" style={{ fontSize: 15, ...(color ? { color } : {}) }}>{amount}</T>
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress}>{body}</Pressable> : body;
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

/** "1.5%", "1.5% (min ₦100, max ₦2,000)". */
function feeText(fee: { rate: number; minFee: number; maxFee: number }) {
  const amount = (value: number) => `₦${value.toLocaleString("en-NG")}`;
  const limits = [fee.minFee > 0 ? `min ${amount(fee.minFee)}` : null, fee.maxFee > 0 ? `max ${amount(fee.maxFee)}` : null].filter(Boolean);
  return `${fee.rate}%${limits.length ? ` (${limits.join(", ")})` : ""}`;
}
