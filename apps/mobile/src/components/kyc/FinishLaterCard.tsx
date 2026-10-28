import { Pressable, View } from "react-native";
import { router } from "expo-router";
import type { OnboardingStep } from "@shared/partner-tiers";
import { AppIcon, type AppIconName } from "@/components/icons";
import { TonePill } from "@/components/partner";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import type { KycState } from "@/lib/kyc";
import { STEP_TONE } from "@/lib/kyc-pure";
import { finishLater, type LaterItem } from "@/lib/partner-setup-pure";
import { colors } from "@/theme";

// "Finish setting up" on Jobs, for a delivery partner who isn't verified yet: the short set-up left everything that
// can wait to this list, in the order of the tiers (shared/partner-tiers.ts). First what taking jobs needs, each
// with why (ID and selfie, the bank account fees are paid into, a vehicle, a guarantor), then "Send for checking"
// (open once those are in), then the things for later: prices (typical ones to start), riders, and CAC for no order
// limits (open once they're verified). Each row opens its verification step or screen. Hidden once everything is sent.

const ICON: Partial<Record<OnboardingStep, AppIconName>> = { identity: "camera", bank: "wallet", vehicles: "truck", coverage: "pin", guarantor: "user", review: "send", cac: "shield" };

function LaterRow({ item, title, why, icon, onPress }: { item: LaterItem; title: string; why: string; icon?: AppIconName; onPress?: () => void }) {
  const t = useT("m_partner", "m_kyc");
  const locked = item.status === "locked";
  const done = item.status === "done";
  // "Checking" while the team or the guarantor still has to answer, "Fix this" when something was turned down.
  const pill = item.status === "pending" || item.status === "rejected" ? <TonePill tone={STEP_TONE[item.status]} label={t(`stepState.${item.status}`)} /> : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: locked, checked: done }}
      accessibilityLabel={`${title}. ${why}`}
      disabled={locked || !onPress}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, opacity: locked ? 0.5 : pressed ? 0.8 : 1 })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: done ? colors.successTint : "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
        <AppIcon name={done ? "check" : locked ? "lock" : (icon ?? ICON[item.step] ?? "check")} size={20} color={done ? colors.success : colors.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T weight="bold" style={{ fontSize: 15.5, textDecorationLine: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>{title}</T>
        <T style={{ fontSize: 13.5, lineHeight: 18, color: colors.inkSoft }}>{why}</T>
      </View>
      {pill}
      {!locked && !done ? <AppIcon name="chevron" size={16} color={colors.inkSoft} /> : null}
    </Pressable>
  );
}

export function FinishLaterCard({ kyc, hasRiders }: { kyc: KycState; hasRiders: boolean }) {
  const t = useT("m_partner", "m_kyc");
  const list = finishLater(kyc);
  if (!list) return null;
  const open = (step: OnboardingStep) => () => router.push({ pathname: "/logistics/verification", params: { step } });
  return (
    <View style={{ backgroundColor: "#E2F5A0", borderRadius: 24, padding: 18, paddingRight: 14, gap: 4 }} testID="finish-later">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <T weight="extrabold" style={{ fontSize: 17, flex: 1 }} accessibilityRole="header">{t("fl.title")}</T>
        <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{t("fl.count", { done: list.done, total: list.total })}</T>
      </View>
      <View style={{ height: 6, borderRadius: 3, marginVertical: 6, backgroundColor: "rgba(22,20,31,0.12)", overflow: "hidden" }}>
        <View style={{ width: `${(list.done / list.total) * 100}%`, height: 6, backgroundColor: colors.ink }} />
      </View>
      <T weight="bold" style={{ fontSize: 13, color: colors.inkSoft, marginTop: 4 }}>{t("fl.startHead")}</T>
      {list.start.map((item) => (
        <LaterRow key={item.step} item={item} title={t.dynamic(`fl.${item.step}`)} why={t.dynamic(`fl.${item.step}Why`)} onPress={open(item.step)} />
      ))}
      <LaterRow item={list.send} title={t("fl.review")} why={list.send.status === "locked" ? t("fl.reviewLocked") : t("fl.reviewWhy")} onPress={open("review")} />
      <T weight="bold" style={{ fontSize: 13, color: colors.inkSoft, marginTop: 10 }}>{t("fl.laterHead")}</T>
      <LaterRow item={{ step: "review", status: "todo" }} icon="tag" title={t("fl.prices")} why={t("fl.pricesWhy")} onPress={() => router.push("/logistics/rates")} />
      <LaterRow item={{ step: "review", status: hasRiders ? "done" : "todo" }} icon="users" title={t("fl.riders")} why={t("fl.ridersWhy")} onPress={() => router.push("/logistics/team")} />
      <LaterRow item={list.cac} title={t("fl.cac")} why={t("fl.cacWhy")} />
    </View>
  );
}
