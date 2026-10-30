import { useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Row, Tile } from "@/components/design";
import { Badge, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { LinkButton, Notice, T } from "@/components/ui";
import { useFeature } from "@/lib/features";
import { fetchGroupBuys, togetherAction } from "@/lib/together";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Group buys for the shop's products (web /home/group-buys; pilot "group_buy"). Members are charged only when a group
// fills, straight to the seller's bank.

const dayText = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });

export default function GroupBuys() {
  const on = useFeature("group_buy");
  const t = useT("together");
  const loaded = useLoad(fetchGroupBuys);
  const data = loaded.data;
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function close(groupId: string) {
    try {
      await togetherAction({ action: "group.cancel", groupId });
      setMessage({ tone: "success", text: t("saved") });
      await loaded.reload();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t("saveFailed") });
    }
  }

  return (
    <Screen title={t("groups.title")} sub={t("groups.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {!on ? <EmptyState icon="lock" title={t("notReady")} /> : null}
      {on && loaded.loading && !data ? <LoadingBlock /> : null}
      {on && loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {on && data ? (
        data.groups.length ? (
          <List>
            {data.groups.map((group) => (
              <Row
                key={group.id}
                lead={<Tile icon="share" tone="sky" />}
                title={group.productName}
                sub={t("groups.line", { joined: group.joined, size: group.size, price: naira(group.price), date: dayText(group.endsAt) })}
                right={<Badge label={t.dynamic(`status.${group.status}`, group.status)} />}
                below={
                  <View style={{ gap: 6, paddingTop: 6 }}>
                    {group.members.map((member) => (
                      <View key={member.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <T style={{ flex: 1, fontSize: 13.5 }} numberOfLines={1}>{member.name}{member.phone ? ` · ${member.phone}` : ""}</T>
                        <Badge label={t.dynamic(`status.${member.status}`, member.status)} />
                        {member.orderId ? <LinkButton title={t("plans.order")} onPress={() => router.push({ pathname: "/order/[id]", params: { id: member.orderId! } })} /> : null}
                      </View>
                    ))}
                    {group.status === "open" ? <LinkButton title={t("groups.close")} color={colors.accentInk} onPress={() => Alert.alert(t("groups.close"), t("confirm"), [{ text: "OK", style: "destructive", onPress: () => void close(group.id) }, { text: "×", style: "cancel" }])} /> : null}
                  </View>
                }
              />
            ))}
          </List>
        ) : (
          <EmptyState icon="share" title={t("groups.empty")} />
        )
      ) : null}
    </Screen>
  );
}
