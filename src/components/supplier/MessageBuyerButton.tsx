"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ConversationsModal } from "@/components/shell/ConversationsModal";
import { useT } from "@/components/i18n/I18nProvider";

interface MessageBuyerButtonProps {
  sellerUserId: string;
  sellerName: string;
}

export function MessageBuyerButton({ sellerUserId, sellerName }: MessageBuyerButtonProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const t = useT("supplier");

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold text-app-ink transition hover:border-app-line-strong"
        onClick={() => setChatOpen(true)}
        aria-label={t("messageBuyer.aria", { name: sellerName })}
      >
        <Icon name="chat" size={14} /> {t("messageBuyer.button")}
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
