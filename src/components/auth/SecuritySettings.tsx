"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Card, CardHead } from "@/components/app-kit";
import { FieldLabel, Notice, PillButton, TextInput } from "@/components/app-ui";
import { friendlyNetworkError, updatePassword } from "./app/auth-api";
import { SignOutDialog } from "./SignOutDialog";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate, type Locale } from "@shared/i18n";

// Settings > Security for every portal: change password (needs the current one), log out of all devices,
// and recent sign-ins / password changes from the AuthEvent log.

interface Activity {
  type: string;
  method: string | null;
  device: string;
  at: string;
}

const ACTIVITY_TYPES = new Set(["login_success", "new_device", "password_changed", "password_reset", "logout_all", "login_locked"]);
const METHODS = new Set(["password", "otp_email", "otp_phone", "google"]);

function formatWhen(iso: string, locale: Locale) {
  return formatDate(iso, locale, { dateStyle: "medium", timeStyle: "short" });
}

export function SecuritySettings({ className }: { className?: string }) {
  const t = useT("auth", "common");
  const locale = useLocale();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmGlobal, setConfirmGlobal] = useState(false);
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const closeGlobal = useCallback(() => setConfirmGlobal(false), []);

  const loadActivity = useCallback(() => {
    fetch("/api/auth/security", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: { activity?: Activity[] } } | null) => setActivity(body?.data?.activity ?? []))
      .catch(() => setActivity([]));
  }, []);

  useEffect(loadActivity, [loadActivity]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (password.length < 8) {
      setError(t("security.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("security.mismatch"));
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password, current || undefined);
      setSaved(true);
      setCurrent("");
      setPassword("");
      setConfirm("");
      loadActivity();
    } catch (updateError) {
      setError(friendlyNetworkError(updateError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={className ?? "p-5"}>
      <CardHead title={t("security.title")} sub={t("security.sub")} />

      <form onSubmit={submit} noValidate className="mt-5 grid gap-4">
        <h3 className="m-0 text-[15px] font-extrabold">{t("security.change")}</h3>
        <div>
          <FieldLabel htmlFor="security-current">{t("security.current")}</FieldLabel>
          <TextInput id="security-current" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
          <p className="mb-0 mt-1.5 text-[12.5px] leading-[1.45] text-app-ink-soft">
            {t("security.currentHint")}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="min-w-0">
            <FieldLabel htmlFor="security-new">{t("reset.new")}</FieldLabel>
            <TextInput id="security-new" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="security-confirm">{t("reset.again")}</FieldLabel>
            <TextInput id="security-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </div>
        </div>
        {error && <Notice>{error}</Notice>}
        {saved && <Notice tone="success">{t("security.changed")}</Notice>}
        <div>
          <PillButton type="submit" size="md" busy={busy}>{t("reset.save")}</PillButton>
        </div>
      </form>

      <div className="mt-6 border-t border-app-line pt-5">
        <h3 className="m-0 text-[15px] font-extrabold">{t("security.devices")}</h3>
        <p className="mb-3 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">
          {t("security.devicesSub")}
        </p>
        <PillButton tone="white" size="md" aria-haspopup="dialog" onClick={() => setConfirmGlobal(true)}>
          {t("security.logoutAll")}
        </PillButton>
        <SignOutDialog open={confirmGlobal} onCancel={closeGlobal} scope="global" />
      </div>

      <div className="mt-6 border-t border-app-line pt-5">
        <h3 className="m-0 text-[15px] font-extrabold">{t("security.recent")}</h3>
        {activity === null ? (
          <p className="mb-0 mt-2 text-[13.5px] text-app-ink-soft">{t("loading")}</p>
        ) : activity.length === 0 ? (
          <p className="mb-0 mt-2 text-[13.5px] text-app-ink-soft">{t("security.nothing")}</p>
        ) : (
          <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
            {activity.map((item, index) => (
              <li key={`${item.at}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5 text-[13.5px]">
                <span className="font-bold">
                  {ACTIVITY_TYPES.has(item.type) ? t.dynamic(`activity.${item.type}`, item.type) : item.type}
                  {item.method && METHODS.has(item.method) ? <span className="font-normal text-app-ink-soft"> {t("security.with", { method: t.dynamic(`method.${item.method}`, item.method) })}</span> : null}
                </span>
                <span className="text-app-ink-soft">{item.device} · {formatWhen(item.at, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
