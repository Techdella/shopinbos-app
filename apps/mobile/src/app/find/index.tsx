import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, Share, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { List, Row, Seg, Tile } from "@/components/design";
import { StatusRow } from "@/components/familiar/StatusRow";
import { StoryViewer } from "@/components/familiar/StoryViewer";
import { AppIcon, type AppIconName } from "@/components/icons";
import { FilterBar, FilterGroup, FilterSheet } from "@/components/FilterBar";
import { Badge, EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { ListScreen, PackStrip, Tick } from "@/components/seller/FindKit";
import { useQuickAdd } from "@/components/seller/QuickAdd";
import { Card, Chip, Field, LinkButton, Mascot, PillButton, Segmented, T } from "@/components/ui";
import { FIND_PRICE_BANDS, NEAR_ME_KM, NO_FIND_FILTERS, filterFind, findCities, findFilterCount, saleBreakdown, sortCategories, withoutAdded, type FindFilters } from "@/lib/find-pure";
import { fetchFindContext, fetchFindProducts, oneTapPrice, type FindProduct } from "@/lib/marketplace";
import { fetchPacks } from "@/lib/quick-add";
import { SupplierTrustBadges } from "@/components/SupplierTrust";
import { preorderPillText } from "@/lib/preorder-pure";
import { fetchStatusFeed } from "@/lib/familiar";
import { openStatusCta, rememberSavedFinds, savedFinds } from "@/lib/seller-home";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";
import { DIAL_COUNTRIES } from "@shared/phone";

// Find products to sell (web /marketplace). First a full-screen swipe card per product ("Familiar app" prototype
// `on.discover`): For you (trending) or Near you (nearest suppliers), the supplier, Costs / Sell at / You keep,
// Save, Ask, Share, Next and "Add to my shop · ₦15,000": one tap adds it as a draft at the supplier's suggested
// price, else cost + the seller's markup (asked once, the first time; components/seller/QuickAdd.tsx), with Undo and
// Edit price on the toast. A dropship product from a supplier the seller hasn't agreed with yet opens the product
// and its Dropship agreement steps (find/[slug]) instead. Suppliers' statuses show as rings on top.
// The list view (virtualised, so 300 products scroll smoothly): Nigeria (local suppliers who dropship or sell
// wholesale) and Popular; starter packs and My supplier products at the top; search, category chips, "Not in my
// shop yet" and a Filters sheet (dropship or wholesale, cost, near me or delivers to my state, the supplier's city,
// verified suppliers only). Each card shows Cost / Sell / You keep, "In your shop" once added, and a + that adds it
// in one tap. "Select" picks many: "Add 24 to my shop" adds them all with the markup (progress, then what didn't go
// in and why). For now only suppliers near the seller show; China · 1688 imports aren't open yet.

type Tab = "nigeria" | "trending";

/** The supplier takes preorders on this listing: "Preorder · 12 Dec", or "Preorders are full" (shared/preorder.ts). */
function PreorderBadge({ product }: { product: FindProduct }) {
  const t = useT("m_ui");
  if (!product.preorder) return null;
  const label = product.preorder.open ? preorderPillText(product.preorder, new Date(), t) : t("preorder.full");
  return label ? <Badge label={label} bg={colors.warnTint} fg={colors.warnInk} /> : null;
}

/** Dropship from a supplier the seller hasn't agreed with: the agreement steps come first (no one-tap add). */
const needsAgreement = (product: FindProduct) => product.dropship && !product.supplier.agreed;

function ProductCard({ product, added, width, selecting, picked, busy, price, onAdd, onPick }: { product: FindProduct; added: boolean; width: number; selecting: boolean; picked: boolean; busy: boolean; price: number; onAdd: () => void; onPick: () => void }) {
  const t = useT("m_find");
  // "Sell": the supplier's suggested price, else the price one tap would list it at (cost + the seller's markup).
  const sell = product.price > 0 ? product.price : price;
  const sale = saleBreakdown(sell, product.cost);
  const open = () => router.push({ pathname: "/find/[slug]", params: { slug: product.slug } });
  const canAdd = !added && !needsAgreement(product);
  return (
    <Pressable
      testID={`find-card-${product.slug}`}
      accessibilityRole={selecting ? "checkbox" : "button"}
      accessibilityState={selecting ? { checked: picked, disabled: added } : undefined}
      accessibilityLabel={t("card.label", { name: product.name, cost: naira(product.cost), price: naira(sell), keep: naira(sale.keep) })}
      onPress={selecting ? (added ? undefined : onPick) : open}
      onLongPress={added ? undefined : onPick}
      style={({ pressed }) => ({ width, backgroundColor: colors.surface, borderRadius: 18, overflow: "hidden", opacity: pressed ? 0.85 : selecting && added ? 0.55 : 1, borderWidth: picked ? 2.5 : 0, borderColor: colors.ink })}
    >
      <View style={{ aspectRatio: 1, backgroundColor: colors.lilac }}>
        {product.images[0] ? <Image source={{ uri: product.images[0] }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} recyclingKey={product.id} /> : null}
        {/* Stacked, so two badges never squeeze or wrap on a half-width card. */}
        <View style={{ position: "absolute", left: 8, right: 44, top: 8, alignItems: "flex-start", gap: 4 }}>
          {added ? <Badge label={t("card.inStore")} bg={colors.successTint} fg={colors.success} /> : product.dropship ? <Badge label={t("card.dropship")} bg={colors.surface} /> : <Badge label={t("card.wholesale")} bg={colors.surface} />}
          <PreorderBadge product={product} />
        </View>
        {selecting ? (
          added ? null : <View style={{ position: "absolute", top: 8, right: 8 }}><Tick on={picked} /></View>
        ) : canAdd ? (
          <Pressable
            testID={`find-plus-${product.slug}`}
            accessibilityRole="button"
            accessibilityLabel={t("quick.addLabel", { name: product.name, price: naira(price) })}
            onPress={onAdd}
            disabled={busy}
            hitSlop={6}
            style={({ pressed }) => ({ position: "absolute", top: 8, right: 8, width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", opacity: busy ? 0.5 : pressed ? 0.8 : 1 })}
          >
            <AppIcon name="plus" size={20} color="#FFFFFF" strokeWidth={2.6} />
          </Pressable>
        ) : added ? (
          <View style={{ position: "absolute", top: 8, right: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="check" size={18} color="#FFFFFF" strokeWidth={2.6} />
          </View>
        ) : null}
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
            <T weight="bold" style={{ fontSize: 12.5 }}>{naira(sell)}</T>
          </View>
        </View>
        <View style={{ backgroundColor: sale.keep > 0 ? colors.successTint : colors.dangerTint, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 }}>
          <T weight="extrabold" style={{ fontSize: 12.5, color: sale.keep > 0 ? colors.success : colors.danger }}>{t("card.keep", { amount: naira(sale.keep) })}</T>
        </View>
        {needsAgreement(product) && !added && !selecting ? <T style={{ color: colors.warnInk, fontSize: 11.5, lineHeight: 15 }} numberOfLines={2}>{t("quick.agreeFirstShort")}</T> : null}
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
function SwipeCard({ product, width, height, saved, added, position, sell, onSave, onNext }: { product: FindProduct; width: number; height: number; saved: boolean; added: boolean; position: string; sell: number; onSave: () => void; onNext: () => void }) {
  const t = useT("m_find");
  const sale = saleBreakdown(sell, product.cost);
  return (
    <View style={{ width, height, borderRadius: 28, overflow: "hidden", backgroundColor: colors.ink }}>
      {product.images[0] ? <Image source={{ uri: product.images[0] }} style={{ position: "absolute", inset: 0 }} contentFit="cover" transition={150} accessibilityLabel={product.name} /> : null}
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "62%", backgroundColor: "rgba(10,10,14,0.55)" }} />
      <View style={{ position: "absolute", right: 12, bottom: 150, gap: 14 }}>
        <SideButton icon="star" label={saved ? t("swipe.saved") : t("swipe.save")} on={saved} onPress={onSave} />
        <SideButton icon="chat" label={t("swipe.ask")} onPress={() => router.push({ pathname: "/partners/[id]", params: { id: product.supplier.id, name: product.supplier.name } })} />
        <SideButton icon="share" label={t("swipe.share")} onPress={() => void Share.share({ message: t("swipe.shareMessage", { name: product.name, price: naira(sell) }) }).catch(() => null)} />
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
            <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 16 }}>{naira(sell)}</T>
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
  const packsLoaded = useLoad(() => fetchPacks().catch(() => null));
  // "Find another supplier" on an order opens this filtered to that product (?q=classic dashiki shirt).
  const params = useLocalSearchParams<{ q?: string }>();
  const t = useT("m_find");
  const tm = useT("marketplace");
  const [tab, setTab] = useState<Tab>("nigeria");
  const [filters, setFilters] = useState<FindFilters>(() => ({ ...NO_FIND_FILTERS, q: typeof params.q === "string" ? params.q.slice(0, 60) : "" }));
  const [sheet, setSheet] = useState(false);
  const set = (patch: Partial<FindFilters>) => setFilters((now) => ({ ...now, ...patch }));
  const products = useMemo(() => loaded.data?.products ?? [], [loaded.data]);
  const bySlug = useMemo(() => new Map(products.map((product) => [product.id, product.slug])), [products]);

  // In the shop: what the server said, plus what this screen added (or took out again with Undo).
  const [changes, setChanges] = useState<{ added: string[]; removed: string[] }>({ added: [], removed: [] });
  const added = useMemo(() => {
    const ids = new Set(loaded.data?.context?.addedIds ?? []);
    for (const id of changes.added) ids.add(id);
    for (const id of changes.removed) ids.delete(id);
    return ids;
  }, [loaded.data, changes]);
  const onChange = useCallback((more: string[], less: string[]) => setChanges((now) => ({ added: [...now.added.filter((id) => !less.includes(id)), ...more], removed: [...now.removed.filter((id) => !more.includes(id)), ...less] })), []);
  const quick = useQuickAdd({ onChange, slugOf: (id) => bySlug.get(id) ?? null });
  const markup = quick.markup?.markup ?? null;

  const categories = useMemo(() => sortCategories(products.map((product) => product.category)), [products]);
  const cities = useMemo(() => findCities(products), [products]);
  const shown = useMemo(() => withoutAdded(filterFind(products, filters), added, filters.notInShop), [products, filters, added]);
  const trending = useMemo(() => [...products].filter((product) => product.trendScore > 0).sort((a, b) => b.trendScore - a.trendScore).slice(0, 20), [products]);
  // The shop's country as words: a stored code ("NG") becomes "Nigeria"; an unknown code shows "All" instead.
  const rawCountry = loaded.data?.context?.country ?? "Nigeria";
  const country = /^[a-z]{2}$/i.test(rawCountry) ? DIAL_COUNTRIES.find((entry) => entry.code === rawCountry.toUpperCase())?.name ?? null : rawCountry;

  // Select mode: tick many, then "Add 24 to my shop".
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const togglePick = (product: FindProduct) => {
    if (added.has(product.id)) return;
    setSelecting(true);
    setPicked((now) => (now.includes(product.id) ? now.filter((id) => id !== product.id) : [...now, product.id]));
  };
  const listed = tab === "trending" ? trending : shown;
  const pickable = listed.filter((product) => !added.has(product.id));
  const stopSelecting = () => {
    setSelecting(false);
    setPicked([]);
  };

  // The swipe cards are the default; a search from an order ("Find another supplier") opens the list.
  const { session } = useSession();
  const uid = session?.user.id;
  const [view, setView] = useState<"cards" | "list">(typeof params.q === "string" && params.q ? "list" : "cards");
  const [feed, setFeed] = useState<Feed>("forYou");
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState<string[]>(() => (uid ? savedFinds(uid) : []));
  const cards = useMemo(() => feedFor(products, feed), [products, feed]);
  const current = cards[Math.min(index, Math.max(0, cards.length - 1))] ?? null;
  const pager = useRef<FlatList<FindProduct>>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cardWidth = screenWidth - 40;
  const cardHeight = Math.max(420, Math.round(screenHeight * 0.58));
  const gridWidth = Math.floor((screenWidth - 40 - 12) / 2);

  // Supplier statuses as rings on top (hidden on a server without Status).
  const status = useLoad(() => fetchStatusFeed().catch(() => null));
  const suppliers = useMemo(() => (status.data?.feed ?? []).filter((author) => author.role === "supplier"), [status.data]);
  const [story, setStory] = useState<number | null>(null);

  function goTo(next: number) {
    const clamped = cards.length ? ((next % cards.length) + cards.length) % cards.length : 0;
    setIndex(clamped);
    pager.current?.scrollToOffset({ offset: clamped * (cardWidth + 12), animated: true });
  }

  function toggleSave(product: FindProduct) {
    const next = saved.includes(product.id) ? saved.filter((id) => id !== product.id) : [product.id, ...saved];
    setSaved(next);
    if (uid) rememberSavedFinds(uid, next);
  }

  function pickFeed(next: Feed) {
    setFeed(next);
    setIndex(0);
    pager.current?.scrollToOffset({ offset: 0, animated: false });
  }

  const packs = packsLoaded.data?.packs ?? [];

  // A round icon button, so "Find products" fits beside it and Help on a 360px phone.
  const toggle = (
    <Pressable
      testID="find-view-toggle"
      accessibilityRole="button"
      accessibilityLabel={view === "cards" ? t("swipe.showList") : t("swipe.showCards")}
      onPress={() => {
        stopSelecting();
        setView(view === "cards" ? "list" : "cards");
      }}
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
  const emptyState =
    loaded.data && !products.length ? (
      <EmptyState icon="search" title={t("empty.title")} action={<PillButton title={t("empty.askPeggy")} size="md" onPress={() => router.push({ pathname: "/peggy", params: { prompt: t("empty.prompt") } })} />}>
        {t("empty.body", { country: country ?? rawCountry })}
      </EmptyState>
    ) : null;

  if (view === "cards") {
    const inShop = current ? added.has(current.id) : false;
    const footer = current ? (
      <>
        {quick.toast}
        {inShop ? (
          <PillButton testID="find-add" tone="white" icon="check" title={t("swipe.inShop")} onPress={() => router.push({ pathname: "/find/[slug]", params: { slug: current.slug } })} />
        ) : needsAgreement(current) ? (
          <PillButton testID="find-add" tone="white" icon="shield" title={t("quick.agreeFirst")} onPress={() => router.push({ pathname: "/find/[slug]", params: { slug: current.slug } })} />
        ) : (
          <PillButton testID="find-add" tone="accent" icon="plus" busy={quick.busy === current.id} accessibilityLabel={t("quick.addLabel", { name: current.name, price: naira(oneTapPrice(current, markup)) })} title={t("quick.addAt", { price: naira(oneTapPrice(current, markup)) })} onPress={() => quick.addOne(current.id)} />
        )}
      </>
    ) : quick.toast ?? undefined;
    return (
      // Keyed per view: a FlatList can't change its number of columns in place.
      <ListScreen<FindProduct>
        key="cards"
        title={t("barTitle")}
        headerRight={toggle}
        refreshing={loaded.refreshing}
        onRefresh={() => void loaded.refresh()}
        footer={footer}
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            {statusRow}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Seg label={t("swipe.forYou")} on={feed === "forYou"} onPress={() => pickFeed("forYou")} />
              <Seg label={t("swipe.nearYou")} on={feed === "nearYou"} onPress={() => pickFeed("nearYou")} />
              {packs.length ? <Seg label={t("packs.short")} on={false} onPress={() => router.push("/find/packs")} /> : null}
            </View>
            {loaded.loading && !loaded.data ? <LoadingBlock label={t("loading")} /> : null}
            {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
            {emptyState}
            {cards.length ? (
              // Virtualised too: only the cards near the one on screen are drawn.
              <FlatList
                ref={pager}
                horizontal
                data={cards}
                keyExtractor={(product) => product.id}
                snapToInterval={cardWidth + 12}
                decelerationRate="fast"
                disableIntervalMomentum
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12 }}
                initialNumToRender={2}
                windowSize={3}
                getItemLayout={(_, at) => ({ length: cardWidth + 12, offset: (cardWidth + 12) * at, index: at })}
                onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 12)))}
                renderItem={({ item: product, index: at }) => (
                  <SwipeCard
                    product={product}
                    width={cardWidth}
                    height={cardHeight}
                    saved={saved.includes(product.id)}
                    added={added.has(product.id)}
                    position={t("swipe.position", { n: at + 1, total: cards.length })}
                    sell={product.price > 0 ? product.price : oneTapPrice(product, markup)}
                    onSave={() => toggleSave(product)}
                    onNext={() => goTo(at + 1)}
                  />
                )}
              />
            ) : null}
            {storyViewer}
            {quick.ui}
          </View>
        }
      />
    );
  }

  const selectFooter = selecting ? (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <T weight="bold" style={{ fontSize: 14.5 }}>{t("select.count", { count: picked.length })}</T>
        <View style={{ flexDirection: "row", gap: 14 }}>
          <LinkButton testID="select-all" title={picked.length >= pickable.length && pickable.length ? t("select.none") : t("select.all", { count: pickable.length })} onPress={() => setPicked(picked.length >= pickable.length ? [] : pickable.map((product) => product.id))} />
          <LinkButton title={t("select.cancel")} onPress={stopSelecting} />
        </View>
      </View>
      <PillButton testID="select-add" tone="accent" icon="plus" disabled={!picked.length} title={picked.length ? t("select.add", { count: picked.length }) : t("select.pick")} onPress={() => quick.addMany(picked, stopSelecting)} />
    </>
  ) : quick.toast ?? undefined;

  const header = (
    <View style={{ gap: 16, paddingBottom: 4 }}>
      {statusRow}
      <Segmented
        options={[
          { value: "nigeria", label: country ?? t("tab.all") },
          { value: "trending", label: t("tab.popular") },
        ]}
        value={tab}
        onChange={(next) => {
          stopSelecting();
          setTab(next);
        }}
      />
      {/* Price requests and wholesale orders (pay the supplier by card) live on their own screen; the supplier
          products already in the shop on My supplier products. */}
      <List>
        <Row lead={<Tile icon="tag" tone="mint" />} title={t("mine.row")} sub={t("mine.rowSub", { count: added.size })} onPress={() => router.push("/find/mine")} />
        <Row lead={<Tile icon="box" tone="butter" />} title={t("wholesale.row")} sub={t("wholesale.rowSub")} onPress={() => router.push("/wholesale")} />
      </List>
      <PackStrip packs={packs} onAll={() => router.push("/find/packs")} />

      {tab === "nigeria" ? (
        <>
          <Field value={filters.q} onChangeText={(q) => set({ q })} placeholder={t("search")} returnKeyType="search" accessibilityLabel={t("searchLabel")} style={{ height: 48 }} />
          {products.length ? (
            <FilterBar testID="find-filters" onMore={() => setSheet(true)} moreLabel={t("filters.title")} moreCount={findFilterCount(filters)}>
              <Seg label={t("select.button")} on={selecting} onPress={() => (selecting ? stopSelecting() : setSelecting(true))} />
              <Seg label={t("filters.notInShop")} on={Boolean(filters.notInShop)} onPress={() => set({ notInShop: !filters.notInShop })} />
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
          {emptyState}
          {products.length && !shown.length ? (
            <EmptyState icon="search" title={t("noMatch.title")} action={<PillButton title={t("filters.clear")} size="sm" tone="white" onPress={() => setFilters(NO_FIND_FILTERS)} />}>
              {t("noMatch.body")}
            </EmptyState>
          ) : null}
          {shown.length ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{selecting ? t("select.hint") : t("quick.hint", { count: shown.length })}</T> : null}
        </>
      ) : (
        <>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.mintTint }}>
            <Mascot name="peggy" size={44} />
            <T style={{ flex: 1, lineHeight: 20 }}>{t("trending.intro")}</T>
          </Card>
          {loaded.loading && !loaded.data ? <LoadingBlock /> : null}
          {loaded.data && !trending.length ? <EmptyState icon="sparkle" title={t("trending.emptyTitle")}>{t("trending.emptyBody")}</EmptyState> : null}
        </>
      )}
    </View>
  );

  return (
    <ListScreen<FindProduct>
      key="list"
      title={t("barTitle")}
      headerRight={toggle}
      refreshing={loaded.refreshing}
      onRefresh={() => void loaded.refresh()}
      footer={selectFooter}
      data={listed}
      keyExtractor={(product) => product.id}
      numColumns={2}
      columnWrapperStyle={{ gap: 12 }}
      ListHeaderComponent={header}
      ListFooterComponent={
        <>
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
            <FilterGroup label={t("filters.nearTitle")}>
              <Chip label={t("filters.anyPlace")} on={!filters.near} onPress={() => set({ near: "" })} />
              <Chip label={t("filters.nearMe", { km: NEAR_ME_KM })} on={filters.near === "near"} onPress={() => set({ near: filters.near === "near" ? "" : "near" })} />
              <Chip label={t("filters.myState")} on={filters.near === "state"} onPress={() => set({ near: filters.near === "state" ? "" : "state" })} />
            </FilterGroup>
            {cities.length > 1 ? (
              <FilterGroup label={t("filters.location")}>
                <Chip label={t("filters.anywhere")} on={!filters.city} onPress={() => set({ city: "" })} />
                {cities.map((city) => <Chip key={city} label={city} on={filters.city === city} onPress={() => set({ city: filters.city === city ? "" : city })} />)}
              </FilterGroup>
            ) : null}
            <FilterGroup label={t("filters.suppliers")}>
              <Chip label={t("filters.verified")} on={filters.verified} onPress={() => set({ verified: !filters.verified })} />
              <Chip label={t("filters.notInShop")} on={Boolean(filters.notInShop)} onPress={() => set({ notInShop: !filters.notInShop })} />
            </FilterGroup>
          </FilterSheet>
          {storyViewer}
          {quick.ui}
        </>
      }
      renderItem={({ item: product }) => (
        <ProductCard
          product={product}
          added={added.has(product.id)}
          width={gridWidth}
          selecting={selecting}
          picked={picked.includes(product.id)}
          busy={quick.busy === product.id}
          price={oneTapPrice(product, markup)}
          onAdd={() => quick.addOne(product.id)}
          onPick={() => togglePick(product)}
        />
      )}
    />
  );
}
