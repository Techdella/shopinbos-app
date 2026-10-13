import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { Badge, ChipRow, EmptyState, ErrorState, LinkRow, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Mascot, PillButton, Segmented, T } from "@/components/ui";
import { saleBreakdown, sortCategories } from "@/lib/find-pure";
import { fetchFindContext, fetchFindProducts, type FindProduct } from "@/lib/marketplace";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// Find products to sell (web /marketplace): Nigeria (local suppliers who dropship or sell wholesale),
// China · 1688 (imports through the sourcing partner, on the web) and Trending. Cards show Cost / Sell / You keep.

type Tab = "nigeria" | "china" | "trending";

function matches(product: FindProduct, q: string) {
  const words = q.toLowerCase().split(/[\s,]+/).filter((word) => word.length > 1);
  if (!words.length) return true;
  const haystack = [product.name, product.description, product.category, product.supplier.name, product.supplier.city].join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word.replace(/(es|s)$/, "")));
}

function ProductCard({ product, added }: { product: FindProduct; added: boolean }) {
  const sale = saleBreakdown(product.price, product.cost);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, cost ${naira(product.cost)}, sell ${naira(product.price)}, you keep ${naira(sale.keep)}`}
      onPress={() => router.push({ pathname: "/find/[slug]", params: { slug: product.slug } })}
      style={({ pressed }) => ({ width: "48.3%", backgroundColor: colors.surface, borderRadius: 18, overflow: "hidden", opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ aspectRatio: 1, backgroundColor: colors.lilac }}>
        {product.images[0] ? <Image source={{ uri: product.images[0] }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} /> : null}
        <View style={{ position: "absolute", left: 8, top: 8, flexDirection: "row", gap: 4 }}>
          {added ? <Badge label="In your store" bg={colors.successTint} fg={colors.success} /> : product.dropship ? <Badge label="Dropship" bg={colors.surface} /> : <Badge label="Wholesale" bg={colors.surface} />}
        </View>
      </View>
      <View style={{ padding: 10, gap: 6 }}>
        <T weight="bold" style={{ fontSize: 13.5, lineHeight: 18 }} numberOfLines={2}>{product.name}</T>
        <T style={{ color: colors.inkSoft, fontSize: 11.5 }} numberOfLines={1}>{[product.supplier.name, product.supplier.city].filter(Boolean).join(" · ")}</T>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <T style={{ color: colors.inkSoft, fontSize: 10.5 }}>Cost</T>
            <T weight="bold" style={{ fontSize: 12.5 }}>{naira(product.cost)}</T>
          </View>
          <View>
            <T style={{ color: colors.inkSoft, fontSize: 10.5 }}>Sell</T>
            <T weight="bold" style={{ fontSize: 12.5 }}>{naira(product.price)}</T>
          </View>
        </View>
        <View style={{ backgroundColor: sale.keep > 0 ? colors.successTint : colors.dangerTint, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 }}>
          <T weight="extrabold" style={{ fontSize: 12.5, color: sale.keep > 0 ? colors.success : colors.danger }}>You keep {naira(sale.keep)}</T>
        </View>
      </View>
    </Pressable>
  );
}

export default function FindProducts() {
  const loaded = useLoad(async () => {
    const context = await fetchFindContext().catch(() => null);
    const products = await fetchFindProducts(context?.country ?? "Nigeria");
    return { context, products };
  });
  // "Find another supplier" on an order opens this filtered to that product (?q=classic dashiki shirt).
  const params = useLocalSearchParams<{ q?: string }>();
  const [tab, setTab] = useState<Tab>("nigeria");
  const [q, setQ] = useState(typeof params.q === "string" ? params.q.slice(0, 60) : "");
  const [category, setCategory] = useState("");
  const products = useMemo(() => loaded.data?.products ?? [], [loaded.data]);
  const added = useMemo(() => new Set(loaded.data?.context?.addedIds ?? []), [loaded.data]);
  const categories = useMemo(() => sortCategories(products.map((product) => product.category)), [products]);
  const shown = useMemo(() => products.filter((product) => (!category || product.category === category) && matches(product, q)), [products, category, q]);
  const trending = useMemo(() => [...products].filter((product) => product.trendScore > 0).sort((a, b) => b.trendScore - a.trendScore).slice(0, 20), [products]);
  const country = loaded.data?.context?.country ?? "Nigeria";

  const grid = (list: FindProduct[]) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }}>
      {list.map((product) => <ProductCard key={product.id} product={product} added={added.has(product.id)} />)}
    </View>
  );

  return (
    <Screen title="Find products to sell" sub="From suppliers near you. Dropship or buy wholesale, or import from China." refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      <Segmented
        options={[
          { value: "nigeria", label: country === "Nigeria" ? "Nigeria" : country },
          { value: "china", label: "China · 1688" },
          { value: "trending", label: "Popular" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "nigeria" ? (
        <>
          <Field value={q} onChangeText={setQ} placeholder="Search shoes, bags, beauty…" returnKeyType="search" accessibilityLabel="Search products" style={{ height: 48 }} />
          {categories.length > 1 ? (
            <ChipRow>
              <Chip label="All" on={!category} onPress={() => setCategory("")} />
              {categories.map((name) => <Chip key={name} label={name} on={category === name} onPress={() => setCategory(category === name ? "" : name)} />)}
            </ChipRow>
          ) : null}
          {loaded.loading && !loaded.data ? <LoadingBlock label="Finding products…" /> : null}
          {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
          {loaded.data && !products.length ? (
            <EmptyState icon="search" title="Suppliers are joining now" action={<PillButton title="Ask Peggy what to sell" size="md" onPress={() => router.push({ pathname: "/peggy", params: { prompt: "What should I sell in my shop?" } })} />}>
              Checked suppliers in {country} show up here as they join. Come back in a few days, or bring products from China.
            </EmptyState>
          ) : null}
          {products.length && !shown.length ? <EmptyState icon="search" title="Nothing matches">Try fewer words, or tap &quot;All&quot;.</EmptyState> : null}
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
                <T weight="extrabold" style={{ fontSize: 16 }}>Import from China</T>
                <T style={{ color: colors.inkSoft, fontSize: 13 }}>Our sourcing partner buys on 1688, checks it and ships it to you.</T>
              </View>
            </View>
            {["Paste a 1688 link or a photo of what you want", "Get a landed price in naira, shipping and duty included", "Pay, then track it to your door"].map((line, index) => (
              <View key={line} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
                  <T weight="extrabold" style={{ fontSize: 12 }}>{String(index + 1)}</T>
                </View>
                <T style={{ flex: 1, lineHeight: 20 }}>{line}</T>
              </View>
            ))}
            <PillButton title="Request an import quote (opens in your browser)" size="md" onPress={() => void openWeb("/marketplace?tab=china")} />
          </Card>
          <Card style={{ paddingVertical: 2 }}>
            <LinkRow first icon="box" label="My imports" hint="Quotes and shipments on the way. Opens in your browser" onPress={() => void openWeb("/home/imports")} />
          </Card>
        </>
      ) : null}

      {tab === "trending" ? (
        <>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.mintTint }}>
            <Mascot name="peggy" size={44} />
            <T style={{ flex: 1, lineHeight: 20 }}>What customers are buying right now. Add one and set a price that leaves you a good profit.</T>
          </Card>
          {loaded.loading && !loaded.data ? <LoadingBlock /> : null}
          {loaded.data && !trending.length ? <EmptyState icon="sparkle" title="Nothing popular yet">Popular products show up once suppliers&apos; products start selling.</EmptyState> : null}
          {grid(trending)}
        </>
      ) : null}
      <View style={{ height: radii.field }} />
    </Screen>
  );
}
