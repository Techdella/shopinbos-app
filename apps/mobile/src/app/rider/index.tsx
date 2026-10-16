import { useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { naira } from "@shared/onboarding";
import { AppIcon, type AppIconName } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { ChoiceSheet } from "@/components/partner";
import { Field, Notice, T } from "@/components/ui";
import { fetchRider, forgetRiderToken, riderAction, riderToken, uploadRiderProof, type RiderDrop, type RiderRun } from "@/lib/rider";
import { useRiderLocation } from "@/lib/rider-location";
import { RIDER_LANGS, RIDER_REASONS_EN, useRiderStrings } from "@/lib/rider-strings";
import { useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";
import { PushPromptCard } from "@/components/PushPromptCard";

// Shopinbos Riders (spec 8A, "Simple supplier, delivery and rider apps"): no tabs, one screen at a time with very
// large buttons. Home: language, Online switch, earned today and cash with you, and the next delivery
// ("Take this delivery"). Then: Go to the shop ("I have the parcel") → Take it to the customer ("I'm with the
// customer") → the customer's 4-digit delivery code on a big keypad → "I collected it" when there's cash → "Delivered".
// Every word comes from lib/rider-strings.ts (the m_rider catalog, in the app language).

type Step = "home" | "pickup" | "dropoff" | "code" | "cash" | "done";

function BigButton({ title, onPress, busy, tone = "ink", disabled }: { title: string; onPress: () => void; busy?: boolean; tone?: "ink" | "forest" | "accent"; disabled?: boolean }) {
  const bg = tone === "forest" ? colors.forest : tone === "accent" ? colors.accent : colors.ink;
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(busy) }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 64, borderRadius: radii.pill, backgroundColor: bg, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, opacity: off ? 0.55 : pressed ? 0.85 : 1 })}
    >
      <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 20 }}>{busy ? "…" : title}</T>
    </Pressable>
  );
}

function SmallAction({ icon, label, onPress }: { icon: AppIconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 52, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: pressed ? 0.8 : 1 })}>
      <AppIcon name={icon} size={18} />
      <T weight="bold" style={{ fontSize: 16 }}>{label}</T>
    </Pressable>
  );
}

const mapUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
const firstName = (name: string | null) => (name ? name.split(" ")[0] : null);

export default function RiderApp() {
  const params = useLocalSearchParams<{ drop?: string }>();
  const [token] = useState(riderToken);
  const rider = useLoad(fetchRider);
  const { lang, setLang, t } = useRiderStrings();
  const common = useT("common");
  const [step, setStep] = useState<Step>(params.drop ? "dropoff" : "home");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pay, setPay] = useState<"cash" | "transfer">("cash");
  const [otherAmount, setOtherAmount] = useState<string | null>(null);
  const [failing, setFailing] = useState(false);
  const [photoDone, setPhotoDone] = useState(false);
  const [last, setLast] = useState<{ earned: number; cash: number } | null>(null);
  const data = rider.data;
  // Location only while online or carrying a delivery, and only with the rider's yes (lib/rider-location.ts).
  const location = useRiderLocation(Boolean(token && data && (data.rider.online || data.runs.length > 0)));

  if (!token) return <Redirect href="/rider/link" />;

  const runs = data?.runs ?? [];
  const drops = runs.flatMap((run) => run.drops.map((drop) => ({ run, drop })));
  // The delivery in hand comes first (picked up / on the way), then the next one waiting to be taken.
  const focus =
    (params.drop ? drops.find((item) => item.drop.id === params.drop) : undefined) ??
    drops.find((item) => item.drop.status === "picked_up" || item.drop.status === "in_transit") ??
    drops.find((item) => item.drop.status === "confirmed");
  const run: RiderRun | undefined = focus?.run;
  const drop: RiderDrop | undefined = focus?.drop;
  const carrying = drop ? drop.status === "picked_up" || drop.status === "in_transit" : false;
  const who = firstName(drop?.buyerName ?? null) ?? t.customer;

  function reset(next: Step) {
    setError(null);
    setStep(next);
  }

  async function act(key: string, work: () => Promise<unknown>, after?: () => void) {
    setBusy(key);
    setError(null);
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

  function pickedUp() {
    if (!run) return;
    const waiting = run.drops.filter((item) => item.status === "confirmed").map((item) => item.id);
    if (!waiting.length) return reset("dropoff");
    void act("pickup", () => riderAction({ action: "start_run", jobIds: waiting }), () => reset("dropoff"));
  }

  function deliver() {
    if (!drop) return;
    if (code.length !== 4) return setError(t.typeAll4);
    let collected: number | null = null;
    if (drop.collect > 0) {
      collected = otherAmount === null ? drop.collect : Number(otherAmount.replace(/[,₦\s]/g, ""));
      if (!Number.isFinite(collected) || collected < 0 || (otherAmount !== null && !otherAmount.trim())) return setError(t.typeAmount);
    }
    const earnedBefore = data?.earnedToday ?? 0;
    setBusy("deliver");
    setError(null);
    riderAction({ action: "delivered", jobId: drop.id, code, codCollected: collected, codMethod: drop.collect > 0 ? pay : null })
      .then(async () => {
        const next = await fetchRider().catch(() => null);
        if (next) rider.setData(next);
        setLast({ earned: Math.max(0, (next?.earnedToday ?? earnedBefore) - earnedBefore), cash: next?.cashInHand ?? 0 });
        setCode("");
        setOtherAmount(null);
        setPhotoDone(false);
        reset("done");
      })
      .catch((deliverError: unknown) => {
        const message = deliverError instanceof Error ? deliverError.message : t.tryAgain;
        setCode("");
        setStep("code");
        setError(message);
      })
      .finally(() => setBusy(null));
  }

  async function addPhoto() {
    if (!drop) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return setError(t.cameraOff);
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (result.canceled) return;
    const asset = result.assets[0];
    await act("photo", () => uploadRiderProof(drop.id, { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName }), () => setPhotoDone(true));
  }

  function leave() {
    Alert.alert(t.removeTitle, t.removeBody, [
      { text: t.keep, style: "cancel" },
      { text: t.remove, style: "destructive", onPress: () => { forgetRiderToken(); router.replace("/welcome"); } },
    ]);
  }

  const linkDead = rider.error && !data && /link/i.test(rider.error);
  const onStep = step !== "home" && step !== "done" && drop;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, flexGrow: 1 }} refreshControl={step === "home" ? <RefreshControl refreshing={rider.refreshing} onRefresh={() => void rider.refresh()} /> : undefined} keyboardShouldPersistTaps="handled">
        {onStep ? (
          <Pressable accessibilityRole="button" onPress={() => reset(step === "pickup" ? "home" : step === "dropoff" ? (carrying ? "home" : "pickup") : step === "code" ? "dropoff" : "code")} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <AppIcon name="chevron" size={18} color={colors.inkSoft} />
            </View>
            <T weight="bold" style={{ fontSize: 16, color: colors.inkSoft }}>{t.back}</T>
          </Pressable>
        ) : null}

        {step === "home" || (!drop && step !== "done") ? (
          <>
            <PushPromptCard who="rider" when={Boolean(data)} />
            <View>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t.appName}{data ? ` · ${data.rider.partnerName}` : ""}</T>
              <T weight="extrabold" style={{ fontSize: 22 }} numberOfLines={1} accessibilityRole="header">{data?.rider.name ?? t.appName}</T>
            </View>
            {/* Five languages: one tap each, wrapping onto a second line on small phones. */}
            <View accessibilityRole="radiogroup" accessibilityLabel={t.language} style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {RIDER_LANGS.map((item) => (
                <Pressable key={item.code} accessibilityRole="radio" accessibilityState={{ selected: lang === item.code }} onPress={() => setLang(item.code)} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: radii.pill, justifyContent: "center", borderWidth: 1, borderColor: lang === item.code ? colors.ink : colors.line, backgroundColor: lang === item.code ? colors.ink : colors.surface }}>
                  <T weight="bold" style={{ fontSize: 15, color: lang === item.code ? "#FFFFFF" : colors.ink }}>{item.label}</T>
                </Pressable>
              ))}
            </View>

            {rider.loading && !data ? <LoadingBlock label={t.loading} /> : null}
            {rider.error && !data ? (
              <ErrorState message={rider.error} onRetry={linkDead ? undefined : () => void rider.reload()} web={linkDead ? { label: t.newLink, onPress: () => { forgetRiderToken(); router.replace("/rider/link"); } } : undefined} />
            ) : null}
            {error ? <Notice>{error}</Notice> : null}

            {data ? (
              <>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: data.rider.online, busy: busy === "online" }}
                  accessibilityLabel={data.rider.online ? t.online : t.offline}
                  disabled={busy === "online"}
                  onPress={() => void act("online", () => riderAction({ action: "online", online: !data.rider.online }))}
                  style={{ minHeight: 88, borderRadius: radii.card, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: data.rider.online ? colors.successTint : colors.surface, borderWidth: 1, borderColor: data.rider.online ? colors.success : colors.line }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <T weight="extrabold" style={{ fontSize: 22, color: data.rider.online ? colors.success : colors.ink }}>{data.rider.online ? t.online : t.offline}</T>
                    <T style={{ color: colors.inkSoft, fontSize: 15 }}>{data.rider.online ? t.onlineHint : t.offlineHint}</T>
                  </View>
                  <View style={{ width: 64, height: 38, borderRadius: 19, backgroundColor: data.rider.online ? colors.success : colors.toggleOff, justifyContent: "center" }}>
                    <View style={{ position: "absolute", left: data.rider.online ? 30 : 4, width: 30, height: 30, borderRadius: 15, backgroundColor: "#FFFFFF" }} />
                  </View>
                </Pressable>

                {location.state === "ask" ? (
                  <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 10, borderWidth: 1, borderColor: colors.line }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <AppIcon name="pin" size={22} />
                      <T weight="extrabold" style={{ fontSize: 18, flex: 1 }}>{t.locAskT}</T>
                    </View>
                    <T style={{ fontSize: 16, lineHeight: 23 }}>{t.locAsk}</T>
                    <BigButton title={t.locYes} tone="forest" onPress={() => void location.allow()} />
                    <Pressable accessibilityRole="button" onPress={location.notNow} style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
                      <T weight="bold" style={{ fontSize: 16, color: colors.inkSoft }}>{t.locNo}</T>
                    </Pressable>
                  </View>
                ) : location.state === "denied" || location.state === "unavailable" ? (
                  <Pressable accessibilityRole="button" onPress={location.openSettings} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 }}>
                    <AppIcon name="pin" size={18} color={colors.inkSoft} />
                    <T style={{ flex: 1, fontSize: 15, color: colors.inkSoft, lineHeight: 21 }}>{t.locOff} <T weight="bold" style={{ fontSize: 15, color: colors.ink }}>{t.locSettings}</T></T>
                  </Pressable>
                ) : location.state === "on" ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppIcon name="pin" size={16} color={colors.success} />
                    <T style={{ fontSize: 15, color: colors.inkSoft }}>{t.locOn}</T>
                  </View>
                ) : null}

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 4 }}>
                    <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t.earnedToday}</T>
                    <T weight="extrabold" style={{ fontSize: 26 }}>{naira(data.earnedToday)}</T>
                  </View>
                  <View style={{ flex: 1, backgroundColor: data.cashInHand > 0 ? "#FDF0D5" : colors.surface, borderRadius: radii.card, padding: 16, gap: 4 }}>
                    <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t.cashWithYou}</T>
                    <T weight="extrabold" style={{ fontSize: 26 }}>{naira(data.cashInHand)}</T>
                    {data.cashInHand > 0 ? <T style={{ color: "#6B4A00", fontSize: 14 }}>{t.cashWithYouHint}</T> : null}
                  </View>
                </View>

                {drop && run ? (
                  <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 10 }}>
                    <T weight="bold" style={{ color: colors.accentInk, fontSize: 15 }}>{carrying ? t.carrying : t.newJob}</T>
                    <T weight="extrabold" style={{ fontSize: 20 }}>{run.pickupName}</T>
                    <T style={{ fontSize: 16, color: colors.inkSoft }}>{run.pickupAddress} → {drop.area}</T>
                    {run.pickupWindow ? <T weight="extrabold" style={{ fontSize: 17, color: colors.accentInk }}>{run.pickupWindow}</T> : null}
                    <T weight="extrabold" style={{ fontSize: 18 }}>{t.forYou({ amount: naira(run.fees) })}</T>
                    {drop.collect > 0 ? <T weight="bold" style={{ fontSize: 16, color: "#8A5A00" }}>{t.collect({ amount: naira(drop.collect) })}</T> : null}
                    {run.drops.length > 1 ? <T style={{ fontSize: 15, color: colors.inkSoft }}>{t.parcels({ count: run.drops.length })}</T> : null}
                    <View style={{ marginTop: 6 }}>
                      <BigButton title={carrying ? t.continueJob : t.accept} tone="accent" onPress={() => reset(carrying ? "dropoff" : "pickup")} />
                    </View>
                  </View>
                ) : (
                  <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 20, gap: 6, alignItems: "center" }}>
                    <AppIcon name="truck" size={28} color={colors.inkSoft} />
                    <T weight="extrabold" style={{ fontSize: 18 }}>{t.noJobs}</T>
                    <T style={{ fontSize: 15, color: colors.inkSoft, textAlign: "center", lineHeight: 21 }}>{data.rider.online ? t.noJobsOnline : t.noJobsOffline}</T>
                  </View>
                )}

                {data.rider.partnerPhone ? <SmallAction icon="phone" label={t.callCompany({ name: data.rider.partnerName })} onPress={() => void Linking.openURL(`tel:${data.rider.partnerPhone}`)} /> : null}
              </>
            ) : null}
            <Pressable accessibilityRole="button" onPress={leave} style={{ minHeight: 48, justifyContent: "center", alignItems: "center", marginTop: "auto" }}>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t.removeLink}</T>
            </Pressable>
          </>
        ) : null}

        {step === "pickup" && drop && run ? (
          <View style={{ flex: 1, gap: 14 }}>
            <T weight="extrabold" style={{ fontSize: 28 }} accessibilityRole="header">{t.pickupT}</T>
            <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 6 }}>
              <T weight="extrabold" style={{ fontSize: 20 }}>{run.pickupName}</T>
              <T style={{ fontSize: 17, lineHeight: 24 }} selectable>{run.pickupAddress}</T>
              {run.pickupWindow ? <T weight="extrabold" style={{ fontSize: 17, color: colors.accentInk }}>{run.pickupWindow}</T> : null}
              <T style={{ fontSize: 15, color: colors.inkSoft }}>{run.drops.length > 1 ? t.parcels({ count: run.drops.length }) : drop.item}</T>
            </View>
            <SmallAction icon="pin" label={t.openMap} onPress={() => void Linking.openURL(run.pickupMapUrl ?? mapUrl(run.pickupAddress))} />
            {error ? <Notice>{error}</Notice> : null}
            <View style={{ marginTop: "auto" }}>
              <BigButton title={t.have} busy={busy === "pickup"} onPress={pickedUp} />
            </View>
          </View>
        ) : null}

        {step === "dropoff" && drop ? (
          <View style={{ flex: 1, gap: 14 }}>
            <T weight="extrabold" style={{ fontSize: 28 }} accessibilityRole="header">{t.dropT({ name: who })}</T>
            <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 6 }}>
              {drop.buyerName ? <T weight="extrabold" style={{ fontSize: 20 }}>{drop.buyerName}</T> : null}
              <T style={{ fontSize: 17, lineHeight: 24 }} selectable>{drop.address}</T>
              {drop.collect > 0 ? <T weight="bold" style={{ fontSize: 17, color: "#8A5A00" }}>{t.collect({ amount: naira(drop.collect) })}</T> : null}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <SmallAction icon="pin" label={t.openMap} onPress={() => void Linking.openURL(drop.mapUrl ?? mapUrl(drop.address))} />
              {drop.buyerPhone ? <SmallAction icon="phone" label={t.call} onPress={() => void Linking.openURL(`tel:${drop.buyerPhone}`)} /> : null}
            </View>
            {drop.buyerPhone ? <SmallAction icon="chat" label={t.whatsapp} onPress={() => void Linking.openURL(`https://wa.me/${drop.buyerPhone!.replace(/\D/g, "")}`)} /> : null}
            {error ? <Notice>{error}</Notice> : null}
            <View style={{ marginTop: "auto", gap: 10 }}>
              <BigButton title={t.with} onPress={() => { setCode(""); reset("code"); }} />
              <Pressable accessibilityRole="button" onPress={() => setFailing(true)} style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
                <T weight="bold" style={{ fontSize: 16, color: colors.danger }}>{t.cantDeliver}</T>
              </Pressable>
            </View>
          </View>
        ) : null}

        {step === "code" && drop ? (
          <View style={{ flex: 1, gap: 14 }}>
            <T weight="extrabold" style={{ fontSize: 26 }} accessibilityRole="header">{t.codeT({ name: who })}</T>
            <T style={{ fontSize: 15, color: colors.inkSoft }}>{t.codeHint}</T>
            <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }} accessibilityLabel={t.codeProgress({ count: code.length })}>
              {[0, 1, 2, 3].map((index) => (
                <View key={index} style={{ width: 62, height: 72, borderRadius: 16, borderWidth: 2, borderColor: code.length === index ? colors.ink : colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                  <T weight="extrabold" style={{ fontSize: 32 }}>{code.charAt(index)}</T>
                </View>
              ))}
            </View>
            {error ? <Notice>{error}</Notice> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((key, index) =>
                key === "" ? (
                  <View key={`blank-${index}`} style={{ width: "30%", height: 64 }} />
                ) : (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={key === "⌫" ? common("delete") : key}
                    onPress={() => { setError(null); setCode((current) => (key === "⌫" ? current.slice(0, -1) : current.length < 4 ? current + key : current)); }}
                    style={({ pressed }) => ({ width: "30%", height: 64, borderRadius: 18, backgroundColor: pressed ? colors.line : colors.surface, alignItems: "center", justifyContent: "center" })}
                  >
                    <T weight="extrabold" style={{ fontSize: 28 }}>{key}</T>
                  </Pressable>
                ),
              )}
            </View>
            <Pressable accessibilityRole="button" onPress={() => void addPhoto()} disabled={busy === "photo" || photoDone} style={{ minHeight: 48, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name={photoDone ? "check" : "camera"} size={18} color={colors.inkSoft} />
              <T weight="bold" style={{ fontSize: 15, color: colors.inkSoft }}>{photoDone ? t.photoDone : t.photo}</T>
            </Pressable>
            <View style={{ marginTop: "auto" }}>
              {drop.collect > 0 ? (
                <BigButton title={t.next} disabled={code.length !== 4} onPress={() => reset("cash")} />
              ) : (
                <BigButton title={t.delivered} tone="forest" disabled={code.length !== 4} busy={busy === "deliver"} onPress={deliver} />
              )}
            </View>
          </View>
        ) : null}

        {step === "cash" && drop ? (
          <View style={{ flex: 1, gap: 14 }}>
            <T weight="extrabold" style={{ fontSize: 28 }} accessibilityRole="header">{t.cashT({ amount: naira(drop.collect) })}</T>
            <T style={{ fontSize: 16, color: colors.inkSoft, lineHeight: 23 }}>{t.cashHint}</T>
            <View style={{ gap: 10 }}>
              {(["cash", "transfer"] as const).map((value) => (
                <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: pay === value }} onPress={() => setPay(value)} style={{ minHeight: 60, borderRadius: radii.card, paddingHorizontal: 18, justifyContent: "center", backgroundColor: pay === value ? colors.ink : colors.surface, borderWidth: 1, borderColor: pay === value ? colors.ink : colors.line }}>
                  <T weight="extrabold" style={{ fontSize: 18, color: pay === value ? "#FFFFFF" : colors.ink }}>{value === "cash" ? t.paidCash : t.paidTransfer}</T>
                </Pressable>
              ))}
            </View>
            {otherAmount === null ? (
              <Pressable accessibilityRole="button" onPress={() => setOtherAmount("")} style={{ minHeight: 48, justifyContent: "center" }}>
                <T weight="bold" style={{ fontSize: 15, color: colors.inkSoft }}>{t.otherAmount}</T>
              </Pressable>
            ) : (
              <Field value={otherAmount} onChangeText={setOtherAmount} keyboardType="decimal-pad" placeholder={String(drop.collect)} accessibilityLabel={t.otherAmount} style={{ fontSize: 22, height: 60 }} />
            )}
            {error ? <Notice>{error}</Notice> : null}
            <View style={{ marginTop: "auto" }}>
              <BigButton title={t.got} tone="forest" busy={busy === "deliver"} onPress={deliver} />
            </View>
          </View>
        ) : null}

        {step === "done" ? (
          <View style={{ flex: 1, gap: 14, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="check" size={44} color="#FFFFFF" />
            </View>
            <T weight="extrabold" style={{ fontSize: 30 }} accessibilityRole="header">{t.doneT}</T>
            <T style={{ fontSize: 17, textAlign: "center", lineHeight: 24 }}>
              {last && last.earned > 0 ? `${naira(last.earned)} · ${t.doneEarned}` : t.doneEarned}
              {last && last.cash > 0 ? ` ${t.doneCash({ amount: naira(last.cash) })}` : ""}
            </T>
            <View style={{ alignSelf: "stretch", marginTop: 12 }}>
              <BigButton title={t.findNext} onPress={() => { router.setParams({ drop: undefined }); reset("home"); }} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <ChoiceSheet
        visible={failing}
        title={t.whyNot}
        options={t.reasons.map((reason, index) => ({ value: String(index), label: reason }))}
        onPick={(value) => {
          setFailing(false);
          // The company and the shop read the reason in English, whatever language the rider uses.
          const reason = RIDER_REASONS_EN[Number(value)] ?? RIDER_REASONS_EN[0];
          if (drop) void act("fail", () => riderAction({ action: "failed", jobId: drop.id, reason }), () => reset("home"));
        }}
        onClose={() => setFailing(false)}
      />
    </SafeAreaView>
  );
}
