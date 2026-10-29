import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { Banner, List, Row, Small, Sub, Tile } from "@/components/design";
import { HelpButton } from "@/components/Help";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { PushPromptCard } from "@/components/PushPromptCard";
import { CardTitle, MAP_OVERLAY, RiderBadge } from "@/components/RiderKit";
import { RiderMap } from "@/components/RiderMap";
import { Sheet } from "@/components/Sheet";
import { TabScreen } from "@/components/TabScreen";
import { Notice, PillButton, T, Toggle } from "@/components/ui";
import { fetchRider, forgetRiderToken, markJobTaken, riderAction, riderWelcomed, takenJobs, type RiderDrop, type RiderRun } from "@/lib/rider";
import { useOwnPosition, useRiderLocation } from "@/lib/rider-location";
import { activeJob, initials, routeLine, waitingOffer } from "@/lib/rider-pure";
import { useRiderStrings } from "@/lib/rider-strings";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Riders app, Today (E2E-Rider "today"): the online switch, a new job from the company (tap → "Start this job" /
// "Skip" sheet; the company already gave the job to this rider, there's no "take" to send it, so starting only opens
// the steps and the company sees the pickup; Skip is sent), the job in hand, or "No jobs right now", and deliveries done today. First run on this phone goes
// to the welcome and language screens. Every word comes from the m_rider catalog (lib/rider-strings.ts).

export default function RiderToday() {
  const params = useLocalSearchParams<{ drop?: string }>();
  const rider = useLoad(fetchRider);
  const { t, say } = useRiderStrings();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const data = rider.data;
  // Location only while online or carrying a delivery, and only with the rider's yes (lib/rider-location.ts).
  const location = useRiderLocation(Boolean(data && (data.rider.online || data.runs.length > 0)));
  // The rider's own dot on the map: on this phone only, once location is allowed (asked above, never here).
  const here = useOwnPosition(location.state === "on" || location.state === "idle");
  const welcomed = useRef(false);
  const opened = useRef(false);

  // First time on this phone: "{Company} added you as a rider", then the language.
  useEffect(() => {
    if (!data || welcomed.current) return;
    welcomed.current = true;
    const id = data.rider.id ?? data.rider.name;
    if (!riderWelcomed(id)) router.push({ pathname: "/rider/welcome", params: { id, name: data.rider.name, company: data.rider.partnerName, lang: data.rider.language ?? "" } });
  }, [data]);

  // Old links and notifications to one delivery (…/rider?drop=<id>) open its steps.
  useEffect(() => {
    if (!params.drop || opened.current) return;
    opened.current = true;
    router.push({ pathname: "/rider/job", params: { id: String(params.drop) } });
  }, [params.drop]);

  async function act(key: string, work: () => Promise<unknown>, after?: () => void) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      await work();
      await rider.reload();
      after?.();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t.tryAgain);
    } finally {
      setBusy(null);
    }
  }

  const runs = data?.runs ?? [];
  // Read on every render: "Take this job" adds to it just before the job's steps open.
  const taken = takenJobs();
  const active = activeJob<RiderDrop, RiderRun>(runs, taken);
  const offer = waitingOffer<RiderDrop, RiderRun>(runs, taken);
  const company = data?.rider.partnerName ?? "";
  const linkDead = Boolean(rider.error && !data && /link/i.test(rider.error));

  function openJob(id: string) {
    setOfferOpen(false);
    router.push({ pathname: "/rider/job", params: { id } });
  }

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46 }}>
      <RiderBadge label={initials(data?.rider.name ?? "")} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }} numberOfLines={1}>{company || t.appName}</T>
        <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={1} accessibilityRole="header">{data?.rider.name ?? t.appName}</T>
      </View>
      <HelpButton />
    </View>
  );

  return (
    <TabScreen header={header} refreshing={rider.refreshing} onRefresh={() => void rider.refresh()}>
      {rider.loading && !data ? <LoadingBlock label={t.loading} /> : null}
      {rider.error && !data ? (
        <ErrorState
          message={rider.error}
          onRetry={linkDead ? undefined : () => void rider.reload()}
          web={linkDead ? { label: t.newLink, onPress: () => { forgetRiderToken(); router.replace("/rider/link"); } } : undefined}
        />
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {note ? <Notice tone="success">{note}</Notice> : null}

      {data ? (
        <>
          <PushPromptCard who="rider" when />

          {/* The map (210px, only the rider's own spot, read on this phone) with the online switch on it. */}
          <RiderMap me={here} height={210} label={say("map.me")}>
            <View style={{ ...MAP_OVERLAY, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingVertical: 12, paddingHorizontal: 14, minHeight: 64, flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="bold" style={{ fontSize: 16 }}>{data.rider.online ? t.online : t.offline}</T>
                <T style={{ fontSize: 13, color: colors.inkSoft }} numberOfLines={2}>{data.rider.online ? say("onlineSub", { company }) : say("offlineSub")}</T>
              </View>
              <Toggle on={data.rider.online} label={data.rider.online ? t.online : t.offline} onChange={(on) => { if (busy !== "online") void act("online", () => riderAction({ action: "online", online: on })); }} />
            </View>
          </RiderMap>

          {location.state === "ask" ? (
            <Banner title={t.locAskT} tone="mint" icon="pin">
              <View style={{ gap: 10 }}>
                <T style={{ fontSize: 14, lineHeight: 20, color: colors.ink }}>{t.locAsk}</T>
                <PillButton title={t.locYes} tone="forest" size="md" onPress={() => void location.allow()} />
                <Pressable accessibilityRole="button" onPress={location.notNow} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
                  <T weight="bold" style={{ fontSize: 15, color: colors.inkSoft }}>{t.locNo}</T>
                </Pressable>
              </View>
            </Banner>
          ) : location.state === "denied" || location.state === "unavailable" ? (
            <Pressable accessibilityRole="button" onPress={location.openSettings} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
              <AppIcon name="pin" size={18} color={colors.inkSoft} />
              <T style={{ flex: 1, fontSize: 14, color: colors.inkSoft, lineHeight: 20 }}>{t.locOff} <T weight="bold" style={{ fontSize: 14, color: colors.ink }}>{t.locSettings}</T></T>
            </Pressable>
          ) : null}

          {offer ? (
            // New job from the company (dark teal card) → the sheet with "Take this job" / "Skip".
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${say("offer.new")}. ${routeLine(offer.run, offer.drop)}`}
              onPress={() => setOfferOpen(true)}
              style={({ pressed }) => ({ backgroundColor: colors.forestFill, borderRadius: 24, padding: 20, gap: 10, opacity: pressed ? 0.92 : 1 })}
            >
              <Small style={{ color: "#BFE6DD" }}>{offer.run.pickupWindow ? `${say("offer.new")} · ${offer.run.pickupWindow}` : say("offer.new")}</Small>
              <CardTitle color="#FFFFFF">{routeLine(offer.run, offer.drop)}</CardTitle>
              <Small style={{ color: "#BFE6DD" }}>
                {offer.drop.collect > 0
                  ? say("offer.earnCollect", { earn: naira(offer.drop.fee ?? offer.run.fees), cash: naira(offer.drop.collect) })
                  : say("youEarn", { amount: naira(offer.drop.fee ?? offer.run.fees) })}
              </Small>
              <View style={{ alignSelf: "flex-start", marginTop: 6, minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: colors.accent, justifyContent: "center" }}>
                <T weight="bold" style={{ fontSize: 15, color: colors.onAccent }}>{say("offer.see")}</T>
              </View>
            </Pressable>
          ) : null}

          {active ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => openJob(active.drop.id)}
              style={({ pressed }) => ({ backgroundColor: colors.mintTint, borderRadius: 24, padding: 20, gap: 8, opacity: pressed ? 0.9 : 1 })}
            >
              <Small style={{ color: colors.forest }}>{say("active.eyebrow")}</Small>
              <T weight="extrabold" style={{ fontSize: 20 }}>{routeLine(active.run, active.drop)}</T>
              <Small>{say("active.tap")}</Small>
            </Pressable>
          ) : null}

          {!offer && !active && data.rider.online ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
              <Sub>{say("idle")}</Sub>
            </View>
          ) : null}

          {data.cashInHand > 0 ? <Banner title={`${t.cashWithYou}: ${naira(data.cashInHand)}`} icon="wallet">{t.cashWithYouHint}</Banner> : null}

          <List>
            <Row lead={<Tile icon="check" tone="ok" />} title={say("doneToday", { count: data.dropsDone })} sub={say("niceWork")} />
            {/* The one number: earned this week, and who pays it (the rider's company sets the pay day). No cash cap. */}
            <Row lead={<Tile icon="coin" tone="ok" />} title={say("earn.weekLine", { amount: naira(data.week?.total ?? 0) })} sub={say("earn.paidBy", { company })} onPress={() => router.navigate("/rider/earnings")} />
          </List>
        </>
      ) : null}

      {offer ? (
        <Sheet visible={offerOpen} onClose={() => setOfferOpen(false)} title={routeLine(offer.run, offer.drop)}>
          {error ? <Notice>{error}</Notice> : null}
          <List>
            <Row lead={<Tile icon="coin" tone="ok" />} title={say("youEarn", { amount: naira(offer.drop.fee ?? offer.run.fees) })} />
            {offer.drop.collect > 0 ? <Row lead={<Tile icon="wallet" tone="warn" />} title={say("collectCash", { amount: naira(offer.drop.collect) })} sub={say("payOnDelivery")} /> : null}
            <Row
              lead={<Tile icon="clock" tone="gray" />}
              title={offer.run.pickupWindow ?? say("pickupAt", { name: offer.run.pickupName })}
              sub={offer.run.pickupKm != null ? say("kmAway", { km: offer.run.pickupKm }) : offer.run.pickupAddress}
            />
          </List>
          <Small>{say("offer.assigned", { company })}</Small>
          <PillButton tone="forest" onPress={() => { markJobTaken(offer.drop.id); openJob(offer.drop.id); }} icon="check" title={say("startJob")} />
          <PillButton
            tone="white"
            title={say("skip")}
            busy={busy === "skip"}
            onPress={() => {
              const id = offer.drop.id;
              void act("skip", () => riderAction({ action: "skip", jobId: id }), () => {
                setOfferOpen(false);
                setNote(say("skipped", { company }));
              });
            }}
          />
        </Sheet>
      ) : null}
    </TabScreen>
  );
}
