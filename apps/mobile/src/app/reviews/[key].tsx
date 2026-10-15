import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Badge, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { draftReviewReply, fetchReview, moderateReview, rememberReview, saveReviewReply, SOURCE_LABELS, stars, type ReviewItem } from "@/lib/reviews";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { formatDate } from "@shared/i18n";
import { useLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { VoiceInput } from "@/components/VoiceInput";

// One review (web /home/reviews/[key]): read it, write or edit the public reply (Peggy can draft one), delete the
// reply, and Publish / Move to waiting / Hide / Feature it. Sharing it as a picture, linking an order and deleting
// the review stay on the web.

type Moderation = { status: ReviewItem["status"] } | { featured: boolean };

// m_reviews keys for the line under "On your shop" and the note after a change.
const STATE_LINE = { approved: "detail.shown", pending: "detail.notShown", rejected: "detail.hidden" } as const;
const STATUS_DONE = { approved: "detail.nowPublished", pending: "detail.nowWaiting", rejected: "detail.nowHidden" } as const;

export default function ReviewDetail() {
  const t = useT("m_reviews");
  const { key } = useLocalSearchParams<{ key: string }>();
  const review = useLoad(() => fetchReview(String(key)), String(key));
  if (!review.data) {
    return (
      <Screen title={t("detail.title")} refreshing={review.refreshing} onRefresh={() => void review.refresh()}>
        {review.loading ? <LoadingBlock /> : null}
        {review.error ? <ErrorState message={review.error} onRetry={() => void review.reload()} /> : null}
        {!review.loading && !review.error ? <Notice>{t("detail.gone")}</Notice> : null}
      </Screen>
    );
  }
  return <ReviewView key={review.data.key} item={review.data} onSaved={review.setData} refreshing={review.refreshing} onRefresh={() => void review.refresh()} />;
}

function ReviewView({ item, onSaved, refreshing, onRefresh }: { item: ReviewItem; onSaved: (item: ReviewItem) => void; refreshing: boolean; onRefresh: () => void }) {
  const t = useT("m_reviews");
  const locale = useLocale();
  const [reply, setReply] = useState(item.reply ?? "");
  const [busy, setBusy] = useState<"save" | "draft" | "delete" | "approved" | "pending" | "rejected" | "feature" | null>(null);
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
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : t("detail.saveFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function moderate(change: Moderation) {
    setBusy("status" in change ? change.status : "feature");
    setNote(null);
    try {
      const next = await moderateReview(item.key, change);
      onSaved({ ...item, status: next.status, featured: next.featured });
      setNote({ tone: "success", text: t("status" in change ? STATUS_DONE[change.status] : change.featured ? "detail.nowFeatured" : "detail.nowUnfeatured") });
    } catch (changeError) {
      setNote({ tone: "error", text: changeError instanceof Error ? changeError.message : t("detail.changeFailed") });
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
      setNote({ tone: "error", text: draftError instanceof Error ? draftError.message : t("detail.draftFailed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      title={item.authorName}
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={<PillButton title={item.reply ? t("detail.save") : t("detail.post")} busy={busy === "save"} disabled={!reply.trim() || busy !== null} onPress={() => void save(reply, "save")} />}
    >
      <Card style={{ gap: 8 }}>
        {item.rating ? <T style={{ color: "#C98A00", fontSize: 18, letterSpacing: 1 }} accessibilityLabel={t("outOf5", { rating: item.rating })}>{stars(item.rating)}</T> : null}
        {item.title ? <T weight="extrabold" style={{ fontSize: 16 }}>{item.title}</T> : null}
        {item.body ? <T style={{ lineHeight: 22 }}>{item.body}</T> : null}
        {item.images.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {item.images.map((uri) => <Image key={uri} source={{ uri }} style={{ width: 96, height: 96, borderRadius: 12 }} contentFit="cover" />)}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Badge label={t.dynamic(`source.${item.source}`, SOURCE_LABELS[item.source] ?? item.source)} />
          <Badge label={formatDate(item.createdAt, locale)} />
          {item.verifiedBuyer ? <Badge label={t("badge.verified")} bg={colors.successTint} fg={colors.success} /> : null}
          {item.status === "pending" ? <Badge label={t("badge.pending")} bg="#FDF0D5" fg="#8A5A00" /> : null}
          {item.status === "rejected" ? <Badge label={t("badge.hidden")} /> : null}
          {item.featured ? <Badge label={t("badge.featured")} bg={colors.peach} fg={colors.accentInk} /> : null}
        </View>
      </Card>

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <Card style={{ gap: 8 }}>
        <Label>{t("detail.replyTo", { name: item.authorName })}</Label>
        <Field value={reply} onChangeText={setReply} multiline maxLength={4000} placeholder={t("detail.placeholder")} style={{ height: 140, paddingTop: 14, textAlignVertical: "top" }} />
        <VoiceInput value={reply} onChange={setReply} maxLength={4000} context="a reply to a customer review" />
        {item.source === "google" ? <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("detail.google")}</T> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <PillButton title={t("detail.draft")} size="sm" tone="white" busy={busy === "draft"} disabled={busy !== null} onPress={() => void draft()} />
          {item.reply ? <PillButton title={t("detail.delete")} size="sm" tone="white" busy={busy === "delete"} disabled={busy !== null} onPress={() => void save("", "delete")} /> : null}
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>{t("detail.onShop")}</T>
        <T style={{ color: item.status === "approved" ? colors.success : colors.inkSoft, fontSize: 15 }}>{t(STATE_LINE[item.status])}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {item.status !== "approved" ? <PillButton title={t("detail.publish")} size="sm" busy={busy === "approved"} disabled={busy !== null} onPress={() => void moderate({ status: "approved" })} /> : null}
          {item.status !== "pending" ? <PillButton title={t("detail.wait")} size="sm" tone="white" busy={busy === "pending"} disabled={busy !== null} onPress={() => void moderate({ status: "pending" })} /> : null}
          {item.status !== "rejected" ? <PillButton title={t("detail.hide")} size="sm" tone="white" busy={busy === "rejected"} disabled={busy !== null} onPress={() => void moderate({ status: "rejected" })} /> : null}
          <PillButton title={item.featured ? t("detail.unfeature") : t("detail.feature")} size="sm" tone={item.featured ? "accent" : "white"} busy={busy === "feature"} disabled={busy !== null} onPress={() => void moderate({ featured: !item.featured })} />
        </View>
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("detail.featureNote")}</T>
      </Card>

      <LinkButton title={t("detail.web")} color={colors.inkSoft} onPress={() => void openWeb(`/home/reviews/${encodeURIComponent(item.key)}`)} />
    </Screen>
  );
}
