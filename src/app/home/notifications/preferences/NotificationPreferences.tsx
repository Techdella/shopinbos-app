"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, Spinner } from "@/components/app-ui";

// Category names are stored as-is; these are only the labels people see.
const CATEGORY_LABEL: Record<string, string> = { Logistics: "Delivery", "Store Builder": "Store builder", RexAI: "Rex" };

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
  { key: "inApp", label: "In the app" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "push", label: "Push" },
  { key: "browser", label: "Browser" },
];

const digestOptions: { value: CategoryPref["digest"]; label: string }[] = [
  { value: "immediate", label: "Straight away" },
  { value: "hourly", label: "Hourly summary" },
  { value: "daily", label: "Daily summary" },
  { value: "weekly", label: "Weekly summary" },
  { value: "disabled", label: "Off" },
];

function defaultPrefs(): CategoryPref[] {
  return defaultCategories.map(cat => ({
    category: cat,
    channels: { inApp: true, email: true, sms: false, whatsapp: false, push: false, browser: false },
    digest: "daily" as const,
  }));
}

export function NotificationPreferences() {
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
      if (res.ok) setNotice("Preferences saved.");
      else setNotice("We couldn't save that. Check your connection and try again.");
    } catch {
      setNotice("Could not save preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      {notice && (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><Notice tone={/saved/i.test(notice) && !/fail|could not/i.test(notice) ? "success" : "error"}>{notice}</Notice></div>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <div role="status" className="flex items-center justify-center gap-3 rounded-[22px] border border-app-line bg-white py-16 text-[14px] text-app-ink-soft">
          <Spinner /> Loading preferences
        </div>
      ) : (
        <ul className="m-0 list-none divide-y divide-app-line overflow-hidden rounded-[22px] border border-app-line bg-white p-0">
          {prefs.map(pref => {
            const label = CATEGORY_LABEL[pref.category] ?? pref.category;
            return (
              <li key={pref.category} className="grid gap-3 px-4 py-4 sm:px-5 xl:grid-cols-[200px_minmax(0,1fr)_220px] xl:items-center">
                <h3 className="m-0 text-[15px] font-extrabold">{label}</h3>
                <fieldset className="m-0 min-w-0 border-0 p-0">
                  <legend className="sr-only">{label}: send by</legend>
                  <div className="flex flex-wrap gap-2">
                    {channels.map(ch => (
                      <label key={ch.key} className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border border-app-line px-3.5 text-[13.5px] font-bold has-[:checked]:border-app-ink has-[:checked]:bg-app-canvas">
                        <input
                          type="checkbox"
                          checked={pref.channels[ch.key]}
                          onChange={() => handleToggle(pref.category, ch.key)}
                          className="h-[18px] w-[18px] accent-[#16141F]"
                        />
                        {ch.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="flex min-w-0 items-center gap-2 text-[13.5px] font-bold text-app-ink-soft">
                  <span className="shrink-0">How often</span>
                  <select
                    value={pref.digest}
                    onChange={e => handleDigest(pref.category, e.target.value)}
                    aria-label={`${label}: how often`}
                    className="h-[44px] min-w-0 flex-1 rounded-full border border-app-line bg-white px-4 text-[14px] font-bold text-app-ink outline-none focus:border-app-ink"
                  >
                    {digestOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex justify-end">
        <PillButton tone="accent" size="md" onClick={handleSave} busy={saving} disabled={loading}>Save preferences</PillButton>
      </div>
    </div>
  );
}
