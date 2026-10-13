"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, Spinner, Toggle, cx } from "@/components/app-ui";
import type { NotifyCategory, NotifyChannel } from "@shared/notifications";
import { CATEGORY_ICON } from "./NotificationFeed";
import { BrowserPushSwitch } from "./PushToggle";

// Settings › Notifications: which alerts reach you where (push to your phone and browser, email, SMS, WhatsApp)
// for each kind of update, quiet hours, and "Send me a test notification". Saves each switch straight away.

interface Settings {
  categories: Array<{ key: NotifyCategory; label: string; help: string; channels: Record<NotifyChannel, boolean>; textAllowed: boolean }>;
  quietHours: { enabled: boolean; start: string; end: string; timezone: string };
  available: { webPush: boolean; email: boolean; sms: boolean; whatsapp: boolean };
  contact: { email: string | null; phone: string | null };
  devices: number;
}

const CHANNELS: Array<{ key: NotifyChannel; label: string }> = [
  { key: "push", label: "Push" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);

function hourLabel(value: string) {
  const hour = Number(value.slice(0, 2));
  return hour === 0 ? "12 midnight" : hour === 12 ? "12 noon" : hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

async function call(method: "GET" | "PUT", body?: unknown): Promise<Settings> {
  const response = await fetch("/api/notifications/settings", { method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = (await response.json().catch(() => null)) as { data?: Settings; error?: { message?: string } } | null;
  if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? "We couldn't save that. Try again.");
  return json.data;
}

export function NotificationSettingsPanel({ className }: { className?: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    call("GET").then(setSettings).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "We couldn't load your settings."));
  }, []);

  const save = async (body: unknown, optimistic: (current: Settings) => Settings) => {
    if (!settings) return;
    const before = settings;
    setSettings(optimistic(settings));
    setError(null);
    try {
      setSettings(await call("PUT", body));
      setSaved("Saved");
      setTimeout(() => setSaved(null), 1800);
    } catch (saveError) {
      setSettings(before);
      setError(saveError instanceof Error ? saveError.message : "We couldn't save that. Try again.");
    }
  };

  const setChannel = (category: NotifyCategory, channel: NotifyChannel, on: boolean) =>
    save({ categories: { [category]: { [channel]: on } } }, (current) => ({
      ...current,
      categories: current.categories.map((row) => (row.key === category ? { ...row, channels: { ...row.channels, [channel]: on } } : row)),
    }));

  const setQuiet = (change: Partial<Settings["quietHours"]>) => save({ quietHours: change }, (current) => ({ ...current, quietHours: { ...current.quietHours, ...change } }));

  const sendTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications/test", { method: "POST", credentials: "include" });
      const json = (await response.json().catch(() => null)) as { data?: { devices: number }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? "We couldn't send a test. Try again.");
      setSaved(json?.data?.devices ? "Test sent. Check your phone or browser." : "Test sent. Look at the bell at the top.");
      setTimeout(() => setSaved(null), 5000);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "We couldn't send a test.");
    } finally {
      setTesting(false);
    }
  };

  if (!settings) {
    return error ? <Notice>{error}</Notice> : (
      <div role="status" className="flex items-center justify-center gap-3 rounded-[22px] border border-app-line bg-white py-12 text-[14px] text-app-ink-soft"><Spinner /> Loading settings</div>
    );
  }

  const shown = CHANNELS.filter((channel) => channel.key === "push" || channel.key === "email" || settings.available[channel.key as "sms" | "whatsapp"]);
  const missing = (channel: NotifyChannel) => (channel === "email" && !settings.contact.email) || ((channel === "sms" || channel === "whatsapp") && !settings.contact.phone);

  return (
    <div className={cx("grid gap-5", className)}>
      <div aria-live="polite" className="min-h-0">
        {error && <Notice>{error}</Notice>}
        {saved && !error && <Notice tone="success">{saved}</Notice>}
      </div>

      <section className="rounded-[22px] border border-app-line bg-white p-5">
        <h2 className="m-0 text-[17px] font-extrabold">Push notifications</h2>
        <p className="m-0 mt-1 text-[14px] text-app-ink-soft">
          {settings.devices ? `On for ${settings.devices} ${settings.devices === 1 ? "phone or browser" : "phones and browsers"}.` : "Get the Shopinbos app on your phone, or turn them on for this computer."}
        </p>
        <div className="mt-2 divide-y divide-app-line">
          <BrowserPushSwitch />
        </div>
        <PillButton tone="white" size="sm" busy={testing} onClick={() => void sendTest()} className="mt-2">
          <Icon name="bell" size={14} /> Send me a test notification
        </PillButton>
      </section>

      <section className="rounded-[22px] border border-app-line bg-white p-5">
        <h2 className="m-0 text-[17px] font-extrabold">What we tell you about</h2>
        <p className="m-0 mt-1 text-[14px] text-app-ink-soft">Everything always shows under the bell. Choose where else each kind of update goes.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className="pb-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">Updates</th>
                {shown.map((channel) => (
                  <th key={channel.key} scope="col" className="w-[88px] pb-2 text-center text-[12px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">{channel.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-app-line">
              {settings.categories.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="py-3 pr-3 font-normal">
                    <span className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-app-canvas"><Icon name={CATEGORY_ICON[row.key]} size={16} /></span>
                      <span>
                        <span className="block text-[14.5px] font-bold">{row.label}</span>
                        <span className="block text-[13px] leading-[1.4] text-app-ink-soft">{row.help}</span>
                      </span>
                    </span>
                  </th>
                  {shown.map((channel) => {
                    const blocked = (!row.textAllowed && (channel.key === "sms" || channel.key === "whatsapp")) || missing(channel.key);
                    return (
                      <td key={channel.key} className="py-3 text-center">
                        {blocked ? (
                          <span className="text-[13px] text-app-ink-faint" title={missing(channel.key) ? (channel.key === "email" ? "Add an email address to your account first" : "Add a phone number to your account first") : "Not sent by text"}>–</span>
                        ) : (
                          <span className="inline-flex"><Toggle on={row.channels[channel.key]} label={`${row.label} by ${channel.label}`} onChange={(on) => void setChannel(row.key, channel.key, on)} /></span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mb-0 mt-3 text-[13px] leading-[1.5] text-app-ink-soft">Payout, billing and security emails always arrive. Texts are never sent for tips and marketing.</p>
      </section>

      <section className="rounded-[22px] border border-app-line bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[17px] font-extrabold">Quiet hours</h2>
            <p className="m-0 mt-1 text-[14px] text-app-ink-soft">No buzzing at night. You get one summary in the morning. Urgent things (an order waiting for you to accept, cash to pay in today) still come through.</p>
          </div>
          <Toggle on={settings.quietHours.enabled} label="Quiet hours" onChange={(on) => void setQuiet({ enabled: on })} />
        </div>
        {settings.quietHours.enabled && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px] font-bold">
            <label className="flex items-center gap-2">
              From
              <select value={settings.quietHours.start} onChange={(event) => void setQuiet({ start: event.target.value })} className="min-h-[42px] rounded-full border border-app-line bg-white px-3 text-[14px]">
                {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              to
              <select value={settings.quietHours.end} onChange={(event) => void setQuiet({ end: event.target.value })} className="min-h-[42px] rounded-full border border-app-line bg-white px-3 text-[14px]">
                {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
              </select>
            </label>
            <span className="text-[13px] font-normal text-app-ink-soft">Lagos time</span>
          </div>
        )}
      </section>
    </div>
  );
}
