import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { lastSeenWords, rankRidersForPickup } from "@shared/delivery-geo";
import { naira } from "@shared/onboarding";
import { ChoiceSheet, RouteLine, Thumb, TonePill } from "@/components/partner";
import { ButtonRow, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { moveJob, type DispatchRider, type Job } from "@/lib/logistics";
import { jobStage, shortPlace, timeAgo, type Say } from "@/lib/partner-pure";
import { colors } from "@/theme";

// A delivery job card, from the "Shopinbos Partners · mobile" prototype: route, fee, parcel, and for a new
// request Decline / Accept and assign (assign a rider from a sheet). Tap the card for the full job.

/**
 * Riders for the picker for one pickup, best first: free riders who are out, then busy, then offline; inside each,
 * fresh locations (under 10 minutes) closest first (shared/delivery-geo rankRidersForPickup).
 */
export function riderOptions(riders: DispatchRider[], pickup?: { lat: number; lng: number } | null, now = new Date(), t?: Say) {
  const ranked = rankRidersForPickup(riders.map((rider) => ({ ...rider, openJobs: rider.openJobs ?? 0 })), pickup, now);
  const say = (key: string, english: string, vars?: Record<string, number>) => (t ? t.dynamic(key, english, vars) : english);
  return ranked.map(({ rider, group, fresh, distanceText }, index) => {
    const state =
      group === 2
        ? say("pick.offline", "Offline")
        : group === 1
          ? say("pick.finishing", `Finishing ${rider.openJobs === 1 ? "a job" : `${rider.openJobs} jobs`}`, { count: rider.openJobs ?? 0 })
          : index === 0
            ? say("pick.best", "Free now · best pick")
            : say("pick.free", "Free now");
    const where = distanceText ? (fresh ? distanceText : `${distanceText.split(" · ")[0]}, ${lastSeenWords(rider.locationAt ?? null, now)}`) : "";
    return { value: rider.id, label: rider.name, hint: where ? `${state} · ${where}` : state };
  });
}

export function JobCard({ job, riders, onChanged }: { job: Job; riders: DispatchRider[]; onChanged: () => void }) {
  const t = useT("m_partner");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);
  const stage = jobStage(job.status, t);
  const isNew = job.status === "pending";

  async function run(action: "accept" | "decline", riderId?: string | null) {
    setBusy(action);
    try {
      await moveJob(job.id, action === "accept" ? { action, riderId: riderId ?? null } : { action });
      onChanged();
    } catch (error) {
      Alert.alert(t("error.title"), error instanceof Error ? error.message : t("error.checkConnection"));
    } finally {
      setBusy(null);
    }
  }

  function decline() {
    Alert.alert(t("decline.title"), t("decline.body"), [
      { text: t("keepIt"), style: "cancel" },
      { text: t("decline"), style: "destructive", onPress: () => void run("decline") },
    ]);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("card.label", { ref: job.ref, from: job.from, to: job.to, fee: naira(job.fee), stage: stage.label })}
      onPress={() => router.push({ pathname: "/logistics/job/[id]", params: { id: job.id } })}
      style={({ pressed }) => ({ backgroundColor: colors.surface, borderRadius: 22, padding: 16, gap: 12, opacity: pressed ? 0.9 : 1 })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <TonePill tone={stage.tone} label={isNew ? t("card.new", { ago: timeAgo(job.createdAt, undefined, t) }) : stage.label} />
        <T weight="extrabold" style={{ fontSize: 18 }}>{naira(job.fee)}</T>
      </View>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Thumb icon="box" size={48} />
        <View style={{ flex: 1, gap: 3 }}>
          <RouteLine from={shortPlace(job.from)} to={shortPlace(job.to)} />
          <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={2}>{[job.item, job.shop, job.rider ? t("card.rider", { name: job.rider.name }) : null].filter(Boolean).join(" · ")}</T>
          {job.pickupWindow ? <T weight="bold" style={{ color: colors.accentInk, fontSize: 15 }} numberOfLines={1}>{job.pickupWindow}</T> : null}
        </View>
      </View>
      {job.collect > 0 ? <TonePill tone="warning" label={t("card.collect", { amount: naira(job.collect) })} /> : null}
      {isNew ? (
        <ButtonRow labels={[t("decline"), t("acceptAssign")]} primaryLast gap={8}>
          <PillButton title={t("decline")} tone="white" size="md" style={{ flex: 0.7 }} busy={busy === "decline"} disabled={Boolean(busy)} onPress={decline} />
          <PillButton title={t("acceptAssign")} size="md" style={{ flex: 1.3 }} busy={busy === "accept"} disabled={Boolean(busy)} onPress={() => setPicking(true)} />
        </ButtonRow>
      ) : null}
      <ChoiceSheet
        visible={picking}
        title={t("assignRider")}
        options={[...riderOptions(riders, job.pickupGeo, undefined, t), { value: "", label: t("acceptLater"), hint: t("acceptLaterHint") }]}
        onPick={(value) => {
          setPicking(false);
          void run("accept", value || null);
        }}
        onClose={() => setPicking(false)}
      />
    </Pressable>
  );
}
