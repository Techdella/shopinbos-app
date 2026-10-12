import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Badge, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { draftReviewReply, fetchReview, rememberReview, saveReviewReply, SOURCE_LABELS, stars, type ReviewItem } from "@/lib/reviews";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// One review (web /home/reviews/[key]): read it, write or edit the public reply (Peggy can draft one), delete it.
// Publishing, hiding, featuring and linking an order stay on the web.

export default function ReviewDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const review = useLoad(() => fetchReview(String(key)), String(key));
  if (!review.data) {
    return (
      <Screen title="Review" refreshing={review.refreshing} onRefresh={() => void review.refresh()}>
        {review.loading ? <LoadingBlock /> : null}
        {review.error ? <ErrorState message={review.error} onRetry={() => void review.reload()} /> : null}
        {!review.loading && !review.error ? <Notice>This review isn&apos;t there any more.</Notice> : null}
      </Screen>
    );
  }
  return <ReviewView key={review.data.key} item={review.data} onSaved={review.setData} refreshing={review.refreshing} onRefresh={() => void review.refresh()} />;
}

function ReviewView({ item, onSaved, refreshing, onRefresh }: { item: ReviewItem; onSaved: (item: ReviewItem) => void; refreshing: boolean; onRefresh: () => void }) {
  const [reply, setReply] = useState(item.reply ?? "");
  const [busy, setBusy] = useState<"save" | "draft" | "delete" | null>(null);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function save(text: string, action: "save" | "delete") {
    setBusy(action);
    setNote(null);
    try {
      const result = await saveReviewReply(item.key, text);
      const next = { ...item, reply: text.trim() || null, repliedAt: text.trim() ? new Date().toISOString() : null };
      rememberReview(next);
      onSaved(next);
      setNote({ tone: result.google === "failed" ? "error" : "success", text: result.message });
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : "Couldn't save the reply." });
    } finally {
      setBusy(null);
    }
  }

  async function draft() {
    setBusy("draft");
    setNote(null);
    try {
      setReply((await draftReviewReply(item.key)).reply);
    } catch (draftError) {
      setNote({ tone: "error", text: draftError instanceof Error ? draftError.message : "Peggy couldn't draft a reply just now." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      title={item.authorName}
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={<PillButton title={item.reply ? "Save reply" : "Post reply"} busy={busy === "save"} disabled={!reply.trim() || busy !== null} onPress={() => void save(reply, "save")} />}
    >
      <Card style={{ gap: 8 }}>
        {item.rating ? <T style={{ color: "#C98A00", fontSize: 18, letterSpacing: 1 }} accessibilityLabel={`${item.rating} out of 5`}>{stars(item.rating)}</T> : null}
        {item.title ? <T weight="extrabold" style={{ fontSize: 16 }}>{item.title}</T> : null}
        {item.body ? <T style={{ lineHeight: 22 }}>{item.body}</T> : null}
        {item.images.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {item.images.map((uri) => <Image key={uri} source={{ uri }} style={{ width: 96, height: 96, borderRadius: 12 }} contentFit="cover" />)}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Badge label={SOURCE_LABELS[item.source] ?? item.source} />
          <Badge label={new Date(item.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} />
          {item.verifiedBuyer ? <Badge label="Verified buyer" bg={colors.successTint} fg={colors.success} /> : null}
          {item.status === "pending" ? <Badge label="Waiting for approval" bg="#FDF0D5" fg="#8A5A00" /> : null}
        </View>
      </Card>

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <Card style={{ gap: 8 }}>
        <Label>Your public reply to {item.authorName}</Label>
        <Field value={reply} onChangeText={setReply} multiline maxLength={4000} placeholder="Thank them, answer what they asked, and keep it short." style={{ height: 140, paddingTop: 14, textAlignVertical: "top" }} />
        {item.source === "google" ? <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>When Google is connected, saving posts the reply on Google too.</T> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <PillButton title="Draft with Peggy" size="sm" tone="white" busy={busy === "draft"} disabled={busy !== null} onPress={() => void draft()} />
          {item.reply ? <PillButton title="Delete reply" size="sm" tone="white" busy={busy === "delete"} disabled={busy !== null} onPress={() => void save("", "delete")} /> : null}
        </View>
      </Card>

      <LinkButton title="Publish, hide or feature on the web" color={colors.inkSoft} onPress={() => void openWeb(`/home/reviews/${encodeURIComponent(item.key)}`)} />
    </Screen>
  );
}
