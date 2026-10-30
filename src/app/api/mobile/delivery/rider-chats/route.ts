import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { listShopRiderThreads } from "@/lib/logistics/rider-messages.server";

export const dynamic = "force-dynamic";

// The shop's chats with the riders carrying its parcels (shared/seller-inbox.ts ShopRiderChat), for the unified
// inbox on the web (/home/messages) and the phone's Chats tab: one per job a rider has, newest first, each with the
// order it belongs to, the delivery status, the last message and the rider's unread messages.
//   GET → ShopRiderChat[]

export const GET = withSeller(async (_req, { user }) => ok(await listShopRiderThreads(user.id)));
