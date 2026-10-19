import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Badge, ChipRow, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, PillButton, T } from "@/components/ui";
import { shortTime } from "@/lib/inbox-pure";
import { fetchReviews, SOURCE_LABELS, stars } from "@/lib/reviews";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Reviews (web /home/reviews): the overview numbers, every review with a filter for the ones that still need a
// reply, and "Ask for reviews". Importing, Google and the widget stay on the web.

type Filter = "all" | "needed" | "5" | "4" | "3" | "2" | "1";

// "all" and "needed" are m_reviews keys; star counts stay as they are.
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "filter.all" },
  { value: "needed", label: "filter.needed" },
  { value: "5", label: "5★" },
  { value: "4", label: "4★" },
  { value: "3", label: "3★" },
  { value: "2", label: "2★" },
  { value: "1", label: "1★" },
];

export default function Reviews() {
  const t = useT("m_reviews", "m_ui");
  const [filter, setFilter] = useState<Filter>("all");
  const reviews = useLoad(() => fetchReviews({ reply: filter === "needed" ? "needed" : null, rating: /^\d$/.test(filter) ? Number(filter) : null }), filter);
  const summary = reviews.data?.summary;

  return (
    <Screen
      title={t("title")}
      sub={t("sub")}
      refreshing={reviews.refreshing}
      onRefresh={() => void reviews.refresh()}
    >
      <PillButton title={t("ask")} onPress={() => router.push("/reviews/ask")} />

      {summary ? (
        <Card style={{ flexDirection: "row", gap: 10 }}>
          {[
            [summary.rated ? summary.average.toFixed(1) : "–", t("summary.average")],
            [String(summary.count), t("summary.count")],
            [`${summary.responseRate}%`, t("summary.replied")],
            [String(summary.needsReply), t("summary.needReply")],
          ].map(([value, label]) => (
            <View key={label} style={{ flex: 1, alignItems: "center" }}>
              <T weight="extrabold" style={{ fontSize: 20 }}>{value}</T>
              <T style={{ color: colors.inkSoft, fontSize: 13 }}>{label}</T>
            </View>
          ))}
        </Card>
      ) : null}

      <ChipRow>
        {FILTERS.map((option) => <Chip key={option.value} label={option.value === "needed" && summary?.needsReply ? t("filter.neededCount", { count: summary.needsReply }) : t.dynamic(option.label, option.label)} on={filter === option.value} onPress={() => setFilter(option.value)} />)}
      </ChipRow>

      {reviews.loading && !reviews.data ? <LoadingBlock /> : null}
      {reviews.error && !reviews.data ? <ErrorState message={reviews.error} onRetry={() => void reviews.reload()} /> : null}
      {reviews.data && !reviews.data.items.length ? (
        <EmptyState icon="star" title={filter === "all" ? t("empty.title") : t("empty.nothing")} >
          {filter === "all" ? t("empty.body") : filter === "needed" ? t("empty.allReplied") : t("empty.noStars")}
        </EmptyState>
      ) : null}

      {reviews.data?.items.map((item) => (
        <Pressable key={item.key} accessibilityRole="button" onPress={() => router.push({ pathname: "/reviews/[key]", params: { key: item.key } })} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <T weight="extrabold" style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{item.authorName}</T>
              <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{shortTime(item.createdAt, new Date(), t)}</T>
            </View>
            {item.rating ? <T style={{ color: "#C98A00", fontSize: 15, letterSpacing: 1 }} accessibilityLabel={t("outOf5", { rating: item.rating })}>{stars(item.rating)}</T> : null}
            {item.title ? <T weight="bold">{item.title}</T> : null}
            {item.body ? <T style={{ color: colors.inkSoft, lineHeight: 20 }} numberOfLines={3}>{item.body}</T> : null}
            {item.images.length ? (
              <View style={{ flexDirection: "row", gap: 6 }}>
                {item.images.slice(0, 4).map((uri) => <Image key={uri} source={{ uri }} style={{ width: 52, height: 52, borderRadius: 10 }} contentFit="cover" />)}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              <Badge label={t.dynamic(`source.${item.source}`, SOURCE_LABELS[item.source] ?? item.source)} />
              {item.verifiedBuyer ? <Badge label={t("badge.verified")} bg={colors.successTint} fg={colors.success} /> : null}
              {item.status === "pending" ? <Badge label={t("badge.pending")} bg="#FDF0D5" fg="#8A5A00" /> : null}
              {item.status === "rejected" ? <Badge label={t("badge.hidden")} /> : null}
              {item.reply ? <Badge label={t("badge.replied")} bg={colors.mintTint} fg={colors.forest} /> : <Badge label={t("badge.reply")} bg={colors.peach} fg={colors.accentInk} />}
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
