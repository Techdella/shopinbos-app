import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { naira } from "@shared/onboarding";
import { isPeggyNight } from "@shared/mascots";
import { DarkCard, Eyebrow, List, Row, Tile, type TileTone } from "@/components/design";
import type { AppIconName } from "@/components/icons";
import { HomeSkeleton, OfflineBanner, OpeningShop, SlowNetwork } from "@/components/Loading";
import { Picture } from "@/components/kit";
import { HelpButton } from "@/components/Help";
import { IconButton, Thumb } from "@/components/seller/bits";
import { TabScreen } from "@/components/TabScreen";
import { Mascot, Notice, T } from "@/components/ui";
import { stepWords } from "@/lib/setup-words";
import { doNextItems, peggyLine, type DoNextItem } from "@/lib/home-pure";
import { useHomeData } from "@/lib/homeData";
import { latestPicture, useChangedIdentity } from "@/lib/identity";
import { hasOpenedHome, rememberedStoreName } from "@/lib/launch";
import { useSession } from "@/lib/session";
import { fetchSetup, type SetupOverview } from "@/lib/setup";
import { fetchDeliveryHub, type DeliveryHub } from "@/lib/delivery";
import { upcomingPayout } from "@/lib/delivery-pure";
import { capitalise, friendlyDay } from "@/lib/friendly";
import { shareShop } from "@/lib/share";
import { fetchWallet } from "@/lib/wallet";
import { openPath } from "@/lib/web";
import { colors } from "@/theme";
import { PushPromptCard } from "@/components/PushPromptCard";
import { NotificationBellButton } from "@/components/NotificationBellButton";
import { CampaignsCard } from "@/components/CampaignsCard";
import { useT } from "@/lib/i18n";

// Seller Home ("Seller app" prototype `on.home`): the seller's photo and greeting with the shop name and Share; a
// dark "Sales today" card (money on its way to the bank, taps through to Money); ONE "To do" card (deliveries that
// need the seller, private rate offers from delivery partners, then Peggy's tasks: orders, chats, stock, at most
// three); and Peggy's line. Everything else is in My shop or the orange +.

/** m_home key for the time of day in Lagos. */
function greeting() {
  const hour = (new Date().getUTCHours() + 1) % 24; // Lagos time
  return hour < 12 ? "greeting.morning" : hour < 17 ? "greeting.afternoon" : "greeting.evening";
}

const TASK_TILE: Record<DoNextItem["icon"], { icon: AppIconName; tone: TileTone }> = {
  chat: { icon: "chat", tone: "mint" },
  mail: { icon: "mail", tone: "gray" },
  truck: { icon: "box", tone: "peach" },
  box: { icon: "tag", tone: "warn" },
  coin: { icon: "coin", tone: "warn" },
  sparkle: { icon: "sparkle", tone: "peach" },
};

/** The first open on this phone shows "Opening your shop" at least this long, so it doesn't just flash. */
const OPENING_MIN_MS = 1500;

type Todo = { key: string; title: string; sub: string; lead: ReactNode; onPress: () => void };

export default function Home() {
  const t = useT("m_home", "m_delivery", "m_onboarding", "m_ui", "common");
  const { session } = useSession();
  const uid = session?.user.id;
  const home = useHomeData(uid);
  const changedPictures = useChangedIdentity();
  const { data, error, cachedAt } = home;
  const load = home.reload;
  const [refreshing, setRefreshing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  // Start here (the web's /home/start checklist), the delivery hub (exceptions and private rates) and money on its
  // way to the bank: each loaded on its own so Home never waits for them, refreshed when coming back to Home.
  const [setup, setSetup] = useState<SetupOverview | null>(null);
  const [delivery, setDelivery] = useState<DeliveryHub | null>(null);
  const [payout, setPayout] = useState<{ amount: number; date: string | null } | null>(null);
  const loadExtras = useCallback(
    () =>
      Promise.all([
        fetchSetup().then(setSetup).catch(() => null),
        fetchDeliveryHub().then(setDelivery).catch(() => null),
        fetchWallet()
          .then((wallet) => setPayout(upcomingPayout(wallet.view.settlements)))
          .catch(() => null),
      ]),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      void loadExtras();
    }, [loadExtras]),
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
  const shopName = data?.store.name ?? "";
  const items = data ? doNextItems(data.tasks, setup?.checklist.showStart && !setup.checklist.complete && setup.checklist.next ? { key: setup.checklist.next.key, ...stepWords(setup.checklist.next, t) } : null) : [];

  // One "To do" card: deliveries that need the seller, private rates waiting, then Peggy's tasks.
  const todos: Todo[] = [];
  const exceptions = delivery?.exceptions ?? [];
  if (exceptions.length) {
    const only = exceptions.length === 1 ? exceptions[0].order : null;
    todos.push({
      key: "delivery-exceptions",
      title: t("todo.ordersNeed", { count: exceptions.length }),
      sub: t("todo.ordersNeedSub"),
      lead: <Tile icon="box" tone="peach" />,
      onPress: () => (only ? router.push({ pathname: "/order/[id]", params: { id: only.id } }) : router.push("/orders")),
    });
  }
  for (const card of (delivery?.privateCards ?? []).filter((entry) => entry.status === "proposed")) {
    todos.push({
      key: `rate-${card.id}`,
      title: t("hub.rateRow", { name: card.partner.displayName }),
      sub: t("todo.rateSub"),
      lead: <Tile icon="tag" tone="warn" />,
      onPress: () => router.push({ pathname: "/delivery/rate/[id]", params: { id: card.id } }),
    });
  }
  for (const item of items) {
    todos.push({
      key: item.key,
      title: item.title,
      sub: item.hint,
      lead: item.image ? <Thumb uri={item.image} size={44} radius={14} /> : <Tile icon={TASK_TILE[item.icon].icon} tone={TASK_TILE[item.icon].tone} />,
      onPress: () => void openPath(item.href),
    });
  }

  // "₦152,400 coming to your bank on Friday" (Paystack settlements not paid out yet), else today's orders.
  const payoutLine = (() => {
    if (!payout) return data ? t("ordersToday", { count: data.counts.ordersToday }) : undefined;
    const amount = naira(payout.amount);
    const day = payout.date ? friendlyDay(payout.date, new Date(), t) : "";
    if (!payout.date || new Date(payout.date).getTime() <= Date.now() || day === t.dynamic("day.today", "today")) return t("sales.comingSoon", { amount });
    if (day === t.dynamic("day.tomorrow", "tomorrow")) return t("sales.comingTomorrow", { amount });
    return t("sales.comingDay", { amount, day: capitalise(day) });
  })();

  async function share() {
    setShareNote(null);
    if ((await shareShop().catch(() => "no-link" as const)) === "no-link") setShareNote(t("create.noLinkBody"));
  }

  return (
    <TabScreen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await Promise.all([load(), loadExtras()]);
        setRefreshing(false);
      }}
      header={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {/* The person's photo opens Settings; the shop's name under the greeting. */}
          <Pressable accessibilityRole="button" accessibilityLabel={t("me.open")} onPress={() => router.push("/settings")} hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
            <Picture uri={latestPicture(changedPictures, "avatarUrl", data?.ownerAvatarUrl)} name={data?.ownerName || firstName || "S"} size={44} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="semibold" style={{ color: colors.inkSoft, fontSize: 13 }} numberOfLines={1}>{firstName ? `${t(greeting())}, ${firstName}` : t(greeting())}</T>
            <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={1}>{shopName || firstName || " "}</T>
          </View>
          <IconButton icon="share" label={t("share.label")} onPress={() => void share()} testID="home-share" />
          <NotificationBellButton />
          <HelpButton compact />
        </View>
      }
    >
      {shareNote ? <Notice>{shareNote}</Notice> : null}

      {/* After the first sale: the moment a push matters. */}
      {data?.counts.ordersToday ? <PushPromptCard who="seller" /> : null}

      <DarkCard eyebrow={t("sales.today")} amount={data ? naira(data.sales.today) : "…"} line={payoutLine} onPress={() => router.push("/wallet")} />

      {cachedAt !== null && (
        <OfflineBanner
          offline={home.offline}
          savedAt={cachedAt}
          action={
            <Pressable accessibilityRole="button" accessibilityLabel={t("offline.tryNow")} disabled={home.attempting} onPress={() => void load()} hitSlop={8} style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "flex-end" }}>
              <T weight="extrabold" style={{ fontSize: 15, color: colors.warnInk, textDecorationLine: "underline" }}>{home.attempting ? t("trying") : t("tryAgain")}</T>
            </Pressable>
          }
        />
      )}

      {error && <Notice>{error}</Notice>}

      {data && (
        <>
          <View style={{ gap: 10 }} testID="do-next">
            <Eyebrow>{t("todo.title")}</Eyebrow>
            {todos.length ? (
              <List>
                {todos.map((todo) => <Row key={todo.key} lead={todo.lead} title={todo.title} sub={todo.sub} onPress={todo.onPress} />)}
              </List>
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
                <T style={{ fontSize: 16, lineHeight: 24, color: colors.inkSoft }}>{t("todo.caughtUp")}</T>
              </View>
            )}
          </View>

          <CampaignsCard />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${peggyLine(data.counts, t)} ${t("askPeggyShort")}`}
            onPress={() => router.push("/peggy")}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.mintTint, borderRadius: 24, padding: 20, opacity: pressed ? 0.9 : 1 })}
          >
            <Mascot name="peggy" mood={isPeggyNight() ? "sleep" : "idle"} size={44} />
            <T style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{peggyLine(data.counts, t)}</T>
          </Pressable>
        </>
      )}
    </TabScreen>
  );
}
