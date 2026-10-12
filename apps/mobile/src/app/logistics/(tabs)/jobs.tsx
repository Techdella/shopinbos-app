import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { JobCard } from "@/components/JobCard";
import { ChipRow, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { Chip } from "@/components/ui";
import { fetchJobs, type JobView } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";

// Jobs: new requests (accept and pick a rider, or decline), active jobs (picked up → on the way → delivered),
// finished ones and issues (failed deliveries to retry). The filter lives in ?view= so Today can open one.

const VIEWS: Array<{ value: JobView; label: string; empty: string }> = [
  { value: "new", label: "New", empty: "No new requests. Shops book you at checkout." },
  { value: "active", label: "On the way", empty: "No jobs on the road right now." },
  { value: "issues", label: "Problems", empty: "No problems. Jobs your riders couldn't deliver show up here." },
  { value: "done", label: "Done", empty: "Delivered and cancelled jobs show up here." },
];

function asView(value: unknown): JobView {
  return value === "new" || value === "done" || value === "issues" ? value : value === "active" ? "active" : "new";
}

export default function LogisticsJobs() {
  const params = useLocalSearchParams<{ view?: string }>();
  const view = asView(params.view);
  const jobs = useLoad(() => fetchJobs(view), view);
  const data = jobs.data;

  return (
    <TabScreen title="Jobs" refreshing={jobs.refreshing} onRefresh={() => void jobs.refresh()}>
      <ChipRow>
        {VIEWS.map((item) => {
          const count = data?.counts[item.value];
          return <Chip key={item.value} label={count && item.value !== "done" ? `${item.label} ${count}` : item.label} on={view === item.value} onPress={() => router.setParams({ view: item.value })} />;
        })}
      </ChipRow>
      <View style={{ marginTop: 14, gap: 10 }}>
        {jobs.loading ? <LoadingBlock label="Loading jobs…" /> : null}
        {jobs.error && !data ? <ErrorState message={jobs.error} onRetry={() => void jobs.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/logistics/bookings") }} /> : null}
        {data && !jobs.loading && !data.jobs.length ? <EmptyState icon="truck" title="Nothing here">{VIEWS.find((item) => item.value === view)?.empty}</EmptyState> : null}
        {!jobs.loading && data?.jobs.map((job) => <JobCard key={job.id} job={job} riders={data.riders} onChanged={() => void jobs.reload()} />)}
      </View>
    </TabScreen>
  );
}
