import { useLocalSearchParams } from "expo-router";
import { RiderChat } from "@/components/RiderChat";
import { riderMessages, sendRiderMessage } from "@/lib/rider";
import { useRiderStrings } from "@/lib/rider-strings";

// Riders app chat: ?with=company (the rider's delivery company, from Me) or ?with=shop&job=<id>&name=<shop> (the shop
// on a job the rider carries, from the job's steps).

export default function RiderChatScreen() {
  const params = useLocalSearchParams<{ with?: string; job?: string; name?: string }>();
  const { say } = useRiderStrings();
  const shop = params.with === "shop";
  const job = shop ? String(params.job ?? "") : undefined;
  const audience = shop ? "shop" : "company";
  const name = String(params.name ?? "") || (shop ? say("chat.theShop") : say("chat.yourCompany"));
  return (
    <RiderChat
      title={name}
      subtitle={shop ? say("chat.aboutJob") : say("chat.company")}
      loadKey={`${audience}-${job ?? ""}`}
      load={async () => (await riderMessages({ with: audience, job })).messages}
      send={async (body) => (await sendRiderMessage({ with: audience, job, body })).message}
      backTo="/rider"
    />
  );
}
