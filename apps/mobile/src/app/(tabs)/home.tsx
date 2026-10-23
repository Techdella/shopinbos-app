import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { naira } from "@shared/onboarding";
import { isPeggyNight } from "@shared/mascots";
import { DarkCard, Eyebrow, List, Row, Tile, Title, type TileTone } from "@/components/design";
import type { AppIconName } from "@/components/icons";
import { HomeSkeleton, OfflineBanner, OpeningShop, SlowNetwork } from "@/components/Loading";
import { HelpButton } from "@/components/Help";
import { Thumb } from "@/components/seller/bits";
import { TabScreen } from "@/components/TabScreen";
import { Mascot, Notice, T } from "@/components/ui";
import { Checklist, type ChecklistItem } from "@/components/familiar/Checklist";
import { LevelPill } from "@/components/familiar/LevelPill";
import { QuickActions, type QuickAction } from "@/components/familiar/QuickActions";
import { StatusRow } from "@/components/familiar/StatusRow";
import { TeamUpdatesRing } from "@/components/updates/TeamUpdatesRing";
import { StoryViewer } from "@/components/familiar/StoryViewer";
import { Tour, type TourStep } from "@/components/familiar/Tour";
import { stepWords } from "@/lib/setup-words";
import { doNextItems, type DoNextItem } from "@/lib/home-pure";
import { useHomeData } from "@/lib/homeData";
import { latestPicture, useChangedIdentity } from "@/lib/identity";
import { hasOpenedHome, rememberedStoreName } from "@/lib/launch";
import { useSession } from "@/lib/session";
import { fetchSetup, type SetupOverview, type SetupStepKey } from "@/lib/setup";
import { fetchDeliveryHub, type DeliveryHub } from "@/lib/delivery";
import { upcomingPayout } from "@/lib/delivery-pure";
import { capitalise, friendlyDay } from "@/lib/friendly";
import { fetchRewards, fetchStatusFeed, levelProgress, type Rewards, type StatusAuthor, type StatusFeed } from "@/lib/familiar";
import { checklistHiddenHere, hideChecklistHere, openStatusCta, rememberTourDone, tourDoneHere, tourDoneOnAccount } from "@/lib/seller-home";
import { shareShop } from "@/lib/share";
import { fetchWallet } from "@/lib/wallet";
import { openPath } from "@/lib/web";
import { colors } from "@/theme";
import { PushPromptCard } from "@/components/PushPromptCard";
import { NotificationBellButton } from "@/components/NotificationBellButton";
import { CampaignsCard } from "@/components/CampaignsCard";
import { useT } from "@/lib/i18n";

// Seller Home ("Familiar app" prototype `on.home`): the level ring round the seller's photo (Rewards), the shop name
// and "Good morning, Ada", the bell; the Status row (suppliers and delivery partners); "Get your shop ready" for
// the first days; the dark "Sales today" card (money on its way to the bank, taps through to Money); four
// shortcuts; Ask Rex and Ask Peggy side by side; and "Needs you" (at most three). The first visit runs a three-step
// tour. Every new part hides itself when its API isn't there (lib/familiar `optional`).

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
/** "Needs you" shows this many at most (build spec 8A). */
const NEEDS_MAX = 3;

type Todo = { key: string; title: string; sub: string; lead: ReactNode; onPress: () => void };

/** Where the orange "+" sits in the tab bar (components/TabBar.tsx), for the tour's first step. */
function usePlusSpot() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  if (Platform.OS === "android") return { right: 20, bottom: Math.max(insets.bottom, 12) + 84, width: 60, height: 60 };
  // iPhone: 58 round, centred, 26 above the bar's row (bar = 8 + 54 + bottom padding).
  return { left: width / 2 - 29, bottom: Math.max(insets.bottom, 8) + 22, width: 58, height: 58 };
}

function AskCard({ who, title, sub, onPress, testID }: { who: "rex" | "peggy"; title: string; sub: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 92, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 14, opacity: pressed ? 0.9 : 1 })}
    >
      {who === "peggy" ? <Mascot name="peggy" mood={isPeggyNight() ? "sleep" : "idle"} size={44} label="" /> : <Mascot name="rex" size={44} label="" />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{title}</T>
        <T style={{ fontSize: 13.5, color: colors.inkSoft }} numberOfLines={2}>{sub}</T>
      </View>
    </Pressable>
  );
}

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

  // Start here (the web's /home/start checklist), the delivery hub (exceptions and private rates), money on its
  // way to the bank, Rewards and Status: each loaded on its own so Home never waits for them, refreshed when coming
  // back to Home. Rewards and Status are null on a server without them (their parts hide).
  const [setup, setSetup] = useState<SetupOverview | null>(null);
  const [delivery, setDelivery] = useState<DeliveryHub | null>(null);
  const [payout, setPayout] = useState<{ amount: number; date: string | null } | null>(null);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [status, setStatus] = useState<StatusFeed | null>(null);
  const loadExtras = useCallback(
    () =>
      Promise.all([
        fetchSetup().then(setSetup).catch(() => null),
        fetchDeliveryHub().then(setDelivery).catch(() => null),
        fetchWallet()
          .then((wallet) => setPayout(upcomingPayout(wallet.view.settlements)))
          .catch(() => null),
        fetchRewards().then(setRewards).catch(() => null),
        fetchStatusFeed().then(setStatus).catch(() => null),
      ]),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      void loadExtras();
    }, [loadExtras]),
  );

  // The Status viewer: someone else's posts, or your own.
  const [story, setStory] = useState<{ authors: StatusAuthor[]; start: number; own: boolean } | null>(null);

  // "Get your shop ready" can be hidden; remembered on this phone for this seller.
  const [checklistHidden, setChecklistHidden] = useState(() => (uid ? checklistHiddenHere(uid) : false));

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

  // The first-login tour: once per seller (this phone, then the account), when Home first shows with data.
  const [touring, setTouring] = useState(false);
  const tourChecked = useRef(false);
  useEffect(() => {
    if (screen !== "home" || !data || !uid || tourChecked.current) return;
    tourChecked.current = true;
    if (tourDoneHere(uid)) return;
    void tourDoneOnAccount().then((done) => {
      if (done) rememberTourDone(uid);
      else setTouring(true);
    });
  }, [screen, data, uid]);
  const plusRef = useRef<View>(null);
  const moneyRef = useRef<View>(null);
  const askRef = useRef<View>(null);
  const plusSpot = usePlusSpot();

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

  // "Needs you": deliveries that need the seller, private rates waiting, then Peggy's tasks (three at most).
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
  const needs = todos.slice(0, NEEDS_MAX);

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
    const result = await shareShop().catch(() => "no-link" as const);
    if (result === "no-link") setShareNote(t("create.noLinkBody"));
    else if (result === "shared") void loadExtras();
  }

  // "Get your shop ready": four steps from the shop's real state (GET /api/app/setup).
  const stepDone = (key: SetupStepKey) => Boolean(setup?.checklist.steps.find((step) => step.key === key)?.done);
  const checklist: ChecklistItem[] = setup
    ? [
        { key: "products", label: t("ready.product"), done: stepDone("products"), onPress: () => router.push("/add-products") },
        { key: "payout", label: t("ready.bank"), done: stepDone("payout"), onPress: () => router.push("/wallet") },
        { key: "delivery", label: t("ready.delivery"), done: stepDone("delivery"), onPress: () => router.push("/delivery") },
        { key: "share", label: t("ready.share"), done: stepDone("share"), onPress: () => void share() },
      ]
    : [];

  const shortcuts: QuickAction[] = [
    { key: "post", label: t("qa.post"), icon: "sparkle", tone: "lime", onPress: () => router.push("/create" as never), testID: "home-make-post" },
    { key: "delivery", label: t("qa.delivery"), icon: "truck", tone: "sky", onPress: () => router.push("/delivery") },
    { key: "find", label: t("qa.find"), icon: "search", tone: "butter", onPress: () => router.push("/find") },
    { key: "share", label: t("qa.share"), icon: "share", tone: "lilac", onPress: () => void share(), testID: "home-share" },
  ];

  const tourSteps: TourStep[] = [
    { key: "plus", title: t("tour.1.title"), body: t("tour.1.body"), target: plusRef },
    { key: "money", title: t("tour.2.title"), body: t("tour.2.body"), target: moneyRef },
    { key: "ask", title: t("tour.3.title"), body: t("tour.3.body"), target: askRef },
  ];

  const myPicture = latestPicture(changedPictures, "avatarUrl", data?.ownerAvatarUrl);
  const myName = data?.ownerName || firstName || "S";

  return (
    <View style={{ flex: 1 }}>
      <TabScreen
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await Promise.all([load(), loadExtras()]);
          setRefreshing(false);
        }}
        header={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {/* The level ring round the seller's photo opens Rewards (just the photo when Rewards isn't there). */}
            <LevelPill level={rewards?.level ?? null} progress={levelProgress(rewards)} uri={myPicture} name={myName} onPress={() => (rewards ? router.push("/rewards" as never) : router.push("/settings"))} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T weight="semibold" style={{ color: colors.inkSoft, fontSize: 13 }} numberOfLines={1}>{shopName || " "}</T>
              <Title size={24} style={{ marginTop: 1 }}>{firstName ? `${t(greeting())}, ${firstName}` : t(greeting())}</Title>
            </View>
            <NotificationBellButton />
            <HelpButton compact />
          </View>
        }
      >
        {shareNote ? <Notice>{shareNote}</Notice> : null}

        {status ? (
          <StatusRow
            authors={status.feed}
            myName={myName}
            myPicture={myPicture}
            hasMine={status.mine.posts.length > 0}
            onNew={() => router.push("/status/new" as never)}
            onOpenMine={() => setStory({ authors: [{ userId: uid ?? "me", name: shopName || myName, role: "seller", logoUrl: myPicture, seen: true, posts: status.mine.posts }], start: 0, own: true })}
            onOpen={(index) => setStory({ authors: status.feed, start: index, own: false })}
            leading={<TeamUpdatesRing />}
          />
        ) : null}

        {/* After the first sale: the moment a push matters. */}
        {data?.counts.ordersToday ? <PushPromptCard who="seller" /> : null}

        {/* Hidden while the tour runs, so its targets stay on screen (as in the prototype). */}
        {!checklistHidden && !touring ? (
          <Checklist
            title={t("ready.title")}
            items={checklist}
            onDismiss={() => {
              if (uid) hideChecklistHere(uid);
              setChecklistHidden(true);
            }}
          />
        ) : null}

        <View ref={moneyRef} collapsable={false} style={{ gap: 18 }}>
          <DarkCard eyebrow={t("sales.today")} amount={data ? naira(data.sales.today) : "…"} line={payoutLine} onPress={() => router.push("/wallet")} />
          <QuickActions actions={shortcuts} />
        </View>

        <View ref={askRef} collapsable={false} style={{ flexDirection: "row", gap: 10 }}>
          <AskCard testID="home-ask-rex" who="rex" title={t("ai.rex")} sub={t("ai.rexSub")} onPress={() => router.push("/rex")} />
          <AskCard testID="home-ask-peggy" who="peggy" title={t("ai.peggy")} sub={t("ai.peggySub")} onPress={() => router.push("/peggy")} />
        </View>

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
              <Eyebrow>{t("needs.title")}</Eyebrow>
              {needs.length ? (
                <List>
                  {needs.map((todo) => <Row key={todo.key} lead={todo.lead} title={todo.title} sub={todo.sub} onPress={todo.onPress} />)}
                </List>
              ) : (
                <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
                  <T style={{ fontSize: 16, lineHeight: 24, color: colors.inkSoft }}>{t("todo.caughtUp")}</T>
                </View>
              )}
            </View>

            <CampaignsCard />
          </>
        )}
      </TabScreen>

      {/* An empty box over the tab bar's "+", for the tour's first step to point at. */}
      <View ref={plusRef} collapsable={false} pointerEvents="none" style={{ position: "absolute", ...plusSpot }} />

      {story ? (
        <StoryViewer
          authors={story.authors}
          start={story.start}
          own={story.own}
          visible
          onClose={() => {
            setStory(null);
            void fetchStatusFeed().then(setStatus).catch(() => null);
          }}
          onCta={openStatusCta}
        />
      ) : null}

      <Tour
        steps={tourSteps}
        visible={touring}
        onDone={() => {
          setTouring(false);
          if (uid) rememberTourDone(uid);
        }}
      />
    </View>
  );
}
