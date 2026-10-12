"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { roleDestination, type AuthRole } from "@/lib/brand";
import { portalLoginPath } from "@/lib/portal-routes";
import { isValidEmail } from "@shared/phone";
import { FieldLabel, Mascot, Notice, PillButton, TextInput, Wordmark } from "@/components/app-ui";
import { friendlyNetworkError, navigateAfterAuth, sendPasswordReset, syncSession, updatePassword } from "./auth-api";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Icon } from "@/components/ui/Icon";
import { StuckLink } from "./AppAuth";

function roleParam(value: string | null): AuthRole {
  return value === "supplier" || value === "logistics_partner" || value === "admin" ? value : "seller";
}

function Frame({ children, back }: { children: ReactNode; back?: string }) {
  return (
    <div className="min-h-dvh bg-app-canvas font-app text-app-ink">
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-[22px] pb-8 pt-[22px] lg:justify-center">
        <div className="mb-8 flex items-center justify-between">
          {back ? (
            <Link href={back} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full bg-white text-app-ink no-underline shadow-[0_1px_2px_rgba(22,20,31,0.06)] hover:bg-app-lilac">
              <Icon name="arrowLeft" size={18} strokeWidth={2.2} />
            </Link>
          ) : <span />}
          <Wordmark />
        </div>
        <div className="rounded-[28px] lg:border lg:border-app-line lg:bg-white lg:p-8">{children}</div>
      </div>
    </div>
  );
}

export function ForgotPasswordScreen() {
  const params = useSearchParams();
  const role = roleParam(params.get("role"));
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError("Enter the email you use for Shopinbos.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(email.trim().toLowerCase(), role);
      setSent(true);
    } catch (resetError) {
      setError(friendlyNetworkError(resetError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame back={portalLoginPath(role)}>
      {sent ? (
        <div>
          <Mascot name="peggy-wave" className="mb-4 h-24 w-24" />
          <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">Check your email</h1>
          <p className="mt-2 leading-[1.55] text-app-ink-soft">
            If {email.trim()} has a Shopinbos account, we&apos;ve sent a link to set a new password. It works once and expires in an hour.
          </p>
          <PillButton tone="white" size="md" className="mt-6 w-full" onClick={() => setSent(false)}>Use a different email</PillButton>
          <p className="mt-5 text-center text-[14px] text-app-ink-soft">
            Remembered it? <Link href={portalLoginPath(role)} className="font-bold text-app-ink">Log in</Link>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">Reset your password</h1>
          <p className="mb-6 mt-2 leading-[1.55] text-app-ink-soft">We&apos;ll email you a link to choose a new one. You can also log in with a code instead.</p>
          <FieldLabel htmlFor="reset-email">Email</FieldLabel>
          <TextInput id="reset-email" type="email" autoComplete="email" autoFocus placeholder="you@yourshop.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          {error && <div className="mt-5"><Notice>{error}</Notice></div>}
          <PillButton type="submit" className="mt-6 w-full" busy={busy}>Send reset link</PillButton>
          <p className="mt-5 text-center text-[14px] text-app-ink-soft">
            <Link href={`${portalLoginPath(role)}?method=email`} className="font-bold text-app-ink">Log in with an email code instead</Link>
          </p>
        </form>
      )}
      <StuckLink className="mt-8" />
    </Frame>
  );
}

/**
 * `ready` comes from the server: true only for the session /auth/callback made from an unused reset link.
 * Anything else (expired, already used, opened in another browser) gets the "ask for a new link" screen.
 */
export function ResetPasswordScreen({ ready }: { ready: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { signedIn: boolean }>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const result = await updatePassword(password);
      setDone({ signedIn: Boolean(result?.signedIn) });
    } catch (updateError) {
      setError(friendlyNetworkError(updateError));
    } finally {
      setBusy(false);
    }
  }

  async function continueToShop() {
    setBusy(true);
    const { data } = (await getSupabaseBrowserClient()?.auth.getSession()) ?? { data: { session: null } };
    // Sync resolves the account's real role; "seller" is only a fallback for brand-new rows.
    const role = data.session ? await syncSession(data.session.access_token, { role: "seller" }) : null;
    await navigateAfterAuth(data.session ? roleDestination(role ?? "seller") : portalLoginPath("seller"));
  }

  if (done) {
    return (
      <Frame>
        <div role="status">
          <Mascot name="peggy-wave" className="mb-4 h-24 w-24" />
          <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">Password saved</h1>
          <p className="mt-2 leading-[1.55] text-app-ink-soft">
            You&apos;ve been signed out on other devices. {done.signedIn ? "You're still logged in here." : "Log in with your new password to carry on."}
          </p>
        </div>
        <PillButton className="mt-6 w-full" busy={busy} onClick={() => void continueToShop()}>
          {done.signedIn ? "Continue" : "Log in"}
        </PillButton>
      </Frame>
    );
  }

  if (!ready) {
    return (
      <Frame back="/forgot-password">
        <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">This link has expired</h1>
        <p className="mb-6 mt-2 leading-[1.55] text-app-ink-soft">Reset links work once and expire after an hour. Ask for a new one.</p>
        <Link href="/forgot-password" className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-app-ink text-[16px] font-extrabold text-white no-underline">Send a new link</Link>
      </Frame>
    );
  }

  return (
    <Frame>
      <form onSubmit={submit} noValidate>
        <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">Choose a new password</h1>
        <p className="mb-6 mt-2 leading-[1.55] text-app-ink-soft">At least 8 characters. We&apos;ll sign you out everywhere else, and keep you logged in here.</p>
        <FieldLabel htmlFor="new-password">New password</FieldLabel>
        <TextInput id="new-password" type="password" autoComplete="new-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} />
        <div className="mt-5">
          <FieldLabel htmlFor="confirm-password">Type it again</FieldLabel>
          <TextInput id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        </div>
        {error && <div className="mt-5"><Notice>{error}</Notice></div>}
        <PillButton type="submit" className="mt-6 w-full" busy={busy}>Save password</PillButton>
      </form>
    </Frame>
  );
}
