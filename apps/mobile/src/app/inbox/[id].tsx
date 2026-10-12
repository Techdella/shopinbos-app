import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Bubble, ChatScreen, Composer } from "@/components/ChatScreen";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Chip, Notice, T } from "@/components/ui";
import { fetchThread, sendInboxMessage, setConversationStatus, type InboxMessage } from "@/lib/inbox";
import { NO_REPLY_CHANNELS, shortTime } from "@/lib/inbox-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// One customer conversation (web /home/messages?c=…): the messages, a reply on the conversation's own channel
// (or a private note), and Done / Snooze.

const SNOOZE: Array<{ label: string; hours: number }> = [
  { label: "1 hour", hours: 1 },
  { label: "3 hours", hours: 3 },
  { label: "Tomorrow", hours: 24 },
  { label: "Next week", hours: 24 * 7 },
];

function meta(message: InboxMessage) {
  const when = shortTime(message.createdAt);
  if (message.direction === "note") return `Note${message.authorName ? ` · ${message.authorName}` : ""} · ${when}`;
  if (message.direction === "outbound") {
    if (message.status === "failed") return `Not sent${message.error ? `: ${message.error}` : ""}`;
    return `${message.authorName ?? "You"} · ${when}${message.status === "read" ? " · Read" : ""}`;
  }
  return when;
}

export default function InboxThread() {
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

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendInboxMessage(String(id), body, canReply ? mode : "note");
      setDraft("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Couldn't send that. Try again.");
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
      setError(statusError instanceof Error ? statusError.message : "Couldn't update the conversation.");
    } finally {
      setSaving(false);
    }
  }

  // Android alerts take three buttons at most, so the snooze choices show above the composer instead.
  const snooze = () => setSnoozing((on) => !on);

  const header = (
    <>
      <View style={{ flex: 1 }}>
        <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{conversation?.name ?? "Conversation"}</T>
        <T style={{ color: colors.inkSoft, fontSize: 12.5 }} numberOfLines={1}>
          {conversation ? [conversation.channelLabel, conversation.contactPhone ?? conversation.contactEmail ?? conversation.contactHandle].filter(Boolean).join(" · ") : " "}
        </T>
      </View>
      {conversation ? (
        conversation.status === "open" ? (
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Pressable accessibilityRole="button" disabled={saving} onPress={snooze} style={{ height: 38, borderRadius: radii.pill, paddingHorizontal: 12, justifyContent: "center", backgroundColor: colors.surface }}>
              <T weight="bold" style={{ fontSize: 13 }}>Snooze</T>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void setStatus("closed")} style={{ height: 38, borderRadius: radii.pill, paddingHorizontal: 14, justifyContent: "center", backgroundColor: colors.ink }}>
              <T weight="bold" style={{ fontSize: 13, color: "#FFFFFF" }}>Done</T>
            </Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void setStatus("open")} style={{ height: 38, borderRadius: radii.pill, paddingHorizontal: 14, justifyContent: "center", backgroundColor: colors.surface }}>
            <T weight="bold" style={{ fontSize: 13 }}>Reopen</T>
          </Pressable>
        )
      ) : null}
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
            placeholder={!canReply || mode === "note" ? "Private note (only your team sees it)" : `Reply on ${conversation?.channelLabel ?? "this channel"}`}
            above={
              <>
                {error ? <Notice>{error}</Notice> : null}
                {snoozing ? (
                  <View style={{ gap: 6 }}>
                    <T weight="bold" style={{ fontSize: 13 }}>Snooze until… (it comes back sooner if they write again)</T>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {SNOOZE.map((option) => <Chip key={option.hours} label={option.label} on={false} onPress={() => { setSnoozing(false); void setStatus("snoozed", option.hours); }} />)}
                    </View>
                  </View>
                ) : null}
                {canReply ? (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Chip label="Reply" on={mode === "reply"} onPress={() => setMode("reply")} />
                    <Chip label="Note" on={mode === "note"} onPress={() => setMode("note")} />
                  </View>
                ) : (
                  <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>You can&apos;t reply on {conversation?.channelLabel} from Shopinbos. Notes stay private.</T>
                )}
              </>
            }
          />
        ) : null
      }
    >
      {thread.loading && !data ? <LoadingBlock /> : null}
      {thread.error && !data ? <ErrorState message={thread.error} onRetry={() => void thread.reload()} web={{ label: "Open on web", onPress: () => void openWeb(`/home/messages?c=${encodeURIComponent(String(id))}`) }} /> : null}
      {conversation?.subject ? <T weight="bold" style={{ color: colors.inkSoft }}>{conversation.subject}</T> : null}
      {conversation?.status === "snoozed" && conversation.snoozedUntil ? <Notice tone="info">Snoozed until {new Date(conversation.snoozedUntil).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}.</Notice> : null}
      {data && !data.messages.length ? <T style={{ color: colors.inkSoft, textAlign: "center" }}>No messages yet.</T> : null}
      {data?.messages.map((message) => (
        <Bubble key={message.id} mine={message.direction === "outbound"} note={message.direction === "note"} meta={meta(message)} failed={message.status === "failed"}>
          <View style={{ gap: 8 }}>
            {message.attachments
              .filter((attachment) => attachment.url && (attachment.type === "image" || attachment.contentType?.startsWith("image/")))
              .map((attachment, index) => (
                <Image key={index} source={{ uri: attachment.url! }} style={{ width: 200, height: 200, borderRadius: 12 }} contentFit="cover" accessibilityLabel={attachment.name ?? "Photo"} />
              ))}
            {message.attachments.some((attachment) => !(attachment.url && (attachment.type === "image" || attachment.contentType?.startsWith("image/")))) ? (
              <T style={{ fontSize: 13, color: message.direction === "outbound" ? "rgba(255,255,255,0.8)" : colors.inkSoft }}>Attachment (open on the web to see it)</T>
            ) : null}
            {message.body ? <T style={{ fontSize: 15, lineHeight: 21, color: message.direction === "outbound" ? "#FFFFFF" : message.direction === "note" ? "#5C3D00" : colors.ink }}>{message.body}</T> : null}
          </View>
        </Bubble>
      ))}
    </ChatScreen>
  );
}
