import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Row, Tile } from "@/components/design";
import { Badge, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { useFeature } from "@/lib/features";
import { fetchAjoGroups } from "@/lib/together";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";

// Ajo groups the shop runs (web /home/ajo; pilot "ajo"). New groups are started from a product's screen.

const dayText = (day: string) => new Date(`${day}T12:00:00+01:00`).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" });

export default function AjoGroups() {
  const on = useFeature("ajo");
  const t = useT("together");
  const loaded = useLoad(fetchAjoGroups);
  const data = loaded.data;
  return (
    <Screen title={t("ajoList.title")} sub={t("ajoList.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {!on ? <EmptyState icon="lock" title={t("notReady")} /> : null}
      {on && loaded.loading && !data ? <LoadingBlock /> : null}
      {on && loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {on && data ? (
        data.groups.length ? (
          <List>
            {data.groups.map((group) => (
              <Row
                key={group.id}
                lead={<Tile icon="users" tone="lilac" />}
                title={group.productName}
                sub={`${t("ajoList.line", { members: group.members, size: group.size, weekly: naira(group.weekly), date: dayText(group.startDay) })}${group.status === "running" ? ` · ${t("ajo.week", { week: group.week, size: group.size })}` : ""}`}
                right={<Badge label={t.dynamic(`status.${group.status}`, group.status)} />}
                onPress={() => router.push({ pathname: "/ajo/[id]", params: { id: group.id } })}
              />
            ))}
          </List>
        ) : (
          <EmptyState icon="users" title={t("ajoList.empty")} />
        )
      ) : null}
    </Screen>
  );
}
