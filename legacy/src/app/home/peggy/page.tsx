"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { Icon, MascotAvatar, PageHead } from "@/components/ui";
import { askPeggy, getPeggyData, getSuggestions } from "@/app/actions/ai";

interface Message {
  role: "user" | "assistant";
  text: string;
}

type PeggyData = Awaited<ReturnType<typeof getPeggyData>>;
type PeggyStatus = PeggyData["status"];

export default function PeggyPage() {
  const [initialData, setInitialData] = useState<PeggyData | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Loading your live store status..." },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([
    "How are my orders doing?",
    "Which products need attention?",
    "What should I source next?",
    "What is my logistics status?",
    "Help me prepare a product CSV import",
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getPeggyData().then((data) => {
      setInitialData(data);
      setMessages([{ role: "assistant", text: data.greeting }]);
    });
    getSuggestions().then((s) => {
      if (s.peggySuggestions.length >= 3) setQuickPrompts(s.peggySuggestions);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setIsLoading(true);

    try {
      const result = await askPeggy(trimmed, initialData?.storeName);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: result.error ?? result.text ?? "Peggy could not answer that yet." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [initialData?.storeName, isLoading]);

  const userName = initialData?.userName ?? "there";
  const storeName = initialData?.storeName ?? "Your Store";
  const storeSlug = initialData?.storeSlug ?? undefined;
  const initials = userName.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);

  return (
    <AppFrame
      role="seller"
      storeName={storeName}
      storeSlug={storeSlug}
      storeInitial={storeName.charAt(0).toUpperCase()}
      userName={userName}
      userInitials={initials}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead title="Ask Peggy" sub="Live store assistant for orders, products, sourcing, and logistics" />

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 18 }}>
          <section className="card" style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: "68vh", overflow: "hidden" }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--ink-100)", display: "flex", alignItems: "center", gap: 10 }}>
              <MascotAvatar role="seller" size={36} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)" }}>Peggy</div>
                <div style={{ fontSize: 12, color: "var(--teal-600)" }}>Connected to live store data</div>
              </div>
              <button
                type="button"
                onClick={() => setMessages([{ role: "assistant", text: initialData?.greeting ?? "Ask Peggy about your store." }])}
                className="dbtn dBtn-ghost dBtn-xs"
                style={{ marginLeft: "auto" }}
              >
                <Icon name="plus" size={12} /> New chat
              </button>
            </div>

            <div style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  style={{
                    alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "78%",
                    padding: "10px 14px",
                    borderRadius: message.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                    background: message.role === "user" ? "var(--teal-600)" : "var(--teal-50)",
                    color: message.role === "user" ? "#fff" : "var(--ink-800)",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {message.text}
                </div>
              ))}

              {isLoading ? (
                <div style={{ alignSelf: "flex-start", padding: "10px 14px", borderRadius: "12px 12px 12px 4px", background: "var(--teal-50)", fontSize: 13 }}>
                  Peggy is checking your store...
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: "0 16px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  className="dbtn dBtn-ghost dBtn-xs"
                  disabled={isLoading}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--ink-100)", display: "flex", gap: 8 }}>
              <input
                ref={inputRef}
                className="inp"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Ask Peggy about orders, products, sourcing, chats, or logistics..."
                disabled={isLoading}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => send(input)}
                disabled={!input.trim() || isLoading}
                className="dbtn dBtn-mint"
                style={{ width: 42, height: 42, display: "grid", placeItems: "center", padding: 0 }}
              >
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </section>

          <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <StatusCard status={initialData?.status} />
            <QuickLinks />
          </aside>
        </div>
      </div>
    </AppFrame>
  );
}

function StatusCard({ status }: { status?: PeggyStatus }) {
  const cells = [
    { label: "Products", value: status?.products.total ?? 0, sub: `${status?.products.published ?? 0} active` },
    { label: "Orders", value: status?.orders.total ?? 0, sub: status?.orders.revenue ?? "NGN 0" },
    { label: "Sourcing", value: status?.sourcing.recommendedProducts.length ?? 0, sub: "supplier products" },
    { label: "Logistics", value: status?.logistics.partners.length ?? 0, sub: "partners" },
  ];

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Live store status</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {cells.map((cell) => (
          <div key={cell.label} style={{ padding: 10, border: "1px solid var(--ink-100)", borderRadius: 8, background: "var(--paper)" }}>
            <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 700 }}>{cell.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink-900)" }}>{cell.value}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{cell.sub}</div>
          </div>
        ))}
      </div>
      {status?.messages.unread ? (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--teal-700)", fontWeight: 700 }}>
          {status.messages.unread} unread supplier/logistics message{status.messages.unread === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  );
}

function QuickLinks() {
  const links = [
    { href: "/home/orders", icon: "package", label: "Orders", desc: "Review and fulfil customer orders" },
    { href: "/products", icon: "box", label: "Product pages", desc: "Edit catalog and product details" },
    { href: "/products/import", icon: "document", label: "Import CSV", desc: "Upload product data" },
    { href: "/api/products/export", icon: "download", label: "Export products", desc: "Download product CSV" },
    { href: "/marketplace", icon: "shop", label: "Sourcing", desc: "Find verified supplier products" },
    { href: "/home/logistics", icon: "truck", label: "Logistics", desc: "Quotes, partners, and bookings" },
  ];

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Connected workflows</div>
      {links.map((link, index) => (
        <Link
          key={link.href}
          href={link.href}
          style={{
            display: "flex",
            gap: 10,
            padding: "10px 0",
            borderBottom: index < links.length - 1 ? "1px solid var(--ink-100)" : "none",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--teal-50)", color: "var(--teal-700)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name={link.icon as any} size={14} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ink-900)" }}>{link.label}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{link.desc}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
