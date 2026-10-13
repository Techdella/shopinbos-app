"use client";

import { useChat } from "./MarketplaceChatWrapper";
import { useT } from "@/components/i18n/I18nProvider";

interface ChatButtonProps {
  contactId: string;
  label?: string;
}

export function ChatButton({ contactId, label }: ChatButtonProps) {
  const t = useT("marketplace");
  const { openChat } = useChat();

  return (
    <button
      type="button"
      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-extrabold text-app-ink transition hover:border-app-line-strong"
      onClick={() => openChat(contactId)}
    >
      {label ?? t("chat")}
    </button>
  );
}
