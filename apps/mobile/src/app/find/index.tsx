import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Share, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { Seg } from "@/components/design";
import { StatusRow } from "@/components/familiar/StatusRow";
import { StoryViewer } from "@/components/familiar/StoryViewer";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Badge, ChipRow, EmptyState, ErrorState, Initials, LinkRow, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Mascot, PillButton, Segmented, T } from "@/components/ui";
import { saleBreakdown, sortCategories } from "@/lib/find-pure";
import { fetchFindContext, fetchFindProducts, type FindProduct } from "@/lib/marketplace";
import { SupplierTrustBadges } from "@/components/SupplierTrust";
import { fetchStatusFeed } from "@/lib/familiar";
import { openStatusCta, rememberSavedFinds, savedFinds } from "@/lib/seller-home";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors, fonts, radii } from "@/theme";

// Find products to sell (web /marketplace). First a full-screen swipe card per product ("Familiar app" prototype
// `on.discover`): For you (trending) or Near you (nearest suppliers), the supplier, Costs / Sell at / You keep,
// Save, Ask, Share, Next and "Add to my shop", which opens the product and its Dropship agreement steps
// (find/[slug]). Suppliers' statuses show as rings on top. The list view: Nigeria (local suppliers who dropship or
// sell wholesale), China · 1688 (imports through the sourcing partner, on the web) and Trending. Cards show Cost /
// Sell / You keep and the supplier's verification, risk score and distance. For now only suppliers near the seller show.

type Tab = "nigeria" | "china" | "trending";

function matches(product: FindProduct, q: string) {
  const words = q.toLowerCase().split(/[\s,]+/).filter((word) => word.length > 1);
  if (!words.length) return true;
  const haystack = [product.name, product.description, product.category, product.supplier.name, product.supplier.city].join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word.replace(/(es|s)$/, "")));
}

function ProductCard({ product, added }: { product: FindProduct; added: boolean }) {
  const t = useT("m_find");
  const sale = saleBreakdown(product.price, product.cost);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("card.label", { name: product.name, cost: naira(product.cost), price: naira(product.price), keep: naira(sale.keep) })}
      onPress={() => router.push({ pathname: "/find/[slug]", params: { slug: product.slug } })}
      style={({ pressed }) => ({ width: "48.3%", backgroundColor: colors.surface, borderRadius: 18, overflow: "hidden", opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ aspectRatio: 1, backgroundColor: colors.lilac }}>
        {product.images[0] ? <Image source={{ uri: product.images[0] }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} /> : null}
        <View style={{ position: "absolute", left: 8, top: 8, flexDirection: "row", gap: 4 }}>
          {added ? <Badge label={t("card.inStore")} bg={colors.successTint} fg={colors.success} /> : product.dropship ? <Badge label={t("card.dropship")} bg={colors.surface} /> : <Badge label={t("card.wholesale")} bg={colors.surface} />}
        </View>
      </View>
      <View style={{ padding: 10, gap: 6 }}>
        <T weight="bold" style={{ fontSize: 13.5, lineHeight: 18 }} numberOfLines={2}>{product.name}</T>
        <T style={{ color: colors.inkSoft, fontSize: 11.5 }} numberOfLines={1}>{[product.supplier.name, product.supplier.city].filter(Boolean).join(" · ")}</T>
        <SupplierTrustBadges supplier={product.supplier} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <T style={{ color: colors.inkSoft, fontSize: 10.5 }}>{t("card.cost")}</T>
            <T weight="bold" style={{ fontSize: 12.5 }}>{naira(product.cost)}</T>
          </View>
          <View>
            <T style={{ color: colors.inkSoft, fontSize: 10.5 }}>{t("card.sell")}</T>
            <T weight="bold" style={{ fontSize: 12.5 }}>{naira(product.price)}</T>
          </View>
        </View>
        <View style={{ backgroundColor: sale.keep > 0 ? colors.successTint : colors.dangerTint, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 }}>
          <T weight="extrabold" style={{ fontSize: 12.5, color: sale.keep > 0 ? colors.success : colors.danger }}>{t("card.keep", { amount: naira(sale.keep) })}</T>
        </View>
      </View>
    </Pressable>
  );
}

type Feed = "forYou" | "nearYou";

/** The products for the swipe cards: most trending first ("For you"), or nearest suppliers first ("Near you"). */
function feedFor(products: FindProduct[], feed: Feed) {
  if (feed === "nearYou") {
    const near = products.filter((product) => product.supplier.km != null).sort((a, b) => (a.supplier.km ?? 0) - (b.supplier.km ?? 0));
    return near.length ? near : products;
  }
  return [...products].sort((a, b) => b.trendScore - a.trendScore);
}

function SideButton({ icon, label, on, onPress }: { icon: AppIconName; label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={on === undefined ? undefined : { selected: on }} onPress={onPress} style={({ pressed }) => ({ alignItems: "center", gap: 4, opacity: pressed ? 0.75 : 1 })}>
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: on ? colors.accent : "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" }}>
        <AppIcon name={icon} size={22} color={colors.ink} />
      </View>
      <T weight="bold" style={{ fontSize: 12, color: "#FFFFFF" }}>{label}</T>
    </Pressable>
  );
}

/** One full-height card: the photo, the supplier, the product, Costs / Sell at / You keep, and Save, Ask, Share, Next. */
function SwipeCard({ product, width, height, saved, added, position, onSave, onNext }: { product: FindProduct; width: number; height: number; saved: boolean; added: boolean; position: string; onSave: () => void; onNext: () => void }) {
  const t = useT("m_find");
  const sale = saleBreakdown(product.price, product.cost);
  return (
    <View style={{ width, height, borderRadius: 28, overflow: "hidden", backgroundColor: colors.ink }}>
      {product.images[0] ? <Image source={{ uri: product.images[0] }} style={{ position: "absolute", inset: 0 }} contentFit="cover" transition={150} accessibilityLabel={product.name} /> : null}
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "62%", backgroundColor: "rgba(10,10,14,0.55)" }} />
      <View style={{ position: "absolute", right: 12, bottom: 150, gap: 14 }}>
        <SideButton icon="star" label={saved ? t("swipe.saved") : t("swipe.save")} on={saved} onPress={onSave} />
        <SideButton icon="chat" label={t("swipe.ask")} onPress={() => router.push({ pathname: "/partners/[id]", params: { id: product.supplier.id, name: product.supplier.name } })} />
        <SideButton icon="share" label={t("swipe.share")} onPress={() => void Share.share({ message: t("swipe.shareMessage", { name: product.name, price: naira(product.price) }) }).catch(() => null)} />
        <SideButton icon="chevron" label={t("swipe.next")} onPress={onNext} />
      </View>
      <View style={{ position: "absolute", left: 16, right: 76, bottom: 16, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Initials name={product.supplier.name} size={30} bg={colors.mintTint} fg={colors.forest} />
          <T weight="bold" numberOfLines={1} style={{ flex: 1, color: "#FFFFFF", fontSize: 14 }}>{[product.supplier.name, product.supplier.city].filter(Boolean).join(" · ")}</T>
        </View>
        {added ? <Badge label={t("card.inStore")} bg={colors.successTint} fg={colors.success} /> : null}
        <T numberOfLines={2} style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 29, color: "#FFFFFF" }}>{product.name}</T>
        <View style={{ flexDirection: "row", gap: 18 }}>
          <View>
            <T style={{ color: "rgba(255,255,255,0.75)", fontSize: 12.5 }}>{t("swipe.costs")}</T>
            <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 16 }}>{naira(product.cost)}</T>
          </View>
          <View>
            <T style={{ color: "rgba(255,255,255,0.75)", fontSize: 12.5 }}>{t("swipe.sellAt")}</T>
            <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 16 }}>{naira(product.price)}</T>
          </View>
        </View>
        <View style={{ alignSelf: "flex-start", backgroundColor: sale.keep > 0 ? "#E2F5A0" : colors.dangerTint, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
          <T weight="extrabold" style={{ fontSize: 14, color: sale.keep > 0 ? colors.ink : colors.danger }}>{t("swipe.keep", { amount: naira(sale.keep) })}</T>
        </View>
        <T style={{ color: "rgba(255,255,255,0.75)", fontSize: 12.5 }}>{position}</T>
      </View>
    </View>
  );
}

export default function FindProducts() {
  const loaded = useLoad(async () => {
    const [context, found] = await Promise.all([fetchFindContext().catch(() => null), fetchFindProducts()]);
    return { context, products: found.products, hasPlace: found.hasPlace, city: found.city };
  });
  // "Find another supplier" on an order opens this filtered to that product (?q=classic dashiki shirt).
  const params = useLocalSearchParams<{ q?: string }>();
  const t = useT("m_find");
  const tm = useT("marketplace");
  const [tab, setTab] = useState<Tab>("nigeria");
  const [q, setQ] = useState(typeof params.q === "string" ? params.q.slice(0, 60) : "");
  const [category, setCategory] = useState("");
  const products = useMemo(() => loaded.data?.products ?? [], [loaded.data]);
  const added = useMemo(() => new Set(loaded.data?.context?.addedIds ?? []), [loaded.data]);
  const categories = useMemo(() => sortCategories(products.map((product) => product.category)), [products]);
  const shown = useMemo(() => products.filter((product) => (!category || product.category === category) && matches(product, q)), [products, category, q]);
  const trending = useMemo(() => [...products].filter((product) => product.trendScore > 0).sort((a, b) => b.trendScore - a.trendScore).slice(0, 20), [products]);
  const country = loaded.data?.context?.country ?? "Nigeria";

  // The swipe cards are the default; a search from an order ("Find another supplier") opens the list.
  const { session } = useSession();
  const uid = session?.user.id;
  const [view, setView] = useState<"cards" | "list">(typeof params.q === "string" && params.q ? "list" : "cards");
  const [feed, setFeed] = useState<Feed>("forYou");
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState<string[]>(() => (uid ? savedFinds(uid) : []));
  const cards = useMemo(() => feedFor(products, feed), [products, feed]);
  const current = cards[Math.min(index, Math.max(0, cards.length - 1))] ?? null;
  const pager = useRef<ScrollView>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cardWidth = screenWidth - 40;
  const cardHeight = Math.max(420, Math.round(screenHeight * 0.6));

  // Supplier statuses as rings on top (hidden on a server without Status).
  const status = useLoad(() => fetchStatusFeed().catch(() => null));
  const suppliers = useMemo(() => (status.data?.feed ?? []).filter((author) => author.role === "supplier"), [status.data]);
  const [story, setStory] = useState<number | null>(null);

  function goTo(next: number) {
    const clamped = cards.length ? ((next % cards.length) + cards.length) % cards.length : 0;
    setIndex(clamped);
    pager.current?.scrollTo({ x: clamped * (cardWidth + 12), animated: true });
  }

  function toggleSave(product: FindProduct) {
    const next = saved.includes(product.id) ? saved.filter((id) => id !== product.id) : [product.id, ...saved];
    setSaved(next);
    if (uid) rememberSavedFinds(uid, next);
  }

  function pickFeed(next: Feed) {
    setFeed(next);
    setIndex(0);
    pager.current?.scrollTo({ x: 0, animated: false });
  }

  const toggle = (
    <Pressable
      testID="find-view-toggle"
      accessibilityRole="button"
      accessibilityLabel={view === "cards" ? t("swipe.showList") : t("swipe.showCards")}
      onPress={() => setView(view === "cards" ? "list" : "cards")}
      hitSlop={6}
      style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
    >
      <AppIcon name={view === "cards" ? "grid" : "image"} size={18} />
      <T weight="bold" style={{ fontSize: 14 }}>{view === "cards" ? t("swipe.list") : t("swipe.cards")}</T>
    </Pressable>
  );

  const statusRow = suppliers.length ? (
    <StatusRow authors={suppliers} showMine={false} myName="" myPicture={null} onNew={() => router.push("/status/new" as never)} onOpen={(at) => setStory(at)} />
  ) : null;
  const storyViewer = story !== null ? <StoryViewer authors={suppliers} start={story} visible onClose={() => setStory(null)} onCta={openStatusCta} /> : null;

  if (view === "cards") {
    return (
      <Screen
        title={t("title")}
        headerRight={toggle}
        refreshing={loaded.refreshing}
        onRefresh={() => void loaded.refresh()}
        footer={
          current ? (
            <PillButton testID="find-add" tone="accent" accessibilityLabel={t("swipe.add")} onPress={() => router.push({ pathname: "/find/[slug]", params: { slug: current.slug } })}>
              <AppIcon name="plus" size={20} color={colors.ink} />
              <T weight="extrabold" style={{ fontSize: 17 }}>{added.has(current.id) ? t("swipe.inShop") : t("swipe.add")}</T>
            </PillButton>
          ) : undefined
        }
      >
        {statusRow}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Seg label={t("swipe.forYou")} on={feed === "forYou"} onPress={() => pickFeed("forYou")} />
          <Seg label={t("swipe.nearYou")} on={feed === "nearYou"} onPress={() => pickFeed("nearYou")} />
        </View>
        {loaded.loading && !loaded.data ? <LoadingBlock label={t("loading")} /> : null}
        {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
        {loaded.data && !products.length ? (
          <EmptyState icon="search" title={t("empty.title")} action={<PillButton title={t("empty.askPeggy")} size="md" onPress={() => router.push({ pathname: "/peggy", params: { prompt: t("empty.prompt") } })} />}>
            {t("empty.body", { country })}
          </EmptyState>
        ) : null}
        {cards.length ? (
          <ScrollView
            ref={pager}
            horizontal
            snapToInterval={cardWidth + 12}
            decelerationRate="fast"
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
            onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 12)))}
          >
            {cards.map((product, at) => (
              <SwipeCard
                key={product.id}
                product={product}
                width={cardWidth}
                height={cardHeight}
                saved={saved.includes(product.id)}
                added={added.has(product.id)}
                position={t("swipe.position", { n: at + 1, total: cards.length })}
                onSave={() => toggleSave(product)}
                onNext={() => goTo(at + 1)}
              />
            ))}
          </ScrollView>
        ) : null}
        {storyViewer}
      </Screen>
    );
  }

  const grid = (list: FindProduct[]) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }}>
      {list.map((product) => <ProductCard key={product.id} product={product} added={added.has(product.id)} />)}
    </View>
  );

  return (
    <Screen title={t("title")} sub={t("sub")} headerRight={toggle} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {statusRow}
      <Segmented
        options={[
          { value: "nigeria", label: country },
          { value: "china", label: "China · 1688" },
          { value: "trending", label: t("tab.popular") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "nigeria" ? (
        <>
          <Field value={q} onChangeText={setQ} placeholder={t("search")} returnKeyType="search" accessibilityLabel={t("searchLabel")} style={{ height: 48 }} />
          {categories.length > 1 ? (
            <ChipRow>
              <Chip label={t("all")} on={!category} onPress={() => setCategory("")} />
              {categories.map((name) => <Chip key={name} label={t.dynamic(`category.${name}`, name)} on={category === name} onPress={() => setCategory(category === name ? "" : name)} />)}
            </ChipRow>
          ) : null}
          {loaded.data ? (
            loaded.data.hasPlace ? (
              <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{tm("trust.nearbyOnly", { city: loaded.data.city ?? "" })}</T>
            ) : (
              <Card style={{ gap: 10, backgroundColor: "#FDF0D5" }}>
                <T style={{ fontSize: 14, lineHeight: 20 }}>{tm("trust.addCity")}</T>
                <PillButton title={tm("trust.addCityBtn")} tone="white" size="sm" onPress={() => void openWeb("/home/settings")} />
              </Card>
            )
          ) : null}
          {loaded.loading && !loaded.data ? <LoadingBlock label={t("loading")} /> : null}
          {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
          {loaded.data && !products.length ? (
            <EmptyState icon="search" title={t("empty.title")} action={<PillButton title={t("empty.askPeggy")} size="md" onPress={() => router.push({ pathname: "/peggy", params: { prompt: t("empty.prompt") } })} />}>
              {t("empty.body", { country })}
            </EmptyState>
          ) : null}
          {products.length && !shown.length ? <EmptyState icon="search" title={t("noMatch.title")}>{t("noMatch.body")}</EmptyState> : null}
          {grid(shown)}
        </>
      ) : null}

      {tab === "china" ? (
        <>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name="truck" size={22} color={colors.accentInk} />
              </View>
              <View style={{ flex: 1 }}>
                <T weight="extrabold" style={{ fontSize: 16 }}>{t("china.title")}</T>
                <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("china.sub")}</T>
              </View>
            </View>
            {[t("china.step1"), t("china.step2"), t("china.step3")].map((line, index) => (
              <View key={line} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
                  <T weight="extrabold" style={{ fontSize: 12 }}>{String(index + 1)}</T>
                </View>
                <T style={{ flex: 1, lineHeight: 20 }}>{line}</T>
              </View>
            ))}
            <PillButton title={t("china.quote")} size="md" onPress={() => void openWeb("/marketplace?tab=china")} />
          </Card>
          <Card style={{ paddingVertical: 2 }}>
            <LinkRow first icon="box" label={t("china.imports")} hint={t("china.importsHint")} onPress={() => void openWeb("/home/imports")} />
          </Card>
        </>
      ) : null}

      {tab === "trending" ? (
        <>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.mintTint }}>
            <Mascot name="peggy" size={44} />
            <T style={{ flex: 1, lineHeight: 20 }}>{t("trending.intro")}</T>
          </Card>
          {loaded.loading && !loaded.data ? <LoadingBlock /> : null}
          {loaded.data && !trending.length ? <EmptyState icon="sparkle" title={t("trending.emptyTitle")}>{t("trending.emptyBody")}</EmptyState> : null}
          {grid(trending)}
        </>
      ) : null}
      <View style={{ height: radii.field }} />
      {storyViewer}
    </Screen>
  );
}
