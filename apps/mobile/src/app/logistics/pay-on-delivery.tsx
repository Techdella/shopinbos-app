import { useMemo } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { GoalList, Ladder } from "@/components/supplier/DropshipKit";
import { Notice, PillButton, T } from "@/components/ui";
import { wordsOf } from "@/lib/dropship-pure";
import { useT } from "@/lib/i18n";
import { fetchPartnerLevel } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";
import { colors, fonts, radii } from "@/theme";

// Pay on delivery jobs (A-Rider-POD; the web's /logistics/level): these jobs mean holding customers' cash, so they
// open at Cash trusted (shared/dropship-rules.ts: 150 delivered jobs, 60 days on Shopinbos, no late cash pay-ins and
// a CAC or a guarantor). Locked: what's left with meters ("64 / 150"), "Add" for the CAC or guarantor, and the three
// cash rules once unlocked (a cash cap, send it within 24 hours, late once pauses it), then "Keep taking prepaid
// jobs". Open: the cap and the rules. GET /api/mobile/logistics/level. Opened from Services, a locked pay on
// delivery switch and any 403 pod_locked.

export default function PayOnDeliveryScreen() {
  const t = useT("m_partner", "common");
  const words = useMemo(() => wordsOf(t), [t]);
  const level = useLoad(fetchPartnerLevel);
  const data = level.data;

  return (
    <Screen
      title={words("pod.title", "Pay on delivery jobs")}
      refreshing={level.refreshing}
      onRefresh={() => void level.refresh()}
      footer={data ? <PillButton title={data.podOpen ? words("pod.back", "Back") : words("pod.keepPrepaid", "Keep taking prepaid jobs")} tone={data.podOpen ? "white" : "forest"} onPress={() => (data.podOpen ? router.back() : router.replace("/logistics/jobs"))} /> : undefined}
    >
      {level.loading && !data ? <LoadingBlock /> : null}
      {level.error && !data ? <ErrorState message={level.error} onRetry={() => void level.reload()} /> : null}
      {data ? (
        <>
          <View style={{ backgroundColor: data.podOpen ? colors.mintTint : colors.grayTint, borderRadius: radii.card, padding: 18, gap: 10, alignItems: "flex-start" }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name={data.podOpen ? "coin" : "lock"} size={24} color={data.podOpen ? colors.forest : colors.grayInk} />
            </View>
            <T style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 28 }}>
              {data.podOpen ? words("pod.open", "Pay on delivery is open to you") : words("pod.locked", "Unlocks at Cash trusted")}
            </T>
            <T style={{ fontSize: 14, lineHeight: 20, color: data.podOpen ? colors.forest : colors.grayInk }}>
              {data.podOpen ? words("pod.openSub", "Switch it on in Services, and for each business you work with.") : words("pod.lockedSub", "These jobs mean holding customers' cash. Build your record on prepaid jobs first.")}
            </T>
            {data.levels.length ? <View style={{ alignSelf: "stretch" }}><Ladder levels={data.levels.map((entry) => ({ key: entry.key, label: words(`plevel.${entry.key}`, entry.label) }))} current={data.level} /></View> : null}
          </View>

          {data.codPaused ? <Notice>{words("pod.paused", "Pay on delivery is paused until your late cash is paid in.")}</Notice> : null}

          {!data.podOpen && data.goals.length ? (
            <GoalList goals={data.goals} action={(goal) => (goal.key === "cac" ? { label: words("pod.add", "Add"), onPress: () => router.push({ pathname: "/logistics/verification", params: { step: "cac" } }) } : null)} />
          ) : null}

          <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 12 }}>
            <T weight="extrabold" style={{ fontSize: 15 }}>{data.podOpen ? words("pod.rules", "The cash rules") : words("pod.onceUnlocked", "Once unlocked")}</T>
            {[
              words("pod.rule1", "Hold up to {cap} cash at a time. More as your record grows.", { cap: naira(data.cashCap) }),
              words("pod.rule2", "Send the cash to your Shopinbos account within {hours} hours.", { hours: data.remitHours }),
              words("pod.rule3", "Late once and pay on delivery pauses. Your fee comes out of what you send, so you're never owed."),
            ].map((rule, index) => (
              <View key={index} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center" }}>
                  <T weight="extrabold" style={{ fontSize: 12, color: colors.forest }}>{index + 1}</T>
                </View>
                <T style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{rule}</T>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
