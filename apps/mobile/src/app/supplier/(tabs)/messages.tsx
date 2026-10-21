import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { List, Row, Seg, Small, Sub, Title } from "@/components/design";
import { HelpButton } from "@/components/Help";
import { AppIcon } from "@/components/icons";
import { ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { Field, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { shortTime } from "@/lib/inbox-pure";
import { fetchChatContacts, ROLE_LABEL } from "@/lib/partner-chat";
import { CHAT_FILTERS, chatMatches, type ChatFilter } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Supplier Chats ("Familiar app" supplier prototype `chats`): the shops that sell your products and the delivery
// companies you use (the same threads as the web portal's inbox, /api/conversations), filtered All / Unread / Shops
// / Delivery by the other side's role. The search button shows a search box. A thread opens /supplier/chat/[id].

const AVATAR: Record<string, { bg: string; fg: string }> = {
  seller: { bg: colors.peach, fg: colors.accentInk },
  supplier: { bg: colors.blueTint, fg: colors.blueInk },
  logistics_partner: { bg: colors.mintTint, fg: colors.forest },
};

const FILTER_WORD: Record<ChatFilter, string> = { all: "chats.f.all", unread: "chats.f.unread", shops: "chats.f.shops", delivery: "chats.f.delivery" };

export default function SupplierMessages() {
  const t = useT("m_supplier", "m_partner");
  const contacts = useLoad(fetchChatContacts);
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const all = contacts.data ?? [];
  const query = q.trim().toLowerCase();
  const list = all.filter((contact) => chatMatches(contact, filter) && (!query || `${contact.name} ${contact.lastMessage ?? ""}`.toLowerCase().includes(query)));

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46 }}>
      <Title style={{ flex: 1 }}>{t("chats.title")}</Title>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("chat.searchLabel")}
        accessibilityState={{ expanded: searching }}
        onPress={() => {
          if (searching) setQ("");
          setSearching(!searching);
        }}
        hitSlop={6}
        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
      >
        <AppIcon name={searching ? "x" : "search"} size={21} />
      </Pressable>
      <HelpButton />
    </View>
  );

  return (
    <TabScreen header={header} refreshing={contacts.refreshing} onRefresh={() => void contacts.refresh()}>
      {searching ? <Field value={q} onChangeText={setQ} placeholder={t("chat.search")} returnKeyType="search" autoFocus accessibilityLabel={t("chat.searchLabel")} style={{ height: 48 }} /> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20 }}>
          {CHAT_FILTERS.map((key) => (
            <Seg key={key} label={t.dynamic(FILTER_WORD[key])} on={filter === key} onPress={() => setFilter(key)} count={key === "unread" && contacts.data ? all.filter((contact) => contact.unread > 0).length : undefined} />
          ))}
        </View>
      </ScrollView>

      {contacts.loading && !contacts.data ? <LoadingBlock label={t("chat.loading")} /> : null}
      {contacts.error && !contacts.data ? <ErrorState message={contacts.error} onRetry={() => void contacts.reload()} web={{ label: t("openOnWeb"), onPress: () => void openWeb("/supplier/inbox") }} /> : null}

      {contacts.data && !list.length ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18 }}>
          <Sub>{all.length ? t("chats.empty") : t("chat.noneBody")}</Sub>
        </View>
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
                sub={contact.lastMessage || role}
                right={
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    {contact.lastMessageAt ? <T style={{ fontSize: 12.5, color: contact.unread ? colors.accentInk : colors.inkSoft }}>{shortTime(contact.lastMessageAt)}</T> : null}
                    {contact.unread ? (
                      <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                        <T weight="extrabold" style={{ fontSize: 12, color: colors.ink }}>{contact.unread}</T>
                      </View>
                    ) : null}
                  </View>
                }
                chevron={false}
                onPress={() => router.push({ pathname: "/supplier/chat/[id]", params: { id: contact.id, name: contact.name, role: contact.role } })}
              />
            );
          })}
        </List>
      ) : null}

      {contacts.data ? <Small style={{ textAlign: "center" }}>{t("chats.footer")}</Small> : null}
    </TabScreen>
  );
}
