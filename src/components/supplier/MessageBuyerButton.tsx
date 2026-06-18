"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { ConversationsModal } from "@/components/shell/ConversationsModal";

interface MessageBuyerButtonProps {
  sellerUserId: string;
  sellerName: string;
}

export function MessageBuyerButton({ sellerUserId, sellerName }: MessageBuyerButtonProps) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="dbtn dBtn-ghost"
        style={{ padding: "5px 9px", fontSize: 12 }}
        onClick={() => setChatOpen(true)}
        title={`Message ${sellerName}`}
      >
        <Icon name="chat" size={12} /> Message
      </button>
      <ConversationsModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        preselectedContactId={sellerUserId}
      />
    </>
  );
}
