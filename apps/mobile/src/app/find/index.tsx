import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Share, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { List, Row, Seg, Tile } from "@/components/design";
import { StatusRow } from "@/components/familiar/StatusRow";
import { StoryViewer } from "@/components/familiar/StoryViewer";
import { AppIcon, type AppIconName } from "@/components/icons";
import { FilterBar, FilterGroup, FilterSheet } from "@/components/FilterBar";
import { Badge, EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Mascot, PillButton, Segmented, T } from "@/components/ui";
import { FIND_PRICE_BANDS, NO_FIND_FILTERS, filterFind, findCities, findFilterCount, saleBreakdown, sortCategories, type FindFilters } from "@/lib/find-pure";
import { fetchFindContext, fetchFindProducts, type FindProduct } from "@/lib/marketplace";
import { SupplierTrustBadges } from "@/components/SupplierTrust";
import { preorderPillText } from "@/lib/preorder-pure";
import { fetchStatusFeed } from "@/lib/familiar";
import { openStatusCta, rememberSavedFinds, savedFinds } from "@/lib/seller-home";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, fonts, radii } from "@/theme";
import { DIAL_COUNTRIES } from "@shared/phone";

// Find products to sell (web /marketplace). First a full-screen swipe card per product ("Familiar app" prototype
// `on.discover`): For you (trending) or Near you (nearest suppliers), the supplier, Costs / Sell at / You keep,
// Save, Ask, Share, Next and "Add to my shop", which opens the product and its Dropship agreement steps
// (find/[slug]). Suppliers' statuses show as rings on top. The list view: Nigeria (local suppliers who dropship or
// sell wholesale) and Trending, with the web's search and category chips plus a Filters sheet (dropship or
// wholesale, what it costs, the supplier's city, verified suppliers only). Cards show Cost / Sell / You keep and the
// supplier's verification, risk score and distance. For now only suppliers near the seller show. China · 1688
// imports aren't open yet (the web turns requests away), so the app has no China tab.

type Tab = "nigeria" | "trending";

/** The supplier takes preorders on this listing: "Preorder · 12 Dec", or "Preorders are full" (shared/preorder.ts). */
function PreorderBadge({ product }: { product: FindProduct }) {
  const t = useT("m_ui");
  if (!product.preorder) return null;
  const label = product.preorder.open ? preorderPillText(product.preorder, new Date(), t) : t("preorder.full");
  return label ? <Badge label={label} bg={colors.warnTint} fg={colors.warnInk} /> : null;
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
        {/* Stacked, so two badges never squeeze or wrap on a half-width card. */}
        <View style={{ position: "absolute", left: 8, right: 8, top: 8, alignItems: "flex-start", gap: 4 }}>
          {added ? <Badge label={t("card.inStore")} bg={colors.successTint} fg={colors.success} /> : product.dropship ? <Badge label={t("card.dropship")} bg={colors.surface} /> : <Badge label={t("card.wholesale")} bg={colors.surface} />}
          <PreorderBadge product={product} />
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
        {added || product.preorder ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {added ? <Badge label={t("card.inStore")} bg={colors.successTint} fg={colors.success} /> : null}
            <PreorderBadge product={product} />
          </View>
        ) : null}
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
  const [filters, setFilters] = useState<FindFilters>(() => ({ ...NO_FIND_FILTERS, q: typeof params.q === "string" ? params.q.slice(0, 60) : "" }));
  const [sheet, setSheet] = useState(false);
  const set = (patch: Partial<FindFilters>) => setFilters((now) => ({ ...now, ...patch }));
  const products = useMemo(() => loaded.data?.products ?? [], [loaded.data]);
  const added = useMemo(() => new Set(loaded.data?.context?.addedIds ?? []), [loaded.data]);
  const categories = useMemo(() => sortCategories(products.map((product) => product.category)), [products]);
  const cities = useMemo(() => findCities(products), [products]);
  const shown = useMemo(() => filterFind(products, filters), [products, filters]);
  const trending = useMemo(() => [...products].filter((product) => product.trendScore > 0).sort((a, b) => b.trendScore - a.trendScore).slice(0, 20), [products]);
  // The shop's country as words: a stored code ("NG") becomes "Nigeria"; an unknown code shows "All" instead.
  const rawCountry = loaded.data?.context?.country ?? "Nigeria";
  const country = /^[a-z]{2}$/i.test(rawCountry) ? DIAL_COUNTRIES.find((entry) => entry.code === rawCountry.toUpperCase())?.name ?? null : rawCountry;

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

  // A round icon button, so "Find products" fits beside it and Help on a 360px phone.
  const toggle = (
    <Pressable
      testID="find-view-toggle"
      accessibilityRole="button"
      accessibilityLabel={view === "cards" ? t("swipe.showList") : t("swipe.showCards")}
      onPress={() => setView(view === "cards" ? "list" : "cards")}
      hitSlop={6}
      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginRight: 4 }}
    >
      <AppIcon name={view === "cards" ? "grid" : "image"} size={19} />
    </Pressable>
  );

  const statusRow = suppliers.length ? (
    <StatusRow authors={suppliers} showMine={false} myName="" myPicture={null} onNew={() => router.push("/status/new" as never)} onOpen={(at) => setStory(at)} />
  ) : null;
  const storyViewer = story !== null ? <StoryViewer authors={suppliers} start={story} visible onClose={() => setStory(null)} onCta={openStatusCta} /> : null;

  if (view === "cards") {
    return (
      <Screen
        title={t("barTitle")}
        headerRight={toggle}
        refreshing={loaded.refreshing}
        onRefresh={() => void loaded.refresh()}
        footer={
          current ? (
            <PillButton testID="find-add" tone="accent" accessibilityLabel={t("swipe.add")} onPress={() => router.push({ pathname: "/find/[slug]", params: { slug: current.slug } })} icon="plus" title={added.has(current.id) ? t("swipe.inShop") : t("swipe.add")} />
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
            {t("empty.body", { country: country ?? rawCountry })}
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
    <Screen title={t("barTitle")} sub={t("sub")} headerRight={toggle} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {statusRow}
      <Segmented
        options={[
          { value: "nigeria", label: country ?? t("tab.all") },
          { value: "trending", label: t("tab.popular") },
        ]}
        value={tab}
        onChange={setTab}
      />
      {/* Price requests and wholesale orders (pay the supplier by card) live on their own screen. */}
      <List>
        <Row lead={<Tile icon="box" tone="butter" />} title={t("wholesale.row")} sub={t("wholesale.rowSub")} onPress={() => router.push("/wholesale")} />
      </List>

      {tab === "nigeria" ? (
        <>
          <Field value={filters.q} onChangeText={(q) => set({ q })} placeholder={t("search")} returnKeyType="search" accessibilityLabel={t("searchLabel")} style={{ height: 48 }} />
          {products.length ? (
            <FilterBar testID="find-filters" onMore={() => setSheet(true)} moreLabel={t("filters.title")} moreCount={findFilterCount(filters)}>
              {categories.length > 1 ? <Seg label={t("all")} on={!filters.category} onPress={() => set({ category: "" })} /> : null}
              {categories.length > 1 ? categories.map((name) => <Seg key={name} label={t.dynamic(`category.${name}`, name)} on={filters.category === name} onPress={() => set({ category: filters.category === name ? "" : name })} />) : null}
            </FilterBar>
          ) : null}
          {loaded.data ? (
            loaded.data.hasPlace ? (
              <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{tm("trust.nearbyOnly", { city: loaded.data.city ?? "" })}</T>
            ) : (
              <Card style={{ gap: 10, backgroundColor: "#FDF0D5" }}>
                <T style={{ fontSize: 14, lineHeight: 20 }}>{tm("trust.addCity")}</T>
                <PillButton title={tm("trust.addCityBtn")} tone="white" size="sm" onPress={() => router.push("/settings")} />
              </Card>
            )
          ) : null}
          {loaded.loading && !loaded.data ? <LoadingBlock label={t("loading")} /> : null}
          {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
          {loaded.data && !products.length ? (
            <EmptyState icon="search" title={t("empty.title")} action={<PillButton title={t("empty.askPeggy")} size="md" onPress={() => router.push({ pathname: "/peggy", params: { prompt: t("empty.prompt") } })} />}>
              {t("empty.body", { country: country ?? rawCountry })}
            </EmptyState>
          ) : null}
          {products.length && !shown.length ? (
            <EmptyState icon="search" title={t("noMatch.title")} action={<PillButton title={t("filters.clear")} size="sm" tone="white" onPress={() => setFilters(NO_FIND_FILTERS)} />}>
              {t("noMatch.body")}
            </EmptyState>
          ) : null}
          {grid(shown)}
          <FilterSheet
            visible={sheet}
            onClose={() => setSheet(false)}
            title={t("filters.title")}
            doneLabel={t("filters.show", { count: shown.length })}
            clearLabel={t("filters.clear")}
            onClear={() => setFilters((now) => ({ ...NO_FIND_FILTERS, q: now.q, category: now.category }))}
          >
            <FilterGroup label={t("filters.way")}>
              <Chip label={t("filters.any")} on={!filters.way} onPress={() => set({ way: "" })} />
              <Chip label={t("card.dropship")} on={filters.way === "dropship"} onPress={() => set({ way: filters.way === "dropship" ? "" : "dropship" })} />
              <Chip label={t("card.wholesale")} on={filters.way === "wholesale"} onPress={() => set({ way: filters.way === "wholesale" ? "" : "wholesale" })} />
            </FilterGroup>
            <FilterGroup label={t("filters.price")}>
              <Chip label={t("filters.any")} on={!filters.price} onPress={() => set({ price: "" })} />
              {FIND_PRICE_BANDS.map((band) => (
                <Chip key={band.key} label={t(`filters.price.${band.key}`)} on={filters.price === band.key} onPress={() => set({ price: filters.price === band.key ? "" : band.key })} />
              ))}
            </FilterGroup>
            {cities.length > 1 ? (
              <FilterGroup label={t("filters.location")}>
                <Chip label={t("filters.anywhere")} on={!filters.city} onPress={() => set({ city: "" })} />
                {cities.map((city) => <Chip key={city} label={city} on={filters.city === city} onPress={() => set({ city: filters.city === city ? "" : city })} />)}
              </FilterGroup>
            ) : null}
            <FilterGroup label={t("filters.suppliers")}>
              <Chip label={t("filters.verified")} on={filters.verified} onPress={() => set({ verified: !filters.verified })} />
            </FilterGroup>
          </FilterSheet>
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
