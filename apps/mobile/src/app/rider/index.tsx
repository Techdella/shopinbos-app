import { useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Redirect, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { TonePill } from "@/components/partner";
import { Card, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { jobStage } from "@/lib/partner-pure";
import { fetchRider, forgetRiderToken, riderAction, riderToken, type RiderRun } from "@/lib/rider";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";

// Shopinbos Riders, from the "Riders app" prototype: Online switch, earned today and cash in hand, the next run
// (pick up, drops, cash collections, what you earn) with Accept run, then each drop to deliver.

function RunCard({ run, next, busy, onStart }: { run: RiderRun; next: boolean; busy: boolean; onStart: () => void }) {
  const waiting = run.drops.filter((drop) => drop.status === "confirmed");
  const cashDrops = run.drops.filter((drop) => drop.collect > 0).length;
  return (
    <Card style={{ gap: 14, opacity: next ? 1 : 0.95 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="store" color={colors.accentInk} />
        </View>
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>Pick up: {run.pickupName}</T>
          <T style={{ color: colors.inkSoft }} numberOfLines={2}>{run.pickupAddress}</T>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <TonePill tone="muted" label={`${run.drops.length} drop${run.drops.length === 1 ? "" : "s"}`} />
        {cashDrops ? <TonePill tone="accent" label={`${cashDrops} cash collection${cashDrops === 1 ? "" : "s"}`} /> : null}
      </View>
      <T weight="extrabold" style={{ fontSize: 22 }}>You earn {naira(run.fees)}</T>
      {waiting.length ? (
        <PillButton title="Accept run" tone="accent" busy={busy} onPress={onStart} />
      ) : null}
      {run.drops.map((drop) => {
        const stage = jobStage(drop.status);
        const canDeliver = drop.status === "picked_up" || drop.status === "in_transit";
        return (
          <Pressable
            key={drop.id}
            accessibilityRole="button"
            disabled={!canDeliver}
            onPress={() => router.push({ pathname: "/rider/drop/[id]", params: { id: drop.id } })}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line, opacity: pressed ? 0.8 : 1 })}
          >
            <AppIcon name="pin" size={18} color={colors.forest} />
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="bold" numberOfLines={1}>{drop.buyerName ?? drop.area}</T>
              <T style={{ color: colors.inkSoft, fontSize: 13 }} numberOfLines={2}>{drop.address}</T>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
                <TonePill tone={stage.tone} label={stage.label} />
                {drop.collect ? <TonePill tone="warning" label={`Collect ${naira(drop.collect)}`} /> : null}
              </View>
            </View>
            {canDeliver ? <T weight="bold" style={{ color: colors.accentInk }}>Deliver</T> : null}
          </Pressable>
        );
      })}
    </Card>
  );
}

export default function RiderHome() {
  const [token] = useState(riderToken);
  const rider = useLoad(fetchRider);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = rider.data;

  if (!token) return <Redirect href="/rider/link" />;

  async function act(key: string, run: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await run();
      await rider.reload();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function leave() {
    Alert.alert("Remove your Riders link from this phone?", "You'll need the link from your dispatcher to open your runs again.", [
      { text: "Keep it", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { forgetRiderToken(); router.replace("/welcome"); } },
    ]);
  }

  const linkDead = rider.error && !data && /link/i.test(rider.error);
  const runs = data?.runs ?? [];
  const nextRun = runs.find((run) => run.drops.some((drop) => drop.status === "confirmed")) ?? runs[0];

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} refreshControl={<RefreshControl refreshing={rider.refreshing} onRefresh={() => void rider.refresh()} />}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Initials name={data?.rider.name ?? "Rider"} size={48} bg={colors.mintTint} fg={colors.forest} />
          <View style={{ flex: 1 }}>
            <T style={{ color: colors.inkSoft, fontSize: 13 }}>Shopinbos Riders{data ? ` · ${data.rider.partnerName}` : ""}</T>
            <T weight="extrabold" style={{ fontSize: 18 }} numberOfLines={1} accessibilityRole="header">{data?.rider.name ?? "Your runs"}</T>
          </View>
          {data ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: data.rider.online, busy: busy === "online" }}
              accessibilityLabel="Online"
              disabled={busy === "online"}
              onPress={() => void act("online", () => riderAction({ action: "online", online: !data.rider.online }))}
              style={{ minHeight: 44, borderRadius: radii.pill, paddingHorizontal: 18, justifyContent: "center", backgroundColor: data.rider.online ? colors.success : colors.surface, borderWidth: data.rider.online ? 0 : 1, borderColor: colors.line }}
            >
              <T weight="extrabold" style={{ color: data.rider.online ? "#FFFFFF" : colors.inkSoft }}>{data.rider.online ? "Online" : "Offline"}</T>
            </Pressable>
          ) : null}
        </View>

        {rider.loading && !data ? <LoadingBlock label="Loading your runs…" /> : null}
        {rider.error && !data ? (
          <ErrorState message={rider.error} onRetry={linkDead ? undefined : () => void rider.reload()} web={linkDead ? { label: "Use a new link", onPress: () => { forgetRiderToken(); router.replace("/rider/link"); } } : undefined} />
        ) : null}
        {error ? <Notice>{error}</Notice> : null}

        {data ? (
          <>
            <View style={{ backgroundColor: colors.ink, borderRadius: 24, padding: 18, flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <T style={{ color: "rgba(255,255,255,0.75)" }}>Earned today</T>
                <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 30, letterSpacing: -0.6 }}>{naira(data.earnedToday)}</T>
                <T style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{data.dropsDone} drop{data.dropsDone === 1 ? "" : "s"} done</T>
              </View>
              <View style={{ flex: 1, backgroundColor: "#2E2B3B", borderRadius: 18, padding: 14, gap: 4 }}>
                <T style={{ color: "rgba(255,255,255,0.75)" }}>Cash in hand</T>
                <T weight="extrabold" style={{ color: "#FFB591", fontSize: 22 }}>{naira(data.cashInHand)}</T>
                <T style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>Hand in to your dispatcher</T>
              </View>
            </View>

            <T weight="extrabold" style={{ fontSize: 18 }}>{runs.length ? "Your next run" : "Your runs"}</T>
            {nextRun ? (
              <RunCard run={nextRun} next busy={busy === nextRun.key} onStart={() => void act(nextRun.key, () => riderAction({ action: "start_run", jobIds: nextRun.drops.filter((drop) => drop.status === "confirmed").map((drop) => drop.id) }))} />
            ) : (
              <EmptyState icon="truck" title="No runs right now">
                {data.rider.online ? "Your dispatcher gives you jobs here. Pull down to check." : "Switch Online when you're ready, so your dispatcher knows you can take jobs."}
              </EmptyState>
            )}
            {runs.filter((run) => run !== nextRun).map((run) => (
              <RunCard key={run.key} run={run} next={false} busy={busy === run.key} onStart={() => void act(run.key, () => riderAction({ action: "start_run", jobIds: run.drops.filter((drop) => drop.status === "confirmed").map((drop) => drop.id) }))} />
            ))}

            {data.rider.partnerPhone ? (
              <PillButton tone="white" size="md" onPress={() => void Linking.openURL(`tel:${data.rider.partnerPhone}`)}>
                <AppIcon name="phone" size={18} />
                <T weight="bold">Call {data.rider.partnerName}</T>
              </PillButton>
            ) : null}
          </>
        ) : null}
        <LinkButton title="Remove my Riders link from this phone" color={colors.inkSoft} onPress={leave} />
      </ScrollView>
    </SafeAreaView>
  );
}

