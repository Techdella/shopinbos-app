import { useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { CLAIM_REASONS, CLAIM_WITHIN_DAYS, PAY_WITHIN_DAYS, type ClaimTarget } from "@shared/money-owed";
import { Card, Chip, Field, Label, Notice, PillButton, T, WithTip } from "@/components/ui";
import { answerClaim, cancelDebt, confirmDebtPaid, nairaFromKobo, payDebt, raiseClaim, type Debt, type MoneyOwed, type WalletRole } from "@/lib/wallet";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Money owed between this business and others, in the phone's Shopinbos Wallet (the web wallet's Money owed,
// web src/lib/money-owed). What you owe: accept or dispute a claim, then pay it by card, straight to their bank.
// What's owed to you: confirm it when they paid another way, or let it go. Sellers raise claims for wrong or
// damaged goods, or a parcel lost after pickup. Shopinbos never holds the money. Words: the shared "wallet"
// namespace (owed.*, reason.*, claim.*), the same as the web.

type WalletT = ReturnType<typeof useT<["wallet"]>>;

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" }) : "");

function statusText(debt: Debt, mine: boolean, t: WalletT) {
  if (debt.status === "claimed") return mine ? t("owed.status.claimedMine") : t("owed.status.claimedTheirs");
  if (debt.status === "disputed") return t("owed.status.disputed");
  if (debt.status === "paid") return t("owed.status.paid");
  if (debt.status === "rejected") return t("owed.status.rejected");
  if (debt.status === "waived") return t("owed.status.waived");
  if (debt.overdue) return mine ? t("owed.status.overdueMine") : t("owed.status.overdueTheirs");
  return debt.dueAt ? t("owed.status.due", { date: day(debt.dueAt) }) : t("owed.status.owed");
}

export function MoneyOwedCard({ owed, role, onChanged }: { owed: MoneyOwed; role: WalletRole; onChanged: () => void }) {
  const t = useT("wallet", "m_money");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const party = (debt: Debt) => (debt.otherParty === "Shopinbos" ? t("owed.shopinbos") : debt.otherParty);

  async function run(key: string, work: () => Promise<{ message?: string } | unknown>, done?: string) {
    setBusy(key);
    setMessage(null);
    try {
      const result = (await work()) as { message?: string } | undefined;
      setMessage({ tone: "success", text: result?.message ?? done ?? t("owed.done") });
      setDisputing(null);
      setResponse("");
      onChanged();
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : t("owed.failed") });
    } finally {
      setBusy(null);
    }
  }

  async function pay(debt: Debt) {
    setBusy(`pay:${debt.id}`);
    setMessage(null);
    try {
      const result = await payDebt(debt.id);
      setMessage(
        result.outcome === "paid"
          ? { tone: "success", text: t("owed.paidThem", { name: party(debt) }) }
          : result.outcome === "pending"
            ? { tone: "info", text: t("pay.pending") }
            : { tone: "error", text: t("pay.cancelled") },
      );
      onChanged();
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : t("owed.failed") });
    } finally {
      setBusy(null);
    }
  }

  function askCancel(debt: Debt) {
    const open = debt.status === "open";
    Alert.alert(open ? t("owed.letGoTitle", { name: party(debt) }) : t("owed.withdrawTitle"), open ? t("owed.letGoBody", { amount: nairaFromKobo(debt.remainingKobo) }) : undefined, [
      { text: t("owed.back"), style: "cancel" },
      { text: open ? t("owed.letGo") : t("owed.withdraw"), style: "destructive", onPress: () => void run(`cancel:${debt.id}`, () => cancelDebt(debt.id)) },
    ]);
  }

  const hasDebts = owed.iOwe.length > 0 || owed.owedToMe.length > 0;
  if (!hasDebts && role !== "seller" && !owed.pausedAt) return null;

  return (
    <Card style={{ gap: 12 }}>
      <WithTip title={t("owed.title")} tip={{ text: t("owed.sub", { days: PAY_WITHIN_DAYS }) }}>
        <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("owed.title")}</T>
      </WithTip>
      {owed.pausedAt ? <Notice>{t("owed.paused")}</Notice> : null}

      {owed.iOwe.length ? <T weight="extrabold" style={{ fontSize: 15 }}>{t("owed.iOwe")}</T> : null}
      {owed.iOwe.map((debt) => (
        <View key={debt.id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
          <DebtLine debt={debt} mine party={party(debt)} t={t} />
          {debt.status === "claimed" ? (
            disputing === debt.id ? (
              <>
                <Field value={response} onChangeText={setResponse} placeholder={t("owed.disputePh")} multiline maxLength={2000} style={{ minHeight: 90 }} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <PillButton title={t("owed.sendTeam")} size="sm" busy={busy === `respond:${debt.id}`} disabled={busy !== null} onPress={() => void run(`respond:${debt.id}`, () => answerClaim(debt.id, false, response))} />
                  <PillButton title={t("owed.back")} tone="white" size="sm" onPress={() => setDisputing(null)} />
                </View>
              </>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <PillButton title={t("owed.accept", { amount: nairaFromKobo(debt.amountKobo) })} size="sm" busy={busy === `respond:${debt.id}`} disabled={busy !== null} onPress={() => void run(`respond:${debt.id}`, () => answerClaim(debt.id, true))} />
                <PillButton title={t("owed.notRight")} tone="white" size="sm" disabled={busy !== null} onPress={() => { setDisputing(debt.id); setResponse(""); }} />
              </View>
            )
          ) : debt.status === "open" && debt.remainingKobo > 0 ? (
            debt.payable ? (
              <PillButton title={t("owed.payOwed", { amount: nairaFromKobo(debt.remainingKobo) })} size="sm" busy={busy === `pay:${debt.id}`} disabled={busy !== null} onPress={() => void pay(debt)} />
            ) : (
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("owed.noWallet", { name: party(debt) })}</T>
            )
          ) : null}
        </View>
      ))}

      {owed.owedToMe.length ? <T weight="extrabold" style={{ fontSize: 15 }}>{t("owed.owedToMe")}</T> : null}
      {owed.owedToMe.map((debt) => (
        <View key={debt.id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
          <DebtLine debt={debt} mine={false} party={party(debt)} t={t} onOpenOrder={role === "seller" && debt.orderId ? () => router.push({ pathname: "/order/[id]", params: { id: debt.orderId as string } }) : undefined} />
          {["claimed", "disputed", "open"].includes(debt.status) ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {debt.status === "open" && debt.remainingKobo > 0 ? (
                <PillButton title={t("owed.theyPaid", { amount: nairaFromKobo(debt.remainingKobo) })} tone="white" size="sm" busy={busy === `paid:${debt.id}`} disabled={busy !== null} onPress={() => void run(`paid:${debt.id}`, () => confirmDebtPaid(debt.id))} />
              ) : null}
              <PillButton title={debt.status === "open" ? t("owed.letGo") : t("owed.withdraw")} tone="white" size="sm" disabled={busy !== null} onPress={() => askCancel(debt)} />
            </View>
          ) : null}
        </View>
      ))}

      {role === "seller" ? <ClaimForm owed={owed} t={t} onDone={(text) => { setMessage({ tone: "success", text }); onChanged(); }} /> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </Card>
  );
}

function DebtLine({ debt, mine, party, t, onOpenOrder }: { debt: Debt; mine: boolean; party: string; t: WalletT; onOpenOrder?: () => void }) {
  return (
    <View style={{ gap: 3 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
        <T weight="extrabold" style={{ flex: 1, fontSize: 15 }} numberOfLines={1} onPress={onOpenOrder}>{mine ? t("owed.to", { name: party }) : t("owed.from", { name: party })}</T>
        <T weight="extrabold" style={{ fontSize: 15 }}>{nairaFromKobo(debt.amountKobo)}</T>
      </View>
      {debt.remainingKobo > 0 && debt.remainingKobo < debt.amountKobo ? <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("owed.left", { amount: nairaFromKobo(debt.remainingKobo) })}</T> : null}
      <T style={{ fontSize: 14 }}>
        <T weight="bold" style={{ fontSize: 14 }}>{t.dynamic(`reason.${debt.reason}`, debt.reasonLabel)}</T>
        {"  "}
        <T weight="bold" style={{ fontSize: 14, color: debt.overdue ? colors.danger : debt.status === "paid" ? colors.success : colors.inkSoft }}>{statusText(debt, mine, t)}</T>
      </T>
      {debt.details ? <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{debt.details}</T> : null}
      {debt.response ? <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{`${mine ? t("owed.youSaid") : t("owed.theySaid")} ${debt.response}`}</T> : null}
      {debt.decisionNote ? <T style={{ fontSize: 13.5, lineHeight: 19 }}>{`${t("owed.decision")} ${debt.decisionNote}`}</T> : null}
    </View>
  );
}

function ClaimForm({ owed, t, onDone }: { owed: MoneyOwed; t: WalletT; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = owed.claimable.find((row) => `${row.target}:${row.id}` === choice) ?? null;

  if (!open) {
    return (
      <View style={{ gap: 8, backgroundColor: colors.canvas, borderRadius: radii.card, padding: 12 }}>
        {/* The deadline stays on screen; what counts is in the tip. */}
        <WithTip title={t("claim.title")} tip={{ text: t("claim.prompt", { days: CLAIM_WITHIN_DAYS }) }}>
          <T style={{ fontSize: 14, lineHeight: 20 }}>{t("claim.promptShort", { days: CLAIM_WITHIN_DAYS })}</T>
        </WithTip>
        <PillButton title={t("claim.open")} tone="white" size="sm" onPress={() => setOpen(true)} />
      </View>
    );
  }

  async function send() {
    if (!selected || !reason) return setError(t("claim.chooseOrder"));
    setBusy(true);
    setError(null);
    try {
      const result = await raiseClaim({ target: selected.target, targetId: selected.id, reason, amount, details });
      setOpen(false);
      setChoice(null);
      setReason(null);
      setAmount("");
      setDetails("");
      onDone(result.message ?? t("claim.sent"));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("owed.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 10, backgroundColor: colors.canvas, borderRadius: radii.card, padding: 12 }}>
      <WithTip title={t("claim.title")} tip={{ text: t("claim.who") }}>
        <T weight="extrabold" style={{ fontSize: 15 }}>{t("claim.title")}</T>
      </WithTip>
      {owed.claimable.length ? (
        <>
          <Label>{t("claim.which")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {owed.claimable.map((row) => {
              const key = `${row.target}:${row.id}`;
              return <Chip key={key} label={`${row.label} · ${row.party}`} on={choice === key} onPress={() => { setChoice(key); setReason(null); }} />;
            })}
          </View>
          {selected ? (
            <>
              <Label>{t("claim.what")}</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {CLAIM_REASONS[selected.target as ClaimTarget].map((key) => <Chip key={key} label={t.dynamic(`reason.${key}`, key)} on={reason === key} onPress={() => setReason(key)} />)}
              </View>
              <Label>{t("claim.howMuch", { max: nairaFromKobo(selected.maxKobo) })}</Label>
              <Field value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="₦" />
              <Label>{t("claim.happened")}</Label>
              <Field value={details} onChangeText={setDetails} placeholder={t("claim.happenedPh")} multiline maxLength={2000} style={{ minHeight: 90 }} />
            </>
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <PillButton title={busy ? t("claim.sending") : t("claim.send")} size="sm" busy={busy} disabled={!selected || !reason} onPress={() => void send()} />
            <PillButton title={t("claim.cancel")} tone="white" size="sm" onPress={() => setOpen(false)} />
          </View>
        </>
      ) : (
        <T style={{ fontSize: 14 }}>{t("claim.none", { days: CLAIM_WITHIN_DAYS })}</T>
      )}
    </View>
  );
}
