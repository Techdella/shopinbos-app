import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { naira } from "@shared/onboarding";
import { isPeggyNight } from "@shared/mascots";
import { DarkCard, Eyebrow, List, Row, Tile, Title, type TileTone } from "@/components/design";
import { MiniBars, PromoCarousel, type PromoSlide } from "@/components/visual";
import { trailingWeekdays } from "@/lib/visual-pure";
import type { AppIconName } from "@/components/icons";
import { HomeSkeleton, OfflineBanner, OpeningShop, SlowNetwork } from "@/components/Loading";
import { HelpButton } from "@/components/Help";
import { CallPeggyButton } from "@/components/CallPeggyButton";
import { usePeggySaved } from "@/lib/peggy-call";
import { Thumb } from "@/components/seller/bits";
import { TabScreen } from "@/components/TabScreen";
import { Mascot, Notice, T } from "@/components/ui";
import { Checklist, type ChecklistItem } from "@/components/familiar/Checklist";
import { GettingStartedCard } from "@/components/familiar/GettingStarted";
import { LevelPill } from "@/components/familiar/LevelPill";
import { QuickActions, type QuickAction } from "@/components/familiar/QuickActions";
import { StatusRow } from "@/components/familiar/StatusRow";
import { useShopinbosRings } from "@/components/updates/TeamUpdatesRing";
import { StoryViewer } from "@/components/familiar/StoryViewer";
import { Tour, type TourStep } from "@/components/familiar/Tour";
import { stepWords } from "@/lib/setup-words";
import { doNextItems, peggyLine, type DoNextItem } from "@/lib/home-pure";
import { useHomeData } from "@/lib/homeData";
import { latestPicture, useChangedIdentity } from "@/lib/identity";
import { hasOpenedHome, rememberedStoreName } from "@/lib/launch";
import { useSession } from "@/lib/session";
import { fetchSetup, type SetupOverview } from "@/lib/setup";
import { SHOP_READY_ROUTE, fetchShopReady, moreProductsWanted, type ShopReady } from "@/lib/seller-onboarding";
import { ShopReadyDone, useChecklistEvents } from "@/components/rex-build/ShopReadyDone";
import { useTourAllowed } from "@/lib/setup-gate";
import { sellerSetupDone } from "@/lib/setup-gate-pure";
import { fetchDeliveryHub, type DeliveryHub } from "@/lib/delivery";
import { upcomingPayout } from "@/lib/delivery-pure";
import { capitalise, friendlyDay } from "@/lib/friendly";
import { fetchRewards, fetchStatusFeed, levelProgress, type Rewards, type StatusAuthor, type StatusFeed } from "@/lib/familiar";
import { checklistHiddenHere, hideChecklistHere, openStatusCta, rememberTourDone, tourDoneHere, tourDoneOnAccount } from "@/lib/seller-home";
import { shareShop } from "@/lib/share";
import { fetchWallet } from "@/lib/wallet";
import { openPath } from "@/lib/web";
import { colors, surfaceCard } from "@/theme";
import { PushPromptCard } from "@/components/PushPromptCard";
import { RexStudioWelcomeCard } from "@/components/RexStudioWelcomeCard";
import { NotificationBellButton } from "@/components/NotificationBellButton";
import { CampaignsCard } from "@/components/CampaignsCard";
import { LinkInBioCard } from "@/components/LinkInBioCard";
import { fetchBio } from "@/lib/paylinks";
import type { BioPage } from "@/lib/paylinks-pure";
import { useT } from "@/lib/i18n";
import { realName } from "@shared/person-name";

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
      style={({ pressed }) => ({ flex: 1, minHeight: 92, flexDirection: "row", alignItems: "center", gap: 10, ...surfaceCard(), padding: 14, opacity: pressed ? 0.9 : 1 })}
    >
      {who === "peggy" ? <Mascot name="peggy" mood={isPeggyNight() ? "sleep" : "idle"} size={44} label="" /> : <Mascot name="rex" size={44} label="" />}
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Two lines for the name: "Béèrè lọ́wọ́ Rex" and "Béèrè lọ́wọ́ Peggy" must not both end in "Béèrè lọ…". */}
        <T weight="extrabold" style={{ fontSize: 16, lineHeight: 20 }} numberOfLines={2}>{title}</T>
        <T style={{ fontSize: 13.5, lineHeight: 18, color: colors.inkSoft }} numberOfLines={2}>{sub}</T>
      </View>
    </Pressable>
  );
}

export default function Home() {
  const t = useT("m_home", "m_delivery", "m_onboarding", "m_ui", "common");
  const tr = useT("m_rexBuild");
  // ?tour=1: just went live (onboarding/launched.tsx): the three tips show now, before setup is finished (spec F1–F3).
  const { tour: tourParam } = useLocalSearchParams<{ tour?: string }>();
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
  // "Get your shop ready" (spec F4, GET /api/mobile/onboarding/ready): each item from the shop's real state.
  const [ready, setReady] = useState<ShopReady | null>(null);
  useChecklistEvents(uid, ready);
  const [delivery, setDelivery] = useState<DeliveryHub | null>(null);
  const [payout, setPayout] = useState<{ amount: number; date: string | null } | null>(null);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [status, setStatus] = useState<StatusFeed | null>(null);
  // The link in bio page (its link with Copy and Share, or "Set it up"); null until it loads or when it can't.
  const [bio, setBio] = useState<BioPage | null>(null);
  const loadExtras = useCallback(
    () =>
      Promise.all([
        fetchSetup().then(setSetup).catch(() => null),
        fetchShopReady().then(setReady).catch(() => null),
        fetchDeliveryHub().then(setDelivery).catch(() => null),
        fetchWallet()
          .then((wallet) => setPayout(upcomingPayout(wallet.view.settlements)))
          .catch(() => null),
        fetchRewards().then(setRewards).catch(() => null),
        fetchStatusFeed().then(setStatus).catch(() => null),
        fetchBio().then(setBio).catch(() => null),
      ]),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      void loadExtras();
    }, [loadExtras]),
  );
  // Peggy saving on a call ticks the checklist here too.
  usePeggySaved(() => void loadExtras());

  // Shopinbos's getting-started posts and the team's weekly updates share one ring.
  const rings = useShopinbosRings(status?.feed);

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

  // The first-login tour: once per seller (this phone, then the account), when Home first shows with data. It only
  // shows once setup is complete (the Start checklist), while Home is the screen in front, and never during a Peggy
  // call (open or minimized) or just after she opened a screen (lib/setup-gate.ts).
  const [touring, setTouring] = useState(false);
  const tourAllowed = useTourAllowed(tourParam === "1" ? true : sellerSetupDone(setup));
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const tourShowing = touring && tourAllowed && focused;
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

  const firstName = realName(data?.ownerName).split(/\s+/)[0] ?? "";
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

  // "Get your shop ready" (spec F4), in order: bank account, delivery partner, pay on delivery, share, first post,
  // more products (under four), WhatsApp or Instagram, then the optional domain. Done items drop off; the bar counts
  // the required ones. Each opens the screen that does it.
  const readyLabel = (key: ShopReady["rows"][number]["key"]) =>
    key === "products"
      ? moreProductsWanted(ready?.facts.products ?? 0) === 1 ? tr("ready.productsOne") : tr("ready.products", { count: moreProductsWanted(ready?.facts.products ?? 0) })
      : tr(`ready.${key}`);
  const checklist: ChecklistItem[] = (ready?.open ?? []).map((row) => ({
    key: row.key,
    label: readyLabel(row.key),
    done: false,
    onPress: () => {
      if (row.key === "share") void share();
      else router.push(SHOP_READY_ROUTE[row.key] as never);
    },
  }));

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

  // Sales a day for the last week (oldest first, today last); nothing to draw on an older server or a quiet week.
  const salesDays = (data?.daily?.data ?? []).slice(-7);
  const dayLabels = trailingWeekdays(salesDays.length).map((day) => t(`wk.${day}` as "wk.0"));
  if (salesDays.length && !salesDays.some((amount) => amount > 0)) salesDays.length = 0;

  const myPicture = latestPicture(changedPictures, "avatarUrl", data?.ownerAvatarUrl);
  const myName = data?.ownerName || firstName || "S";
  // Statuses are posted as the shop: its logo and name on "Your status" (the owner's photo only when there's no logo).
  const shopPicture = latestPicture(changedPictures, "logoUrl", data?.store.logoUrl) ?? myPicture;

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
              {/* No name yet (a phone sign-up that skipped it): ask for one instead of greeting nobody. */}
              {data && !firstName ? (
                <Pressable accessibilityRole="link" onPress={() => router.push("/settings")} hitSlop={6}>
                  <T weight="bold" style={{ color: colors.accentInk, fontSize: 13 }} numberOfLines={1}>{t("greeting.addName")}</T>
                </Pressable>
              ) : null}
            </View>
            <NotificationBellButton />
            <HelpButton compact />
          </View>
        }
      >
        {shareNote ? <Notice>{shareNote}</Notice> : null}

        {status ? (
          <StatusRow
            authors={rings.authors}
            myName={shopName || myName}
            myPicture={shopPicture}
            hasMine={status.mine.posts.length > 0}
            onNew={() => router.push("/status/new" as never)}
            onOpenMine={() => setStory({ authors: [{ userId: uid ?? "me", name: shopName || myName, role: "seller", logoUrl: shopPicture, seen: true, posts: status.mine.posts }], start: 0, own: true })}
            onOpen={(index) => setStory({ authors: rings.authors, start: index, own: false })}
            leading={rings.leading}
          />
        ) : null}

        {/* After the first sale: the moment a push matters. */}
        {data?.counts.ordersToday ? <PushPromptCard who="seller" /> : null}

        {/* Free plan, after Rex built the shop: "You have 20 credits to try Rex Studio" (hidden otherwise). */}
        {!tourShowing ? <RexStudioWelcomeCard /> : null}

        {/* Hidden while the tour runs, so its targets stay on screen (as in the prototype). */}
        {!checklistHidden && !tourShowing ? (
          <Checklist
            title={tr("ready.title")}
            items={checklist}
            progress={ready ? { done: ready.done, total: ready.total } : undefined}
            onDismiss={() => {
              if (uid) hideChecklistHere(uid);
              setChecklistHidden(true);
            }}
          />
        ) : null}

        {/* Everything on the list done: confetti and "Your shop is fully set up" (once). */}
        {ready?.complete && uid && !tourShowing ? <ShopReadyDone uid={uid} /> : null}

        {/* Shopinbos's getting-started videos and tips (an X closes it for good). */}
        {!tourShowing ? <GettingStartedCard /> : null}

        <View ref={moneyRef} collapsable={false} style={{ gap: 18 }}>
          <DarkCard eyebrow={t("sales.today")} amount={data ? naira(data.sales.today) : "…"} line={payoutLine} onPress={() => router.push("/wallet")}>
            {/* The last 7 days of sales, a bar a day, today lit (the dashboard's daily series). */}
            {salesDays.length ? <MiniBars dark height={52} values={salesDays} labels={dayLabels} accessibilityLabel={t("chart.lastDays", { days: salesDays.map((amount, index) => `${dayLabels[index]} ${naira(amount)}`).join(", ") })} /> : null}
          </DarkCard>
          <QuickActions actions={shortcuts} />
        </View>

        <View ref={askRef} collapsable={false} style={{ flexDirection: "row", gap: 10 }}>
          <AskCard testID="home-ask-rex" who="rex" title={t("ai.rex")} sub={t("ai.rexSub")} onPress={() => router.push("/rex")} />
          <AskCard testID="home-ask-peggy" who="peggy" title={t("ai.peggy")} sub={t("ai.peggySub")} onPress={() => router.push("/peggy")} />
        </View>
        {/* A free voice call with Peggy, in the app (hidden where calls can't run). */}
        <CallPeggyButton note={false} />

        {/* The seller's link in bio: Copy and Share, or set it up (onboarding/bio.tsx). */}
        <LinkInBioCard page={bio} shopName={data?.store.name ?? ""} />

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
              {/* "Needs you" with "All orders" beside it (board A-Seller-Home). */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <Eyebrow>{t("needs.title")}</Eyebrow>
                <Pressable testID="home-all-orders" accessibilityRole="link" onPress={() => router.push("/orders")} hitSlop={8} style={{ minHeight: 32, justifyContent: "center" }}>
                  <T weight="bold" style={{ fontSize: 14, color: colors.accentInk }}>{t("needs.allOrders")}</T>
                </Pressable>
              </View>
              {needs.length ? (
                <List>
                  {needs.map((todo) => <Row key={todo.key} lead={todo.lead} title={todo.title} sub={todo.sub} onPress={todo.onPress} />)}
                </List>
              ) : (
                <View style={{ ...surfaceCard(), padding: 20 }}>
                  <T style={{ fontSize: 16, lineHeight: 24, color: colors.inkSoft }}>{t("todo.caughtUp")}</T>
                </View>
              )}
            </View>

            {/* "From Peggy" (board A-Seller-Home): what she kept an eye on today; a tap opens her. */}
            <View style={{ gap: 10 }}>
              <Eyebrow>{t("fromPeggy")}</Eyebrow>
              {/* A soft promo banner: her line, "Ask Peggy", and Peggy on the right. */}
              <PromoCarousel
                label={t("fromPeggy")}
                slides={[{ key: "peggy", testID: "home-from-peggy", tone: "mint", title: peggyLine(data.counts, t), cta: t("ai.peggy"), onPress: () => router.push("/peggy"), art: <Mascot name="peggy" mood={isPeggyNight() ? "sleep" : "idle"} size={64} label="" /> } satisfies PromoSlide]}
              />
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
        visible={tourShowing}
        onDone={() => {
          setTouring(false);
          if (uid) rememberTourDone(uid);
        }}
      />
    </View>
  );
}
