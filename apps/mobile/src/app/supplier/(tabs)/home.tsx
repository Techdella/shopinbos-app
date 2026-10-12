import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { PartnerHeader, PartnerScroll, StatTile, Thumb, TonePill } from "@/components/partner";
import { Card, LinkButton, T } from "@/components/ui";
import { OrderRow } from "@/components/SupplierOrderRow";
import { timeAgo, verificationStage } from "@/lib/partner-pure";
import { fetchSupplierOverview } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// Supplier Home: orders to pack today, wholesale orders, quote requests, low stock, what's been earned and
// verification. Numbers from /api/mobile/supplier/overview (same rules as the web supplier dashboard).

export default function SupplierHome() {
  const overview = useLoad(fetchSupplierOverview);
  const data = overview.data;
  const verification = data ? verificationStage(data.supplier.verificationStatus) : null;

  return (
    <PartnerScroll refreshing={overview.refreshing} onRefresh={() => void overview.refresh()}>
      <PartnerHeader
        eyebrow="Shopinbos Suppliers"
        name={data?.supplier.name ?? "Your business"}
        logoUrl={data?.supplier.logoUrl}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Messages" onPress={() => router.push("/supplier/messages")} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="chat" size={20} />
          </Pressable>
        }
      />

      {overview.loading && !data ? <LoadingBlock label="Loading your orders…" /> : null}
      {overview.error && !data ? <ErrorState message={overview.error} onRetry={() => void overview.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/supplier/dashboard") }} /> : null}

      {data && verification ? (
        <>
          {data.supplier.verificationStatus !== "verified" || !data.supplier.onboarded ? (
            <Pressable accessibilityRole="button" onPress={() => router.push("/supplier/verification")} style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <AppIcon name="shield" size={20} color={colors.forest} />
                <T weight="extrabold" style={{ flex: 1, fontSize: 15 }}>{data.supplier.onboarded ? verification.label : "Finish setting up"}</T>
                <AppIcon name="chevron" size={18} color={colors.inkSoft} />
              </View>
              <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{data.supplier.onboarded ? verification.hint : "Tell us what you supply and where, then upload your documents to start taking orders."}</T>
            </Pressable>
          ) : null}

          <View>
            <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.8, lineHeight: 34 }} accessibilityRole="header">
              {data.counts.toPack ? `${data.counts.toPack} to pack today` : "Nothing to pack"}
            </T>
            <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.8, lineHeight: 34 }}>{naira(data.earned)} earned</T>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatTile label="To pack" value={data.counts.toPack} onPress={() => router.push("/supplier/orders")} />
            <StatTile label="Wholesale" value={data.counts.wholesale} onPress={() => router.push("/supplier/orders")} />
            <StatTile label="Quotes" value={data.counts.quotes} onPress={() => router.push("/supplier/quotes")} />
          </View>

          <SectionTitle action={<LinkButton title="See all" color={colors.accentInk} onPress={() => router.push("/supplier/orders")} style={{ minHeight: 32 }} />}>Orders to pack</SectionTitle>
          {data.toPack.length ? (
            <View style={{ gap: 8 }}>{data.toPack.map((order) => <OrderRow key={order.id} order={order} />)}</View>
          ) : (
            <EmptyState icon="bag" title="All packed">When a shop sells one of your products, the order lands here with their label details.</EmptyState>
          )}

          {data.wholesale.length ? (
            <>
              <SectionTitle>Wholesale orders</SectionTitle>
              <View style={{ gap: 8 }}>{data.wholesale.map((order) => <OrderRow key={order.id} order={order} />)}</View>
            </>
          ) : null}

          {data.quotes.length ? (
            <>
              <SectionTitle action={<LinkButton title="See all" color={colors.accentInk} onPress={() => router.push("/supplier/quotes")} style={{ minHeight: 32 }} />}>Quote requests</SectionTitle>
              <View style={{ gap: 8 }}>
                {data.quotes.map((quote) => (
                  <Pressable key={quote.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/supplier/quote/[id]", params: { id: quote.id } })} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12, opacity: pressed ? 0.8 : 1 })}>
                    <Thumb uri={quote.image} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T weight="extrabold" style={{ fontSize: 14.5 }} numberOfLines={1}>{quote.product} × {quote.quantity.toLocaleString("en-NG")}</T>
                      <T style={{ color: colors.inkSoft, fontSize: 12.5 }} numberOfLines={1}>{quote.seller} · to {quote.destination} · {timeAgo(quote.createdAt)}</T>
                    </View>
                    <TonePill tone="accent" label="Reply" />
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {data.lowStock.length ? (
            <>
              <SectionTitle>Low stock</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {data.lowStock.map((product, index) => (
                  <Pressable key={product.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/supplier/product/[id]", params: { id: product.id } })} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                    <Thumb uri={product.image} size={40} />
                    <T weight="semibold" style={{ flex: 1 }} numberOfLines={1}>{product.name}</T>
                    <TonePill tone={product.stock === 0 ? "danger" : "warning"} label={product.stock === 0 ? "Sold out" : `${product.stock} left`} />
                  </Pressable>
                ))}
              </Card>
            </>
          ) : null}

          <View style={{ backgroundColor: "#FDF0D5", borderRadius: radii.card, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T weight="extrabold" style={{ fontSize: 15 }}>Payouts</T>
              <T weight="extrabold" style={{ fontSize: 17 }}>{naira(data.earned)}</T>
            </View>
            <T style={{ color: "#6B4A00", lineHeight: 20 }}>
              {data.bank
                ? `${data.bank.bankName} ${data.bank.account}${data.bank.ready ? " · payouts go to this account" : " · we're checking this account"}`
                : "From shipped and delivered orders. Add your bank account to get paid."}
            </T>
            <Pressable accessibilityRole="button" onPress={() => void openWeb("/supplier/payouts")} style={{ alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: radii.pill, paddingHorizontal: 16, minHeight: 40, justifyContent: "center" }}>
              <T weight="bold" style={{ color: "#FFFFFF", fontSize: 13.5 }}>{data.bank ? "Open payouts" : "Add bank account"}</T>
            </Pressable>
          </View>
        </>
      ) : null}
    </PartnerScroll>
  );
}
