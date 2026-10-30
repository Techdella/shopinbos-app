import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { AppIcon } from "@/components/icons";
import { Badge, EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { useFlowSwitch } from "@/components/FlowSwitch";
import { Card, Notice, PillButton, T, Toggle } from "@/components/ui";
import { friendlyDay } from "@/lib/friendly";
import { addAutomation, fetchAutomations } from "@/lib/marketing";
import type { FlowRow } from "@/lib/marketing-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Automations (web /home/automations): messages that go out by themselves (welcome, cart left behind, thank-you,
// review, win-back, birthday…). Each one with its switch and what it did in the last 30 days; switching on asks
// first in the app's own sheet. Ready-made ones are added switched off, then open so the seller can read them.

function FlowCard({ flow, onToggle }: { flow: FlowRow; onToggle: (next: boolean) => void }) {
  const t = useT("m_marketing", "automations", "m_ui");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={flow.name} onPress={() => router.push({ pathname: "/marketing/automation/[id]", params: { id: flow.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={2}>{flow.name}</T>
            <Badge label={flow.active ? t("auto.on") : t("auto.off")} bg={flow.active ? colors.successTint : colors.canvas} fg={flow.active ? colors.success : colors.inkSoft} />
          </View>
          <Toggle on={flow.active} label={t("toggle.label", { name: flow.name })} onChange={onToggle} />
        </View>
        <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20 }}>
          {t("when", { trigger: t.dynamic(`trigger.${flow.trigger}`, flow.trigger) })}
          {flow.trigger === "win_back" ? ` (${t("days", { count: flow.settings.days ?? 90 })})` : ""}
        </T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {flow.steps.slice(0, 5).map((step, index) => <Badge key={index} label={t.dynamic(`step.${step.type}`, step.type)} />)}
          {flow.steps.length > 5 ? <Badge label={`+${flow.steps.length - 5}`} /> : null}
        </View>
        <T style={{ fontSize: 14, lineHeight: 20 }}>
          {[`${flow.sent30d} ${t("sent30")}`, t("inFlowNow", { count: flow.inFlow }), flow.lastTriggeredAt ? t("lastStarted", { date: friendlyDay(flow.lastTriggeredAt, new Date(), t) }) : t("notStarted")].join(" · ")}
        </T>
      </Card>
    </Pressable>
  );
}

export default function Automations() {
  const t = useT("m_marketing", "automations", "m_ui");
  const data = useLoad(fetchAutomations);
  const overview = data.data;
  const flowSwitch = useFlowSwitch(data.reload);
  const [adding, setAdding] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const used = new Set((overview?.flows ?? []).map((flow) => flow.preset).filter(Boolean));

  async function add(key: string) {
    setAdding(key);
    setProblem(null);
    try {
      const flow = await addAutomation(key);
      await data.reload();
      router.push({ pathname: "/marketing/automation/[id]", params: { id: flow.id } });
    } catch (addError) {
      setProblem(addError instanceof Error ? addError.message : t("auto.notSaved"));
    } finally {
      setAdding(null);
    }
  }

  return (
    <Screen title={t("link.automations")} sub={t("auto.sub")} refreshing={data.refreshing} onRefresh={() => void data.refresh()}>
      {flowSwitch.note ? <Notice tone={flowSwitch.note.tone}>{flowSwitch.note.text}</Notice> : null}
      {problem ? <Notice>{problem}</Notice> : null}
      {data.loading && !overview ? <LoadingBlock /> : null}
      {data.error && !overview ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : null}
      {overview ? (
        <>
          {!overview.channels.email ? <Notice tone="info">{t("emailNotReady")}</Notice> : null}
          {overview.flows.length ? (
            <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 22 }}>
              {t("auto.totals", { on: overview.flows.filter((flow) => flow.active).length, count: overview.flows.length, sent: overview.totals.sent30, inFlow: overview.totals.inFlow })}
            </T>
          ) : null}

          <SectionTitle>{t("yours")}</SectionTitle>
          {overview.flows.length ? (
            overview.flows.map((flow) => <FlowCard key={flow.id} flow={flow} onToggle={(next) => flowSwitch.toggle(flow, next)} />)
          ) : (
            <EmptyState icon="sparkle" title={t("empty.title")}>{t("auto.emptyBody")}</EmptyState>
          )}

          <SectionTitle>{t("presets.title")}</SectionTitle>
          <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 21 }}>{t("presets.sub")}</T>
          {overview.presets.map((preset) => (
            <Card key={preset.key} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center" }}>
                  <AppIcon name={preset.key.includes("whatsapp") ? "whatsapp" : preset.key === "review" ? "star" : preset.key === "birthday" ? "sparkle" : "mail"} size={18} color={colors.forest} />
                </View>
                <T weight="extrabold" style={{ flex: 1, fontSize: 15.5 }}>{t.dynamic(`preset.${preset.key}.name`, preset.name)}</T>
                {used.has(preset.key) ? <Badge label={t("presets.added")} bg={colors.successTint} fg={colors.success} /> : null}
              </View>
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t.dynamic(`preset.${preset.key}.description`, preset.description)}</T>
              <PillButton title={used.has(preset.key) ? t("add.another") : t("auto.add")} size="sm" tone={used.has(preset.key) ? "white" : "ink"} style={{ alignSelf: "flex-start" }} busy={adding === preset.key} disabled={adding !== null} onPress={() => void add(preset.key)} />
            </Card>
          ))}
        </>
      ) : null}
      {flowSwitch.sheet}
    </Screen>
  );
}
