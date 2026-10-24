import { useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ChatListScreen, HeaderIcon, type ChatRowData } from "@/components/ChatList";
import { EmptyState } from "@/components/kit";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { PillButton } from "@/components/ui";
import { asSellerChatFilter, chatPreview, mergeSellerChats, SELLER_CHAT_FILTERS, sellerChatMatches, type MergedChat, type SellerChatFilter } from "@/lib/chats-pure";
import { fetchInbox } from "@/lib/inbox";
import { channelLabel } from "@/lib/inbox-pure";
import { fetchPartnerContacts } from "@/lib/partners";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Chats ("Familiar app" prototype `on.chats`): only the conversations. Customers on every channel (WhatsApp,
// Instagram, Facebook, email, the shop's live chat…) and the seller's supplier and delivery-partner chats
// (/api/conversations) in one list, newest first, with All / Customers / Partners / Unread and a search. Auto-replies,
// the Peggy chatbot and connecting channels are behind the settings button. ?filter=partners opens on Partners.

const FILTER_LABEL: Record<SellerChatFilter, "filter.all" | "chats.customers" | "chats.partners" | "view.unread"> = {
  all: "filter.all",
  customers: "chats.customers",
  partners: "chats.partners",
  unread: "view.unread",
};

const TONE = {
  customer: { bg: colors.peach, fg: colors.accentInk },
  supplier: { bg: colors.blueTint, fg: colors.blueInk },
  logistics_partner: { bg: colors.mintTint, fg: colors.forest },
};

/** The source badge on each row: the customer's channel, or the partner's kind. */
const GRAY = { bg: colors.grayTint, fg: colors.grayInk };
const CHANNEL_TONE: Record<string, { bg: string; fg: string }> = {
  whatsapp: { bg: colors.successTint, fg: colors.success },
  instagram: { bg: "#FCE4EC", fg: "#A0204F" },
  messenger: { bg: colors.blueTint, fg: colors.blueInk },
  tiktok: GRAY,
  email: { bg: colors.warnTint, fg: colors.warnInk },
  form: { bg: colors.warnTint, fg: colors.warnInk },
  livechat: { bg: colors.peach, fg: colors.accentInk },
};

function open(chat: MergedChat) {
  if (chat.kind === "partner") router.push({ pathname: "/partners/[id]", params: { id: chat.id, name: chat.name } });
  else router.push({ pathname: "/inbox/[id]", params: { id: chat.id } });
}

async function loadChats() {
  // Either half can be missing (no shop yet, an older server): show what answers.
  const [inbox, contacts] = await Promise.allSettled([fetchInbox(), fetchPartnerContacts()]);
  if (inbox.status === "rejected" && contacts.status === "rejected") throw inbox.reason;
  return mergeSellerChats(inbox.status === "fulfilled" ? inbox.value : null, contacts.status === "fulfilled" ? contacts.value : null);
}

export default function Chats() {
  const t = useT("m_chats", "m_ui", "nav");
  const params = useLocalSearchParams<{ filter?: string }>();
  const chats = useLoad(loadChats);
  const [filter, setFilter] = useState<SellerChatFilter>(asSellerChatFilter(params.filter) ?? "all");
  const [q, setQ] = useState("");
  const [settings, setSettings] = useState(false);

  // A later link with ?filter= (e.g. /partners) switches the chips while the tab stays mounted.
  const [askedFilter, setAskedFilter] = useState(params.filter);
  if (params.filter !== askedFilter) {
    setAskedFilter(params.filter);
    const asked = asSellerChatFilter(params.filter);
    if (asked) setFilter(asked);
  }

  const all = chats.data;
  const unread = (all ?? []).filter((chat) => chat.unread > 0 && chat.status !== "closed").length;
  const rows = useMemo<ChatRowData[] | null>(
    () =>
      all
        ? all
            .filter((chat) => sellerChatMatches(chat, filter, q))
            .map((chat) => ({
              key: chat.key,
              name: chat.name,
              preview: chatPreview(chat.subject, chat.preview),
              at: chat.at,
              unread: chat.unread,
              avatarUrl: chat.avatarUrl,
              tone: chat.kind === "customer" ? TONE.customer : chat.role === "logistics_partner" ? TONE.logistics_partner : TONE.supplier,
              label: chat.kind === "partner" ? t.dynamic(`partners.kind.${chat.role}`, t("partners.partner")) : channelLabel(chat.channel, t),
              badge: chat.kind === "partner" ? (chat.role === "logistics_partner" ? TONE.logistics_partner : TONE.supplier) : CHANNEL_TONE[chat.channel ?? ""] ?? GRAY,
              onPress: () => open(chat),
            }))
        : null,
    [all, filter, q, t],
  );

  const go = (path: "/inbox/auto-replies" | "/inbox/chatbot" | "/channels") => {
    setSettings(false);
    router.push(path);
  };

  return (
    <>
      <ChatListScreen
        title={t("tab.chats")}
        filters={SELLER_CHAT_FILTERS.map((key) => ({ key, label: t(FILTER_LABEL[key]), count: key === "unread" ? unread : undefined }))}
        filter={filter}
        onFilter={setFilter}
        chats={rows}
        q={q}
        onSearch={setQ}
        loading={chats.loading}
        error={chats.error}
        onRetry={() => void chats.reload()}
        refreshing={chats.refreshing}
        onRefresh={() => void chats.refresh()}
        actions={<HeaderIcon icon="settings" label={t("chats.settings")} onPress={() => setSettings(true)} />}
        empty={
          all && !all.length ? (
            <EmptyState icon="chat" title={t("list.noMessages")} action={<PillButton title={t("list.connectButton")} size="md" onPress={() => router.push("/channels")} />} />
          ) : undefined
        }
      />
      <Sheet visible={settings} onClose={() => setSettings(false)} title={t("chats.settings")}>
        <ChoiceRow icon="clock" title={t("list.autoReplies")} sub={t("list.autoRepliesHint")} onPress={() => go("/inbox/auto-replies")} />
        <ChoiceRow icon="bot" title={t("auto.chatbot")} sub={t("auto.chatbotHint")} onPress={() => go("/inbox/chatbot")} />
        <ChoiceRow icon="link" title={t("chats.channels")} sub={t("list.connectHint")} onPress={() => go("/channels")} />
      </Sheet>
    </>
  );
}
