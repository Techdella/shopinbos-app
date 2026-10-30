import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ChatContextBar } from "@/components/ChatContextBar";
import { RiderChat } from "@/components/RiderChat";
import { useT } from "@/lib/i18n";
import { jobRiderMessages, sendJobRiderMessage, type JobRiderContext } from "@/lib/delivery";

// The shop's chat with the rider carrying one of its parcels (from the order: "Message the rider", and from Chats →
// Riders). The bar at the top is the delivery and the order it carries (it comes with the messages). Voice notes: the
// mic writes down what you say and sends it.

export default function DeliveryRiderChat() {
  const { job, name } = useLocalSearchParams<{ job: string; name?: string }>();
  const t = useT("m_orders", "m_chats");
  const jobId = String(job ?? "");
  const [context, setContext] = useState<JobRiderContext | null>(null);
  return (
    <RiderChat
      title={String(name ?? "") || context?.riderName || t("order2.yourRider")}
      subtitle={context?.company ? t("chats.riderFor", { company: context.company }) : t("order2.riderChatSub")}
      loadKey={jobId}
      load={async () => {
        const answer = await jobRiderMessages(jobId);
        setContext(answer.job ?? null);
        return answer.messages;
      }}
      send={(body) => sendJobRiderMessage(jobId, body)}
      backTo="/chats"
      voice
      context={context ? <ChatContextBar order={context.order} deliveryStatus={context.deliveryStatus} /> : null}
    />
  );
}
