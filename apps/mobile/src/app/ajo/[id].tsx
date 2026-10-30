import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Row, Tile } from "@/components/design";
import { Badge, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { useFeature } from "@/lib/features";
import { fetchAjoGroup, togetherAction } from "@/lib/together";
import { shareOnWhatsApp } from "@/lib/share";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One ajo group (web /home/ajo/[id]; pilot "ajo"): who has paid this week, "Ship to <member> this week" once
// everyone has, the collection order (drawn; editable before the start), decisions about removed members, and every
// contribution that landed.

export default function AjoGroup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const on = useFeature("ajo");
  const t = useT("together");
  const loaded = useLoad(() => fetchAjoGroup(String(id)), String(id));
  const group = loaded.data;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!group) return;
    setOrder(group.members.filter((member) => member.status === "active").sort((a, b) => (a.position ?? 99) - (b.position ?? 99)).map((member) => member.id));
    setDecisions(Object.fromEntries(group.members.map((member) => [member.id, member.settlement ?? ""])));
  }, [group]);

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await togetherAction({ groupId: String(id), ...body });
      setMessage({ tone: "success", text: t("saved") });
      await loaded.reload();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  const byId = new Map((group?.members ?? []).map((member) => [member.id, member]));
  const shipTo = group?.shipTo ? byId.get(group.shipTo) : null;
  const paidThisWeek = new Set(group?.thisWeek?.paid ?? []);
  const members = group ? (group.canReorder ? order.map((memberId) => byId.get(memberId)!).filter(Boolean) : group.members) : [];

  return (
    <Screen title={t("ajoList.title")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()} fallback="/ajo">
      {!on ? <EmptyState icon="lock" title={t("notReady")} /> : null}
      {on && loaded.loading && !group ? <LoadingBlock /> : null}
      {on && loaded.error && !group ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {on && group ? (
        <>
          <Card style={{ gap: 8 }}>
            <T weight="extrabold" style={{ fontSize: 18 }}>{group.productName}</T>
            <T style={{ fontSize: 14 }}>{t("ajoList.line", { members: group.members.filter((member) => member.status !== "removed").length, size: group.size, weekly: naira(group.weekly), date: group.startDay })}</T>
            {group.status === "running" ? <T weight="bold" style={{ fontSize: 14 }}>{t("ajo.week", { week: group.week, size: group.size })}</T> : null}
            <Badge label={t.dynamic(`status.${group.status}`, group.status)} />
            {group.joinUrl && group.status === "forming" ? <LinkButton title={t("ajo.share")} onPress={() => void shareOnWhatsApp(`Join my ajo for ${group.productName}: ${naira(group.weekly)} a week for ${group.size} weeks. ${group.joinUrl}`)} /> : null}
            {group.status === "forming" ? <LinkButton title={t("ajo.startNow")} onPress={() => void run({ action: "ajo.start" })} /> : null}
            {group.status === "forming" || group.status === "running" ? (
              <LinkButton title={t("ajo.cancel")} color={colors.accentInk} onPress={() => Alert.alert(t("ajo.cancel"), t("ajo.confirmCancel"), [{ text: "OK", style: "destructive", onPress: () => void run({ action: "ajo.cancel" }) }, { text: "×", style: "cancel" }])} />
            ) : null}
          </Card>
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

          {group.status === "running" && group.thisWeek ? (
            <Card style={{ gap: 8 }}>
              {shipTo ? (
                <>
                  <T weight="extrabold" style={{ fontSize: 16 }}>{t("ajo.shipTo", { name: shipTo.name })}</T>
                  <PillButton size="md" busy={busy} title={t("ajo.ship")} onPress={() => void run({ action: "ajo.ship" })} />
                </>
              ) : group.thisWeek.missing.length ? (
                <T style={{ fontSize: 14.5 }}>{t("ajo.waiting", { count: group.thisWeek.missing.length })}: {group.thisWeek.missing.map((memberId) => byId.get(memberId)?.name ?? "").join(", ")}</T>
              ) : null}
            </Card>
          ) : null}

          <T weight="extrabold" style={{ fontSize: 17 }}>{t("ajo.order")}</T>
          {group.drawnAt ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{group.orderSetBy === "seller" ? t("ajo.setBySeller") : t("ajo.drawn", { seed: (group.drawSeed ?? "").split(":")[1] ?? "" })}</T> : null}
          <List>
            {members.map((member, index) => (
              <Row
                key={member.id}
                lead={<Tile icon="user" tone={paidThisWeek.has(member.id) ? "ok" : "gray"} />}
                title={`${member.position ?? "–"}. ${member.name}${group.status === "running" && paidThisWeek.has(member.id) ? " ✓" : ""}`}
                sub={`${member.phone}${member.isNew ? ` · ${t("ajo.new")}` : ""} · ${t("ajo.paidWeeks", { count: member.paidWeeks })}${member.autopay ? ` · ${t("plans.autopay")}` : ""}`}
                right={<Badge label={t.dynamic(`status.${member.status}`, member.status)} />}
                below={
                  <View style={{ gap: 6 }}>
                    {group.canReorder && index > 0 ? <LinkButton title={t("ajo.moveUp")} onPress={() => setOrder((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next; })} /> : null}
                    {member.orderId ? <LinkButton title={t("plans.order")} onPress={() => router.push({ pathname: "/order/[id]", params: { id: member.orderId! } })} /> : null}
                    {member.status === "removed" || group.status === "cancelled" ? (
                      <View style={{ gap: 6 }}>
                        {member.removedReason ? <T style={{ fontSize: 13, color: colors.inkSoft }}>{member.removedReason}</T> : null}
                        <Field value={decisions[member.id] ?? ""} onChangeText={(text) => setDecisions((current) => ({ ...current, [member.id]: text }))} placeholder={t("ajo.decision")} accessibilityLabel={t("ajo.decision")} maxLength={500} />
                        <LinkButton title={t("ajo.saveDecision")} onPress={() => void run({ action: "ajo.settle", memberId: member.id, note: decisions[member.id] ?? "" })} />
                      </View>
                    ) : null}
                  </View>
                }
              />
            ))}
          </List>
          {group.canReorder ? <PillButton size="md" busy={busy} title={t("ajo.saveOrder")} onPress={() => void run({ action: "ajo.reorder", order })} /> : null}

          <T weight="extrabold" style={{ fontSize: 17 }}>{t("ajo.rules")}</T>
          <Card><T style={{ fontSize: 14, lineHeight: 21 }}>{group.rules}</T></Card>

          {group.settlements.length ? (
            <>
              <T weight="extrabold" style={{ fontSize: 17 }}>{t("ajo.contributions")}</T>
              <List>
                {group.settlements.map((row) => (
                  <Row key={row.reference} lead={<Tile icon="coin" tone={row.extra ? "gray" : "ok"} />} title={`${byId.get(row.memberId)?.name ?? ""} · ${t("ajo.week", { week: row.week, size: group.size })}`} sub={`${naira(row.amount)} · ${t("plans.fee")} ${naira(row.fee)}${row.extra ? ` · ${t("plans.extra")}` : ""}`} right={<T weight="extrabold" style={{ fontSize: 15 }}>{naira(row.toYou)}</T>} />
                ))}
              </List>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
