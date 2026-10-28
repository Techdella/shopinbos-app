import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { Card, Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { answerReturn, type OrderMoney, type OrderReturn } from "@/lib/orders";
import { colors } from "@/theme";

// The seller's order screen (src/lib/faults/seller.server.ts): what they earn on the order (from the split), problems
// on it and what each meant for them, and a customer's return to approve (books the trip back), decline or receive
// (the refund follows the matrix, shared/fault-matrix.ts row 6). The web shows the same on /home/orders/[id].

const card = { gap: 6, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 } as const;
const fromKobo = (kobo: number) => naira(Math.round(kobo) / 100);

function Line({ label, value, strong, minus }: { label: string; value: string; strong?: boolean; minus?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, ...(strong ? { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 4, paddingTop: 10 } : {}) }}>
      <T style={{ color: strong ? colors.ink : colors.inkSoft, fontSize: strong ? 17 : 15 }} weight={strong ? "extrabold" : "regular"}>{label}</T>
      <T weight={strong ? "extrabold" : "semibold"} style={{ fontSize: strong ? 17 : 15, color: strong ? colors.success : colors.ink }}>{minus ? "−" : ""}{value}</T>
    </View>
  );
}

export function EarningsCard({ money }: { money: OrderMoney }) {
  const t = useT("m_faults");
  const e = money.earnings;
  return (
    <Card style={card}>
      <T weight="extrabold" style={{ fontSize: 18 }}>{t("earn.title")}</T>
      <Line label={t("earn.customerPaid")} value={fromKobo(e.customerPaidKobo)} />
      {e.suppliersKobo > 0 ? <Line label={t("earn.suppliers")} value={fromKobo(e.suppliersKobo)} minus /> : null}
      {e.deliveryKobo > 0 ? <Line label={t("earn.delivery")} value={fromKobo(e.deliveryKobo)} minus /> : null}
      {e.feeKobo > 0 ? <Line label={t("earn.fee")} value={fromKobo(e.feeKobo)} minus /> : null}
      <Line label={t("earn.you")} value={fromKobo(e.earnKobo)} strong />
      {e.toDebtsKobo > 0 ? <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("earn.toDebts", { amount: fromKobo(e.toDebtsKobo) })}</T> : null}
      {e.faultsKobo !== 0 ? <Line label={t("earn.problems")} value={fromKobo(e.netKobo)} /> : null}
      {e.basis === "estimate" ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("earn.estimate")}</T> : null}
    </Card>
  );
}

export function ProblemsCard({ money }: { money: OrderMoney }) {
  const t = useT("m_faults");
  if (!money.problems.length) return null;
  return (
    <Card style={card}>
      <T weight="extrabold" style={{ fontSize: 18 }}>{t("problems.title")}</T>
      {money.problems.map((row) => (
        <View key={row.id} style={{ backgroundColor: colors.canvas, borderRadius: 16, padding: 12, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 13.5 }}>{row.label}</T>
          {row.line ? <T style={{ fontSize: 14.5, lineHeight: 20 }}>{row.line}</T> : null}
        </View>
      ))}
    </Card>
  );
}

export function ReturnCard({ orderId, returns: initial }: { orderId: string; returns: OrderReturn[] }) {
  const t = useT("m_faults");
  const [returns, setReturns] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [why, setWhy] = useState("");
  const current = returns[0];
  if (!current) return null;
  async function act(action: "approve" | "decline" | "received") {
    setBusy(action);
    setError(null);
    try {
      setReturns((await answerReturn(orderId, current!.id, action, action === "decline" ? why : undefined)).returns);
      setDeclining(false);
    } catch (actError) {
      setError(actError instanceof Error ? actError.message : t("error.generic"));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card style={{ ...card, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <T weight="extrabold" style={{ fontSize: 18 }}>{t("returns.title")}</T>
        <View style={{ backgroundColor: current.status === "requested" ? colors.warnTint : colors.mintTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <T weight="bold" style={{ fontSize: 13, color: current.status === "requested" ? colors.warnInk : colors.forest }}>{t.dynamic(`returns.status.${current.status}`, current.status)}</T>
        </View>
      </View>
      <T weight="bold" style={{ fontSize: 15.5 }}>{t.dynamic(`returns.reason.${current.reason}`, current.reasonLabel)}</T>
      {current.message ? <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>&ldquo;{current.message}&rdquo;</T> : null}
      <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{current.returnPayer === "seller" ? t("returns.payer.seller") : t("returns.payer.customer")}</T>
      {current.photos.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {current.photos.map((url) => <Image key={url} source={{ uri: url }} style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityLabel={t("returns.photo")} />)}
        </View>
      ) : null}
      {current.status === "refunded" ? <T weight="bold" style={{ color: colors.success }}>{t("returns.refunded", { amount: fromKobo(current.refundKobo) })}</T> : null}
      {current.status === "declined" && current.declineReason ? <T style={{ color: colors.inkSoft }}>{current.declineReason}</T> : null}
      {error ? <Notice>{error}</Notice> : null}
      {current.status === "requested" && !declining ? (
        <>
          <PillButton tone="accent" title={t("returns.approve")} busy={busy === "approve"} disabled={Boolean(busy)} onPress={() => void act("approve")} />
          <LinkButton title={t("returns.decline")} color={colors.danger} onPress={() => setDeclining(true)} />
        </>
      ) : null}
      {current.status === "requested" && declining ? (
        <>
          <Field value={why} onChangeText={setWhy} placeholder={t("returns.declineWhy")} maxLength={500} multiline accessibilityLabel={t("returns.declineWhy")} />
          <PillButton tone="white" title={t("returns.decline")} busy={busy === "decline"} disabled={Boolean(busy)} onPress={() => void act("decline")} />
          <LinkButton title={t("cancel")} onPress={() => setDeclining(false)} />
        </>
      ) : null}
      {current.status === "approved" ? <PillButton tone="accent" title={t("returns.received")} busy={busy === "received"} disabled={Boolean(busy)} onPress={() => void act("received")} /> : null}
    </Card>
  );
}
