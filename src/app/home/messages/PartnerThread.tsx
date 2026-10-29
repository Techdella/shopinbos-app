"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/app-ui";
import { Avatar } from "@/components/seller-core";
import { Icon } from "@/components/ui/Icon";
import { formatWhen } from "@/components/messaging/inbox-ui";
import { getMessages, markConversationAsRead, sendMessage } from "@/app/actions/messaging";
import { useLocale, useT } from "@/components/i18n/I18nProvider";

// A chat with a supplier or delivery partner (the Conversation/Message models), inside the unified inbox.

interface PartnerMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
}

export function PartnerThread({
  conversationId,
  recipientId,
  name,
  roleLabel,
  meId,
  onBack,
  onStarted,
}: {
  conversationId: string | null;
  recipientId: string;
  name: string;
  roleLabel: string;
  meId: string;
  onBack: () => void;
  onStarted: (conversationId: string) => void;
}) {
  const t = useT("inbox", "common");
  const locale = useLocale();
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let live = true;
    const load = () =>
      getMessages(conversationId).then((items) => {
        if (live) setMessages(items);
      });
    void load().then(() => markConversationAsRead(conversationId));
    const timer = window.setInterval(() => void load(), 10_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    const form = new FormData();
    if (conversationId) form.set("conversationId", conversationId);
    else form.set("recipientId", recipientId);
    form.set("text", text);
    const res = await sendMessage(form);
    setSending(false);
    if (!res.success) {
      setError(res.error ?? t("partner.sendFailed"));
      return;
    }
    setText("");
    if (res.conversationId) {
      if (!conversationId) onStarted(res.conversationId);
      setMessages(await getMessages(res.conversationId));
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-app-line px-3 py-2.5 sm:px-5">
        <button type="button" onClick={onBack} aria-label={t("thread.back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas lg:hidden">
          <Icon name="arrowLeft" size={18} />
        </button>
        <Avatar name={name} size={38} />
        <div className="min-w-0">
          <h2 className="m-0 truncate text-[15px] font-extrabold">{name}</h2>
          <div className="text-[12.5px] text-app-ink-soft">{t("partner.onShopinbos", { role: roleLabel })}</div>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-app-canvas/50 px-3 py-4 sm:px-5" aria-live="polite">
        {messages.length === 0 ? (
          <p className="m-0 p-6 text-center text-[14px] text-app-ink-soft">{t("partner.empty", { name })}</p>
        ) : (
          messages.map((msg) => {
            const mine = msg.senderId === meId;
            return (
              <div key={msg.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cx("max-w-[85%] rounded-[18px] px-3.5 py-2.5 text-[14px] leading-[1.45] sm:max-w-[70%]", mine ? "rounded-br-[6px] bg-app-ink text-white" : "rounded-bl-[6px] border border-app-line bg-white")}>
                  <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                  <div suppressHydrationWarning className={cx("mt-1 text-right text-[11px]", mine ? "text-white/60" : "text-app-ink-faint")}>{formatWhen(msg.createdAt, locale)}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="border-t border-app-line px-3 py-2.5 sm:px-5"
      >
        {error && <p role="alert" className="m-0 mb-2 text-[13px] font-semibold text-app-danger">{error}</p>}
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={t("partner.messageName", { name })}
            placeholder={t("partner.write")}
            disabled={sending}
            className="h-11 min-w-0 flex-1 rounded-full border border-app-line bg-white px-4 text-[16px] outline-none placeholder:text-app-ink-faint focus:border-app-ink sm:text-[15px]"
          />
          <button type="submit" disabled={sending || !text.trim()} aria-label={t("send")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-accent text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
            <Icon name="send" size={17} />
          </button>
        </div>
      </form>
    </>
  );
}
