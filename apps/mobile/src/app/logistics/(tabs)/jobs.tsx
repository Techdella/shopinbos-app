import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { JobCard } from "@/components/JobCard";
import { ChipRow, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { Chip } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchJobs, type JobView } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";

// Jobs: new requests (accept and assign, or decline), active jobs (picked up → on the way → delivered),
// finished ones and issues (failed deliveries to retry). The filter lives in ?view= so Today can open one.

// Labels in m_partner "jobs.<view>", empty lines in "jobs.empty<View>".
const VIEWS = [
  { value: "new", label: "jobs.new", empty: "jobs.emptyNew" },
  { value: "active", label: "jobs.active", empty: "jobs.emptyActive" },
  { value: "issues", label: "jobs.issues", empty: "jobs.emptyIssues" },
  { value: "done", label: "jobs.done", empty: "jobs.emptyDone" },
] as const satisfies readonly { value: JobView; label: string; empty: string }[];

function asView(value: unknown): JobView {
  return value === "new" || value === "done" || value === "issues" ? value : value === "active" ? "active" : "new";
}

export default function LogisticsJobs() {
  const t = useT("m_partner");
  const params = useLocalSearchParams<{ view?: string }>();
  const view = asView(params.view);
  const jobs = useLoad(() => fetchJobs(view), view);
  const data = jobs.data;

  return (
    <TabScreen title={t("jobs.title")} refreshing={jobs.refreshing} onRefresh={() => void jobs.refresh()}>
      <ChipRow>
        {VIEWS.map((item) => {
          const count = data?.counts[item.value];
          return <Chip key={item.value} label={count && item.value !== "done" ? t("jobs.withCount", { label: t(item.label), count }) : t(item.label)} on={view === item.value} onPress={() => router.setParams({ view: item.value })} />;
        })}
      </ChipRow>
      <View style={{ marginTop: 14, gap: 10 }}>
        {jobs.loading ? <LoadingBlock label={t("jobs.loading")} /> : null}
        {jobs.error && !data ? <ErrorState message={jobs.error} onRetry={() => void jobs.reload()} web={{ label: t("openOnWeb"), onPress: () => void openWeb("/logistics/bookings") }} /> : null}
        {data && !jobs.loading && !data.jobs.length ? <EmptyState icon="truck" title={t("jobs.nothing")}>{t(VIEWS.find((item) => item.value === view)?.empty ?? "jobs.emptyNew")}</EmptyState> : null}
        {!jobs.loading && data?.jobs.map((job) => <JobCard key={job.id} job={job} riders={data.riders} onChanged={() => void jobs.reload()} />)}
      </View>
    </TabScreen>
  );
}
