import { useMemo } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { PAY_AT_DOOR_STEPS } from "@shared/dropship-rules";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { BoardScreen } from "@/components/Screen";
import { InfoTip, Notice, PillButton, T } from "@/components/ui";
import { wordsOf } from "@/lib/dropship-pure";
import { useT } from "@/lib/i18n";
import { fetchPartnerLevel } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";
import { colors, fonts, radii } from "@/theme";

// Pay on delivery jobs (A-Rider-POD; the web's /logistics/level). Riders never hold cash: the customer pays the
// delivery fee when they order and the rest in the app at the door, then gives the rider a code (shared/pay-at-door.ts).
// So it's open to every verified partner (shared/dropship-rules.ts partner tiers); locked only before verification,
// or paused while cash from older jobs is still owed. Shows how it works (PAY_AT_DOOR_STEPS).
// GET /api/mobile/logistics/level. Opened from Services, a locked pay on delivery switch and any 403 pod_locked.

export default function PayOnDeliveryScreen() {
  const t = useT("m_partner", "common");
  const words = useMemo(() => wordsOf(t), [t]);
  const level = useLoad(fetchPartnerLevel);
  const data = level.data;

  return (
    <BoardScreen
      title={words("pod.title", "Pay on delivery jobs")}
      gap={12}
      refreshing={level.refreshing}
      onRefresh={() => void level.refresh()}
      footer={data ? <PillButton title={data.podOpen ? words("pod.back", "Back") : words("pod.keepPrepaid", "Keep taking prepaid jobs")} tone={data.podOpen ? "white" : "forest"} onPress={() => (data.podOpen ? router.back() : router.replace("/logistics/jobs"))} /> : undefined}
    >
      {level.loading && !data ? <LoadingBlock /> : null}
      {level.error && !data ? <ErrorState message={level.error} onRetry={() => void level.reload()} /> : null}
      {data ? (
        <>
          <View style={{ backgroundColor: colors.forestFill, borderRadius: 24, padding: 18, gap: 8, alignItems: "flex-start" }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" }}>
              <AppIcon name={data.podOpen ? "coin" : "lock"} size={22} color="#FFFFFF" />
            </View>
            <T style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 27, color: "#FFFFFF" }}>
              {data.podOpen ? words("pod.open", "Pay on delivery is open to you") : words("pod.lockedVerify", "Opens once you're verified")}
            </T>
            <T style={{ fontSize: 14, lineHeight: 20, color: "#D2EDE8" }}>
              {data.podOpen ? words("pod.openSub", "Switch it on in Services, and for each business you work with.") : words("pod.lockedSubVerify", "Finish your ID and selfie checks. Your riders never carry cash on these jobs.")}
            </T>
          </View>

          {data.codPaused ? <Notice>{words("pod.pausedOld", "Pay on delivery is paused until the cash you collected on older jobs is paid in.")}</Notice> : null}

          {/* How it works: the steps are in the tip, so the screen is the status and one line. */}
          <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <T style={{ flex: 1, fontFamily: fonts.display, fontSize: 15 }}>{words("pod.howItWorks", "No cash, no code, no drop")}</T>
            <InfoTip title={words("pod.howItWorks", "No cash, no code, no drop")} text={PAY_AT_DOOR_STEPS.map((step, index) => `${index + 1}. ${words(`pod.step${index + 1}`, step)}`)} />
          </View>
        </>
      ) : null}
    </BoardScreen>
  );
}
