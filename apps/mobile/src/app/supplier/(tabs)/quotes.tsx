import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { HelpButton } from "@/components/Help";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Thumb, TonePill } from "@/components/partner";
import { TabScreen } from "@/components/TabScreen";
import { Segmented, T } from "@/components/ui";
import { capitalise, friendlyDay } from "@/lib/friendly";
import { quoteStage } from "@/lib/partner-pure";
import { fetchQuoteRequests } from "@/lib/supplier";
import { bulkRequestStage, countWord } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Shops asking to buy a lot (bulk requests). Not a tab any more: new ones show at the top of Orders → New, and
// Money → "Shops asking for a lot" opens this list. Tap one to tell them your price.

export default function BulkRequests() {
  const quotes = useLoad(fetchQuoteRequests);
  const [view, setView] = useState<"waiting" | "answered">("waiting");
  const all = quotes.data ?? [];
  const waiting = all.filter((quote) => quote.status === "pending");
  const shown = view === "waiting" ? waiting : all.filter((quote) => quote.status !== "pending");

  return (
    <TabScreen title="Shops asking for a lot" action={<HelpButton />} refreshing={quotes.refreshing} onRefresh={() => void quotes.refresh()}>
      <Segmented value={view} onChange={setView} options={[{ value: "waiting", label: waiting.length ? `Waiting ${waiting.length}` : "Waiting" }, { value: "answered", label: "Answered" }]} />
      <View style={{ marginTop: 14, gap: 8 }}>
        {quotes.loading && !quotes.data ? <LoadingBlock label="Loading…" /> : null}
        {quotes.error && !quotes.data ? <ErrorState message={quotes.error} onRetry={() => void quotes.reload()} /> : null}
        {quotes.data && !shown.length ? (
          <EmptyState icon="tag" title={view === "waiting" ? "No shops waiting" : "Nothing answered yet"}>
            When a shop wants to buy a lot of one product, it shows here. Tell them your price and when it can be ready.
          </EmptyState>
        ) : null}
        {shown.map((quote) => (
          <Pressable
            key={quote.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/supplier/quote/[id]", params: { id: quote.id } })}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12, opacity: pressed ? 0.8 : 1 })}
          >
            <Thumb uri={quote.supplierProduct.images[0]} />
            <View style={{ flex: 1, gap: 3 }}>
              <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{quote.seller.name} wants {countWord(quote.quantity)}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14.5 }} numberOfLines={1}>{quote.supplierProduct.name} · {capitalise(friendlyDay(quote.createdAt))}</T>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TonePill tone={quoteStage(quote.status).tone} label={bulkRequestStage(quote.status)} />
                {quote.quotedPrice ? <TonePill tone="muted" label={`${naira(quote.quotedPrice)} each`} /> : null}
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </TabScreen>
  );
}
