import { useCallback, useState } from "react";
import { BackHandler, Linking, ScrollView, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { naira } from "@shared/onboarding";
import { Banner, Eyebrow, Heading, Keypad, List, Row, Seg, Small, Sub, Tile, Title } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { ChoiceSheet } from "@/components/partner";
import { BigTile, Center, DoneCheck, mapUrl, TextLink } from "@/components/RiderKit";
import { RiderMap } from "@/components/RiderMap";
import { Screen } from "@/components/Screen";
import { Field, Notice, PillButton, T } from "@/components/ui";
import { MiniStat } from "@/components/visual";
import { ApiError } from "@/lib/api";
import { fetchRider, riderAction, uploadRiderProof, type RiderDrop, type RiderRun } from "@/lib/rider";
import { useOwnPosition } from "@/lib/rider-location";
import { firstName, isCarrying, pickupJobIds, routeLine } from "@/lib/rider-pure";
import { RIDER_HELP_EN, RIDER_HELP_KEYS, RIDER_REASONS_EN, useRiderStrings } from "@/lib/rider-strings";
import { useLoad } from "@/lib/useLoad";
import QRCode from "react-native-qrcode-svg";
import { PAY_AT_DOOR_WAIT_MINUTES } from "@shared/pay-at-door";
import { colors } from "@/theme";
import { useT } from "@/lib/i18n";

// Riders app, one job's steps (E2E-Rider pickup → pcode → dropoff → dcode → cash → rdone, and "problem"):
//   Step 1 Pick up: Call, Open in maps, "I'm there, enter code" → the shop's 4-digit pickup code on the keypad →
//   "Got the parcel" (the server checks the code and moves the job to picked up; older jobs without a code: "I have
//   the parcel"). Step 2 Drop off → the customer's code on the keypad (checked first) → pay on delivery: "I've got
//   the money", then "Parcel handed over" → Delivered. No code from the customer: "No code? Use a photo" takes a
//   proof-of-delivery photo and who received it, which the server accepts instead of the code (riderProofInstead in
//   src/lib/logistics/job-rules.ts). "Something wrong?" (on every step, the code step too) tells the company without
//   failing the job; "I can't deliver it at all" is still there for the real failures.
//   Pay on delivery (shared/pay-at-door.ts) has no cash step: at the drop-off the customer pays in the app (the link we
//   texted them, or the QR code here) and gets the code; no code, no drop, and no photo instead. Only older jobs that
//   still carry a cash amount use the cash step.
//   The sealed-parcel photos (shared/fault-matrix.ts: they decide most disputes): a shop's or supplier's parcel is
//   photographed sealed at pickup before "Got the parcel" (pphoto), and every drop is photographed as it's handed over
//   (hphoto) before "Parcel handed over". The server refuses both steps without them.

type Step = "pickup" | "pphoto" | "pcode" | "dropoff" | "dcode" | "hphoto" | "cash" | "done" | "help";
type CodeState = "idle" | "checking" | "ok" | "bad";

export default function RiderJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = String(id ?? "");
  const rider = useLoad(fetchRider);
  const { t, say } = useRiderStrings();
  const f = useT("m_faults");
  const [step, setStep] = useState<Step | null>(null);
  const [helpFrom, setHelpFrom] = useState<Step>("pickup");
  const [helpSent, setHelpSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pcode, setPcode] = useState("");
  const [pstate, setPstate] = useState<CodeState>("idle");
  const [dcode, setDcode] = useState("");
  const [dstate, setDstate] = useState<CodeState>("idle");
  const [pay, setPay] = useState<"cash" | "transfer">("cash");
  const [otherAmount, setOtherAmount] = useState<string | null>(null);
  const [got, setGot] = useState(false);
  const [photoDone, setPhotoDone] = useState(false);
  const [pickupPhoto, setPickupPhoto] = useState(false);
  // After the pickup photo: the shop's code, or straight to "Got the parcel" for jobs without one.
  const [afterPickupPhoto, setAfterPickupPhoto] = useState<"pcode" | "direct">("pcode");
  // No code from the customer: a proof photo plus who received it instead.
  const [noCode, setNoCode] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [failing, setFailing] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [last, setLast] = useState<{ earned: number; cash: number } | null>(null);
  // The job as last seen: once delivered it leaves the list, but "Delivered" still needs its amounts.
  const [held, setHeld] = useState<{ run: RiderRun; drop: RiderDrop } | null>(null);

  const here = useOwnPosition();
  const data = rider.data;
  const company = data?.rider.partnerName ?? "";
  const found = findDrop(data?.runs ?? [], jobId);
  // Keep the latest copy (adjusting state while rendering, guarded so it settles at once).
  if (found && (found.run !== held?.run || found.drop !== held?.drop)) {
    setHeld(found);
    if (!step) {
      setStep(isCarrying(found.drop.status) ? "dropoff" : "pickup");
      setPhotoDone(found.drop.hasProof);
      setPickupPhoto(Boolean(found.drop.hasPickupPhoto));
    }
  }

  const run = held?.run;
  const drop = held?.drop;
  const who = firstName(drop?.buyerName) ?? t.customer;

  const previous = useCallback((): Step | "exit" => {
    if (step === "pphoto") return "pickup";
    if (step === "pcode") return drop?.needsPickupPhoto ? "pphoto" : "pickup";
    if (step === "hphoto") return "dcode";
    if (step === "dropoff") return drop && isCarrying(drop.status) ? "exit" : "pickup";
    if (step === "dcode") return "dropoff";
    if (step === "cash") return "dcode";
    if (step === "help") return helpFrom;
    return "exit";
  }, [step, drop, helpFrom]);

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  const back = useCallback(() => {
    const to = previous();
    setError(null);
    if (to === "exit") {
      if (router.canGoBack()) router.back();
      else router.replace("/rider");
    } else setStep(to);
  }, [previous]);

  // Android's back button walks back through the steps before leaving the job.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (step === "done") return false;
        back();
        return true;
      });
      return () => sub.remove();
    }, [back, step]),
  );

  function toToday() {
    router.dismissTo("/rider");
  }

  async function pickUp(code: string | null) {
    if (!run || !drop) return;
    setBusy("pickup");
    setError(null);
    if (code) setPstate("checking");
    try {
      await riderAction(code ? { action: "start_run", jobIds: pickupJobIds(run, drop.id), codes: { [drop.id]: code } } : { action: "start_run", jobIds: pickupJobIds(run, drop.id) });
      if (code) setPstate("ok");
      else go("dropoff");
      void rider.reload();
    } catch (pickupError) {
      if (pickupError instanceof ApiError && pickupError.code === "WRONG_PICKUP_CODE") setPstate("bad");
      else {
        setPstate("idle");
        setError(pickupError instanceof Error ? pickupError.message : t.tryAgain);
      }
    } finally {
      setBusy(null);
    }
  }

  function typePickup(next: string) {
    setPcode(next);
    setError(null);
    if (pstate === "ok") return;
    setPstate("idle");
    if (next.length === 4) void pickUp(next);
  }

  async function checkDrop(code: string) {
    if (!drop) return;
    setDstate("checking");
    setError(null);
    try {
      await riderAction({ action: "check_code", jobId: drop.id, code });
      setDstate("ok");
    } catch (checkError) {
      if (checkError instanceof ApiError && checkError.code === "WRONG_CODE") setDstate("bad");
      else {
        setDstate("idle");
        setError(checkError instanceof Error ? checkError.message : t.tryAgain);
      }
    }
  }

  function typeDrop(next: string) {
    setDcode(next);
    setError(null);
    setDstate("idle");
    if (next.length === 4) void checkDrop(next);
  }

  /** Pay on delivery: text the customer the payment link again (3 an hour per order). */
  async function resendLink() {
    if (!drop) return;
    setBusy("pay_link");
    setError(null);
    setLinkNote(null);
    try {
      await riderAction({ action: "pay_link", jobId: drop.id });
      setLinkNote(say("pay.resent"));
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : t.tryAgain);
    } finally {
      setBusy(null);
    }
  }

  async function deliver() {
    if (!drop) return;
    let collected: number | null = null;
    if (drop.collect > 0) {
      collected = otherAmount === null ? drop.collect : Number(otherAmount.replace(/[,₦\s]/g, ""));
      if (!Number.isFinite(collected) || collected < 0 || (otherAmount !== null && !otherAmount.trim())) return setError(t.typeAmount);
    }
    const earnedBefore = data?.earnedToday ?? 0;
    setBusy("deliver");
    setError(null);
    try {
      await riderAction(
        noCode
          ? { action: "delivered", jobId: drop.id, code: "", recipientName: recipient.trim(), codCollected: collected, codMethod: drop.collect > 0 ? pay : null }
          : { action: "delivered", jobId: drop.id, code: dcode, codCollected: collected, codMethod: drop.collect > 0 ? pay : null },
      );
      const next = await fetchRider().catch(() => null);
      if (next) rider.setData(next);
      const earned = Math.max(0, (next?.earnedToday ?? earnedBefore) - earnedBefore) || drop.fee || 0;
      setLast({ earned, cash: next?.cashInHand ?? 0 });
      go("done");
    } catch (deliverError) {
      setError(deliverError instanceof Error ? deliverError.message : t.tryAgain);
      // A code that stopped matching (the shop changed something): type it again.
      if (!noCode && deliverError instanceof ApiError && /code/i.test(deliverError.message)) {
        setDcode("");
        setDstate("idle");
        setGot(false);
        setStep("dcode");
      }
    } finally {
      setBusy(null);
    }
  }

  async function addPhoto(kind: "handover" | "pickup" = "handover") {
    if (!drop) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return setError(t.cameraOff);
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setBusy("photo");
    try {
      await uploadRiderProof(drop.id, { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName, width: asset.width, height: asset.height, fileSize: asset.fileSize }, kind);
      if (kind === "pickup") setPickupPhoto(true);
      else setPhotoDone(true);
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : t.tryAgain);
    } finally {
      setBusy(null);
    }
  }

  async function askHelp(index: number) {
    if (!drop) return;
    setBusy(`help-${index}`);
    setError(null);
    try {
      // The company reads the reason in English, whatever language the rider uses.
      await riderAction({ action: "help", jobId: drop.id, reason: RIDER_HELP_EN[index] ?? RIDER_HELP_EN[0] });
      setHelpSent(true);
      setStep(helpFrom);
    } catch (helpError) {
      setError(helpError instanceof Error ? helpError.message : t.tryAgain);
    } finally {
      setBusy(null);
    }
  }

  async function fail(reason: string) {
    if (!drop) return;
    setFailing(false);
    setBusy("fail");
    setError(null);
    try {
      await riderAction({ action: "failed", jobId: drop.id, reason });
      toToday();
    } catch (failError) {
      setError(failError instanceof Error ? failError.message : t.tryAgain);
    } finally {
      setBusy(null);
    }
  }

  // Loading, a job that's gone (cancelled, given to another rider), or no link.
  if (!run || !drop || !step) {
    return (
      <Screen title={t.appName}>
        {rider.loading || (!data && !rider.error) ? <LoadingBlock label={t.loading} /> : null}
        {rider.error && !data ? <ErrorState message={rider.error} onRetry={() => void rider.reload()} /> : null}
        {data && !rider.loading ? (
          <>
            <Sub>{t.noJobs}</Sub>
            <PillButton tone="forest" title={say("done.back")} onPress={toToday} />
          </>
        ) : null}
      </Screen>
    );
  }

  const route = routeLine(run, drop);
  // The map: pickup and drop-off pins when the server could place them, and the rider's own spot from this phone.
  const pickupPin = run.pickupLat != null && run.pickupLng != null ? { lat: run.pickupLat, lng: run.pickupLng } : null;
  const dropPin = drop.dropLat != null && drop.dropLng != null ? { lat: drop.dropLat, lng: drop.dropLng } : null;
  const helpLink = <TextLink title={say("somethingWrong")} onPress={() => { setHelpFrom(step); setHelpSent(false); go("help"); }} />;
  const sentBanner = helpSent ? <Banner title={say("help.sent", { company })} tone="mint" icon="check" /> : null;
  const errorNotice = error ? <Notice>{error}</Notice> : null;

  if (step === "done") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 80 }}>
          <Center>
            <DoneCheck />
            <Title>{t.delivered}</Title>
            <Sub style={{ textAlign: "center" }}>{last && last.earned > 0 ? say("done.added", { amount: naira(last.earned) }) : t.doneEarned}</Sub>
            {/* What this drop made, big: earned, and the cash to hand over (when there was any). */}
            {last && (last.earned > 0 || last.cash > 0) ? (
              <View style={{ flexDirection: "row", gap: 12, alignSelf: "stretch", marginTop: 8 }}>
                {last.earned > 0 ? <MiniStat tone="ok" label={say("done.earned")} value={naira(last.earned)} /> : null}
                {last.cash > 0 ? <MiniStat tone="warn" label={say("done.cash")} value={naira(last.cash)} /> : null}
              </View>
            ) : null}
            {last && last.cash > 0 ? <Small style={{ textAlign: "center" }}>{t.doneCash({ amount: naira(last.cash) })}</Small> : null}
          </Center>
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10 }}>
          <PillButton tone="forest" title={say("done.back")} onPress={toToday} />
        </View>
      </SafeAreaView>
    );
  }

  if (step === "pickup") {
    return (
      <Screen
        title={route}
        onBack={back}
        footer={
          drop.hasPickupCode ? (
            <PillButton tone="forest" title={say("there")} onPress={() => { setPcode(""); setPstate("idle"); if (drop.needsPickupPhoto && !pickupPhoto) { setAfterPickupPhoto("pcode"); go("pphoto"); } else go("pcode"); }} />
          ) : (
            <PillButton tone="forest" title={t.have} busy={busy === "pickup"} onPress={() => { if (drop.needsPickupPhoto && !pickupPhoto) { setAfterPickupPhoto("direct"); go("pphoto"); } else void pickUp(null); }} />
          )
        }
      >
        <RiderMap me={here} pickup={pickupPin} drop={dropPin} address={run.pickupAddress} label={say("map.route")} />
        {sentBanner}
        <View style={{ gap: 6 }}>
          <Eyebrow>{say("step1")}</Eyebrow>
          <Title>{say("pickup.title")}</Title>
        </View>
        <List>
          <Row lead={<Tile icon="store" tone="mint" />} title={run.pickupName} sub={run.pickupWindow ? `${run.pickupAddress}\n${run.pickupWindow}` : run.pickupAddress} />
          {run.pickupPhone ? <Row lead={<Tile icon="phone" />} title={t.call} onPress={() => void Linking.openURL(`tel:${run.pickupPhone}`)} chevron={false} /> : null}
          <Row lead={<Tile icon="pin" />} title={say("openMaps")} onPress={() => void Linking.openURL(mapUrl(run.pickupAddress))} chevron={false} />
        </List>
        <Small>
          {drop.orderNumber
            ? say(drop.hasPickupCode ? "pickup.order" : "pickup.orderNoCode", { order: drop.orderNumber })
            : drop.hasPickupCode ? say("pickup.ask") : say("pickup.noCode")}
        </Small>
        {run.drops.length > 1 ? <Small>{t.parcels({ count: run.drops.length })}</Small> : null}
        {errorNotice}
        {helpLink}
      </Screen>
    );
  }

  if (step === "pphoto") {
    // The sealed parcel as the rider takes it: the photo that shows it left the shop or supplier in one piece.
    return (
      <Screen
        title={f("rider.pickupPhotoHeader")}
        onBack={back}
        footer={
          pickupPhoto ? (
            afterPickupPhoto === "pcode" ? (
              <PillButton tone="forest" icon="check" title={f("rider.next")} onPress={() => go("pcode")} />
            ) : (
              <PillButton tone="forest" icon="check" busy={busy === "pickup"} title={t.have} onPress={() => void pickUp(null)} />
            )
          ) : (
            <PillButton tone="white" disabled icon="box" title={afterPickupPhoto === "pcode" ? f("rider.next") : t.have} onPress={() => undefined} />
          )
        }
      >
        <Center top={24}>
          <BigTile icon="camera" bg={colors.mintTint} fg={colors.forest} />
          <Title style={{ textAlign: "center" }}>{f("rider.pickupPhotoTitle")}</Title>
          <Sub style={{ textAlign: "center" }}>{f("rider.pickupPhotoSub", { name: run.pickupName })}</Sub>
        </Center>
        <PillButton tone={pickupPhoto ? "white" : "forest"} busy={busy === "photo"} disabled={Boolean(busy)} icon={pickupPhoto ? "check" : "camera"} title={pickupPhoto ? f("rider.retake") : f("rider.takePhoto")} onPress={() => void addPhoto("pickup")} />
        {pickupPhoto ? <Banner title={f("rider.photoAdded")} tone="mint" icon="check" /> : null}
        {errorNotice}
        {helpLink}
      </Screen>
    );
  }

  if (step === "hphoto") {
    // Every drop: the sealed parcel as it's handed over (the server refuses "delivered" without it).
    return (
      <Screen
        title={f("rider.handoverHeader")}
        onBack={back}
        footer={photoDone ? (
          drop.collect > 0 ? (
            <PillButton tone="forest" onPress={() => { setGot(false); go("cash"); }} icon="check" title={say("codeNext")} />
          ) : (
            <PillButton tone="forest" busy={busy === "deliver"} onPress={() => void deliver()} icon="box" title={say("cash.handed")} />
          )
        ) : (
          <PillButton tone="white" disabled icon="box" title={say("cash.handed")} onPress={() => undefined} />
        )}
      >
        <Center top={24}>
          <BigTile icon="camera" bg={colors.mintTint} fg={colors.forest} />
          <Title style={{ textAlign: "center" }}>{f("rider.handoverTitle")}</Title>
          <Sub style={{ textAlign: "center" }}>{f("rider.handoverSub")}</Sub>
        </Center>
        <PillButton tone={photoDone ? "white" : "forest"} busy={busy === "photo"} disabled={Boolean(busy)} icon={photoDone ? "check" : "camera"} title={photoDone ? f("rider.retake") : f("rider.takePhoto")} onPress={() => void addPhoto("handover")} />
        {photoDone ? <Banner title={f("rider.photoAdded")} tone="mint" icon="check" /> : null}
        {errorNotice}
        {helpLink}
      </Screen>
    );
  }

  if (step === "pcode") {
    return (
      <Screen
        title={say("pcode.title")}
        onBack={back}
        footer={pstate === "ok" ? (
          <PillButton tone="forest" onPress={() => go("dropoff")} icon="check" title={say("gotParcel")} />
        ) : undefined}
      >
        <View style={{ gap: 8 }}>
          <Heading style={{ textAlign: "center" }}>{say("enterCode")}</Heading>
          <Sub style={{ textAlign: "center" }}>{say("pcode.hint", { name: run.pickupName })}</Sub>
        </View>
        <Keypad value={pcode} length={4} onChange={typePickup} />
        <CodeLine state={pstate} bad={say("codeBad")} ok={say("codeOk")} />
        {errorNotice}
      </Screen>
    );
  }

  if (step === "dropoff") {
    return (
      <Screen title={route} onBack={back} footer={<PillButton tone="forest" title={say("there")} onPress={() => { setDcode(""); setDstate("idle"); go("dcode"); }} />}>
        <RiderMap me={here} pickup={pickupPin} drop={dropPin} address={drop.address} label={say("map.route")} />
        {sentBanner}
        <View style={{ gap: 6 }}>
          <Eyebrow>{say("step2")}</Eyebrow>
          <Title>{say("drop.title")}</Title>
        </View>
        <List>
          <Row lead={<Tile icon="user" tone="mint" />} title={drop.buyerName ? say("drop.customer", { name: drop.buyerName }) : t.customer} sub={drop.address} />
          {drop.buyerPhone ? <Row lead={<Tile icon="phone" />} title={t.call} onPress={() => void Linking.openURL(`tel:${drop.buyerPhone}`)} chevron={false} /> : null}
          {drop.buyerPhone ? <Row lead={<Tile icon="whatsapp" />} title={t.whatsapp} onPress={() => void Linking.openURL(`https://wa.me/${drop.buyerPhone!.replace(/\D/g, "")}`)} chevron={false} /> : null}
          <Row lead={<Tile icon="pin" />} title={say("openMaps")} onPress={() => void Linking.openURL(mapUrl(drop.address))} chevron={false} />
        </List>
        {drop.collect > 0 ? (
          <View style={{ backgroundColor: colors.warnTint, borderRadius: 24, padding: 20, gap: 6 }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>{say("collectCash", { amount: naira(drop.collect) })}</T>
            <Sub style={{ color: colors.warnInk }}>{say("drop.payNote")}</Sub>
          </View>
        ) : null}
        {drop.payInApp ? (
          // Pay on delivery (shared/pay-at-door.ts): the customer pays in the app and gets the code. No cash.
          drop.payInApp.paid ? (
            <Banner title={say("pay.paid")} tone="mint" icon="check">{say("pay.paidSub")}</Banner>
          ) : (
            <View style={{ backgroundColor: colors.mintTint, borderRadius: 24, padding: 20, gap: 10 }}>
              <T weight="extrabold" style={{ fontSize: 16, color: colors.forest }}>{say("pay.title", { amount: naira(drop.payInApp.amount) })}</T>
              <Sub>{say("pay.body")}</Sub>
              {showQr ? (
                <View style={{ alignItems: "center", gap: 8, backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16 }}>
                  <QRCode value={drop.payInApp.url} size={220} color="#16141F" backgroundColor="#FFFFFF" />
                  <Small style={{ color: "#4A4757" }}>{say("pay.qrHint")}</Small>
                </View>
              ) : null}
              <PillButton tone="white" size="md" title={showQr ? say("pay.hideQr") : say("pay.showQr")} onPress={() => setShowQr((open) => !open)} />
              <PillButton tone="white" size="md" busy={busy === "pay_link"} title={say("pay.resend")} onPress={() => void resendLink()} />
              {linkNote ? <Small style={{ color: colors.success }}>{linkNote}</Small> : null}
              <Small>{say("pay.wait", { minutes: PAY_AT_DOOR_WAIT_MINUTES })}</Small>
            </View>
          )
        ) : null}
        {errorNotice}
        {helpLink}
      </Screen>
    );
  }

  if (step === "dcode" && noCode) {
    // No code: the photo first, then who took the parcel; then the cash step or "Parcel handed over".
    const ready = photoDone && recipient.trim().length >= 2;
    return (
      <Screen
        title={say("dcode.title")}
        onBack={back}
        footer={ready ? (
          drop.collect > 0 ? (
            <PillButton tone="forest" onPress={() => { setGot(false); go("cash"); }} icon="check" title={say("noCode.next")} />
          ) : (
            <PillButton tone="forest" busy={busy === "deliver"} onPress={() => void deliver()} icon="check" title={say("cash.handed")} />
          )
        ) : undefined}
      >
        <View style={{ gap: 8 }}>
          <Heading style={{ textAlign: "center" }}>{say("noCode.title")}</Heading>
          <Sub style={{ textAlign: "center" }}>{say("noCode.sub")}</Sub>
        </View>
        <PillButton tone={photoDone ? "white" : "forest"} busy={busy === "photo"} disabled={Boolean(busy)} onPress={() => void addPhoto()} icon={photoDone ? "check" : "camera"} title={photoDone ? say("noCode.photoAgain") : say("noCode.photo")} />
        <View style={{ gap: 6 }}>
          <T weight="bold" style={{ fontSize: 14, color: colors.inkSoft }}>{say("noCode.who")}</T>
          <Field value={recipient} onChangeText={setRecipient} placeholder={drop.buyerName ?? ""} autoCapitalize="words" maxLength={80} accessibilityLabel={say("noCode.who")} style={{ height: 56, fontSize: 18 }} />
        </View>
        {errorNotice}
        <TextLink title={say("noCode.useCode")} color={colors.inkSoft} onPress={() => { setNoCode(false); setError(null); }} />
        {helpLink}
      </Screen>
    );
  }

  if (step === "dcode") {
    const ok = dstate === "ok";
    return (
      <Screen
        title={say("dcode.title")}
        onBack={back}
        footer={ok ? (
          // The handover photo comes next (every drop needs one), then the cash step or "Parcel handed over".
          !photoDone ? (
            <PillButton tone="forest" onPress={() => go("hphoto")} icon="camera" title={f("rider.next")} />
          ) : drop.collect > 0 ? (
            <PillButton tone="forest" onPress={() => { setGot(false); go("cash"); }} icon="check" title={say("codeNext")} />
          ) : (
            <PillButton tone="forest" busy={busy === "deliver"} onPress={() => void deliver()} icon="check" title={say("cash.handed")} />
          )
        ) : undefined}
      >
        <View style={{ gap: 8 }}>
          <Heading style={{ textAlign: "center" }}>{say("enterCode")}</Heading>
          <Sub style={{ textAlign: "center" }}>{drop.payInApp ? say("pay.codeHint") : say("dcode.hint")}</Sub>
        </View>
        <Keypad value={dcode} length={4} onChange={typeDrop} />
        <CodeLine state={dstate} bad={say("codeBad")} ok={say("codeOk")} />
        {errorNotice}
        {ok && photoDone ? <TextLink title={t.photoDone} color={colors.inkSoft} onPress={() => go("hphoto")} /> : null}
        {/* Pay on delivery: the code is the customer's proof of payment, so there's no photo instead. */}
        {!ok ? <TextLink title={say("noCode.link")} onPress={() => { setNoCode(true); setError(null); }} /> : null}
        {helpLink}
      </Screen>
    );
  }

  if (step === "cash") {
    return (
      <Screen
        title={say("cash.header")}
        onBack={back}
        footer={!got ? (
          <PillButton
            tone="forest"
            icon="wallet"
            title={say("cash.got")}
            onPress={() => {
              if (otherAmount !== null && !otherAmount.trim()) return setError(t.typeAmount);
              setError(null);
              setGot(true);
            }}
          />
        ) : (
          <PillButton busy={busy === "deliver"} onPress={() => void deliver()} icon="box" title={say("cash.handed")} />
        )}
      >
        <Center top={24}>
          <BigTile icon="coin" bg={colors.warnTint} fg={colors.warnInk} />
          <Title style={{ textAlign: "center" }}>{t.cashT({ amount: naira(drop.collect) })}</Title>
          <Sub style={{ textAlign: "center" }}>{say("cash.sub", { company })}</Sub>
        </Center>
        {!got ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              <Seg label={t.paidCash} on={pay === "cash"} onPress={() => setPay("cash")} />
              <Seg label={t.paidTransfer} on={pay === "transfer"} onPress={() => setPay("transfer")} />
            </View>
            {otherAmount === null ? (
              <TextLink title={t.otherAmount} color={colors.inkSoft} onPress={() => setOtherAmount("")} />
            ) : (
              <Field value={otherAmount} onChangeText={setOtherAmount} keyboardType="decimal-pad" placeholder={String(drop.collect)} accessibilityLabel={t.otherAmount} style={{ fontSize: 22, height: 60 }} />
            )}
          </>
        ) : (
          <View style={{ backgroundColor: colors.successTint, borderRadius: 24, padding: 20, gap: 6 }}>
            <T weight="extrabold" style={{ fontSize: 16, color: colors.success }}>{say("cash.received", { amount: naira(otherAmount !== null && otherAmount.trim() ? Number(otherAmount.replace(/[,₦\s]/g, "")) || 0 : drop.collect) })}</T>
            <Sub>{say("cash.handOver")}</Sub>
          </View>
        )}
        {errorNotice}
      </Screen>
    );
  }

  // "Need help?": tell the company without failing the job (they call the rider). Failing stays one tap further.
  return (
    <Screen title={say("help.title")} onBack={back}>
      <Sub>{say("help.sub", { company })}</Sub>
      {errorNotice}
      <List>
        {RIDER_HELP_KEYS.map((key, index) => (
          <Row key={key} lead={<Tile icon="help" />} title={busy === `help-${index}` ? "…" : say(key)} onPress={() => { if (!busy) void askHelp(index); }} />
        ))}
      </List>
      <List>
        <Row lead={<Tile icon="x" tone="peach" />} title={say("help.cantDeliver")} sub={say("help.cantDeliverSub", { company })} titleStyle={{ color: colors.danger }} onPress={() => setFailing(true)} />
      </List>
      <ChoiceSheet
        visible={failing}
        title={t.whyNot}
        options={t.reasons.map((reason, index) => ({ value: String(index), label: reason }))}
        // The company and the shop read the reason in English, whatever language the rider uses.
        onPick={(value) => void fail(RIDER_REASONS_EN[Number(value)] ?? RIDER_REASONS_EN[0])}
        onClose={() => setFailing(false)}
      />
    </Screen>
  );
}

/** "That code doesn't match…" in orange, or "Code is correct" in green, under the digit boxes. */
function CodeLine({ state, bad, ok }: { state: CodeState; bad: string; ok: string }) {
  if (state === "bad") return <T weight="bold" accessibilityRole="alert" style={{ fontSize: 13, textAlign: "center", color: colors.accentInk }}>{bad}</T>;
  if (state === "ok") return <T weight="bold" style={{ fontSize: 13, textAlign: "center", color: colors.success }}>{ok}</T>;
  return null;
}

function findDrop(runs: RiderRun[], jobId: string): { run: RiderRun; drop: RiderDrop } | null {
  for (const run of runs) {
    const drop = run.drops.find((item) => item.id === jobId);
    if (drop) return { run, drop };
  }
  return null;
}
