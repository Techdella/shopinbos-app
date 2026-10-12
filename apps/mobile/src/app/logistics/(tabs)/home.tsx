import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { JobCard } from "@/components/JobCard";
import { EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { PartnerHeader, PartnerScroll, StatTile } from "@/components/partner";
import { LinkButton, T } from "@/components/ui";
import { fetchLogisticsOverview } from "@/lib/logistics";
import { verificationStage } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// Delivery partner "Today", from the "Shopinbos Partners · mobile" prototype: taking new jobs, delivered and
// earned today, New / Active / Issues, the new requests to accept and assign, riders out and cash to pay in.

export default function LogisticsToday() {
  const overview = useLoad(fetchLogisticsOverview);
  const data = overview.data;
  const verification = data ? verificationStage(data.partner.verificationStatus) : null;

  return (
    <PartnerScroll refreshing={overview.refreshing} onRefresh={() => void overview.refresh()}>
      <PartnerHeader
        eyebrow="Shopinbos Partners"
        name={data?.partner.name ?? "Your company"}
        logoUrl={data?.partner.logoUrl}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Messages" onPress={() => router.push("/logistics/messages")} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="chat" size={20} />
          </Pressable>
        }
      />

      {overview.loading && !data ? <LoadingBlock label="Loading today…" /> : null}
      {overview.error && !data ? <ErrorState message={overview.error} onRetry={() => void overview.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/logistics/dashboard") }} /> : null}

      {data && verification ? (
        <>
          {data.partner.verificationStatus !== "verified" || !data.partner.onboarded ? (
            <Pressable accessibilityRole="button" onPress={() => router.push("/logistics/verification")} style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <AppIcon name="shield" size={20} color={colors.forest} />
                <T weight="extrabold" style={{ flex: 1, fontSize: 15 }}>{data.partner.onboarded ? verification.label : "Finish setting up"}</T>
                <AppIcon name="chevron" size={18} color={colors.inkSoft} />
              </View>
              <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{data.partner.onboarded ? verification.hint : "Set where you deliver and your prices, then upload your documents to start taking jobs."}</T>
            </Pressable>
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T weight="extrabold" style={{ color: data.partner.taking ? colors.success : colors.inkSoft, fontSize: 15 }}>{data.partner.taking ? "Taking new jobs" : "Not taking new jobs"}</T>
                <T style={{ color: colors.inkSoft, fontSize: 13 }} numberOfLines={2}>{data.partner.areas}</T>
              </View>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: data.partner.taking ? colors.success : colors.toggleOff }} />
            </View>
          )}

          <View>
            <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.8, lineHeight: 34 }} accessibilityRole="header">{data.deliveredToday} delivered today</T>
            <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.8, lineHeight: 34 }}>{naira(data.earnedToday)} earned</T>
            {data.onTime !== null ? <T style={{ color: colors.inkSoft, marginTop: 6 }}>{data.onTime}% on time over the last 30 days</T> : null}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatTile label="New" value={data.counts.new} onPress={() => router.push({ pathname: "/logistics/jobs", params: { view: "new" } })} />
            <StatTile label="Active" value={data.counts.active} onPress={() => router.push({ pathname: "/logistics/jobs", params: { view: "active" } })} />
            <StatTile label="Issues" value={data.counts.issues} tone="danger" onPress={() => router.push({ pathname: "/logistics/jobs", params: { view: "issues" } })} />
          </View>

          <SectionTitle action={<LinkButton title="See all" color={colors.accentInk} onPress={() => router.push({ pathname: "/logistics/jobs", params: { view: "new" } })} style={{ minHeight: 32 }} />}>New requests</SectionTitle>
          {data.newJobs.length ? (
            <View style={{ gap: 10 }}>
              {data.newJobs.map((job) => <JobCard key={job.id} job={job} riders={data.riderList} onChanged={() => void overview.reload()} />)}
            </View>
          ) : (
            <EmptyState icon="truck" title="No new requests">Shops book you at checkout. New jobs land here to accept and assign.</EmptyState>
          )}
          {data.counts.quotes ? (
            <Pressable accessibilityRole="button" onPress={() => void openWeb("/logistics/quotes")} style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <AppIcon name="tag" size={20} />
              <T weight="bold" style={{ flex: 1 }}>{data.counts.quotes} shop{data.counts.quotes === 1 ? "" : "s"} asking for a price</T>
              <AppIcon name="chevron" size={18} color={colors.inkSoft} />
            </Pressable>
          ) : null}

          <Pressable accessibilityRole="button" onPress={() => router.push("/logistics/riders")} style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <AppIcon name="truck" size={20} />
            <T weight="bold" style={{ flex: 1 }}>{data.riders.total ? `${data.riders.out} rider${data.riders.out === 1 ? "" : "s"} out · ${data.riders.offline} offline` : "No riders yet"}</T>
            <T weight="bold" style={{ color: colors.accentInk }}>See riders</T>
          </Pressable>

          <View style={{ backgroundColor: "#FDF0D5", borderRadius: radii.card, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T weight="extrabold" style={{ fontSize: 15 }}>Cash to pay in</T>
              <T weight="extrabold" style={{ fontSize: 17 }}>{naira(data.cashToPayIn)}</T>
            </View>
            <T style={{ color: "#6B4A00", lineHeight: 20 }}>From pay-on-delivery orders your riders collected in cash.</T>
            <Pressable accessibilityRole="button" onPress={() => router.push("/logistics/earnings")} style={{ alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: radii.pill, paddingHorizontal: 16, minHeight: 40, justifyContent: "center" }}>
              <T weight="bold" style={{ color: "#FFFFFF", fontSize: 13.5 }}>Open cash</T>
            </Pressable>
          </View>
        </>
      ) : null}
    </PartnerScroll>
  );
}
