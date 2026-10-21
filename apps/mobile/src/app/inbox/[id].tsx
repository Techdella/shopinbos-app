import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Bubble, ChatScreen, Composer } from "@/components/ChatScreen";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Chip, Mascot, Notice, PillButton, T } from "@/components/ui";
import { fetchThread, sendInboxMessage, setConversationStatus, suggestReply, type InboxMessage } from "@/lib/inbox";
import { channelLabel, NO_REPLY_CHANNELS, repliesByEmail, replySubject, shortTime } from "@/lib/inbox-pure";
import { AppIcon } from "@/components/icons";
import { useLoad } from "@/lib/useLoad";
import { formatDate } from "@shared/i18n";
import { useLocale, useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// One customer conversation (web /home/messages?c=…): the messages, "Peggy wrote a reply" for the newest customer
// message (Send it as it is, or Edit it in the box), a reply on the conversation's own channel (or a private note),
// and Done / Snooze.

// Labels are m_chats keys.
const SNOOZE: Array<{ label: "thread.snooze.1h" | "thread.snooze.3h" | "thread.snooze.tomorrow" | "thread.snooze.week"; hours: number }> = [
  { label: "thread.snooze.1h", hours: 1 },
  { label: "thread.snooze.3h", hours: 3 },
  { label: "thread.snooze.tomorrow", hours: 24 },
  { label: "thread.snooze.week", hours: 24 * 7 },
];

type Words = ReturnType<typeof useT<["m_chats", "m_ui", "common"]>>;

// Peggy's drafts, per conversation and the customer message they answer, so coming back doesn't ask (and spend
// AI credits) again. null = Peggy had nothing (no AI key, out of credits): the card stays hidden.
const DRAFTS = new Map<string, string | null>();

/** "Peggy wrote a reply" ("Familiar app" prototype `thread`): her draft for the newest customer message, with Send
 * and Edit. Asked once per message; hidden when Peggy can't answer. */
function usePeggyDraft(conversationId: string, lastInbound: InboxMessage | null, enabled: boolean) {
  const cacheKey = lastInbound ? `${conversationId}:${lastInbound.id}` : null;
  const [drafts, setDrafts] = useState<Record<string, string | null>>({});
  const known = cacheKey ? (cacheKey in drafts ? drafts[cacheKey] : DRAFTS.get(cacheKey)) : undefined;
  useEffect(() => {
    if (!enabled || !cacheKey || known !== undefined) return;
    let alive = true;
    DRAFTS.set(cacheKey, null);
    suggestReply(conversationId)
      .then((answer) => answer.text?.trim() || null)
      .catch(() => null)
      .then((text) => {
        DRAFTS.set(cacheKey, text);
        if (alive) setDrafts((all) => ({ ...all, [cacheKey]: text }));
      });
    return () => {
      alive = false;
    };
  }, [enabled, cacheKey, known, conversationId]);
  const dismiss = () => {
    if (!cacheKey) return;
    DRAFTS.set(cacheKey, null);
    setDrafts((all) => ({ ...all, [cacheKey]: null }));
  };
  return { draft: enabled ? known ?? null : null, dismiss };
}

function meta(message: InboxMessage, t: Words) {
  const when = shortTime(message.createdAt, new Date(), t);
  if (message.direction === "note") return `${t("thread.note")}${message.authorName ? ` · ${message.authorName}` : ""} · ${when}`;
  if (message.direction === "outbound") {
    if (message.status === "failed") return t("thread.notSent");
    return `${message.authorName ?? t("thread.you")} · ${when}${message.status === "read" ? ` · ${t("thread.read")}` : ""}`;
  }
  return when;
}

export default function InboxThread() {
  const t = useT("m_chats", "m_ui", "common");
  const locale = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const thread = useLoad(() => fetchThread(String(id)), String(id));
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const data = thread.data;
  const conversation = data?.conversation;
  const canReply = conversation ? !NO_REPLY_CHANNELS.includes(conversation.channel) : false;
  // Email (and contact-form) replies go out as an email from the seller's address, with "Re: <subject>".
  const byEmail = conversation ? repliesByEmail(conversation.channel) : false;
  const subjectOut = byEmail ? replySubject(conversation?.subject) : null;
  const channelName = conversation ? channelLabel(conversation.channel, t) : "";
  // The newest message is the customer's and nobody has answered: Peggy drafts a reply.
  const last = data?.messages.length ? data.messages[data.messages.length - 1] : null;
  const lastInbound = last && last.direction === "inbound" ? last : null;
  const peggy = usePeggyDraft(String(id), lastInbound, canReply && conversation?.status !== "closed");

  async function send(text = draft) {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendInboxMessage(String(id), body, canReply ? (text === draft ? mode : "reply") : "note");
      if (text === draft) setDraft("");
      else peggy.dismiss();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("thread.sendFailed"));
    } finally {
      // A failed send is saved too (marked "Not sent"), so reload either way.
      await thread.reload();
      setSending(false);
    }
  }

  async function setStatus(status: "open" | "snoozed" | "closed", hours?: number) {
    setSaving(true);
    setError(null);
    try {
      await setConversationStatus(String(id), status, hours);
      if (status === "open") await thread.reload();
      else router.back();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : t("thread.statusFailed"));
    } finally {
      setSaving(false);
    }
  }

  // Android alerts take three buttons at most, so the snooze choices show above the composer instead.
  const snooze = () => setSnoozing((on) => !on);

  const header = (
    <>
      <View style={{ flex: 1 }}>
        <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{conversation?.name ?? t("thread.conversation")}</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          {byEmail ? <AppIcon name="mail" size={14} color={colors.inkSoft} /> : null}
          <T style={{ flex: 1, color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>
            {conversation ? [channelName, conversation.contactPhone ?? conversation.contactEmail ?? conversation.contactHandle].filter(Boolean).join(" · ") : " "}
          </T>
        </View>
      </View>
    </>
  );

  return (
    <ChatScreen
      header={header}
      refreshing={thread.refreshing}
      onRefresh={() => void thread.refresh()}
      scrollKey={data?.messages.length}
      composer={
        data ? (
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => void send()}
            busy={sending}
            placeholder={!canReply || mode === "note" ? t("thread.notePlaceholder") : byEmail ? t("thread.emailPlaceholder") : channelName ? t("thread.replyOn", { channel: channelName }) : t("thread.replyHere")}
            above={
              <>
                {error ? <Notice>{error}</Notice> : null}
                {peggy.draft && !draft.trim() ? (
                  <View testID="peggy-draft" style={{ backgroundColor: colors.mintTint, borderRadius: 20, padding: 14, gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Mascot name="peggy" size={30} label="" />
                      <T weight="extrabold" style={{ flex: 1, fontSize: 15, color: colors.forest }}>{t("thread.peggyWrote")}</T>
                    </View>
                    <T style={{ fontSize: 15, lineHeight: 21 }}>{peggy.draft}</T>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <PillButton size="sm" title={t("thread.peggySend")} busy={sending} style={{ flex: 1 }} onPress={() => void send(peggy.draft!)} />
                      <PillButton
                        size="sm"
                        tone="white"
                        title={t("thread.peggyEdit")}
                        style={{ flex: 1 }}
                        onPress={() => {
                          setMode("reply");
                          setDraft(peggy.draft!);
                          peggy.dismiss();
                        }}
                      />
                    </View>
                  </View>
                ) : null}
                {byEmail && canReply && mode === "reply" ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <AppIcon name="mail" size={14} color={colors.inkSoft} />
                    <T style={{ flex: 1, color: colors.inkSoft, fontSize: 14 }} numberOfLines={2}>
                      {subjectOut ? t("thread.emailGoesAs", { subject: subjectOut }) : t("thread.emailGoes")}
                    </T>
                  </View>
                ) : null}
                {snoozing ? (
                  <View style={{ gap: 6 }}>
                    <T weight="bold" style={{ fontSize: 15 }}>{t("thread.snoozeTitle")}</T>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {SNOOZE.map((option) => <Chip key={option.hours} label={t(option.label)} on={false} onPress={() => { setSnoozing(false); void setStatus("snoozed", option.hours); }} />)}
                    </View>
                  </View>
                ) : null}
                {conversation ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {canReply ? <Chip label={t("thread.reply")} on={mode === "reply"} onPress={() => setMode("reply")} /> : null}
                    {canReply ? <Chip label={t("thread.privateNote")} on={mode === "note"} onPress={() => setMode("note")} /> : null}
                    {conversation.status === "open" ? (
                      <>
                        <Pressable accessibilityRole="button" disabled={saving} onPress={snooze} style={{ minHeight: 44, borderRadius: radii.pill, paddingHorizontal: 14, justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
                          <T weight="bold" style={{ fontSize: 15 }}>{t("thread.later")}</T>
                        </Pressable>
                        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void setStatus("closed")} style={{ minHeight: 44, borderRadius: radii.pill, paddingHorizontal: 14, justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
                          <T weight="bold" style={{ fontSize: 15 }}>{t("done")}</T>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void setStatus("open")} style={{ minHeight: 44, borderRadius: radii.pill, paddingHorizontal: 14, justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
                        <T weight="bold" style={{ fontSize: 15 }}>{t("thread.openAgain")}</T>
                      </Pressable>
                    )}
                  </View>
                ) : null}
                {canReply ? null : (
                  <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("thread.cantReply", { channel: channelName })}</T>
                )}
              </>
            }
          />
        ) : null
      }
    >
      {thread.loading && !data ? <LoadingBlock /> : null}
      {thread.error && !data ? <ErrorState message={thread.error} onRetry={() => void thread.reload()} /> : null}
      {conversation?.subject ? (
        <View style={{ gap: 2, backgroundColor: colors.surface, borderRadius: radii.card, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
          <T weight="semibold" style={{ color: colors.inkSoft, fontSize: 13 }}>{t("thread.subject")}</T>
          <T weight="bold" style={{ fontSize: 15 }}>{conversation.subject}</T>
        </View>
      ) : null}
      {conversation?.status === "snoozed" && conversation.snoozedUntil ? <Notice tone="info">{t("thread.hiddenUntil", { when: formatDate(conversation.snoozedUntil, locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }) })}</Notice> : null}
      {data && !data.messages.length ? <T style={{ color: colors.inkSoft, textAlign: "center" }}>{t("thread.noMessages")}</T> : null}
      {data?.messages.map((message) => (
        <Bubble key={message.id} mine={message.direction === "outbound"} note={message.direction === "note"} meta={meta(message, t)} failed={message.status === "failed"}>
          <View style={{ gap: 8 }}>
            {message.attachments
              .filter((attachment) => attachment.url && (attachment.type === "image" || attachment.contentType?.startsWith("image/")))
              .map((attachment, index) => (
                <Image key={index} source={{ uri: attachment.url! }} style={{ width: 200, height: 200, borderRadius: 12 }} contentFit="cover" accessibilityLabel={attachment.name ?? t("thread.photo")} />
              ))}
            {message.attachments.some((attachment) => !(attachment.url && (attachment.type === "image" || attachment.contentType?.startsWith("image/")))) ? (
              <T style={{ fontSize: 14, color: message.direction === "outbound" ? "rgba(255,255,255,0.8)" : colors.inkSoft }}>{t("thread.file")}</T>
            ) : null}
            {message.body ? <T style={{ fontSize: 15, lineHeight: 21, color: message.direction === "outbound" ? "#FFFFFF" : message.direction === "note" ? "#5C3D00" : colors.ink }}>{message.body}</T> : null}
          </View>
        </Bubble>
      ))}
    </ChatScreen>
  );
}
