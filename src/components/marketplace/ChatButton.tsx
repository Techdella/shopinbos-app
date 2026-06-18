"use client";

import { useChat } from "./MarketplaceChatWrapper";

interface ChatButtonProps {
  contactId: string;
  label?: string;
}

export function ChatButton({ contactId, label = "Chat" }: ChatButtonProps) {
  const { openChat } = useChat();

  return (
    <button
      type="button"
      className="dbtn dBtn-ghost dBtn-sm"
      style={{ flex: 1, justifyContent: "center", fontSize: 12 }}
      onClick={() => openChat(contactId)}
    >
      {label}
    </button>
  );
}
