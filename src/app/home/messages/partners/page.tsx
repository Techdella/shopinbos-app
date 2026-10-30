import { redirect } from "next/navigation";
import type { MessagesSearchParams } from "@/components/conversations/MessagesPage";
import { partnersPageRedirect } from "@shared/seller-inbox";

export const dynamic = "force-dynamic";

// Supplier and delivery-partner chats now live in the seller's one inbox (/home/messages). Old links keep working:
// ?c=<conversation> opens that chat, ?with=<id>&ctx=<kind:id> starts one, and no params opens the list on
// suppliers and delivery partners (shared/seller-inbox.ts partnersPageRedirect).
export default async function SellerPartnerMessagesPage({ searchParams }: { searchParams?: Promise<MessagesSearchParams> }) {
  redirect(partnersPageRedirect(await searchParams));
}
