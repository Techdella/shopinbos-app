import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { ChoiceSheet, RouteLine, Thumb, TonePill } from "@/components/partner";
import { PillButton, T } from "@/components/ui";
import { moveJob, type DispatchRider, type Job } from "@/lib/logistics";
import { jobStage, shortPlace, timeAgo } from "@/lib/partner-pure";
import { colors } from "@/theme";

// A delivery job card, from the "Shopinbos Partners · mobile" prototype: route, fee, parcel, and for a new
// request Decline / Accept and assign (pick a rider from a sheet). Tap the card for the full job.

const RIDER_WINDOW_MS = 30 * 60 * 1000;

/** Riders for the picker, best first (the server already sorts them): free riders who are out, then busy, then offline. */
export function riderOptions(riders: DispatchRider[], now = Date.now()) {
  const rows = riders.map((rider) => {
    const out = Boolean(rider.online && rider.lastSeenAt && now - new Date(rider.lastSeenAt).getTime() <= RIDER_WINDOW_MS);
    const busy = (rider.openJobs ?? 0) > 0;
    return { rider, out, busy, rank: out ? (busy ? 1 : 0) : 2 };
  });
  rows.sort((a, b) => a.rank - b.rank);
  return rows.map(({ rider, out, busy }, index) => ({
    value: rider.id,
    label: rider.name,
    hint: !out ? "Offline" : busy ? `Finishing ${rider.openJobs === 1 ? "a job" : `${rider.openJobs} jobs`}` : index === 0 ? "Free now · best pick" : "Free now",
  }));
}

export function JobCard({ job, riders, onChanged }: { job: Job; riders: DispatchRider[]; onChanged: () => void }) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);
  const stage = jobStage(job.status);
  const isNew = job.status === "pending";

  async function run(action: "accept" | "decline", riderId?: string | null) {
    setBusy(action);
    try {
      await moveJob(job.id, action === "accept" ? { action, riderId: riderId ?? null } : { action });
      onChanged();
    } catch (error) {
      Alert.alert("That didn't go through", error instanceof Error ? error.message : "Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  function decline() {
    Alert.alert("Decline this job?", "The shop is told to book someone else.", [
      { text: "Keep it", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: () => void run("decline") },
    ]);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.ref}, ${job.from} to ${job.to}, ${naira(job.fee)}, ${stage.label}`}
      onPress={() => router.push({ pathname: "/logistics/job/[id]", params: { id: job.id } })}
      style={({ pressed }) => ({ backgroundColor: colors.surface, borderRadius: 22, padding: 16, gap: 12, opacity: pressed ? 0.9 : 1 })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <TonePill tone={stage.tone} label={isNew ? `New · ${timeAgo(job.createdAt)}` : stage.label} />
        <T weight="extrabold" style={{ fontSize: 18 }}>{naira(job.fee)}</T>
      </View>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Thumb icon="box" size={48} />
        <View style={{ flex: 1, gap: 3 }}>
          <RouteLine from={shortPlace(job.from)} to={shortPlace(job.to)} />
          <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={2}>{[job.item, job.shop, job.rider ? `Rider: ${job.rider.name}` : null].filter(Boolean).join(" · ")}</T>
        </View>
      </View>
      {job.collect > 0 ? <TonePill tone="warning" label={`Collect ${naira(job.collect)}`} /> : null}
      {isNew ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <PillButton title="Decline" tone="white" size="md" style={{ flex: 0.7 }} busy={busy === "decline"} disabled={Boolean(busy)} onPress={decline} />
          <PillButton title="Accept and pick a rider" size="md" style={{ flex: 1.3 }} busy={busy === "accept"} disabled={Boolean(busy)} onPress={() => setPicking(true)} />
        </View>
      ) : null}
      <ChoiceSheet
        visible={picking}
        title="Pick a rider"
        options={[...riderOptions(riders), { value: "", label: "Accept now, pick a rider later", hint: "Pick from the job when you're ready" }]}
        onPick={(value) => {
          setPicking(false);
          void run("accept", value || null);
        }}
        onClose={() => setPicking(false)}
      />
    </Pressable>
  );
}
