"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { askRex, getSuggestions } from "@/app/actions/ai";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

interface Message {
  role: "user" | "assistant";
  text: string;
  actions?: Array<{
    label: string;
    href?: string;
    prompt?: string;
    icon: "check" | "eye" | "wand";
  }>;
}

/** The conversation so far as plain turns for Rex (the greeting and placeholders are left out). */
function historyFor(messages: Message[]) {
  return messages
    .slice(1)
    .filter((message) => message.text && message.text !== "...")
    .map((message) => ({ role: message.role, content: message.text }));
}

interface AssistantRexDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialMessage?: string;
  userName?: string;
}

export function AssistantRexDrawer({
  isOpen,
  onClose,
  initialMessage,
  userName,
}: AssistantRexDrawerProps) {
  const t = useT("rex");
  const pathname = usePathname();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestionChips, setSuggestionChips] = useState<string[]>(() => [
    t("drawer.chip.build"),
    t("drawer.chip.landing"),
    t("drawer.chip.descriptions"),
    t("drawer.chip.upload"),
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pageContext = {
    path: pathname,
    label: pathname.startsWith("/products")
      ? "Products"
      : pathname.includes("/builder") || pathname.includes("/editor")
        ? "Store Builder"
        : pathname.includes("/verification")
          ? "Verification"
          : pathname.includes("/orders")
            ? "Orders"
            : "Dashboard",
  };

  const messageFromResult = useCallback((result: Awaited<ReturnType<typeof askRex>>): Message => {
    if ("error" in result && result.error) {
      return { role: "assistant", text: result.error };
    }

    const meta = "meta" in result
      ? result.meta as {
          needsConfirmation?: boolean;
          confirmationLabel?: string | null;
          draftCreated?: boolean;
          previewUrl?: string;
          builderUrl?: string;
        } | undefined
      : undefined;
    const actions: Message["actions"] = [];

    if (meta?.needsConfirmation) {
      actions.push({
        label: meta.confirmationLabel || t("drawer.generate"),
        prompt: t("drawer.generatePrompt"),
        icon: "check",
      });
    }
    if (meta?.draftCreated && meta.previewUrl) {
      actions.push({ label: t("drawer.preview"), href: meta.previewUrl, icon: "eye" });
    }
    if (meta?.draftCreated && meta.builderUrl) {
      actions.push({ label: t("drawer.openBuilder"), href: meta.builderUrl, icon: "wand" });
    }

    return {
      role: "assistant",
      text: ("text" in result && result.text) || t("drawer.noAnswer"),
      actions,
    };
  }, [t]);

  useEffect(() => {
    if (isOpen) {
      setMessages([{ role: "assistant", text: "..." }]);
      setInput("");
      getSuggestions(pathname).then((s) => {
        if (s.rexSuggestions.length > 0) setSuggestionChips(s.rexSuggestions);
        setMessages([{
          role: "assistant",
          text: s.greeting ?? t("drawer.greeting", { name: userName?.split(" ")[0] ?? t("studio.there") }),
        }]);
      }).catch(() => {
        const name = userName?.split(" ")[0] ?? t("studio.there");
        setMessages([{ role: "assistant", text: t("drawer.greetingShort", { name }) }]);
      });
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [isOpen, userName, pathname, t]);

  useEffect(() => {
    if (initialMessage && isOpen && messages.length <= 1) {
      setMessages((prev) => [...prev, { role: "user", text: initialMessage }]);
      setIsLoading(true);
      askRex(initialMessage, pageContext).then((result) => {
        setMessages((prev) => [
          ...prev,
          messageFromResult(result),
        ]);
      }).finally(() => setIsLoading(false));
    }
  }, [initialMessage, isOpen, messageFromResult, messages.length, pageContext.label, pageContext.path]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || isLoading) return;

    const history = historyFor(messages);
    setMessages((prev) => [
      ...prev.map((message) => ({
        ...message,
        actions: message.actions?.filter((action) => Boolean(action.href)),
      })),
      { role: "user", text: cleanText },
    ]);
    setIsLoading(true);

    try {
      const result = await askRex(cleanText, pageContext, history);
      setMessages((prev) => [...prev, messageFromResult(result)]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messageFromResult, messages, pageContext.label, pageContext.path]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    await sendMessage(text);
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = useCallback(async (suggestion: string) => {
    await sendMessage(suggestion);
  }, [sendMessage]);

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(11,38,44,0.3)",
          }}
        />
      )}

      {/* Closed: hidden after the slide-out, so its shadow doesn't line the page edge and its controls aren't tabbable. */}
      <div
        aria-hidden={!isOpen}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(100vw, 520px)",
          minWidth: 0,
          maxWidth: 520,
          zIndex: 10000,
          background: "var(--paper, #fff)",
          boxShadow: isOpen ? "-8px 0 32px rgba(11,38,44,0.12)" : "none",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          visibility: isOpen ? "visible" : "hidden",
          transition: isOpen
            ? "transform 0.3s cubic-bezier(0.22,1,0.36,1)"
            : "transform 0.3s cubic-bezier(0.22,1,0.36,1), visibility 0s linear 0.3s",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 20px",
            borderBottom: "1px solid var(--ink-100, #E3DDD0)",
            flexShrink: 0,
          }}
        >
          <ChipAvatar mascot="rex" size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-900, #0B262C)" }}>
              Rex
            </div>
            <div style={{ fontSize: 11.5, color: "var(--teal-600, #2EB39A)" }}>
              {t("drawer.status")}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("drawer.close")}
            style={{
              width: 32, height: 32, borderRadius: 8, border: "none",
              background: "var(--ink-50, #F6F2E9)", cursor: "pointer",
              display: "grid", placeItems: "center", flexShrink: 0,
            }}
          >
            <Icon name="x" size={16} color="var(--ink-600, #6A7A7E)" />
          </button>
        </div>

        <div
          style={{
            flex: 1, overflowY: "auto", padding: "16px 20px",
            display: "flex", flexDirection: "column", gap: 12,
          }}
        >
          {messages.map((msg, i) =>
            msg.role === "assistant" ? (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <ChipAvatar mascot="rex" size={28} />
                <div style={{ maxWidth: "85%", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "12px 12px 12px 4px",
                      background: "var(--teal-50, #C7ECE3)",
                      color: "var(--ink-800, #2A4148)",
                      fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap",
                    }}
                  >
                    {msg.text}
                  </div>
                  {msg.actions && msg.actions.length > 0 && (
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                      {msg.actions.map((action) =>
                        action.href ? (
                          <a
                            key={`${action.label}-${action.href}`}
                            href={action.href}
                            style={{
                              minHeight: 34,
                              padding: "7px 11px",
                              borderRadius: 7,
                              background: "var(--teal-700, #087E73)",
                              color: "#fff",
                              fontSize: 11.5,
                              fontWeight: 700,
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Icon name={action.icon} size={13} color="currentColor" />
                            {action.label}
                          </a>
                        ) : (
                          <button
                            key={`${action.label}-${action.prompt}`}
                            type="button"
                            onClick={() => action.prompt && void sendMessage(action.prompt)}
                            disabled={isLoading}
                            style={{
                              minHeight: 34,
                              padding: "7px 11px",
                              borderRadius: 7,
                              border: "none",
                              background: "var(--teal-700, #087E73)",
                              color: "#fff",
                              fontSize: 11.5,
                              fontWeight: 700,
                              cursor: isLoading ? "not-allowed" : "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              opacity: isLoading ? 0.6 : 1,
                            }}
                          >
                            <Icon name={action.icon} size={13} color="currentColor" />
                            {action.label}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius: "12px 12px 4px 12px",
                    background: "var(--teal-600, #2EB39A)",
                    color: "#fff", fontSize: 13, lineHeight: 1.5,
                  }}
                >
                  {msg.text}
                </div>
              </div>
            )
          )}
          {isLoading && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <ChipAvatar mascot="rex" size={28} />
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "12px 12px 12px 4px",
                  background: "var(--teal-50, #C7ECE3)",
                  display: "flex", gap: 5,
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: "var(--teal-500)",
                      animation: "rex-pulse 1.2s ease-in-out infinite",
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {messages.length <= 1 && !isLoading && (
          <div
            style={{
              padding: "0 20px 10px",
              display: "flex", gap: 6, flexWrap: "wrap",
            }}
          >
            {suggestionChips.map((chip, i) => (
              <button
                key={i}
                onClick={() => handleSuggestionClick(chip)}
                style={{
                  padding: "6px 12px", borderRadius: 20,
                  border: "1px solid var(--ink-200, #E3DDD0)",
                  background: "transparent",
                  color: "var(--ink-700, #2A4148)", fontSize: 11.5,
                  cursor: "pointer", whiteSpace: "nowrap",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--teal-400)";
                  e.currentTarget.style.background = "var(--teal-50)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--ink-200)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            padding: "12px 20px 16px",
            borderTop: "1px solid var(--ink-100, #E3DDD0)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <div
              style={{
                flex: 1, display: "flex", alignItems: "center",
                padding: "0 12px", borderRadius: 10,
                border: "1px solid var(--ink-150, #E3DDD0)",
                background: "var(--bg, #F6F2E9)",
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("drawer.placeholder")}
                disabled={isLoading}
                style={{
                  border: "none", background: "none", outline: "none",
                  width: "100%", fontSize: 13,
                  color: "var(--ink-900, #0B262C)", padding: "8px 0",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <button
              onClick={handleSend}
              aria-label={t("drawer.send")}
              disabled={!input.trim() || isLoading}
              style={{
                width: 40, height: 40, borderRadius: 10, border: "none",
                background: !input.trim() || isLoading ? "var(--ink-100, #E3DDD0)" : "var(--teal-600, #2EB39A)",
                color: "#fff",
                cursor: !input.trim() || isLoading ? "not-allowed" : "pointer",
                display: "grid", placeItems: "center", flexShrink: 0,
                transition: "background 0.15s",
              }}
            >
              <Icon name="arrow" size={16} color="white" />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes rex-pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(1); }
          40% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </>
  );
}
