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
import { colors } from "@/theme";

// Reviews (web /home/reviews): the overview numbers, every review with a filter for the ones that still need a
// reply, and "Ask for reviews". Importing, Google and the widget stay on the web.

type Filter = "all" | "needed" | "5" | "4" | "3" | "2" | "1";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "needed", label: "Needs reply" },
  { value: "5", label: "5★" },
  { value: "4", label: "4★" },
  { value: "3", label: "3★" },
  { value: "2", label: "2★" },
  { value: "1", label: "1★" },
];

export default function Reviews() {
  const [filter, setFilter] = useState<Filter>("all");
  const reviews = useLoad(() => fetchReviews({ reply: filter === "needed" ? "needed" : null, rating: /^\d$/.test(filter) ? Number(filter) : null }), filter);
  const summary = reviews.data?.summary;

  return (
    <Screen
      title="Reviews"
      sub="What customers say about your shop."
      refreshing={reviews.refreshing}
      onRefresh={() => void reviews.refresh()}
    >
      <PillButton title="Ask for reviews" onPress={() => router.push("/reviews/ask")} />

      {summary ? (
        <Card style={{ flexDirection: "row", gap: 10 }}>
          {[
            [summary.rated ? summary.average.toFixed(1) : "–", "Average"],
            [String(summary.count), "Reviews"],
            [`${summary.responseRate}%`, "Replied"],
            [String(summary.needsReply), "Need reply"],
          ].map(([value, label]) => (
            <View key={label} style={{ flex: 1, alignItems: "center" }}>
              <T weight="extrabold" style={{ fontSize: 20 }}>{value}</T>
              <T style={{ color: colors.inkSoft, fontSize: 13 }}>{label}</T>
            </View>
          ))}
        </Card>
      ) : null}

      <ChipRow>
        {FILTERS.map((option) => <Chip key={option.value} label={option.value === "needed" && summary?.needsReply ? `Needs reply ${summary.needsReply}` : option.label} on={filter === option.value} onPress={() => setFilter(option.value)} />)}
      </ChipRow>

      {reviews.loading && !reviews.data ? <LoadingBlock /> : null}
      {reviews.error && !reviews.data ? <ErrorState message={reviews.error} onRetry={() => void reviews.reload()} /> : null}
      {reviews.data && !reviews.data.items.length ? (
        <EmptyState icon="star" title={filter === "all" ? "No reviews yet" : "Nothing here"} >
          {filter === "all" ? "Send buyers a link to rate what they bought. Reviews help new shoppers trust you." : filter === "needed" ? "You've replied to everything. Nice." : "No reviews with that many stars. Tap All to see the rest."}
        </EmptyState>
      ) : null}

      {reviews.data?.items.map((item) => (
        <Pressable key={item.key} accessibilityRole="button" onPress={() => router.push({ pathname: "/reviews/[key]", params: { key: item.key } })} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <T weight="extrabold" style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{item.authorName}</T>
              <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{shortTime(item.createdAt)}</T>
            </View>
            {item.rating ? <T style={{ color: "#C98A00", fontSize: 15, letterSpacing: 1 }} accessibilityLabel={`${item.rating} out of 5`}>{stars(item.rating)}</T> : null}
            {item.title ? <T weight="bold">{item.title}</T> : null}
            {item.body ? <T style={{ color: colors.inkSoft, lineHeight: 20 }} numberOfLines={3}>{item.body}</T> : null}
            {item.images.length ? (
              <View style={{ flexDirection: "row", gap: 6 }}>
                {item.images.slice(0, 4).map((uri) => <Image key={uri} source={{ uri }} style={{ width: 52, height: 52, borderRadius: 10 }} contentFit="cover" />)}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              <Badge label={SOURCE_LABELS[item.source] ?? item.source} />
              {item.verifiedBuyer ? <Badge label="Verified buyer" bg={colors.successTint} fg={colors.success} /> : null}
              {item.status === "pending" ? <Badge label="Waiting for approval" bg="#FDF0D5" fg="#8A5A00" /> : null}
              {item.status === "rejected" ? <Badge label="Hidden" /> : null}
              {item.reply ? <Badge label="Replied" bg={colors.mintTint} fg={colors.forest} /> : <Badge label="Reply" bg={colors.peach} fg={colors.accentInk} />}
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
