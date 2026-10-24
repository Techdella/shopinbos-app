import { MessagesTab } from "@/components/PartnerMessages";

// Chats only, with filters All / Shops / Suppliers / Unread.
export default function LogisticsMessages() {
  return <MessagesTab base="/logistics" />;
}
