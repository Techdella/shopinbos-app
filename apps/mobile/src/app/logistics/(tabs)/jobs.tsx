import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { Banner, List, Row, Seg, Small, Sub, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { PayInOverdueCard } from "@/components/PayInOverdueCard";
import { CardButton, Initial } from "@/components/PartnerKit";
import { PushPromptCard } from "@/components/PushPromptCard";
import { TabScreen } from "@/components/TabScreen";
import { Card, Notice, T, Toggle } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchJobs, fetchLogisticsOverview, fetchMarket, setTakingJobs, type Job, type JobView } from "@/lib/logistics";
import { STATUS_WORD } from "@/lib/logistics-pure";
import { shortPlace, verificationStage } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Jobs ("Delivery partner app" prototype `jobs`): the company and the taking-jobs switch, set-up and verification
// prompts, the businesses connected with you, then New / Active / Problems / Done with counts and one row per job
// ("Yaba → Lekki · ₦2,500" over "Glow by Amaka · Pay on delivery · New"). The segment lives in ?view= so other
// screens can open one.

const SEGMENTS: { view: JobView; key: string }[] = [
  { view: "new", key: "seg.new" },
  { view: "active", key: "seg.active" },
  { view: "issues", key: "seg.problems" },
  { view: "done", key: "seg.done" },
];

function asView(value: unknown): JobView {
  return value === "active" || value === "issues" || value === "done" ? value : "new";
}

function jobLine(job: Job) {
  return `${shortPlace(job.from)} → ${shortPlace(job.to)} · ${naira(job.fee)}`;
}

export default function LogisticsJobs() {
  const t = useT("m_partner");
  const params = useLocalSearchParams<{ view?: string }>();
  const view = asView(params.view);
  const overview = useLoad(fetchLogisticsOverview);
  const jobs = useLoad(() => fetchJobs(view), view);
  const market = useLoad(fetchMarket);
  const data = overview.data;
  const [override, setOverride] = useState<boolean | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const taking = override ?? data?.partner.taking ?? false;
  const ready = data ? data.partner.verificationStatus === "verified" && data.partner.onboarded : false;
  const verification = data ? verificationStage(data.partner.verificationStatus, t) : null;
  const connected = market.data?.connections.length ?? 0;

  async function toggle() {
    const next = !taking;
    setSwitching(true);
    setSwitchError(null);
    setOverride(next);
    try {
      await setTakingJobs(next);
    } catch (error) {
      setOverride(!next);
      setSwitchError(error instanceof Error ? error.message : t("error.retry"));
    } finally {
      setSwitching(false);
    }
  }

  function refresh() {
    void overview.refresh();
    void jobs.refresh();
    void market.reload();
  }

  const status = (job: Job) => t.dynamic(`pst.${job.status}`, STATUS_WORD[job.status] ?? job.status.replace(/_/g, " "));
  const sub = (job: Job) =>
    [job.shop, job.collect > 0 ? t("jobs.pod") : null, status(job), view === "active" && job.rider ? job.rider.name.split(" ")[0] : null].filter(Boolean).join(" · ");

  const header = (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46 }}>
        <Initial name={data?.partner.name ?? "Shopinbos"} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="semibold" numberOfLines={1} style={{ fontSize: 13, color: colors.inkSoft }}>{data?.partner.name ?? " "}</T>
          <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("jobs.title")}</T>
        </View>
        <View style={{ opacity: ready && !switching ? 1 : 0.45 }} pointerEvents={ready && !switching ? "auto" : "none"}>
          <Toggle on={Boolean(taking)} onChange={() => void toggle()} label={t("jobs.takingLabel")} />
        </View>
      </View>
      {data ? <Small>{taking ? t("jobs.taking") : t("jobs.paused")}</Small> : null}
    </View>
  );

  return (
    <TabScreen header={header} refreshing={overview.refreshing || jobs.refreshing} onRefresh={refresh}>
      {switchError ? <Notice>{switchError}</Notice> : null}
      {overview.error && !data ? <ErrorState message={overview.error} onRetry={() => void overview.reload()} web={{ label: t("openOnWeb"), onPress: () => void openWeb("/logistics/dashboard") }} /> : null}

      {data && !data.partner.onboarded ? (
        <CardButton icon="truck" tint={colors.mintTint} iconBg="#FFFFFF" title={t("today.finish")} sub={t("today.finishHint")} onPress={() => router.push("/logistics/setup")} />
      ) : data && verification && data.partner.verificationStatus !== "verified" ? (
        <CardButton icon="shield" tint={colors.warnTint} iconBg="#FFFFFF" iconFg={colors.warnInk} title={verification.label} sub={verification.hint} onPress={() => router.push("/logistics/verification")} />
      ) : null}

      <PushPromptCard who="logistics" when={Boolean(data)} />
      {data?.overdue ? <PayInOverdueCard overdue={data.overdue} onChecked={() => void overview.reload()} /> : null}

      {connected > 0 ? (
        <CardButton icon="link" tint={colors.mintTint} iconBg="#FFFFFF" title={t("conn.banner", { count: connected })} sub={t("conn.bannerSub")} onPress={() => router.push("/logistics/connections")} />
      ) : null}

      {data && data.counts.quotes > 0 ? (
        <Banner title={t("today.quotes", { count: data.counts.quotes })} tone="mint" icon="tag">
          <T weight="bold" style={{ fontSize: 14, color: colors.forest, textDecorationLine: "underline" }} onPress={() => void openWeb("/logistics/quotes")}>{t("openOnWeb")}</T>
        </Banner>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
        {SEGMENTS.map((segment) => (
          <Seg key={segment.view} label={t.dynamic(segment.key)} count={jobs.data?.counts[segment.view]} on={view === segment.view} onPress={() => router.setParams({ view: segment.view })} />
        ))}
      </ScrollView>

      {jobs.loading ? <LoadingBlock label={t("jobs.loading")} /> : null}
      {jobs.error && !jobs.data ? <ErrorState message={jobs.error} onRetry={() => void jobs.reload()} web={{ label: t("openOnWeb"), onPress: () => void openWeb("/logistics/bookings") }} /> : null}
      {!jobs.loading && jobs.data && !jobs.data.jobs.length ? (
        <Card style={{ padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
          <Sub>{t("jobs.nothingHere")}</Sub>
        </Card>
      ) : null}
      {!jobs.loading && jobs.data?.jobs.length ? (
        <List>
          {jobs.data.jobs.map((job) => (
            <Row
              key={job.id}
              lead={<Tile icon="route" tone="mint" />}
              title={jobLine(job)}
              sub={sub(job)}
              onPress={() => router.push({ pathname: "/logistics/job/[id]", params: { id: job.id } })}
            />
          ))}
        </List>
      ) : null}
    </TabScreen>
  );
}
