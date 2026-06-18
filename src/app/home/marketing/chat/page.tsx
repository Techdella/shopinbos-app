"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

type ChatMode = "contact_form" | "whatsapp" | "in_app" | "multiple";

interface ChatConfig {
  mode: ChatMode;
  whatsapp: {
    number: string;
    greeting: string;
    position: "left" | "right";
    buttonColor: string;
    showMobile: boolean;
    showDesktop: boolean;
    widgetStyle: "floating_bubble" | "floating_bar" | "contact_drawer";
  };
  contactForm: {
    email: string;
    phone: string;
    greeting: string;
  };
}

const MODE_OPTIONS: { value: ChatMode; label: string; sub: string; icon: string }[] = [
  { value: "contact_form", label: "Contact Form", sub: "Simple email/phone contact form", icon: "mail" },
  { value: "whatsapp", label: "WhatsApp", sub: "Chat with customers on WhatsApp", icon: "message" },
  { value: "in_app", label: "In-App Messaging", sub: "Built-in chat widget", icon: "chat" },
  { value: "multiple", label: "Multiple Options", sub: "WhatsApp + contact form combo", icon: "layers" },
];

const WIDGET_STYLES = [
  { value: "floating_bubble", label: "Floating Bubble" },
  { value: "floating_bar", label: "Floating Bar" },
  { value: "contact_drawer", label: "Contact Drawer" },
];

const defaultConfig: ChatConfig = {
  mode: "contact_form",
  whatsapp: {
    number: "",
    greeting: "Hi! How can we help you today?",
    position: "right",
    buttonColor: "#25D366",
    showMobile: true,
    showDesktop: true,
    widgetStyle: "floating_bubble",
  },
  contactForm: {
    email: "",
    phone: "",
    greeting: "Have a question? Send us a message and we'll get back to you.",
  },
};

export default function ChatPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ChatConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/store/chat");
      const data = await res.json();
      if (data.data) setConfig({ ...defaultConfig, ...data.data });
    } catch {
      toast("Could not load chat settings", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void fetchConfig(); }, [fetchConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const flat = {
        mode: config.mode,
        whatsappNumber: config.whatsapp.number || null,
        whatsappGreeting: config.whatsapp.greeting,
        whatsappPosition: config.whatsapp.position,
        whatsappColor: config.whatsapp.buttonColor,
        showOnMobile: config.whatsapp.showMobile,
        showOnDesktop: config.whatsapp.showDesktop,
        widgetStyle: config.whatsapp.widgetStyle.replace("floating_", "").replace("contact_", "help"),
        greeting: config.contactForm.greeting,
        contactEmail: config.contactForm.email || null,
        contactPhone: config.contactForm.phone || null,
      };
      const res = await fetch("/api/store/chat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flat),
      });
      if (res.ok) toast("Chat settings saved", "success");
      else toast("Failed to save settings", "error");
    } catch {
      toast("Could not save settings", "error");
    } finally {
      setSaving(false);
    }
  }, [config, toast]);

  const showWhatsApp = config.mode === "whatsapp" || config.mode === "multiple";
  const showContact = config.mode === "contact_form" || config.mode === "multiple";

  return (
    <AppFrame role="seller">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Live Chat & WhatsApp"
          sub="Configure how customers reach you"
          actions={
            <button onClick={handleSave} disabled={saving}
              className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
          }
        />

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>Loading chat settings...</div>
        ) : (
          <>
            <div>
              <label className="label" style={{ marginBottom: 10, display: "block" }}>Chat Mode</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {MODE_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => setConfig({ ...config, mode: opt.value })}
                    className={`card ${config.mode === opt.value ? "" : ""}`}
                    style={{
                      padding: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                      border: config.mode === opt.value ? "2px solid var(--teal-500)" : "2px solid transparent",
                      background: config.mode === opt.value ? "var(--teal-50)" : undefined,
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: config.mode === opt.value ? "var(--teal-100)" : "var(--ink-100)",
                        color: config.mode === opt.value ? "var(--teal-700)" : "var(--ink-500)",
                        display: "grid", placeItems: "center",
                      }}>
                        <Icon name={opt.icon as any} size={18} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink-900)" }}>{opt.label}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 1 }}>{opt.sub}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {showWhatsApp && (
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>
                  <Icon name="message" size={16} /> WhatsApp Settings
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="field">
                      <label className="label">WhatsApp Number</label>
                      <input value={config.whatsapp.number}
                        onChange={(e) => setConfig({ ...config, whatsapp: { ...config.whatsapp, number: e.target.value } })}
                        className="inp" placeholder="+2348012345678" />
                    </div>
                    <div className="field">
                      <label className="label">Button Color</label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="color" value={config.whatsapp.buttonColor}
                          onChange={(e) => setConfig({ ...config, whatsapp: { ...config.whatsapp, buttonColor: e.target.value } })}
                          style={{ width: 40, height: 36, padding: 2, border: "1px solid var(--ink-200)", borderRadius: 6, cursor: "pointer" }} />
                        <input value={config.whatsapp.buttonColor}
                          onChange={(e) => setConfig({ ...config, whatsapp: { ...config.whatsapp, buttonColor: e.target.value } })}
                          className="inp" style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12 }} />
                      </div>
                    </div>
                  </div>
                  <div className="field">
                    <label className="label">Greeting message</label>
                    <textarea value={config.whatsapp.greeting}
                      onChange={(e) => setConfig({ ...config, whatsapp: { ...config.whatsapp, greeting: e.target.value } })}
                      className="ta" rows={2} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="field">
                      <label className="label">Widget Style</label>
                      <select value={config.whatsapp.widgetStyle}
                        onChange={(e) => setConfig({ ...config, whatsapp: { ...config.whatsapp, widgetStyle: e.target.value as any } })}
                        className="sel">
                        {WIDGET_STYLES.map((ws) => <option key={ws.value} value={ws.value}>{ws.label}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Position</label>
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}>
                          <input type="radio" name="position" value="left"
                            checked={config.whatsapp.position === "left"}
                            onChange={() => setConfig({ ...config, whatsapp: { ...config.whatsapp, position: "left" } })}
                            style={{ accentColor: "var(--teal-600)" }} />
                          Left
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}>
                          <input type="radio" name="position" value="right"
                            checked={config.whatsapp.position === "right"}
                            onChange={() => setConfig({ ...config, whatsapp: { ...config.whatsapp, position: "right" } })}
                            style={{ accentColor: "var(--teal-600)" }} />
                          Right
                        </label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="label" style={{ marginBottom: 6, display: "block" }}>Show on</label>
                    <div style={{ display: "flex", gap: 16 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={config.whatsapp.showMobile}
                          onChange={() => setConfig({ ...config, whatsapp: { ...config.whatsapp, showMobile: !config.whatsapp.showMobile } })}
                          style={{ accentColor: "var(--teal-600)" }} />
                        Mobile
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={config.whatsapp.showDesktop}
                          onChange={() => setConfig({ ...config, whatsapp: { ...config.whatsapp, showDesktop: !config.whatsapp.showDesktop } })}
                          style={{ accentColor: "var(--teal-600)" }} />
                        Desktop
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showContact && (
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>
                  <Icon name="mail" size={16} /> Contact Form Settings
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="field">
                      <label className="label">Contact email</label>
                      <input value={config.contactForm.email}
                        onChange={(e) => setConfig({ ...config, contactForm: { ...config.contactForm, email: e.target.value } })}
                        className="inp" placeholder="hello@store.com" />
                    </div>
                    <div className="field">
                      <label className="label">Contact phone</label>
                      <input value={config.contactForm.phone}
                        onChange={(e) => setConfig({ ...config, contactForm: { ...config.contactForm, phone: e.target.value } })}
                        className="inp" placeholder="+2348012345678" />
                    </div>
                  </div>
                  <div className="field">
                    <label className="label">Custom greeting</label>
                    <textarea value={config.contactForm.greeting}
                      onChange={(e) => setConfig({ ...config, contactForm: { ...config.contactForm, greeting: e.target.value } })}
                      className="ta" rows={2} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppFrame>
  );
}
