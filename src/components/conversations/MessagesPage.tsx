import { Messenger } from "./Messenger";
import { parseContextParam, type PartnerRole } from "@/lib/conversations/pure";

// The full-page messenger for /home/messages/partners, /supplier/inbox and /logistics/inbox.
// URL: ?c=<conversationId> opens a chat; ?with=<user|supplier|partner id>&ctx=<kind:id> starts one with a card.

export type MessagesSearchParams = { c?: string; with?: string; ctx?: string };

export function MessagesPage({ role, params }: { role: PartnerRole; params?: MessagesSearchParams }) {
  const context = parseContextParam(params?.ctx);
  const initial = params?.with
    ? { with: params.with.slice(0, 64), context }
    : params?.c
      ? { conversation: params.c.slice(0, 64), context }
      : null;
  return <Messenger role={role} variant="page" initial={initial} />;
}
