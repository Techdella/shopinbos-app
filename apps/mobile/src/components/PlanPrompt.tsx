import { useEffect, useState } from "react";
import { DeviceEventEmitter, View } from "react-native";
import { PLAN_PROMPT_EVENT, type PlanPromptDetail } from "@shared/plan-prompts";
import { Sheet } from "@/components/Sheet";
import { PillButton, T } from "@/components/ui";
import { AppIcon } from "@/components/icons";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// "This isn't on your plan" / "You're out of AI credits": slides up on any screen when the server says a feature
// isn't on the plan or the credits ran out (lib/api.ts emits it with every such error). Store rules (Apple 3.1.1 /
// 3.1.3(f)): no price, no link and no button to buy, only what happened (shared/plan-prompts.ts).

export function PlanPrompt() {
  const t = useT("payments");
  const [shown, setShown] = useState<PlanPromptDetail | null>(null);
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(PLAN_PROMPT_EVENT, (detail: PlanPromptDetail) => setShown(detail));
    return () => subscription.remove();
  }, []);
  const credits = shown?.kind === "credits";
  return (
    <Sheet visible={Boolean(shown)} onClose={() => setShown(null)} title={credits ? t("lock.creditsTitle") : t("lock.notOnPlan")}>
      <View style={{ gap: 14, paddingBottom: 8 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name={credits ? "sparkle" : "lock"} size={26} />
        </View>
        <T style={{ fontSize: 15.5, lineHeight: 22, color: colors.inkSoft }}>{shown?.message?.trim() || (credits ? t("lock.creditsBodyApp") : t("lock.bodyApp"))}</T>
        <PillButton title={t("lock.notNow")} tone="white" onPress={() => setShown(null)} />
      </View>
    </Sheet>
  );
}
