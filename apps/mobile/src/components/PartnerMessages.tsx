import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { offPlatformSignals } from "@shared/delivery-market";
import { Bubble, ChatScreen, Composer } from "@/components/ChatScreen";
import { List, Pill, Row, Seg, Small, Sub, Title } from "@/components/design";
import { HelpButton } from "@/components/Help";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { Card, Field, Notice, PillButton, T } from "@/components/ui";
import { shortTime } from "@/lib/inbox-pure";
import { fetchChatContacts, ROLE_LABEL } from "@/lib/partner-chat";
import { fetchPartnerMessages, sendPartnerMessage } from "@/lib/partners";
import { useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Chats for the supplier and delivery partner apps ("Delivery partner app" prototype `chats` and `thread`): the
// shops and suppliers they work with, the same threads as the web portal's inbox. In a thread everyone sees "Keep it
// on Shopinbos" when a message (or what they're typing) looks like moving the job off the app (shared
// offPlatformSignals). Delivery partners also get quick replies before their first message and "Send them a private
// rate" when they're talking to a seller or supplier.

type Base = "/supplier" | "/logistics";

const AVATAR: Record<string, { bg: string; fg: string }> = {
  seller: { bg: colors.peach, fg: colors.accentInk },
  supplier: { bg: colors.blueTint, fg: colors.blueInk },
  logistics_partner: { bg: colors.mintTint, fg: colors.forest },
};

/** The chips over the list when `filters` is on ("Familiar app" F-Delivery `chatFilters`). */
type ChatFilter = "all" | "unread" | "seller" | "supplier";
const FILTERS: { key: ChatFilter; label: string }[] = [
  { key: "all", label: "fam.chats.all" },
  { key: "unread", label: "fam.chats.unread" },
  { key: "seller", label: "fam.chats.sellers" },
  { key: "supplier", label: "fam.chats.suppliers" },
];

export function MessagesTab({ base, webPath, filters = false }: { base: Base; webPath: string; /** All / Unread / Sellers / Suppliers chips (delivery partners). */ filters?: boolean }) {
  const t = useT("m_partner");
  const contacts = useLoad(fetchChatContacts);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const partner = base === "/logistics";
  const shown = (contact: { unread: number; role: string }) => !filters || filter === "all" || (filter === "unread" ? contact.unread > 0 : contact.role === filter);
  const matches = (contacts.data ?? []).filter((contact) => !q.trim() || `${contact.name} ${contact.lastMessage ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const list = matches.filter(shown);
  const unread = (contacts.data ?? []).filter((contact) => contact.unread > 0).length;

  const header = (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46 }}>
        <Title style={{ flex: 1 }}>{partner ? t("chats.title") : t("chat.title")}</Title>
        {contacts.data ? <Pill tone="teal" label={unread ? t("chats.new", { count: unread }) : t("chats.allRead")} /> : null}
        <HelpButton />
      </View>
      {partner ? <Sub>{t("chats.sub")}</Sub> : null}
    </View>
  );

  return (
    <TabScreen header={header} refreshing={contacts.refreshing} onRefresh={() => void contacts.refresh()}>
      {(contacts.data?.length ?? 0) > 6 ? <Field value={q} onChangeText={setQ} placeholder={t("chat.search")} returnKeyType="search" accessibilityLabel={t("chat.searchLabel")} style={{ height: 48 }} /> : null}
      {contacts.loading && !contacts.data ? <LoadingBlock label={t("chat.loading")} /> : null}
      {contacts.error && !contacts.data ? <ErrorState message={contacts.error} onRetry={() => void contacts.reload()} web={{ label: t("openOnWeb"), onPress: () => void openWeb(webPath) }} /> : null}
      {filters && contacts.data?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          {FILTERS.map((option) => (
            <Seg key={option.key} label={t.dynamic(option.label)} on={filter === option.key} onPress={() => setFilter(option.key)} />
          ))}
        </ScrollView>
      ) : null}
      {contacts.data && matches.length && !list.length ? (
        <Card style={{ padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
          <Sub>{t("fam.chats.noneHere")}</Sub>
        </Card>
      ) : null}
      {contacts.data && !matches.length ? (
        <EmptyState icon="chat" title={contacts.data.length ? t("chat.noMatch") : t("chat.none")}>
          {contacts.data.length ? t("chat.tryName") : t("chat.noneBody")}
        </EmptyState>
      ) : null}
      {list.length ? (
        <List>
          {list.map((contact) => {
            const tone = AVATAR[contact.role] ?? AVATAR.logistics_partner;
            const role = t.dynamic(`chat.role.${contact.role}`, ROLE_LABEL[contact.role] ?? t("chat.role.other"));
            return (
              <Row
                key={contact.id}
                accessibilityLabel={contact.unread ? t("chat.unread", { name: contact.name, count: contact.unread }) : `${contact.name}, ${role}`}
                lead={<Initials name={contact.name} bg={tone.bg} fg={tone.fg} />}
                title={contact.name}
                sub={`${contact.lastMessage || t("chat.none")}${contact.lastMessageAt ? ` · ${shortTime(contact.lastMessageAt)}` : ""}`}
                right={contact.unread ? <View accessibilityLabel={t("chats.newDot")} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent }} /> : undefined}
                chevron={false}
                onPress={() => router.push({ pathname: `${base}/chat/[id]` as never, params: { id: contact.id, name: contact.name, role: contact.role } })}
              />
            );
          })}
        </List>
      ) : null}
    </TabScreen>
  );
}

/** Quick replies a delivery partner can send before their first message in a thread (m_partner "quick.<n>"). */
const QUICK = ["quick.0", "quick.1", "quick.2"] as const;

/** One conversation (?name= is shown while the messages load, ?role= is the other side's role). */
export function ConversationScreen({ webPath }: { webPath: string }) {
  const { id, name, role } = useLocalSearchParams<{ id: string; name?: string; role?: string }>();
  const t = useT("m_partner");
  const tu = useT("m_ui");
  const messages = useLoad(() => fetchPartnerMessages(String(id)), String(id));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = name || t("chat.conversation");
  const partner = webPath.startsWith("/logistics");
  // A job's "Message the shop" opens this without a role: that's the seller.
  const otherRole = role || (partner ? "seller" : "");
  const canRate = partner && (otherRole === "seller" || otherRole === "supplier");
  const list = messages.data ?? [];
  const sentAny = list.some((message) => message.mine);
  const warn = offPlatformSignals(draft).length > 0 || list.some((message) => offPlatformSignals(message.text).length > 0);

  async function send(text = draft.trim()) {
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendPartnerMessage(String(id), text);
      if (text === draft.trim()) setDraft("");
      messages.setData([...(messages.data ?? []), sent]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("chat.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  const quick = partner && messages.data && !sentAny ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
      {QUICK.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          disabled={sending}
          onPress={() => void send(t(key))}
          style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: "center", opacity: pressed || sending ? 0.7 : 1 })}
        >
          <T weight="bold" style={{ fontSize: 15 }}>{t(key)}</T>
        </Pressable>
      ))}
    </ScrollView>
  ) : null;

  return (
    <ChatScreen
      header={
        <>
          <Initials name={title} size={40} bg={(AVATAR[otherRole] ?? AVATAR.logistics_partner).bg} fg={(AVATAR[otherRole] ?? AVATAR.logistics_partner).fg} />
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{title}</T>
            <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>{otherRole ? t.dynamic(`chat.role.${otherRole}`, ROLE_LABEL[otherRole] ?? t("chat.role.other")) : t("chat.onShopinbos")}</T>
          </View>
        </>
      }
      refreshing={messages.refreshing}
      onRefresh={() => void messages.refresh()}
      scrollKey={`${list.length}-${warn ? 1 : 0}`}
      composer={
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => void send()}
          busy={sending}
          placeholder={t("chat.messageTo", { name: title })}
          above={
            <>
              {quick}
              {error ? <Notice>{error}</Notice> : null}
            </>
          }
        />
      }
    >
      {messages.loading && !messages.data ? <LoadingBlock /> : null}
      {messages.error && !messages.data ? <ErrorState message={messages.error} onRetry={() => void messages.reload()} web={{ label: t("openOnWeb"), onPress: () => void openWeb(webPath) }} /> : null}
      {messages.data && !messages.data.length ? <Small style={{ textAlign: "center" }}>{t("chat.empty")}</Small> : null}
      {list.map((message) => (
        <Bubble key={message.id} mine={message.mine} meta={shortTime(message.createdAt)}>{message.text}</Bubble>
      ))}
      {warn ? (
        <View accessibilityRole="alert" style={{ backgroundColor: colors.warnTint, borderRadius: 24, padding: 20, gap: 8, marginTop: 4 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{tu("chat.keepTitle")}</T>
          <T style={{ fontSize: 16, lineHeight: 24, color: colors.warnInk }}>{tu("chat.keepBody")}</T>
        </View>
      ) : null}
      {canRate ? (
        <PillButton tone="white" onPress={() => router.push({ pathname: "/logistics/private-rate", params: { ownerUserId: String(id), name: title } })}>
          <AppIcon name="tag" size={20} />
          <T weight="extrabold" style={{ fontSize: 17 }}>{t("chat.privateRate")}</T>
        </PillButton>
      ) : null}
    </ChatScreen>
  );
}
