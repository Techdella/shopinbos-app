import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Thumb, TonePill } from "@/components/partner";
import { TabScreen } from "@/components/TabScreen";
import { Segmented, T } from "@/components/ui";
import { quoteStage, timeAgo } from "@/lib/partner-pure";
import { fetchQuoteRequests } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Quote requests: shops asking for a custom quantity and price. Tap one to reply with a price and minimum order.

export default function SupplierQuotes() {
  const quotes = useLoad(fetchQuoteRequests);
  const [view, setView] = useState<"waiting" | "answered">("waiting");
  const all = quotes.data ?? [];
  const waiting = all.filter((quote) => quote.status === "pending");
  const shown = view === "waiting" ? waiting : all.filter((quote) => quote.status !== "pending");

  return (
    <TabScreen title="Quotes" refreshing={quotes.refreshing} onRefresh={() => void quotes.refresh()}>
      <Segmented value={view} onChange={setView} options={[{ value: "waiting", label: waiting.length ? `Waiting ${waiting.length}` : "Waiting" }, { value: "answered", label: "Answered" }]} />
      <View style={{ marginTop: 14, gap: 8 }}>
        {quotes.loading && !quotes.data ? <LoadingBlock label="Loading quote requests…" /> : null}
        {quotes.error && !quotes.data ? <ErrorState message={quotes.error} onRetry={() => void quotes.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/supplier/quote-requests") }} /> : null}
        {quotes.data && !shown.length ? (
          <EmptyState icon="tag" title={view === "waiting" ? "No requests waiting" : "Nothing answered yet"}>
            Shops ask for custom quantities and prices here. Reply with an offer and agree the deal in one thread.
          </EmptyState>
        ) : null}
        {shown.map((quote) => {
          const stage = quoteStage(quote.status);
          return (
            <Pressable
              key={quote.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/supplier/quote/[id]", params: { id: quote.id } })}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12, opacity: pressed ? 0.8 : 1 })}
            >
              <Thumb uri={quote.supplierProduct.images[0]} />
              <View style={{ flex: 1, gap: 3 }}>
                <T weight="extrabold" style={{ fontSize: 14.5 }} numberOfLines={1}>{quote.supplierProduct.name} × {quote.quantity.toLocaleString("en-NG")}</T>
                <T style={{ color: colors.inkSoft, fontSize: 12.5 }} numberOfLines={1}>{quote.seller.name} · to {quote.destination} · {timeAgo(quote.createdAt)}</T>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TonePill tone={stage.tone} label={stage.label} />
                  {quote.quotedPrice ? <TonePill tone="muted" label={`${naira(quote.quotedPrice)} a unit`} /> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </TabScreen>
  );
}
