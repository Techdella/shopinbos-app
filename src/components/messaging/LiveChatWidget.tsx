"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStoreVisitor } from "@/hooks/useStoreVisitor";

// The storefront chat box. Shopper messages go to the seller's inbox (POST /api/public/store/[slug]/chat);
// the seller's replies show up here by polling (every 4s while open, 30s while closed for the unread dot).
// When the seller is offline, or the store uses "contact form" mode, we ask for an email or phone first so
// the reply can reach them after they leave. Styled with plain colours so it sits on any store theme.

interface ChatMessage {
  id: string;
  from: "shopper" | "shop";
  body: string;
  at: string;
  auto: boolean;
  /** Written by the chatbot (Peggy). */
  bot?: boolean;
}

interface ChatState {
  store: { name: string; logoUrl: string | null };
  config: {
    mode: string;
    greeting: string;
    whatsappNumber: string | null;
    whatsappGreeting: string | null;
    color: string;
    position: "left" | "right";
    showOnMobile: boolean;
    showOnDesktop: boolean;
    enabled: boolean;
  };
  online: boolean;
  /** The storefront chatbot, when it is answering right now. */
  assistant?: { name: string; greeting: string; handedOff: boolean } | null;
  contact: { name: string | null; email: string | null; phone: string | null } | null;
  messages: ChatMessage[];
}

const INK = "#16141F";

function seenKey(slug: string) {
  return `chat-seen:${slug}`;
}

function whatsappHref(number: string, text: string | null) {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function LiveChatWidget({ slug }: { slug: string }) {
  const pathname = usePathname();
  const visitorKey = useStoreVisitor(slug);
  const [state, setState] = useState<ChatState | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [askContact, setAskContact] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<string>("");
  const [waitingSince, setWaitingSince] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const hidden = pathname?.includes("/preview");

  const load = useCallback(
    async (isOpen: boolean) => {
      if (!visitorKey) return;
      const res = await fetch(`/api/public/store/${encodeURIComponent(slug)}/chat?visitorKey=${encodeURIComponent(visitorKey)}${isOpen ? "&open=1" : ""}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const json = await res.json().catch(() => null);
      if (json?.data) setState(json.data as ChatState);
    },
    [slug, visitorKey],
  );

  useEffect(() => {
    try {
      setLastSeen(localStorage.getItem(seenKey(slug)) ?? "");
    } catch {}
  }, [slug]);

  useEffect(() => {
    if (hidden || !visitorKey) return;
    void load(open);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(open);
    }, open ? 4_000 : 30_000);
    return () => window.clearInterval(timer);
  }, [hidden, visitorKey, open, load]);

  const messages = state?.messages ?? [];
  const lastShop = [...messages].reverse().find((m) => m.from === "shop");

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "nearest" });
    if (lastShop && lastShop.at !== lastSeen) {
      setLastSeen(lastShop.at);
      try {
        localStorage.setItem(seenKey(slug), lastShop.at);
      } catch {}
    }
  }, [open, messages.length, lastShop, lastSeen, slug]);

  if (hidden || !state || !state.config.enabled) return null;
  const { config } = state;
  const showChat = config.mode === "messaging" || config.mode === "contact_form" || config.mode === "multiple";
  const showWhatsApp = Boolean(config.whatsappNumber) && (config.mode === "whatsapp" || config.mode === "multiple");
  if (!showChat && !showWhatsApp) return null;

  const hasContact = Boolean(state.contact?.email || state.contact?.phone);
  const bot = state.assistant ?? null;
  const botLive = Boolean(bot && !bot.handedOff);
  const needContact = !hasContact && (bot?.handedOff || (!botLive && (!state.online || config.mode === "contact_form")) || askContact);
  // "Peggy is typing" until her answer arrives (or 25 seconds pass, see send()).
  const typing = botLive && waitingSince !== null && !messages.some((m) => m.from === "shop" && m.at > waitingSince);
  const unread = Boolean(lastShop && lastShop.at > lastSeen) && !open;
  const side = config.position === "left" ? "left-4" : "right-4";
  const visibility = `${config.showOnMobile ? "flex" : "hidden"} ${config.showOnDesktop ? "md:flex" : "md:hidden"}`;

  async function send() {
    if (!text.trim() || !visitorKey) return;
    if (needContact && !email.trim() && !phone.trim()) {
      setError("Add your email or phone number so we can reply.");
      return;
    }
    setSending(true);
    setError(null);
    const res = await fetch(`/api/public/store/${encodeURIComponent(slug)}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorKey,
        body: text,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        page: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setSending(false);
    if (!res?.ok) {
      if (json?.error?.code === "CONTACT_REQUIRED") setAskContact(true);
      setError(json?.error?.message ?? "Couldn't send. Check your connection and try again.");
      return;
    }
    setText("");
    if (botLive) {
      const since = new Date(Date.now() - 2000).toISOString();
      setWaitingSince(since);
      window.setTimeout(() => setWaitingSince((current) => (current === since ? null : current)), 25_000);
    }
    await load(true);
  }

  const field = "h-10 w-full rounded-[10px] border border-black/15 bg-white px-3 text-[16px] text-[#16141F] outline-none focus:border-[#16141F] sm:text-[14px]";

  return (
    <div
      className={`fixed z-[55] ${side} ${visibility} flex-col items-end gap-2 bottom-[calc(88px_+_env(safe-area-inset-bottom))] md:bottom-6`}
      style={{ alignItems: config.position === "left" ? "flex-start" : "flex-end", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
    >
      {open && showChat && (
        <section
          role="dialog"
          aria-label={`Chat with ${state.store.name}`}
          className="flex h-[min(560px,calc(100dvh-180px))] w-[min(370px,calc(100vw-32px))] flex-col overflow-hidden rounded-[20px] border border-black/10 bg-white text-[#16141F] shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
        >
          <header className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: INK }}>
            {state.store.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.store.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-cover" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-[15px] font-bold">{state.store.name.charAt(0).toUpperCase()}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold">{state.store.name}</div>
              <div className="flex items-center gap-1.5 text-[12px] text-white/75">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: state.online ? "#3BD16F" : "#B7B4BF" }} />
                {botLive && bot ? `${bot.name} (AI assistant) is here to help` : state.online ? "Online now" : "Away. We'll reply by email or text."}
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-[#F6F5F8] px-3 py-3" aria-live="polite">
            <div className="max-w-[85%] self-start rounded-[16px] rounded-bl-[6px] bg-white px-3 py-2 text-[14px] leading-[1.45] shadow-sm">{(botLive && bot?.greeting) || config.greeting || "Hi there! How can we help?"}</div>
            {messages.map((m) => (
              <div key={m.id} className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[16px] px-3 py-2 text-[14px] leading-[1.45] ${m.from === "shopper" ? "self-end rounded-br-[6px] text-white" : "self-start rounded-bl-[6px] bg-white shadow-sm"}`} style={m.from === "shopper" ? { background: INK } : undefined}>
                {m.bot && bot ? <div className="mb-0.5 text-[11px] font-bold text-black/50">{bot.name} · AI assistant</div> : m.bot ? <div className="mb-0.5 text-[11px] font-bold text-black/50">AI assistant</div> : null}
                {m.body}
                <div className={`mt-0.5 text-[10.5px] ${m.from === "shopper" ? "text-white/60" : "text-black/40"}`}>
                  {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {m.auto && !m.bot ? " · automatic reply" : ""}
                </div>
              </div>
            ))}
            {typing && bot ? <div className="self-start rounded-[16px] rounded-bl-[6px] bg-white px-3 py-2 text-[13px] text-black/50 shadow-sm" role="status">{bot.name} is typing…</div> : null}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="grid gap-2 border-t border-black/10 p-3"
          >
            {needContact && (
              <div className="grid gap-2">
                <p className="m-0 text-[12.5px] text-black/60">{bot?.handedOff ? "Someone from the shop will reply. Leave your email or phone in case you leave." : state.online ? "Leave your email or phone so we can reply if you leave." : "We're away right now. Leave your email or phone and we'll reply there."}</p>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" autoComplete="name" className={field} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" aria-label="Your email" autoComplete="email" className={field} />
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="Phone" aria-label="Your phone number" autoComplete="tel" className={field} />
                </div>
              </div>
            )}
            {!needContact && !hasContact && (state.online || botLive) && (
              <button type="button" onClick={() => setAskContact(true)} className="justify-self-start text-[12.5px] text-black/60 underline">Get the reply by email or text</button>
            )}
            {error && <p role="alert" className="m-0 text-[12.5px] font-semibold text-[#C0392B]">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder="Write a message"
                aria-label="Your message"
                className="max-h-28 min-h-[42px] min-w-0 flex-1 resize-none rounded-[14px] border border-black/15 px-3 py-2.5 text-[16px] text-[#16141F] outline-none focus:border-[#16141F] sm:text-[14px]"
              />
              <button type="submit" disabled={sending || !text.trim()} aria-label="Send message" className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full text-white disabled:opacity-50" style={{ background: INK }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4z" /></svg>
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="flex items-center gap-2" style={{ flexDirection: config.position === "left" ? "row-reverse" : "row" }}>
        {showWhatsApp && config.whatsappNumber && (
          <a
            href={whatsappHref(config.whatsappNumber, config.whatsappGreeting)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat with us on WhatsApp"
            className="grid h-14 w-14 place-items-center rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
            style={{ background: config.color || "#25D366" }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.03c-.25.69-1.45 1.32-2 1.4-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.69-.62-2.98-1.29-4.93-4.29-5.08-4.49-.15-.2-1.21-1.61-1.21-3.07 0-1.46.77-2.18 1.04-2.48.27-.3.6-.37.79-.37h.57c.18 0 .43-.07.67.51.25.6.84 2.06.92 2.21.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.45.52-.15.15-.3.31-.13.61.17.3.77 1.27 1.65 2.06 1.14 1.01 2.09 1.33 2.39 1.48.3.15.47.12.65-.07.17-.2.74-.87.94-1.17.2-.3.4-.25.67-.15.27.1 1.73.82 2.03.97.3.15.5.22.57.35.07.12.07.72-.18 1.41z" />
            </svg>
          </a>
        )}
        {showChat && (
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              setError(null);
            }}
            aria-expanded={open}
            aria-label={open ? "Close chat" : unread ? "Open chat, new reply" : "Chat with us"}
            className="relative flex h-14 items-center gap-2 rounded-full px-5 text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
            style={{ background: INK }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a8 8 0 11-3.7-6.7L21 4l-1 4.3A7.9 7.9 0 0121 12z" /></svg>
            <span className="hidden sm:inline">{open ? "Close" : config.mode === "contact_form" ? "Message us" : "Chat"}</span>
            {unread && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#F15928]" />}
          </button>
        )}
      </div>
    </div>
  );
}
