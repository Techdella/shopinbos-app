"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Card, CardHead } from "@/components/app-kit";
import { FieldLabel, Notice, PillButton, TextInput } from "@/components/app-ui";
import { friendlyNetworkError, updatePassword } from "./app/auth-api";
import { SignOutDialog } from "./SignOutDialog";

// Settings > Security for every portal: change password (needs the current one), log out of all devices,
// and recent sign-ins / password changes from the AuthEvent log.

interface Activity {
  type: string;
  method: string | null;
  device: string;
  at: string;
}

const ACTIVITY_LABEL: Record<string, string> = {
  login_success: "Signed in",
  new_device: "Signed in on a new device",
  password_changed: "Password changed",
  password_reset: "Password reset by email link",
  logout_all: "Logged out of all devices",
  login_locked: "Sign-in paused after wrong attempts",
};

const METHOD_LABEL: Record<string, string> = {
  password: "password",
  otp_email: "email code",
  otp_phone: "phone code",
  google: "Google",
};

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function SecuritySettings({ className }: { className?: string }) {
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
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirm) {
      setError("The two new passwords don't match.");
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
      <CardHead title="Security" sub="Your password, where you're signed in, and recent activity." />

      <form onSubmit={submit} noValidate className="mt-5 grid gap-4">
        <h3 className="m-0 text-[15px] font-extrabold">Change password</h3>
        <div>
          <FieldLabel htmlFor="security-current">Current password</FieldLabel>
          <TextInput id="security-current" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
          <p className="mb-0 mt-1.5 text-[12.5px] leading-[1.45] text-app-ink-soft">
            Only ever used a code or Google? Leave this empty within 10 minutes of logging in.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="min-w-0">
            <FieldLabel htmlFor="security-new">New password</FieldLabel>
            <TextInput id="security-new" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="security-confirm">Type it again</FieldLabel>
            <TextInput id="security-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </div>
        </div>
        {error && <Notice>{error}</Notice>}
        {saved && <Notice tone="success">Password changed. We signed you out on your other devices and emailed you a note.</Notice>}
        <div>
          <PillButton type="submit" size="md" busy={busy}>Save password</PillButton>
        </div>
      </form>

      <div className="mt-6 border-t border-app-line pt-5">
        <h3 className="m-0 text-[15px] font-extrabold">Signed-in devices</h3>
        <p className="mb-3 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">
          Lost a phone or used a shared computer? Log out everywhere, including this browser.
        </p>
        <PillButton tone="white" size="md" aria-haspopup="dialog" onClick={() => setConfirmGlobal(true)}>
          Log out of all devices
        </PillButton>
        <SignOutDialog open={confirmGlobal} onCancel={closeGlobal} scope="global" />
      </div>

      <div className="mt-6 border-t border-app-line pt-5">
        <h3 className="m-0 text-[15px] font-extrabold">Recent activity</h3>
        {activity === null ? (
          <p className="mb-0 mt-2 text-[13.5px] text-app-ink-soft">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="mb-0 mt-2 text-[13.5px] text-app-ink-soft">Nothing to show yet.</p>
        ) : (
          <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
            {activity.map((item, index) => (
              <li key={`${item.at}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5 text-[13.5px]">
                <span className="font-bold">
                  {ACTIVITY_LABEL[item.type] ?? item.type}
                  {item.method && METHOD_LABEL[item.method] ? <span className="font-normal text-app-ink-soft"> with {METHOD_LABEL[item.method]}</span> : null}
                </span>
                <span className="text-app-ink-soft">{item.device} · {formatWhen(item.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
