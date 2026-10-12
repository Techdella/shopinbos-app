"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
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
        className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-extrabold text-app-ink transition hover:border-app-line-strong"
        onClick={() => setChatOpen(true)}
        aria-label={`Message ${sellerName}`}
      >
        <Icon name="chat" size={14} /> Message
      </button>
      <ConversationsModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        preselectedContactId={sellerUserId}
        role="supplier"
      />
    </>
  );
}
