"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { ConversationsModal } from "@/components/shell/ConversationsModal";

interface ChatContextValue {
  openChat: (contactId: string) => void;
}

const ChatContext = createContext<ChatContextValue>({ openChat: () => {} });

export function useChat() {
  return useContext(ChatContext);
}

export function MarketplaceChatWrapper({ children }: { children: ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [activeContact, setActiveContact] = useState<string | null>(null);

  const openChat = useCallback((contactId: string) => {
    setActiveContact(contactId);
    setChatOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
    setActiveContact(null);
  }, []);

  return (
    <ChatContext.Provider value={{ openChat }}>
      {children}
      <ConversationsModal open={chatOpen} onClose={closeChat} preselectedContactId={activeContact} />
    </ChatContext.Provider>
  );
}
