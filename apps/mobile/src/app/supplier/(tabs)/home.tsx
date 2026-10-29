import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { DarkCard, Eyebrow, List, Row, Small, Sub, Tile } from "@/components/design";
import { Checklist, type ChecklistItem } from "@/components/familiar/Checklist";
import { GettingStartedCard } from "@/components/familiar/GettingStarted";
import { LevelPill } from "@/components/familiar/LevelPill";
import { QuickActions } from "@/components/familiar/QuickActions";
import { StatusRow } from "@/components/familiar/StatusRow";
import { useShopinbosRings } from "@/components/updates/TeamUpdatesRing";
import { StoryViewer } from "@/components/familiar/StoryViewer";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock, Picture } from "@/components/kit";
import { NotificationBellButton } from "@/components/NotificationBellButton";
import { PushPromptCard } from "@/components/PushPromptCard";
import { ChatTile } from "@/components/SupplierKit";
import { levelName, useWords } from "@/components/supplier/DropshipKit";
import { TabScreen } from "@/components/TabScreen";
import { Mascot, T } from "@/components/ui";
import { fetchDeliveryHub, openPartnerChat } from "@/lib/delivery";
import { fetchRewards, fetchStatusFeed, levelProgress, type StatusAuthor, type StatusPost } from "@/lib/familiar";
import { useT } from "@/lib/i18n";
import { verificationStage } from "@/lib/partner-pure";
import { useSession } from "@/lib/session";
import { fetchAgreements, fetchSupplierLevel, fetchSupplierOrders, fetchSupplierOverview, fetchUnreadMessages, type SupplierOrder } from "@/lib/supplier";
import { countWord, greetingKey, supplierOrderGroup } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors, surfaceCard } from "@/theme";

// Supplier Home ("Familiar app" supplier prototype `home`): the level ring (Rewards), "Good morning" and the
// business, the bell and the gear to Account; the Status row (delivery partners and shops posting for 24 hours);
// the lime "Get set up" checklist for the first days; the dark "Coming to your bank" card (money shops paid that's
// waiting for delivery to be confirmed: Paystack pays it straight to the bank, nothing to withdraw); four quick
// actions; "Ask Peggy"; and "Needs you": new orders, messages, price requests, low stock and private delivery rates.
// A new supplier is sent to the set-up wizard (/supplier/setup) once per launch until it's done. Status, Rewards
// and the delivery hub load on their own: when one isn't there (an older server answers 404) its part just hides.
// Your level (New → Trusted → Established, Supplier & Dropship Rules) sits under Ask Peggy, with the next goal.

let setupShown = false;

type Todo = { key: string; lead: React.ReactNode; title: string; sub: string; go: () => void };
type CheckKey = "product" | "delivery" | "where" | "bank";

/** A remembered yes/no on this phone (the checklist ticks and "hide this list"). Storage can fail: then it's no. */
function readFlag(key: string) {
  try {
    return globalThis.localStorage?.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string) {
  try {
    globalThis.localStorage?.setItem(key, "1");
  } catch {
    // Not remembered: the list shows again next time.
  }
}

export default function SupplierHome() {
  const t = useT("m_supplier", "m_partner", "common");
  const words = useWords();
  const level = useLoad(() => fetchSupplierLevel().catch(() => null));
  const { session } = useSession();
  const uid = session?.user.id ?? "anon";
  const loaded = useLoad(async () => {
    const [overview, open, unread, hub] = await Promise.all([
      fetchSupplierOverview(),
      fetchSupplierOrders("open").catch(() => null),
      fetchUnreadMessages().catch(() => 0),
      fetchDeliveryHub().catch(() => null),
    ]);
    const orders: SupplierOrder[] = open ? [...open.dropship, ...open.wholesale] : [];
    return { overview, fresh: orders.filter((order) => supplierOrderGroup(order) === "new").length, unread, hub };
  });
  // Status and Rewards are extras: never block Home, and hide when the server doesn't have them yet.
  const extras = useLoad(async () => {
    const [feed, rewards, agreements] = await Promise.all([fetchStatusFeed().catch(() => null), fetchRewards().catch(() => null), fetchAgreements().catch(() => null)]);
    // Shops waiting for the supplier to sign their Dropship agreement.
    return { feed, rewards, waitingAgreements: agreements?.filter((row) => row.status === "requested").length ?? 0 };
  });
  const data = loaded.data;
  const overview = data?.overview;
  const onboarded = overview?.supplier.onboarded ?? true;
  const feed = extras.data?.feed ?? null;
  const rewards = extras.data?.rewards ?? null;
  // Shopinbos's getting-started posts and the team's weekly updates share one ring.
  const rings = useShopinbosRings(feed?.feed);

  const [story, setStory] = useState<{ own: boolean; start: number } | null>(null);
  const [hidden, setHidden] = useState(() => readFlag(`supplier.checklist.hidden.${uid}`));
  const [ticked, setTicked] = useState<Record<CheckKey, boolean>>(() => ({
    product: false,
    delivery: false,
    where: readFlag(`supplier.checklist.where.${uid}`),
    bank: readFlag(`supplier.checklist.bank.${uid}`),
  }));

  useEffect(() => {
    if (overview && !onboarded && !setupShown) {
      setupShown = true;
      router.push("/supplier/setup");
    }
  }, [overview, onboarded]);

  const name = overview?.supplier.name ?? t("home.yourBusiness");

  function tick(key: CheckKey, go: () => void) {
    if (key === "where" || key === "bank") {
      writeFlag(`supplier.checklist.${key}.${uid}`);
      setTicked((current) => ({ ...current, [key]: true }));
    }
    go();
  }

  function hideChecklist() {
    writeFlag(`supplier.checklist.hidden.${uid}`);
    setHidden(true);
  }

  /** A story's action: connect or see a delivery partner's rates on their page, else chat with whoever posted. */
  function storyAction(post: StatusPost, author: StatusAuthor) {
    const cta = post.cta;
    if (!cta) return;
    const slug = cta.target?.slug;
    if ((cta.kind === "connect" || cta.kind === "see_rates") && slug) {
      router.push({ pathname: "/delivery/partner/[slug]", params: { slug } });
      return;
    }
    if (cta.kind === "connect" || cta.kind === "see_rates") {
      router.push("/delivery");
      return;
    }
    openPartnerChat("supplier", { userId: cta.target?.userId ?? author.userId, name: author.name });
  }

  const checklist: ChecklistItem[] =
    data && overview
      ? [
          { key: "product", label: t("home.ck.product"), done: overview.counts.products > 0, onPress: () => router.push("/supplier/product/new") },
          { key: "delivery", label: t("home.ck.delivery"), done: Boolean(data.hub && (data.hub.connections.length > 0 || data.hub.settings.selfDelivery)), onPress: () => router.push("/delivery") },
          { key: "where", label: t("home.ck.where"), done: ticked.where || Boolean(data.hub?.settings.sellStates.length), onPress: () => tick("where", () => router.push("/delivery/where")) },
          { key: "bank", label: t("home.ck.bank"), done: ticked.bank || Boolean(overview.bank?.ready), onPress: () => tick("bank", () => router.push("/supplier/account")) },
        ]
      : [];

  const todo: Todo[] = [];
  if (data && overview) {
    if (data.fresh) todo.push({ key: "new", lead: <Tile icon="box" tone="peach" />, title: t("home.newOrders", { count: data.fresh }), sub: t("home.newOrdersSub"), go: () => router.push({ pathname: "/supplier/orders", params: { view: "new" } }) });
    const waiting = extras.data?.waitingAgreements ?? 0;
    if (waiting) todo.push({ key: "agreements", lead: <Tile icon="users" tone="lilac" />, title: t("home.agreements", { count: waiting }), sub: t("home.agreementsSub"), go: () => router.push("/supplier/agreements") });
    if (data.unread) todo.push({ key: "chat", lead: <ChatTile />, title: t("home.newMessages", { count: data.unread }), sub: t("home.newMessagesSub"), go: () => router.push("/supplier/messages") });
    for (const quote of overview.quotes) {
      todo.push({ key: `quote-${quote.id}`, lead: <Tile icon="tag" tone="blue" />, title: t("home.priceRequest", { pieces: countWord(quote.quantity, t) }), sub: t("home.priceRequestSub", { shop: quote.seller }), go: () => router.push({ pathname: "/supplier/quote/[id]", params: { id: quote.id } }) });
    }
    for (const product of overview.lowStock) {
      todo.push({ key: `low-${product.id}`, lead: <Tile icon="box" tone="warn" />, title: t("home.runningLow", { name: product.name }), sub: t("home.left", { count: product.stock }), go: () => router.push({ pathname: "/supplier/product/[id]", params: { id: product.id } }) });
    }
    for (const card of (data.hub?.privateCards ?? []).filter((entry) => entry.status === "proposed")) {
      todo.push({ key: `rate-${card.id}`, lead: <Tile icon="tag" tone="sky" />, title: t("home.privateRate", { name: card.partner.displayName }), sub: t("home.privateRateSub"), go: () => router.push({ pathname: "/delivery/rate/[id]", params: { id: card.id } }) });
    }
    if (!overview.supplier.onboarded) {
      todo.push({ key: "setup", lead: <Tile icon="store" tone="mint" />, title: t("home.finish"), sub: t("home.finishHint"), go: () => router.push("/supplier/setup") });
    } else if (overview.supplier.verificationStatus !== "verified") {
      const stage = verificationStage(overview.supplier.verificationStatus, t);
      todo.push({ key: "verify", lead: <Tile icon="shield" tone="mint" />, title: stage.label, sub: stage.hint, go: () => router.push("/supplier/verification") });
    }
    if (!overview.bank) todo.push({ key: "bank", lead: <Tile icon="wallet" tone="ok" />, title: t("home.addBank"), sub: t("home.addBankSub"), go: () => router.push({ pathname: "/supplier/setup", params: { edit: "bank" } }) });
  }

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 50 }}>
      {rewards ? (
        <LevelPill level={rewards.level} progress={levelProgress(rewards)} uri={overview?.supplier.logoUrl ?? null} name={name} onPress={() => router.push("/rewards" as never)} />
      ) : (
        <Picture uri={overview?.supplier.logoUrl} name={name} size={44} shape="square" />
      )}
      <View style={{ flex: 1 }}>
        <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{t(greetingKey(new Date().getHours()))}</T>
        <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={1}>{name}</T>
      </View>
      <NotificationBellButton />
      <Pressable accessibilityRole="button" accessibilityLabel={t("home.account")} onPress={() => router.push("/supplier/account")} hitSlop={6} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}>
        <AppIcon name="settings" size={21} />
      </Pressable>
    </View>
  );

  const mine: StatusAuthor[] = feed && overview ? [{ userId: "me", name, role: "supplier", logoUrl: overview.supplier.logoUrl, seen: true, posts: feed.mine.posts }] : [];

  return (
    <TabScreen
      header={header}
      refreshing={loaded.refreshing}
      onRefresh={() => {
        void loaded.refresh();
        void extras.refresh();
      }}
    >
      <PushPromptCard who="supplier" when={Boolean(data)} />
      {loaded.loading && !data ? <LoadingBlock label={t("loading")} /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}

      {data && overview ? (
        <>
          {feed ? (
            <View style={{ gap: 6 }}>
              <StatusRow
                authors={rings.authors}
                myName={name}
                myPicture={overview.supplier.logoUrl}
                hasMine={feed.mine.posts.length > 0}
                onNew={() => router.push("/status/new" as never)}
                onOpenMine={() => setStory({ own: true, start: 0 })}
                onOpen={(index) => setStory({ own: false, start: index })}
                leading={rings.leading}
              />
              {feed.mine.posts.length ? <Small>{t("home.statusViews", { count: feed.mine.viewsLast })}</Small> : null}
            </View>
          ) : null}

          {hidden ? null : <Checklist title={t("home.setupTitle")} items={checklist} onDismiss={hideChecklist} />}
          <GettingStartedCard />

          <DarkCard eyebrow={t("home.coming")} amount={naira(overview.owed ?? 0)} line={t("home.afterConfirm")} onPress={() => router.push("/supplier/money")} />

          <QuickActions
            actions={[
              { key: "add", label: t("home.qa.add"), icon: "plus", tone: "peach", onPress: () => router.push("/supplier/product/new") },
              { key: "orders", label: t("home.qa.orders"), icon: "box", tone: "butter", onPress: () => router.push("/supplier/orders") },
              { key: "create", label: t("home.qa.create"), icon: "sparkle", tone: "lilac", onPress: () => router.push("/create" as never) },
              { key: "delivery", label: t("home.qa.delivery"), icon: "truck", tone: "sky", onPress: () => router.push("/delivery") },
            ]}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("home.peggy")}. ${t("home.peggySub")}`}
            onPress={() => router.push("/ask-peggy" as never)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, backgroundColor: colors.peach, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 14, opacity: pressed ? 0.85 : 1 })}
          >
            <Mascot name="peggy" size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="extrabold" style={{ fontSize: 17 }}>{t("home.peggy")}</T>
              <T style={{ fontSize: 14, lineHeight: 19, color: colors.accentInk }}>{t("home.peggySub")}</T>
            </View>
            <AppIcon name="chevron" size={18} color={colors.accentInk} />
          </Pressable>

          {level.data ? (
            <List>
              <Row
                lead={<Tile icon="star" tone="butter" />}
                title={words("level.youre", "You're {level}", { level: levelName(level.data.level, words) })}
                sub={level.data.next === "established" ? words("level.homeEstablished", "Pre-orders open at Established. See your goals.") : level.data.next ? words("level.homeTrusted", "Reach Trusted for branding and faster pay. See your goals.") : words("level.homeTop", "Pre-orders are open to you.")}
                onPress={() => router.push("/supplier/level")}
              />
            </List>
          ) : null}

          <View style={{ gap: 10 }} testID="do-next">
            <Eyebrow>{t("home.needsYou")}</Eyebrow>
            {todo.length ? (
              <List>
                {todo.map((item) => <Row key={item.key} lead={item.lead} title={item.title} sub={item.sub} onPress={item.go} />)}
              </List>
            ) : (
              <View style={{ ...surfaceCard(), padding: 18 }}>
                <Sub>{t("home.caughtUp")}</Sub>
              </View>
            )}
          </View>
        </>
      ) : null}

      {feed ? (
        <StoryViewer
          authors={story?.own ? mine : rings.authors}
          start={story?.own ? 0 : (story?.start ?? 0)}
          visible={Boolean(story)}
          own={Boolean(story?.own)}
          onClose={() => {
            setStory(null);
            void extras.refresh();
          }}
          onCta={storyAction}
        />
      ) : null}
    </TabScreen>
  );
}
