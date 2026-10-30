"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice, Toggle } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { clockWords, type RiderNotifyPrefs } from "@shared/message-notifications";

// Web Riders app › Me › Notifications: the same settings as the phone's (shared/message-notifications.ts), saved on
// the rider through /api/mobile/logistics/rider/notifications with the private link's token. They decide which
// messages buzz the Riders app on the phone; messages always wait in the chat.

const SETTINGS_URL = "/api/mobile/logistics/rider/notifications";

type Change = { company?: boolean; shops?: boolean; quiet?: Partial<RiderNotifyPrefs["quiet"]> };

export function RiderNotifySettings({ token, company }: { token: string; company: string }) {
  const t = useT("rider");
  const [prefs, setPrefs] = useState<RiderNotifyPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch(SETTINGS_URL, { headers: { "x-rider-token": token }, cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { data?: RiderNotifyPrefs; error?: { message?: string } } | null;
        if (!live) return;
        if (!response.ok || !body?.data) setError(body?.error?.message ?? t("notify.loadFailed"));
        else setPrefs(body.data);
      })
      .catch(() => live && setError(t("notify.loadFailed")));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function change(patch: Change, optimistic: RiderNotifyPrefs) {
    if (!prefs) return;
    const before = prefs;
    setPrefs(optimistic);
    setError(null);
    const response = await fetch(SETTINGS_URL, { method: "PUT", headers: { "x-rider-token": token, "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { data?: RiderNotifyPrefs; error?: { message?: string } } | null;
    if (!response?.ok || !body?.data) {
      setPrefs(before);
      setError(body?.error?.message ?? t("notify.saveFailed"));
      return;
    }
    setPrefs(body.data);
  }

  const row = "flex min-h-[64px] items-center gap-3 px-4 py-3";
  return (
    <section className="grid gap-2">
      <h2 className="m-0 flex items-center gap-2 px-1 text-[15px] font-extrabold"><Icon name="bell" size={16} /> {t("notify.title")}</h2>
      <p className="m-0 px-1 text-[13.5px] text-app-ink-soft">{t("notify.sub")}</p>
      {error && <Notice>{error}</Notice>}
      {prefs && (
        <ul className="m-0 list-none divide-y divide-app-line-soft overflow-hidden rounded-[22px] bg-white p-0">
          <li className={row}>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[15px] font-bold">{t("notify.company", { company })}</p>
              <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">{t("notify.companyHint")}</p>
            </div>
            <Toggle on={prefs.company} label={t("notify.company", { company })} onChange={(on) => void change({ company: on }, { ...prefs, company: on })} />
          </li>
          <li className={row}>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[15px] font-bold">{t("notify.shops")}</p>
              <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">{t("notify.shopsHint")}</p>
            </div>
            <Toggle on={prefs.shops} label={t("notify.shops")} onChange={(on) => void change({ shops: on }, { ...prefs, shops: on })} />
          </li>
          <li className={row}>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[15px] font-bold">{t("notify.quiet")}</p>
              <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">
                {prefs.quiet.enabled ? t("notify.quietOn", { start: clockWords(prefs.quiet.start), end: clockWords(prefs.quiet.end) }) : t("notify.quietOff")}
              </p>
            </div>
            <Toggle on={prefs.quiet.enabled} label={t("notify.quiet")} onChange={(on) => void change({ quiet: { enabled: on } }, { ...prefs, quiet: { ...prefs.quiet, enabled: on } })} />
          </li>
        </ul>
      )}
      <p className="m-0 px-1 text-[13px] text-app-ink-soft">{t("notify.phoneNote")}</p>
    </section>
  );
}
