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
import { useT } from "@/components/i18n/I18nProvider";
import { StuckLink } from "./AppAuth";

function roleParam(value: string | null): AuthRole {
  return value === "supplier" || value === "logistics_partner" || value === "admin" ? value : "seller";
}

function Frame({ children, back }: { children: ReactNode; back?: string }) {
  const t = useT("auth");
  return (
    <div className="min-h-dvh bg-app-canvas font-app text-app-ink">
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-[22px] pb-8 pt-[22px] lg:justify-center">
        <div className="mb-8 flex items-center justify-between">
          {back ? (
            <Link href={back} aria-label={t("back")} className="grid h-11 w-11 place-items-center rounded-full bg-white text-app-ink no-underline shadow-[0_1px_2px_rgba(22,20,31,0.06)] hover:bg-app-lilac">
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
  const t = useT("auth", "common");
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
      setError(t("forgot.needEmail"));
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
          <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">{t("forgot.checkEmail")}</h1>
          <p className="mt-2 leading-[1.55] text-app-ink-soft">
            {t("forgot.sent", { email: email.trim() })}
          </p>
          <PillButton tone="white" size="md" className="mt-6 w-full" onClick={() => setSent(false)}>{t("forgot.differentEmail")}</PillButton>
          <p className="mt-5 text-center text-[14px] text-app-ink-soft">
            {t("forgot.remembered")} <Link href={portalLoginPath(role)} className="font-bold text-app-ink">{t("logIn")}</Link>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">{t("forgot.title")}</h1>
          <p className="mb-6 mt-2 leading-[1.55] text-app-ink-soft">{t("forgot.sub")}</p>
          <FieldLabel htmlFor="reset-email">{t("method.email")}</FieldLabel>
          <TextInput id="reset-email" type="email" autoComplete="email" autoFocus placeholder="you@yourshop.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          {error && <div className="mt-5"><Notice>{error}</Notice></div>}
          <PillButton type="submit" className="mt-6 w-full" busy={busy}>{t("forgot.send")}</PillButton>
          <p className="mt-5 text-center text-[14px] text-app-ink-soft">
            <Link href={`${portalLoginPath(role)}?method=email`} className="font-bold text-app-ink">{t("forgot.codeInstead")}</Link>
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
  const t = useT("auth", "common");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { signedIn: boolean }>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("reset.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("reset.mismatch"));
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
          <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">{t("reset.saved")}</h1>
          <p className="mt-2 leading-[1.55] text-app-ink-soft">
            {t("reset.signedOut")} {done.signedIn ? t("reset.stillIn") : t("reset.loginAgain")}
          </p>
        </div>
        <PillButton className="mt-6 w-full" busy={busy} onClick={() => void continueToShop()}>
          {done.signedIn ? t("continue") : t("logIn")}
        </PillButton>
      </Frame>
    );
  }

  if (!ready) {
    return (
      <Frame back="/forgot-password">
        <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">{t("reset.expired")}</h1>
        <p className="mb-6 mt-2 leading-[1.55] text-app-ink-soft">{t("reset.expiredSub")}</p>
        <Link href="/forgot-password" className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-app-ink text-[16px] font-extrabold text-white no-underline">{t("reset.newLink")}</Link>
      </Frame>
    );
  }

  return (
    <Frame>
      <form onSubmit={submit} noValidate>
        <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">{t("reset.title")}</h1>
        <p className="mb-6 mt-2 leading-[1.55] text-app-ink-soft">{t("reset.sub")}</p>
        <FieldLabel htmlFor="new-password">{t("reset.new")}</FieldLabel>
        <TextInput id="new-password" type="password" autoComplete="new-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} />
        <div className="mt-5">
          <FieldLabel htmlFor="confirm-password">{t("reset.again")}</FieldLabel>
          <TextInput id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        </div>
        {error && <div className="mt-5"><Notice>{error}</Notice></div>}
        <PillButton type="submit" className="mt-6 w-full" busy={busy}>{t("reset.save")}</PillButton>
      </form>
    </Frame>
  );
}
