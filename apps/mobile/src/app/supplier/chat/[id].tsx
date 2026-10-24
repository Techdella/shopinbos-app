import { ConversationScreen } from "@/components/PartnerMessages";
import { useT } from "@/lib/i18n";
import { supplierQuickReplies } from "@/lib/supplier-pure";

// One supplier chat: the shared conversation screen, with the supplier's quick replies before the first message
// ("Yes, I have it" to a shop, "Please call when you arrive" to a delivery company).
export default function SupplierChat() {
  const t = useT("m_supplier");
  return <ConversationScreen base="/supplier" quickReplies={(role) => supplierQuickReplies(role).map((key) => t.dynamic(key))} />;
}
