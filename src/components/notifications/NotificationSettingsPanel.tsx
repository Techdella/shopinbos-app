"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, Spinner, Toggle, cx } from "@/components/app-ui";
import type { NotifyCategory, NotifyChannel } from "@shared/notifications";
import { CATEGORY_ICON } from "./NotificationFeed";
import { BrowserPushSwitch } from "./PushToggle";
import { categoryName, type NotificationsT } from "./client";
import { useT } from "@/components/i18n/I18nProvider";

// Settings › Notifications: which alerts reach you where (push to your phone and browser, email, SMS, WhatsApp)
// for each kind of update, quiet hours, and "Send me a test notification". Saves each switch straight away.

interface Settings {
  categories: Array<{ key: NotifyCategory; label: string; help: string; channels: Record<NotifyChannel, boolean>; textAllowed: boolean; emailAllowed?: boolean }>;
  quietHours: { enabled: boolean; start: string; end: string; timezone: string };
  available: { webPush: boolean; email: boolean; sms: boolean; whatsapp: boolean };
  contact: { email: string | null; phone: string | null };
  devices: number;
}

const CHANNELS: Array<{ key: NotifyChannel }> = [{ key: "push" }, { key: "email" }, { key: "sms" }, { key: "whatsapp" }];

const HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);

function hourLabel(value: string, t: NotificationsT) {
  const hour = Number(value.slice(0, 2));
  return hour === 0 ? t("settings.midnight") : hour === 12 ? t("settings.noon") : hour < 12 ? t("settings.am", { hour }) : t("settings.pm", { hour: hour - 12 });
}

/** The API sends English labels; "Jobs" and "Needs review" are the role-specific names. */
function rowLabel(row: { key: NotifyCategory; label: string }, t: NotificationsT) {
  return categoryName(row.key, row.label === "Jobs" ? "logistics_partner" : row.label === "Needs review" ? "admin" : null, t);
}

async function call(method: "GET" | "PUT", body: unknown, failed: string): Promise<Settings> {
  const response = await fetch("/api/notifications/settings", { method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = (await response.json().catch(() => null)) as { data?: Settings; error?: { message?: string } } | null;
  if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? failed);
  return json.data;
}

export function NotificationSettingsPanel({ className }: { className?: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const t = useT("notifications", "common");

  useEffect(() => {
    call("GET", undefined, t("settings.loadFailed")).then(setSettings).catch((loadError) => setError(loadError instanceof Error && loadError.message ? loadError.message : t("settings.loadFailed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (body: unknown, optimistic: (current: Settings) => Settings) => {
    if (!settings) return;
    const before = settings;
    setSettings(optimistic(settings));
    setError(null);
    try {
      setSettings(await call("PUT", body, t("settings.saveFailed")));
      setSaved(t("settings.saved"));
      setTimeout(() => setSaved(null), 1800);
    } catch (saveError) {
      setSettings(before);
      setError(saveError instanceof Error && saveError.message ? saveError.message : t("settings.saveFailed"));
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
      if (!response.ok) throw new Error(json?.error?.message ?? t("settings.testFailed"));
      setSaved(json?.data?.devices ? t("settings.testSentDevice") : t("settings.testSentBell"));
      setTimeout(() => setSaved(null), 5000);
    } catch (testError) {
      setError(testError instanceof Error && testError.message ? testError.message : t("settings.testFailedShort"));
    } finally {
      setTesting(false);
    }
  };

  if (!settings) {
    return error ? <Notice>{error}</Notice> : (
      <div role="status" className="flex items-center justify-center gap-3 rounded-[22px] border border-app-line bg-white py-12 text-[14px] text-app-ink-soft"><Spinner /> {t("settings.loading")}</div>
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
        <h2 className="m-0 text-[17px] font-extrabold">{t("settings.pushTitle")}</h2>
        <p className="m-0 mt-1 text-[14px] text-app-ink-soft">
          {settings.devices ? t("settings.pushOn", { count: settings.devices }) : t("settings.pushNone")}
        </p>
        <div className="mt-2 divide-y divide-app-line">
          <BrowserPushSwitch />
        </div>
        <PillButton tone="white" size="sm" busy={testing} onClick={() => void sendTest()} className="mt-2">
          <Icon name="bell" size={14} /> {t("settings.sendTest")}
        </PillButton>
      </section>

      <section className="rounded-[22px] border border-app-line bg-white p-5">
        <h2 className="m-0 text-[17px] font-extrabold">{t("settings.whatTitle")}</h2>
        <p className="m-0 mt-1 text-[14px] text-app-ink-soft">{t("settings.whatText")}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className="pb-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">{t("settings.updates")}</th>
                {shown.map((channel) => (
                  <th key={channel.key} scope="col" className="w-[88px] pb-2 text-center text-[12px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">{t(`channel.${channel.key}` as const)}</th>
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
                        <span className="block text-[14.5px] font-bold">{rowLabel(row, t)}</span>
                        <span className="block text-[13px] leading-[1.4] text-app-ink-soft">{t.dynamic(`help.${row.key}`, row.help)}</span>
                      </span>
                    </span>
                  </th>
                  {shown.map((channel) => {
                    // Shopinbos news is push and bell only (emailAllowed false); older servers don't send the flag.
                    const blocked = (!row.textAllowed && (channel.key === "sms" || channel.key === "whatsapp")) || (row.emailAllowed === false && channel.key === "email") || missing(channel.key);
                    return (
                      <td key={channel.key} className="py-3 text-center">
                        {blocked ? (
                          <span className="text-[13px] text-app-ink-faint" title={missing(channel.key) ? (channel.key === "email" ? t("settings.needEmail") : t("settings.needPhone")) : t("settings.notByText")}>–</span>
                        ) : (
                          <span className="inline-flex"><Toggle on={row.channels[channel.key]} label={t("settings.toggle", { category: rowLabel(row, t), channel: t(`channel.${channel.key}` as const) })} onChange={(on) => void setChannel(row.key, channel.key, on)} /></span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mb-0 mt-3 text-[13px] leading-[1.5] text-app-ink-soft">{t("settings.alwaysArrive")}</p>
      </section>

      <section className="rounded-[22px] border border-app-line bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[17px] font-extrabold">{t("settings.quietTitle")}</h2>
            <p className="m-0 mt-1 text-[14px] text-app-ink-soft">{t("settings.quietText")}</p>
          </div>
          <Toggle on={settings.quietHours.enabled} label={t("settings.quietTitle")} onChange={(on) => void setQuiet({ enabled: on })} />
        </div>
        {settings.quietHours.enabled && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px] font-bold">
            <label className="flex items-center gap-2">
              {t("settings.from")}
              <select value={settings.quietHours.start} onChange={(event) => void setQuiet({ start: event.target.value })} className="min-h-[42px] rounded-full border border-app-line bg-white px-3 text-[14px]">
                {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour, t)}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              {t("settings.to")}
              <select value={settings.quietHours.end} onChange={(event) => void setQuiet({ end: event.target.value })} className="min-h-[42px] rounded-full border border-app-line bg-white px-3 text-[14px]">
                {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour, t)}</option>)}
              </select>
            </label>
            <span className="text-[13px] font-normal text-app-ink-soft">{t("settings.lagosTime")}</span>
          </div>
        )}
      </section>
    </div>
  );
}
