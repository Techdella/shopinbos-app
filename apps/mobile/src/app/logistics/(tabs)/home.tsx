import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon, type AppIconName } from "@/components/icons";
import { JobCard } from "@/components/JobCard";
import { EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { PartnerHeader, PartnerScroll } from "@/components/partner";
import { Card, LinkButton, Notice, T, Toggle } from "@/components/ui";
import { fetchLogisticsOverview, setTakingJobs } from "@/lib/logistics";
import { verificationStage } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// Delivery partner "Today" (spec 8A, "Simple supplier, delivery and rider apps"): a big "Taking new jobs" switch,
// today's deliveries and earnings, the newest job with "Accept and pick a rider", and the cash to pay in by 6pm.
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
  const overview = useLoad(fetchLogisticsOverview);
  const data = overview.data;
  const verification = data ? verificationStage(data.partner.verificationStatus) : null;
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
      setSwitchError(error instanceof Error ? error.message : "That didn't go through. Check your connection and try again.");
    } finally {
      setSwitching(false);
    }
  }

  const ready = data ? data.partner.verificationStatus === "verified" && data.partner.onboarded : false;
  const newest = data?.newJobs[0];
  const moreNew = data ? data.counts.new - (newest ? 1 : 0) : 0;

  return (
    <PartnerScroll refreshing={overview.refreshing} onRefresh={() => void overview.refresh()}>
      <PartnerHeader
        eyebrow="Shopinbos Partners"
        name={data?.partner.name ?? "Your company"}
        logoUrl={data?.partner.logoUrl}
        right={
          <View style={{ flexDirection: "row", gap: 6 }}>
            <HeaderButton icon="chat" label="Messages" onPress={() => router.push("/logistics/messages")} />
            <HeaderButton icon="grid" label="Menu" onPress={() => router.push("/logistics/menu")} />
          </View>
        }
      />

      {overview.loading && !data ? <LoadingBlock label="Loading today…" /> : null}
      {overview.error && !data ? <ErrorState message={overview.error} onRetry={() => void overview.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/logistics/dashboard") }} /> : null}

      {data && verification ? (
        <>
          {!ready ? (
            <Pressable accessibilityRole="button" onPress={() => router.push("/logistics/verification")} style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <AppIcon name="shield" size={20} color={colors.forest} />
                <T weight="extrabold" style={{ flex: 1, fontSize: 16 }}>{data.partner.onboarded ? verification.label : "Finish setting up"}</T>
                <AppIcon name="chevron" size={18} color={colors.inkSoft} />
              </View>
              <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{data.partner.onboarded ? verification.hint : "Set where you deliver and your prices, then add your papers to start taking jobs."}</T>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Taking new jobs"
              accessibilityState={{ checked: Boolean(taking), busy: switching }}
              disabled={switching}
              onPress={() => void toggleTaking(!taking)}
              style={{ backgroundColor: taking ? colors.successTint : colors.surface, borderRadius: radii.card, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, minHeight: 84 }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="extrabold" style={{ fontSize: 20, color: taking ? colors.success : colors.ink }}>{taking ? "Taking new jobs" : "Not taking new jobs"}</T>
                <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={2}>{taking ? `Shops in ${data.partner.areas} can book you.` : "Shops can't book you now. Jobs you have carry on."}</T>
              </View>
              <View pointerEvents="none" style={{ transform: [{ scale: 1.3 }] }}>
                <Toggle on={Boolean(taking)} onChange={() => undefined} label="Taking new jobs" />
              </View>
            </Pressable>
          )}
          {switchError ? <Notice>{switchError}</Notice> : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Card style={{ flex: 1, gap: 4 }}>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>Delivered today</T>
              <T weight="extrabold" style={{ fontSize: 28, letterSpacing: -0.6 }} accessibilityRole="header">{data.deliveredToday}</T>
            </Card>
            <Card style={{ flex: 1, gap: 4 }}>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>You earned</T>
              <T weight="extrabold" style={{ fontSize: 28, letterSpacing: -0.6 }}>{naira(data.earnedToday)}</T>
            </Card>
          </View>

          {data.counts.issues ? (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/logistics/jobs", params: { view: "issues" } })} style={{ backgroundColor: colors.dangerTint, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <AppIcon name="help" size={20} color={colors.danger} />
              <T weight="bold" style={{ flex: 1, fontSize: 15, color: colors.danger }}>{data.counts.issues} {data.counts.issues === 1 ? "job" : "jobs"} couldn&apos;t be delivered</T>
              <T weight="bold" style={{ fontSize: 15, color: colors.danger }}>See</T>
            </Pressable>
          ) : null}

          <SectionTitle action={moreNew > 0 ? <LinkButton title={`${moreNew} more`} color={colors.accentInk} onPress={() => router.push({ pathname: "/logistics/jobs", params: { view: "new" } })} style={{ minHeight: 32 }} /> : undefined}>New job</SectionTitle>
          {newest ? (
            <JobCard job={newest} riders={data.riderList} onChanged={() => void overview.reload()} />
          ) : (
            <EmptyState icon="truck" title="No new jobs">When a shop books you, the job shows up here for you to accept.</EmptyState>
          )}
          {data.counts.quotes ? (
            <Pressable accessibilityRole="button" onPress={() => void openWeb("/logistics/quotes")} style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <AppIcon name="tag" size={20} />
              <T weight="bold" style={{ flex: 1, fontSize: 15 }}>{data.counts.quotes} shop{data.counts.quotes === 1 ? "" : "s"} asking for your price</T>
              <AppIcon name="chevron" size={18} color={colors.inkSoft} />
            </Pressable>
          ) : null}

          {data.cashToPayIn > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => router.push("/logistics/earnings")} style={{ backgroundColor: "#FDF0D5", borderRadius: radii.card, padding: 16, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <T weight="extrabold" style={{ fontSize: 17, flex: 1 }}>Pay in {naira(data.cashToPayIn)} by 6pm</T>
                <AppIcon name="chevron" size={18} color={colors.inkSoft} />
              </View>
              <T style={{ color: "#6B4A00", fontSize: 15, lineHeight: 21 }}>Cash your riders collected from customers who paid when it arrived.</T>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </PartnerScroll>
  );
}
