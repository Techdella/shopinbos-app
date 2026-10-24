import { MessagesTab } from "@/components/PartnerMessages";

// Supplier Chats ("Familiar app" supplier prototype `chats`): only the conversations with the shops that sell your
// products and the delivery partners you use, filtered All / Shops / Delivery partners / Unread, with a search.
// A thread opens /supplier/chat/[id].
export default function SupplierMessages() {
  return <MessagesTab base="/supplier" />;
}
