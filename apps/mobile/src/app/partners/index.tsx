import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { PillButton, Segmented, T } from "@/components/ui";
import { shortTime } from "@/lib/inbox-pure";
import { fetchPartnerContacts, PARTNER_LABEL, type PartnerKind } from "@/lib/partners";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Messages with suppliers and delivery partners (the web inbox's partner chats). All / Suppliers / Logistics.

type Tab = "all" | PartnerKind;

export default function Partners() {
  const contacts = useLoad(fetchPartnerContacts);
  const [tab, setTab] = useState<Tab>("all");
  const list = useMemo(() => (contacts.data ?? []).filter((contact) => tab === "all" || contact.kind === tab), [contacts.data, tab]);

  return (
    <Screen title="Partner messages" sub="Suppliers you buy from and delivery partners you ship with." refreshing={contacts.refreshing} onRefresh={() => void contacts.refresh()}>
      <Segmented
        options={[
          { value: "all", label: "All" },
          { value: "supplier", label: "Suppliers" },
          { value: "logistics_partner", label: "Logistics" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {contacts.loading && !contacts.data ? <LoadingBlock /> : null}
      {contacts.error && !contacts.data ? <ErrorState message={contacts.error} onRetry={() => void contacts.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/home/messages") }} /> : null}
      {contacts.data && !list.length ? (
        <EmptyState icon="truck" title="No conversations yet" action={<PillButton title="Find products" size="sm" onPress={() => router.push("/find")} />}>
          {tab === "logistics_partner" ? "Book a delivery partner on the web and their messages show up here." : "Message a supplier from any product in Find products."}
        </EmptyState>
      ) : null}
      <View style={{ gap: 8 }}>
        {list.map((contact) => (
          <Pressable
            key={contact.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/partners/[id]", params: { id: contact.id, name: contact.name } })}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12, opacity: pressed ? 0.8 : 1 })}
          >
            <Initials name={contact.name} bg={contact.kind === "supplier" ? colors.mintTint : colors.peach} fg={contact.kind === "supplier" ? colors.forest : colors.accentInk} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <T weight={contact.unread ? "extrabold" : "bold"} style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{contact.name}</T>
                {contact.lastMessageAt ? <T style={{ color: colors.inkSoft, fontSize: 12 }}>{shortTime(contact.lastMessageAt)}</T> : null}
              </View>
              <T style={{ color: contact.unread ? colors.ink : colors.inkSoft, fontSize: 13 }} numberOfLines={1}>{contact.lastMessage ?? "Say hello"}</T>
              <T weight="semibold" style={{ color: colors.inkSoft, fontSize: 11.5 }}>{PARTNER_LABEL[contact.kind]}</T>
            </View>
            {contact.unread ? (
              <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 12 }}>{String(contact.unread)}</T>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
