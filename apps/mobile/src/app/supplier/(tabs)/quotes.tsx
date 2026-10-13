import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { HelpButton } from "@/components/Help";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Thumb, TonePill } from "@/components/partner";
import { TabScreen } from "@/components/TabScreen";
import { Segmented, T } from "@/components/ui";
import { capitalise } from "@/lib/friendly";
import { useT } from "@/lib/i18n";
import { dayWord, quoteStage } from "@/lib/partner-pure";
import { fetchQuoteRequests } from "@/lib/supplier";
import { quoteRequestStage, countWord } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Quote requests: shops asking for a price on a large order. Not a tab any more: new ones show at the top of
// Orders → New, and Money → "Quote requests" opens this list. Tap one to send your quote.

export default function QuoteRequests() {
  const t = useT("m_supplier", "m_partner", "common");
  const quotes = useLoad(fetchQuoteRequests);
  const [view, setView] = useState<"waiting" | "answered">("waiting");
  const all = quotes.data ?? [];
  const waiting = all.filter((quote) => quote.status === "pending");
  const shown = view === "waiting" ? waiting : all.filter((quote) => quote.status !== "pending");

  return (
    <TabScreen title={t("quotes.title")} action={<HelpButton />} refreshing={quotes.refreshing} onRefresh={() => void quotes.refresh()}>
      <Segmented value={view} onChange={setView} options={[{ value: "waiting", label: waiting.length ? t("quotes.waitingCount", { count: waiting.length }) : t("quotes.waiting") }, { value: "answered", label: t("quotes.answered") }]} />
      <View style={{ marginTop: 14, gap: 8 }}>
        {quotes.loading && !quotes.data ? <LoadingBlock label={t("loading")} /> : null}
        {quotes.error && !quotes.data ? <ErrorState message={quotes.error} onRetry={() => void quotes.reload()} /> : null}
        {quotes.data && !shown.length ? (
          <EmptyState icon="tag" title={view === "waiting" ? t("quotes.noneWaiting") : t("quotes.noneAnswered")}>
            {t("quotes.noneBody")}
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
              <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{t("wants", { shop: quote.seller.name, pieces: countWord(quote.quantity, t) })}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14.5 }} numberOfLines={1}>{quote.supplierProduct.name} · {capitalise(dayWord(quote.createdAt, undefined, t))}</T>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TonePill tone={quoteStage(quote.status).tone} label={quoteRequestStage(quote.status, t)} />
                {quote.quotedPrice ? <TonePill tone="muted" label={t("each", { price: naira(quote.quotedPrice) })} /> : null}
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </TabScreen>
  );
}
