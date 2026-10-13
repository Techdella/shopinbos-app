import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { naira } from "@shared/onboarding";
import { isPeggyNight } from "@shared/mascots";
import { AppIcon, type AppIconName } from "@/components/icons";
import { HomeSkeleton, OfflineBanner, OpeningShop, SlowNetwork } from "@/components/Loading";
import { HelpButton } from "@/components/Help";
import { Mascot, Notice, T } from "@/components/ui";
import { stepWords } from "@/lib/setup-words";
import { doNextItems, peggyLine, type DoNextItem } from "@/lib/home-pure";
import { useHomeData } from "@/lib/homeData";
import { hasOpenedHome, rememberedStoreName } from "@/lib/launch";
import { useSession } from "@/lib/session";
import { fetchSetup, type SetupOverview } from "@/lib/setup";
import { openPath } from "@/lib/web";
import { colors } from "@/theme";

// Seller Home (build spec 8A, "Simple app" prototype): today's sales, at most three "Do these next" items and one
// line about Peggy. Nothing else; everything else is in My shop or the orange +.

function greeting() {
  const hour = (new Date().getUTCHours() + 1) % 24; // Lagos time
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const TASK_ICON: Record<DoNextItem["icon"], AppIconName> = { chat: "chat", mail: "mail", truck: "truck", box: "box", coin: "coin", sparkle: "sparkle" };

/** The first open on this phone shows "Opening your shop" at least this long, so it doesn't just flash. */
const OPENING_MIN_MS = 1500;

export default function Home() {
  const { session } = useSession();
  const uid = session?.user.id;
  const home = useHomeData(uid);
  const { data, error, cachedAt } = home;
  const load = home.reload;
  const [refreshing, setRefreshing] = useState(false);

  // Start here (the web's /home/start checklist). Loaded on its own so Home never waits for it; refreshed when
  // coming back from the Start here screen. Null (e.g. an error) falls back to the onboarding checklist below.
  const [setup, setSetup] = useState<SetupOverview | null>(null);
  const loadSetup = useCallback(() => fetchSetup().then(setSetup).catch(() => null), []);
  useFocusEffect(
    useCallback(() => {
      void loadSetup();
    }, [loadSetup]),
  );

  // First time this seller's Home loads on this phone → "Opening your shop"; every later open → skeleton.
  const [firstOpen] = useState(() => (uid ? !hasOpenedHome(uid) : false));
  const [storeName] = useState(() => (uid ? rememberedStoreName(uid) ?? home.cached?.data.store.name ?? null : null));
  const [openingDone, setOpeningDone] = useState(!firstOpen);
  useEffect(() => {
    if (openingDone) return;
    const timer = setTimeout(() => setOpeningDone(true), OPENING_MIN_MS);
    return () => clearTimeout(timer);
  }, [openingDone]);

  const screen: "home" | "opening" | "skeleton" | "slow" =
    data && openingDone ? "home" : home.slow && !data ? "slow" : error && !data ? "home" : firstOpen ? "opening" : data ? "home" : "skeleton";

  // The opening and slow screens are full screen: hide the tab bar while they show.
  const navigation = useNavigation();
  const fullScreen = screen === "opening" || screen === "slow";
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: fullScreen ? { display: "none" } : undefined });
  }, [navigation, fullScreen]);

  if (screen === "opening") return <OpeningShop storeName={data?.store.name ?? storeName} />;
  if (screen === "skeleton") return <HomeSkeleton />;
  if (screen === "slow") {
    return <SlowNetwork offline={home.offline} cached={home.cached} attempting={home.attempting} nextRetryAt={home.nextRetryAt} onRetry={() => void load()} onUseCached={home.showCached} />;
  }

  const firstName = data?.ownerName.split(/\s+/)[0] ?? "";
  const items = data ? doNextItems(data.tasks, setup?.checklist.showStart && !setup.checklist.complete && setup.checklist.next ? { key: setup.checklist.next.key, ...stepWords(setup.checklist.next) } : null) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([load(), loadSetup()]); setRefreshing(false); }} />}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
              <T weight="extrabold" style={{ fontSize: 18, color: colors.accentInk }}>{(firstName || "S").charAt(0)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{greeting()}</T>
              <T weight="extrabold" style={{ fontSize: 18 }} numberOfLines={1}>{firstName || " "}</T>
            </View>
            <HelpButton />
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 26, padding: 20, marginTop: 18, gap: 4 }}>
            <T style={{ color: colors.inkSoft, fontSize: 16 }}>You sold today</T>
            <T weight="extrabold" style={{ fontSize: 40, lineHeight: 46, letterSpacing: -1 }} accessibilityRole="header">{data ? naira(data.sales.today) : "…"}</T>
            {data ? <T style={{ color: colors.inkSoft, fontSize: 15 }}>{data.counts.ordersToday} order{data.counts.ordersToday === 1 ? "" : "s"} today</T> : null}
          </View>

          {cachedAt !== null && (
            <View style={{ marginTop: 14 }}>
              <OfflineBanner
                offline={home.offline}
                savedAt={cachedAt}
                action={
                  <Pressable accessibilityRole="button" accessibilityLabel="Try again now" disabled={home.attempting} onPress={() => void load()} hitSlop={8} style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "flex-end" }}>
                    <T weight="extrabold" style={{ fontSize: 15, color: "#8A5A08", textDecorationLine: "underline" }}>{home.attempting ? "Trying…" : "Try again"}</T>
                  </Pressable>
                }
              />
            </View>
          )}

          {error && <View style={{ marginTop: 14 }}><Notice>{error}</Notice></View>}

          {data && (
            <>
              <T weight="extrabold" style={{ fontSize: 20, marginTop: 22, marginBottom: 10 }} accessibilityRole="header">Do these next</T>
              {items.length ? (
                <View style={{ gap: 10 }} testID="do-next">
                  {items.map((item) => (
                    <Pressable key={item.key} accessibilityRole="button" onPress={() => void openPath(item.href)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 14, opacity: pressed ? 0.85 : 1 })}>
                      {item.image ? (
                        <Image source={{ uri: item.image }} style={{ width: 44, height: 44, borderRadius: 12 }} contentFit="cover" />
                      ) : (
                        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
                          <AppIcon name={TASK_ICON[item.icon]} size={20} color={colors.accentInk} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={2}>{item.title}</T>
                        <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={2}>{item.hint}</T>
                      </View>
                      <AppIcon name="chevron" size={18} color={colors.inkSoft} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 16 }}>
                  <T style={{ fontSize: 15, lineHeight: 22 }}>Nothing needs you right now. Tap the orange + to add a product or record a sale.</T>
                </View>
              )}

              <Pressable accessibilityRole="button" onPress={() => router.push("/peggy")} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, paddingVertical: 6 }}>
                <Mascot name="peggy" mood={isPeggyNight() ? "sleep" : "idle"} size={36} />
                <T style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>{peggyLine(data.counts)}</T>
                <T weight="bold" style={{ fontSize: 15, color: colors.forest }}>Ask Peggy</T>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
