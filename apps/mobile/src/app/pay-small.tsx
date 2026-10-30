import { useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { DarkCard, List, Row, Tile } from "@/components/design";
import { Badge, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { useFeature } from "@/lib/features";
import { fetchPlans, togetherAction } from "@/lib/together";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Paying small small (web /home/pay-small; pilot "pay_small_small"): plans with progress and next due date, refunds
// per the seller's own rule on missed or cancelled plans (sent from their own bank), and every part that landed.

const TONE: Record<string, { bg: string; fg: string }> = {
  active: { bg: colors.mintTint, fg: colors.forest },
  completed: { bg: colors.successTint, fg: colors.success },
  defaulted: { bg: colors.dangerTint, fg: colors.accentInk },
  cancelled: { bg: colors.canvas, fg: colors.inkSoft },
};

const dayText = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" });

export default function PaySmall() {
  const on = useFeature("pay_small_small");
  const t = useT("together");
  const loaded = useLoad(fetchPlans);
  const data = loaded.data;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await togetherAction(body);
      setMessage({ tone: "success", text: t("saved") });
      setRefundFor(null);
      await loaded.reload();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t("plans.title")} sub={t("plans.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {!on ? <EmptyState icon="lock" title={t("notReady")} /> : null}
      {on && loaded.loading && !data ? <LoadingBlock /> : null}
      {on && loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {on && data ? (
        <>
          {!data.walletReady ? <Notice tone="info">{t("walletNeeded")}</Notice> : null}
          <DarkCard eyebrow={t("plans.received")} amount={naira(data.totals.received)} line={`${t("plans.active")}: ${data.totals.active} · ${t("plans.completed")}: ${data.totals.completed} · ${t("plans.owed")}: ${naira(data.totals.owed)}`} />
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          {data.plans.length ? (
            <List>
              {data.plans.map((plan) => {
                const tone = TONE[plan.status] ?? TONE.cancelled;
                const canRefund = (plan.status === "defaulted" || plan.status === "cancelled") && plan.paid > 0 && plan.refundStatus !== "done";
                return (
                  <Row
                    key={plan.id}
                    lead={<Tile icon="coin" tone="mint" />}
                    title={plan.buyerName}
                    sub={`${plan.productName} · ${t("plans.progress", { paid: naira(plan.paid), total: naira(plan.total), count: plan.paidCount, weeks: plan.weeks })}${plan.nextDueAt && plan.status === "active" ? ` · ${t("plans.next", { date: dayText(plan.nextDueAt) })}` : ""}`}
                    right={<Badge label={t.dynamic(`status.${plan.status}`, plan.status)} bg={tone.bg} fg={tone.fg} />}
                    below={
                      <View style={{ gap: 8, paddingTop: 6 }}>
                        {plan.refundNote ? <T style={{ fontSize: 13, color: colors.inkSoft }}>{plan.refundNote}</T> : null}
                        {plan.orderId ? <LinkButton title={t("plans.order")} onPress={() => router.push({ pathname: "/order/[id]", params: { id: plan.orderId! } })} /> : null}
                        {plan.status === "active" ? (
                          <LinkButton title={t("plans.cancel")} color={colors.accentInk} onPress={() => Alert.alert(t("plans.cancel"), t("confirm"), [{ text: "OK", style: "destructive", onPress: () => void run({ action: "plan.cancel", planId: plan.id }) }, { text: "×", style: "cancel" }])} />
                        ) : null}
                        {canRefund && plan.refundStatus === "manual" ? <LinkButton title={t("plans.refundSent")} onPress={() => void run({ action: "plan.refund_sent", planId: plan.id })} /> : null}
                        {canRefund && plan.refundStatus !== "manual" && refundFor !== plan.id ? <LinkButton title={t("plans.refund")} onPress={() => { setRefundFor(plan.id); setAmount(String(Math.max(0, plan.paid - 1000))); }} /> : null}
                        {refundFor === plan.id ? (
                          <View style={{ gap: 6 }}>
                            <T style={{ fontSize: 13, color: colors.inkSoft }}>“{plan.refundRule}” · {t("plans.refundHint")}</T>
                            <Field value={amount} onChangeText={setAmount} keyboardType="number-pad" accessibilityLabel={t("plans.refundAmount")} placeholder={t("plans.refundAmount")} />
                            <PillButton size="sm" busy={busy} title={t("save")} onPress={() => void run({ action: "plan.refund", planId: plan.id, amount: Number(amount) || 0 })} />
                          </View>
                        ) : null}
                      </View>
                    }
                  />
                );
              })}
            </List>
          ) : (
            <EmptyState icon="coin" title={t("plans.empty")} />
          )}
          {data.settlements.length ? (
            <>
              <T weight="extrabold" style={{ fontSize: 17 }}>{t("plans.settlements")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("plans.settlementsSub")}</T>
              <List>
                {data.settlements.map((row) => (
                  <Row
                    key={row.reference}
                    lead={<Tile icon="coin" tone={row.extra ? "gray" : "ok"} />}
                    title={`${row.buyerName} · ${t("plans.part", { n: row.n, weeks: row.weeks })}`}
                    sub={`${row.paidAt ? dayText(row.paidAt) : ""} · ${naira(row.amount)} · ${t("plans.fee")} ${naira(row.fee)}${row.via === "autopay" ? ` · ${t("plans.autopay")}` : ""}${row.extra ? ` · ${t("plans.extra")}` : ""}`}
                    right={<T weight="extrabold" style={{ fontSize: 15 }}>{naira(row.toYou)}</T>}
                  />
                ))}
              </List>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
