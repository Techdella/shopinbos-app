import "server-only";

import Link from "next/link";
import { Card, TextLink } from "@/components/app-kit";
import { cx } from "@/components/app-ui/cx";
import { PartnerAvatar } from "@/components/conversations/parts";
import { timeAgo, type LogisticsT } from "@/components/logistics/kit";
import { listConversations } from "@/lib/conversations/service.server";
import { listRiderThreads } from "@/lib/logistics/rider-messages.server";
import { chatHref, mergeChatList, recentChats, totalUnread, type ChatListItem } from "@shared/logistics-chats";
import { ChatKindChip } from "./ChatKindChip";

// "Messages" on the delivery partner's Today page: the latest chats (unread first) with their riders, shops and
// suppliers, each opening the chat on the Messages page (/logistics/inbox), and "See all".

/** The newest chats for the card; an empty list when they can't be read (Today still loads). */
export async function recentPartnerChats(viewer: { id: string; role: string; name?: string | null }, partnerId: string, limit = 5) {
  const [conversations, riders] = await Promise.all([
    listConversations(viewer).catch(() => []),
    listRiderThreads(partnerId).catch(() => []),
  ]);
  const items = mergeChatList(conversations, riders);
  return { items: recentChats(items, limit), unread: totalUnread(items) };
}

export function MessagesCard({ items, unread, now, t }: { items: ChatListItem[]; unread: number; now: Date; t: LogisticsT }) {
  return (
    <Card className="p-5" as="section">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 flex items-center gap-2 text-[17px] font-extrabold">
          {t("chats.card.title")}
          {unread > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-app-accent px-1.5 text-[11px] font-extrabold text-white">
              <span aria-hidden>{unread > 99 ? "99+" : unread}</span>
              <span className="sr-only">{t("chats.card.unread", { count: unread })}</span>
            </span>
          )}
        </h2>
        <TextLink href="/logistics/inbox">{t("seeAll")}</TextLink>
      </div>
      {items.length === 0 ? (
        <p className="m-0 mt-2 text-[15px] text-app-ink-soft">{t("chats.card.empty")}</p>
      ) : (
        <ul className="m-0 mt-2 grid list-none gap-0 p-0">
          {items.map((item) => (
            <li key={item.key} className="border-t border-app-line first:border-t-0">
              <Link href={chatHref(item)} className="flex min-w-0 items-center gap-3 py-2.5 text-app-ink no-underline hover:opacity-90">
                <PartnerAvatar name={item.name} logoUrl={item.logoUrl} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cx("min-w-0 truncate text-[15px]", item.unread ? "font-extrabold" : "font-bold")}>{item.name}</span>
                    <ChatKindChip kind={item.kind} />
                    <span className="ml-auto shrink-0 text-[12.5px] text-app-ink-faint">{item.at ? timeAgo(new Date(item.at), now, t) : ""}</span>
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-2">
                    <span className={cx("min-w-0 flex-1 truncate text-[14px]", item.unread ? "font-semibold text-app-ink" : "text-app-ink-soft")}>
                      {item.last ? `${item.last.mine ? `${t("chats.you")} ` : ""}${item.last.text}` : ""}
                    </span>
                    {item.unread > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-app-accent px-1.5 text-[11px] font-extrabold text-white">{item.unread > 99 ? "99+" : item.unread}</span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
