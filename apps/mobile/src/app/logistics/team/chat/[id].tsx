import { useLocalSearchParams } from "expo-router";
import { RiderChat } from "@/components/RiderChat";
import { useT } from "@/lib/i18n";
import { riderCompanyMessages, sendRiderCompanyMessage } from "@/lib/logistics";

// The delivery company's chat with one of its riders (from the rider's page): the rider writes from the Riders app.

export default function TeamRiderChat() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const t = useT("m_partner");
  const riderId = String(id ?? "");
  return (
    <RiderChat
      title={String(name ?? "") || t("rider.title")}
      subtitle={t("rider.chatSub")}
      loadKey={riderId}
      load={async () => (await riderCompanyMessages(riderId)).messages}
      send={(body) => sendRiderCompanyMessage(riderId, body)}
      backTo="/logistics/riders"
      voice
    />
  );
}
