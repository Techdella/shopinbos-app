import { useLocalSearchParams } from "expo-router";
import { RiderChat } from "@/components/RiderChat";
import { useT } from "@/lib/i18n";
import { jobRiderMessages, sendJobRiderMessage } from "@/lib/delivery";

// The shop's chat with the rider carrying one of its parcels (from the order: "Message the rider").

export default function DeliveryRiderChat() {
  const { job, name } = useLocalSearchParams<{ job: string; name?: string }>();
  const t = useT("m_orders");
  const jobId = String(job ?? "");
  return (
    <RiderChat
      title={String(name ?? "") || t("order2.yourRider")}
      subtitle={t("order2.riderChatSub")}
      loadKey={jobId}
      load={async () => (await jobRiderMessages(jobId)).messages}
      send={(body) => sendJobRiderMessage(jobId, body)}
      backTo="/orders"
    />
  );
}
