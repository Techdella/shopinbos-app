import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon, type AppIconName } from "@/components/icons";
import { JobCard } from "@/components/JobCard";
import { PayInOverdueCard } from "@/components/PayInOverdueCard";
import { EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { PartnerHeader, PartnerScroll } from "@/components/partner";
import { Card, LinkButton, Notice, T, Toggle } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchLogisticsOverview, setTakingJobs } from "@/lib/logistics";
import { verificationStage } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";
import { PushPromptCard } from "@/components/PushPromptCard";
import { NotificationBellButton } from "@/components/NotificationBellButton";

// Delivery partner "Today" (spec 8A, "Simple supplier, delivery and rider apps"): a big "Taking new jobs" switch,
// today's deliveries and earnings, the newest job with "Accept and assign", and the cash to pay in by 6pm.
// Everything else is one tap away: Messages and Menu in the header, the other tabs below.

function HeaderButton({ icon, label, onPress }: { icon: AppIconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ minHeight: 46, borderRadius: radii.pill, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.85 : 1 })}>
      <AppIcon name={icon} size={18} />
      <T weight="bold" style={{ fontSize: 15 }}>{label}</T>
    </Pressable>
  );
}

export default function LogisticsToday() {
  const t = useT("m_partner");
  const overview = useLoad(fetchLogisticsOverview);
  const data = overview.data;
  const verification = data ? verificationStage(data.partner.verificationStatus, t) : null;
  // What the partner just switched to, until the next load says the same.
  const [override, setTaking] = useState<boolean | null>(null);
  const taking = override ?? data?.partner.taking ?? false;
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  async function toggleTaking(next: boolean) {
    setSwitching(true);
    setSwitchError(null);
    setTaking(next);
    try {
      await setTakingJobs(next);
    } catch (error) {
      setTaking(!next);
      setSwitchError(error instanceof Error ? error.message : t("error.retry"));
    } finally {
      setSwitching(false);
    }
  }

  const ready = data ? data.partner.verificationStatus === "verified" && data.partner.onboarded : false;
  const newest = data?.newJobs[0];
  const moreNew = data ? data.counts.new - (newest ? 1 : 0) : 0;
  // Riders switched Online and seen in the last 30 minutes (the server sends them first). No map: a list with where
  // each was last seen ("last seen 2 min ago, Ikeja").
  const outNow = (data?.riderList ?? []).filter((rider) => rider.out);

  return (
    <PartnerScroll refreshing={overview.refreshing} onRefresh={() => void overview.refresh()}>
      <PartnerHeader
        eyebrow="Shopinbos Partners"
        name={data?.partner.name ?? t("today.company")}
        logoUrl={data?.partner.logoUrl}
        right={
          <View style={{ flexDirection: "row", gap: 6 }}>
            <NotificationBellButton />
            <HeaderButton icon="chat" label={t("today.messages")} onPress={() => router.push("/logistics/messages")} />
            <HeaderButton icon="grid" label={t("today.menu")} onPress={() => router.push("/logistics/menu")} />
          </View>
        }
      />

      <PushPromptCard who="logistics" when={Boolean(data)} />
      {overview.loading && !data ? <LoadingBlock label={t("today.loading")} /> : null}
      {overview.error && !data ? <ErrorState message={overview.error} onRetry={() => void overview.reload()} web={{ label: t("openOnWeb"), onPress: () => void openWeb("/logistics/dashboard") }} /> : null}

      {data && verification ? (
        <>
          {!ready ? (
            <Pressable accessibilityRole="button" onPress={() => router.push("/logistics/verification")} style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <AppIcon name="shield" size={20} color={colors.forest} />
                <T weight="extrabold" style={{ flex: 1, fontSize: 16 }}>{data.partner.onboarded ? verification.label : t("today.finish")}</T>
                <AppIcon name="chevron" size={18} color={colors.inkSoft} />
              </View>
              <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{data.partner.onboarded ? verification.hint : t("today.finishHint")}</T>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={t("today.taking")}
              accessibilityState={{ checked: Boolean(taking), busy: switching }}
              disabled={switching}
              onPress={() => void toggleTaking(!taking)}
              style={{ backgroundColor: taking ? colors.successTint : colors.surface, borderRadius: radii.card, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, minHeight: 84 }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="extrabold" style={{ fontSize: 20, color: taking ? colors.success : colors.ink }}>{taking ? t("today.taking") : t("today.notTaking")}</T>
                <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={2}>{taking ? t("today.takingHint", { areas: data.partner.areas }) : t("today.notTakingHint")}</T>
              </View>
              <View pointerEvents="none" style={{ transform: [{ scale: 1.3 }] }}>
                <Toggle on={Boolean(taking)} onChange={() => undefined} label={t("today.taking")} />
              </View>
            </Pressable>
          )}
          {switchError ? <Notice>{switchError}</Notice> : null}

          {data.overdue ? <PayInOverdueCard overdue={data.overdue} onChecked={() => void overview.reload()} /> : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Card style={{ flex: 1, gap: 4 }}>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("today.delivered")}</T>
              <T weight="extrabold" style={{ fontSize: 28, letterSpacing: -0.6 }} accessibilityRole="header">{data.deliveredToday}</T>
            </Card>
            <Card style={{ flex: 1, gap: 4 }}>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("today.earned")}</T>
              <T weight="extrabold" style={{ fontSize: 28, letterSpacing: -0.6 }}>{naira(data.earnedToday)}</T>
            </Card>
          </View>

          {data.counts.issues ? (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/logistics/jobs", params: { view: "issues" } })} style={{ backgroundColor: colors.dangerTint, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <AppIcon name="help" size={20} color={colors.danger} />
              <T weight="bold" style={{ flex: 1, fontSize: 15, color: colors.danger }}>{t("today.failed", { count: data.counts.issues })}</T>
              <T weight="bold" style={{ fontSize: 15, color: colors.danger }}>{t("today.see")}</T>
            </Pressable>
          ) : null}

          <SectionTitle action={moreNew > 0 ? <LinkButton title={t("today.more", { count: moreNew })} color={colors.accentInk} onPress={() => router.push({ pathname: "/logistics/jobs", params: { view: "new" } })} style={{ minHeight: 32 }} /> : undefined}>{t("today.newRequests")}</SectionTitle>
          {newest ? (
            <JobCard job={newest} riders={data.riderList} onChanged={() => void overview.reload()} />
          ) : (
            <EmptyState icon="truck" title={t("today.noRequests")}>{t("today.noRequestsBody")}</EmptyState>
          )}
          {data.counts.quotes ? (
            <Pressable accessibilityRole="button" onPress={() => void openWeb("/logistics/quotes")} style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <AppIcon name="tag" size={20} />
              <T weight="bold" style={{ flex: 1, fontSize: 15 }}>{t("today.quotes", { count: data.counts.quotes })}</T>
              <AppIcon name="chevron" size={18} color={colors.inkSoft} />
            </Pressable>
          ) : null}

          {outNow.length ? (
            <>
              <SectionTitle action={<LinkButton title={t("today.allRiders")} color={colors.accentInk} onPress={() => router.push("/logistics/riders")} style={{ minHeight: 32 }} />}>{t("today.ridersOut")}</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {outNow.slice(0, 6).map((rider, index) => (
                  <View key={rider.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: rider.openJobs ? colors.accent : colors.success }} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T weight="bold" style={{ fontSize: 15 }}>{rider.openJobs ? t("today.riderOnJob", { name: rider.name }) : t("today.riderFree", { name: rider.name })}</T>
                      <T style={{ color: colors.inkSoft, fontSize: 14 }}>{rider.where ?? t("today.seenRecently")}</T>
                    </View>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {data.cashToPayIn > 0 && !data.overdue ? (
            <Pressable accessibilityRole="button" onPress={() => router.push("/logistics/earnings")} style={{ backgroundColor: "#FDF0D5", borderRadius: radii.card, padding: 16, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <T weight="extrabold" style={{ fontSize: 17, flex: 1 }}>{t("payIn", { amount: naira(data.cashToPayIn), by: data.payInBy ?? t("bySix") })}</T>
                <AppIcon name="chevron" size={18} color={colors.inkSoft} />
              </View>
              <T style={{ color: "#6B4A00", fontSize: 15, lineHeight: 21 }}>{t("codExplain")}</T>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </PartnerScroll>
  );
}
