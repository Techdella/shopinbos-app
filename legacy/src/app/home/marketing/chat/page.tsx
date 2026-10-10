"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon } from "@/components/ui";
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
          title="Live Chat & Contact"
          sub="Configure how customers reach you on your storefront"
          actions={
            <button onClick={handleSave} disabled={saving || loading}
              className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              {saving ? "Saving…" : "Save Settings"}
            </button>
          }
        />

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>Loading chat settings…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 20, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Mode selector */}
              <div>
                <label className="label" style={{ marginBottom: 10, display: "block" }}>Chat Mode</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
                  {MODE_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => setConfig({ ...config, mode: opt.value })}
                      type="button"
                      className="card"
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
                          <Icon name={opt.icon as Parameters<typeof Icon>[0]["name"]} size={18} />
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
                  <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "var(--ink-900)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="message" size={16} /> WhatsApp Settings
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div className="field">
                        <label className="label">WhatsApp Number</label>
                        <input value={config.whatsapp.number}
                          onChange={(e) => setConfig({ ...config, whatsapp: { ...config.whatsapp, number: e.target.value } })}
                          className="inp" placeholder="+2348012345678" />
                        <div className="help">Include country code, e.g. +234 for Nigeria.</div>
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
                      <label className="label">Pre-filled greeting message</label>
                      <textarea value={config.whatsapp.greeting}
                        onChange={(e) => setConfig({ ...config, whatsapp: { ...config.whatsapp, greeting: e.target.value } })}
                        className="ta" rows={2} />
                      <div className="help">This text is pre-filled in WhatsApp when a customer taps the button.</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div className="field">
                        <label className="label">Widget Style</label>
                        <select value={config.whatsapp.widgetStyle}
                          onChange={(e) => setConfig({ ...config, whatsapp: { ...config.whatsapp, widgetStyle: e.target.value as ChatConfig["whatsapp"]["widgetStyle"] } })}
                          className="inp">
                          {WIDGET_STYLES.map((ws) => <option key={ws.value} value={ws.value}>{ws.label}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label className="label">Position</label>
                        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                          {(["left", "right"] as const).map((pos) => (
                            <label key={pos} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                              <input type="radio" name="position" value={pos}
                                checked={config.whatsapp.position === pos}
                                onChange={() => setConfig({ ...config, whatsapp: { ...config.whatsapp, position: pos } })} />
                              {pos.charAt(0).toUpperCase() + pos.slice(1)}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="label" style={{ marginBottom: 8, display: "block" }}>Show on</label>
                      <div style={{ display: "flex", gap: 16 }}>
                        {([
                          { key: "showMobile" as const, label: "Mobile" },
                          { key: "showDesktop" as const, label: "Desktop" },
                        ]).map(({ key, label }) => (
                          <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                            <input type="checkbox" checked={config.whatsapp[key]}
                              onChange={() => setConfig({ ...config, whatsapp: { ...config.whatsapp, [key]: !config.whatsapp[key] } })} />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {showContact && (
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "var(--ink-900)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="mail" size={16} /> Contact Form
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div className="field">
                        <label className="label">Contact email</label>
                        <input value={config.contactForm.email}
                          onChange={(e) => setConfig({ ...config, contactForm: { ...config.contactForm, email: e.target.value } })}
                          className="inp" placeholder="hello@yourbrand.com" type="email" />
                        <div className="help">Form submissions will be forwarded here.</div>
                      </div>
                      <div className="field">
                        <label className="label">Contact phone</label>
                        <input value={config.contactForm.phone}
                          onChange={(e) => setConfig({ ...config, contactForm: { ...config.contactForm, phone: e.target.value } })}
                          className="inp" placeholder="+2348012345678" />
                      </div>
                    </div>
                    <div className="field">
                      <label className="label">Greeting text</label>
                      <textarea value={config.contactForm.greeting}
                        onChange={(e) => setConfig({ ...config, contactForm: { ...config.contactForm, greeting: e.target.value } })}
                        className="ta" rows={2} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live preview */}
            <aside>
              <div style={{ position: "sticky", top: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-500)", marginBottom: 10 }}>
                  Widget Preview
                </div>
                <div style={{
                  width: "100%", aspectRatio: "9 / 16", maxHeight: 460, background: "#f0f0ec",
                  borderRadius: 20, border: "8px solid #1a1a1a", position: "relative", overflow: "hidden",
                  boxShadow: "0 8px 32px rgba(0,0,0,.18)",
                }}>
                  {/* Fake storefront */}
                  <div style={{ padding: 12, background: "#0E2A38", height: 48, display: "flex", alignItems: "center" }}>
                    <div style={{ width: 60, height: 8, borderRadius: 4, background: "rgba(255,255,255,.3)" }} />
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      {[0,1,2].map((i) => <div key={i} style={{ width: 32, height: 8, borderRadius: 4, background: "rgba(255,255,255,.2)" }} />)}
                    </div>
                  </div>
                  <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ height: 80, borderRadius: 10, background: "#73D8C8", opacity: 0.3 }} />
                    <div style={{ height: 12, borderRadius: 4, background: "#ccc", width: "70%" }} />
                    <div style={{ height: 8, borderRadius: 4, background: "#e0e0e0", width: "90%" }} />
                    <div style={{ height: 8, borderRadius: 4, background: "#e0e0e0", width: "60%" }} />
                    <div style={{ display: "flex", gap: 6 }}>
                      {[0,1].map((i) => (
                        <div key={i} style={{ flex: 1, height: 70, borderRadius: 8, background: "#e8e8e4" }} />
                      ))}
                    </div>
                  </div>

                  {/* WhatsApp bubble */}
                  {showWhatsApp && config.whatsapp.widgetStyle === "floating_bubble" && (
                    <div style={{
                      position: "absolute", bottom: 16,
                      [config.whatsapp.position]: 12,
                      width: 44, height: 44, borderRadius: "50%",
                      background: config.whatsapp.buttonColor,
                      display: "grid", placeItems: "center",
                      boxShadow: "0 4px 16px rgba(0,0,0,.3)",
                    }}>
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </div>
                  )}

                  {/* Contact form drawer */}
                  {showContact && !showWhatsApp && (
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      background: "white", borderRadius: "12px 12px 0 0",
                      padding: "14px 14px 18px",
                      boxShadow: "0 -4px 16px rgba(0,0,0,.12)",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#0E2A38", marginBottom: 6 }}>
                        {config.contactForm.greeting.slice(0, 40)}{config.contactForm.greeting.length > 40 ? "…" : ""}
                      </div>
                      <div style={{ height: 24, borderRadius: 4, background: "#f4f4f0", marginBottom: 6 }} />
                      <div style={{ height: 24, borderRadius: 4, background: "#f4f4f0", marginBottom: 8 }} />
                      <div style={{ height: 26, borderRadius: 6, background: "#0E2A38", width: "100%" }} />
                    </div>
                  )}

                  {/* Multiple: show both */}
                  {config.mode === "multiple" && (
                    <div style={{
                      position: "absolute", bottom: 16, right: 12,
                      display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end",
                    }}>
                      <div style={{
                        padding: "6px 12px", background: "white", borderRadius: 12,
                        fontSize: 9, fontWeight: 700, color: "#0E2A38",
                        boxShadow: "0 2px 8px rgba(0,0,0,.15)", display: "flex", alignItems: "center", gap: 4,
                      }}>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill={config.whatsapp.buttonColor}>
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        WhatsApp
                      </div>
                      <div style={{
                        padding: "6px 12px", background: "#0E2A38", borderRadius: 12,
                        fontSize: 9, fontWeight: 700, color: "white",
                        boxShadow: "0 2px 8px rgba(0,0,0,.15)",
                      }}>
                        Send message
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-400)", textAlign: "center" }}>
                  Live preview of your storefront widget
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </AppFrame>
  );
}
