"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Messenger } from "@/components/conversations/Messenger";
import { OPEN_CONVERSATION_EVENT, type OpenConversationDetail } from "@/components/conversations/client";
import type { PartnerRole } from "@/lib/conversations/pure";
import { useT } from "@/components/i18n/I18nProvider";

// The "Messages" drawer: chats with suppliers, sellers and delivery partners (tabs, search, the open chat).
// The top bar mounts it with onOpenRequest, so openConversation({ with, context }) from any page opens it.

interface ConversationsModalProps {
  open: boolean;
  onClose: () => void;
  /** User id, supplier id or delivery partner id to open a chat with. */
  preselectedContactId?: string | null;
  role?: PartnerRole;
  /** Set by the top bar: lets openConversation() open this drawer from anywhere on the page. */
  onOpenRequest?: () => void;
}

export function ConversationsModal({ open, onClose, preselectedContactId, role = "seller", onOpenRequest }: ConversationsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [request, setRequest] = useState<(OpenConversationDetail & { at: number }) | null>(null);
  const t = useT("shell");

  useEffect(() => {
    if (!onOpenRequest) return;
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenConversationDetail>).detail ?? {};
      event.preventDefault();
      setRequest({ ...detail, at: Date.now() });
      onOpenRequest();
    };
    window.addEventListener(OPEN_CONVERSATION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CONVERSATION_EVENT, onOpen);
  }, [onOpenRequest]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = setTimeout(() => {
      setMounted(false);
      setRequest(null);
    }, 200);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const initial: (OpenConversationDetail & { at?: number }) | null = request ?? (preselectedContactId ? { with: preselectedContactId } : null);

  return (
    <div className="fixed inset-0 z-50 font-app text-app-ink">
      <div onClick={onClose} aria-hidden className="absolute inset-0 bg-[rgba(15,25,22,0.35)] transition-opacity duration-200" style={{ opacity: visible ? 1 : 0 }} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("messages.title")}
        className="absolute right-0 top-0 flex h-full w-full flex-col border-l border-app-line bg-white shadow-[0_20px_60px_-20px_rgba(22,20,31,0.45)] transition-transform duration-200 ease-out sm:w-[480px]"
        style={{ transform: visible ? "translateX(0)" : "translateX(100%)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-app-line px-4 py-3.5 sm:px-5">
          <h2 className="m-0 text-[17px] font-extrabold">{t("messages.title")}</h2>
          <button type="button" onClick={onClose} aria-label={t("messages.close")} className="grid h-9 w-9 place-items-center rounded-full border border-app-line text-app-ink-soft hover:border-app-line-strong hover:text-app-ink">
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <Messenger key={initial ? JSON.stringify(initial) : "list"} role={role} variant="drawer" initial={initial} onNavigate={onClose} />
        </div>
      </aside>
    </div>
  );
}
