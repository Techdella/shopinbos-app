import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { lastSeenWords, rankRidersForPickup } from "@shared/delivery-geo";
import { naira } from "@shared/onboarding";
import { ChoiceSheet, RouteLine, Thumb, TonePill } from "@/components/partner";
import { PillButton, T } from "@/components/ui";
import { moveJob, type DispatchRider, type Job } from "@/lib/logistics";
import { jobStage, shortPlace, timeAgo } from "@/lib/partner-pure";
import { colors } from "@/theme";

// A delivery job card, from the "Shopinbos Partners · mobile" prototype: route, fee, parcel, and for a new
// request Decline / Accept and assign (assign a rider from a sheet). Tap the card for the full job.

/**
 * Riders for the picker for one pickup, best first: free riders who are out, then busy, then offline; inside each,
 * fresh locations (under 10 minutes) closest first (shared/delivery-geo rankRidersForPickup).
 */
export function riderOptions(riders: DispatchRider[], pickup?: { lat: number; lng: number } | null, now = new Date()) {
  const ranked = rankRidersForPickup(riders.map((rider) => ({ ...rider, openJobs: rider.openJobs ?? 0 })), pickup, now);
  return ranked.map(({ rider, group, fresh, distanceText }, index) => {
    const state = group === 2 ? "Offline" : group === 1 ? `Finishing ${rider.openJobs === 1 ? "a job" : `${rider.openJobs} jobs`}` : index === 0 ? "Free now · best pick" : "Free now";
    const where = distanceText ? (fresh ? distanceText : `${distanceText.split(" · ")[0]}, ${lastSeenWords(rider.locationAt ?? null, now)}`) : "";
    return { value: rider.id, label: rider.name, hint: where ? `${state} · ${where}` : state };
  });
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
          {job.pickupWindow ? <T weight="bold" style={{ color: colors.accentInk, fontSize: 15 }} numberOfLines={1}>{job.pickupWindow}</T> : null}
        </View>
      </View>
      {job.collect > 0 ? <TonePill tone="warning" label={`Collect ${naira(job.collect)}`} /> : null}
      {isNew ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <PillButton title="Decline" tone="white" size="md" style={{ flex: 0.7 }} busy={busy === "decline"} disabled={Boolean(busy)} onPress={decline} />
          <PillButton title="Accept and assign" size="md" style={{ flex: 1.3 }} busy={busy === "accept"} disabled={Boolean(busy)} onPress={() => setPicking(true)} />
        </View>
      ) : null}
      <ChoiceSheet
        visible={picking}
        title="Assign a rider"
        options={[...riderOptions(riders, job.pickupGeo), { value: "", label: "Accept, assign later", hint: "Assign a rider from the job when you're ready" }]}
        onPick={(value) => {
          setPicking(false);
          void run("accept", value || null);
        }}
        onClose={() => setPicking(false)}
      />
    </Pressable>
  );
}
