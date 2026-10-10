"use client";

import { useState, useEffect, useCallback } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon } from "@/components/ui";

interface CategoryPref {
  category: string;
  channels: {
    inApp: boolean;
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
    browser: boolean;
  };
  digest: "immediate" | "hourly" | "daily" | "weekly" | "disabled";
}

const defaultCategories = [
  "Orders", "Inventory", "Payments", "Logistics",
  "Products", "Customers", "Suppliers", "Marketing",
  "Store Builder", "RexAI", "System",
];

const channels: { key: keyof CategoryPref["channels"]; label: string }[] = [
  { key: "inApp", label: "In-App" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "push", label: "Push" },
  { key: "browser", label: "Browser" },
];

const digestOptions: { value: CategoryPref["digest"]; label: string }[] = [
  { value: "immediate", label: "Immediate" },
  { value: "hourly", label: "Hourly Digest" },
  { value: "daily", label: "Daily Digest" },
  { value: "weekly", label: "Weekly Digest" },
  { value: "disabled", label: "Disabled" },
];

function defaultPrefs(): CategoryPref[] {
  return defaultCategories.map(cat => ({
    category: cat,
    channels: { inApp: true, email: true, sms: false, whatsapp: false, push: false, browser: false },
    digest: "daily" as const,
  }));
}

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<CategoryPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/notifications/preferences");
        const data = await res.json();
        if (data.preferences && data.preferences.length > 0) {
          setPrefs(data.preferences);
        } else {
          setPrefs(defaultPrefs());
        }
      } catch {
        setNotice("Could not load preferences");
        setPrefs(defaultPrefs());
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const handleToggle = useCallback((category: string, channel: keyof CategoryPref["channels"]) => {
    setPrefs(prev => prev.map(p =>
      p.category === category
        ? { ...p, channels: { ...p.channels, [channel]: !p.channels[channel] } }
        : p
    ));
  }, []);

  const handleDigest = useCallback((category: string, value: string) => {
    setPrefs(prev => prev.map(p =>
      p.category === category ? { ...p, digest: value as CategoryPref["digest"] } : p
    ));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: prefs }),
      });
      if (res.ok) setNotice("Preferences saved!");
      else setNotice("Failed to save preferences");
    } catch {
      setNotice("Could not save preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppFrame role="seller" storeName="Your Store">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 }}>
        <PageHead
          title="Notification Preferences"
          sub="Choose how and when you receive notifications"
          actions={
            <button onClick={handleSave} disabled={saving}
              className="dbtn dBtn-mint"
              style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              {saving ? "Saving..." : "Save Preferences"}
            </button>
          }
        />

        {notice && (
          <div style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, background: "var(--mint-bg)", color: "var(--mint)", border: "1px solid var(--mint-border)" }}>
            {notice}
            <button onClick={() => setNotice("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit" }}>✕</button>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-sec)" }}>Loading preferences...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {prefs.map(pref => (
              <div key={pref.category} className="card" style={{ padding: 18 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>
                  {pref.category}
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  {channels.map(ch => (
                    <label key={ch.key} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      cursor: "pointer", fontSize: 13, color: "var(--ink-700)",
                    }}>
                      <input
                        type="checkbox"
                        checked={pref.channels[ch.key]}
                        onChange={() => handleToggle(pref.category, ch.key)}
                        style={{ accentColor: "var(--teal-600)" }}
                      />
                      {ch.label}
                    </label>
                  ))}
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 600 }}>Digest:</span>
                    <select
                      value={pref.digest}
                      onChange={e => handleDigest(pref.category, e.target.value)}
                      className="sel"
                      style={{ fontSize: 12.5, padding: "4px 8px", fontFamily: "inherit" }}
                    >
                      {digestOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppFrame>
  );
}
