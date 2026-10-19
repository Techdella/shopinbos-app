import { getT } from "@/lib/i18n/server";
import { embeddedSignupConfig } from "@/lib/inbox/channels/whatsapp";
import { channelCards } from "@/lib/sales-channels/server";
import { PLATFORM_NAME, type LivePlatform } from "@/lib/sales-channels/pure";
import { ConnectCard } from "./ChannelClient";

// The one-screen "Connect your accounts": the same cards on /channels, Inbox → Channels and Start here. Connect
// once and it shows everywhere (inbox, WhatsApp catalog, Facebook & Instagram shop, Post & share).
// `only`: which cards to show (the inbox shows WhatsApp and Facebook & Instagram); `next`: where a sign-in returns.

export async function ConnectAccounts({ storeId, only, next, columns = "sm:grid-cols-2 xl:grid-cols-3" }: { storeId: string; only?: LivePlatform[]; next?: "/home/connections" | "/home/inbox/channels" | "/home/start"; columns?: string }) {
  const t = await getT("social", "common");
  // Falls back to no cards rather than taking the page down; logged so the cause shows in the server logs.
  const cards = await channelCards(storeId)
    .then((result) => result.cards)
    .catch((error: unknown) => {
      console.error("[connect-accounts] channel cards failed", error instanceof Error ? `${error.name}: ${error.message.slice(0, 300)}` : "unknown");
      return [];
    });
  const signup = embeddedSignupConfig();
  const shown = only ? cards.filter((card) => only.includes(card.platform)) : cards;
  return (
    <ul className={`m-0 grid list-none gap-4 p-0 ${columns}`}>
      {shown.map((card) => (
        <ConnectCard
          key={card.platform}
          platform={card.platform}
          name={PLATFORM_NAME[card.platform]}
          line={t(`p.${card.platform}`)}
          state={card.state}
          accountUrl={card.accountUrl}
          signup={card.platform === "whatsapp" ? signup : null}
          accounts={card.accounts}
          next={next}
        />
      ))}
    </ul>
  );
}
