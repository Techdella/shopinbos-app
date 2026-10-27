"use client";

import type { AuthRole } from "@/lib/brand";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { friendlyError } from "@/lib/errors/report-client";

export type SignupRole = Exclude<AuthRole, "admin">;

export type CodeTarget = { kind: "phone"; phone: string; via: "whatsapp" | "sms" } | { kind: "email"; email: string };

type ApiBody<T> = { data?: T; error?: { code?: string; message?: string; role?: AuthRole | null } } | null;

/**
 * A refused auth request, with the server's code: NO_ACCOUNT (log in with an email or phone that has no account) or
 * ACCOUNT_EXISTS (sign up with one that has; role is the kind of account it is, when known).
 */
export class AuthApiError extends Error {
  constructor(message: string, readonly code?: string, readonly role?: AuthRole | null) {
    super(message);
  }
}

async function postJson<T>(url: string, payload: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => null)) as ApiBody<T>;
  if (!response.ok) throw new AuthApiError(body?.error?.message ?? "Something went wrong. Please try again.", body?.error?.code, body?.error?.role);
  return body?.data as T;
}

function targetFields(target: CodeTarget) {
  return target.kind === "phone" ? { phone: target.phone, via: target.via } : { email: target.email };
}

/** How the code actually went: WhatsApp, SMS (WhatsApp off, failed, or "Send it by SMS") or email. */
export type CodeChannel = "whatsapp" | "sms" | "email";

/** Sends a code. Returns the channel that really carried it, so the screen can say where to look. */
export async function sendCode(
  target: CodeTarget,
  options: { create: boolean; profile?: { fullName?: string; role?: SignupRole; businessName?: string } },
): Promise<CodeChannel> {
  const data = await postJson<{ channel?: CodeChannel | null }>("/api/auth/otp", { action: "send", ...targetFields(target), create: options.create, profile: options.profile });
  const channel = data?.channel;
  return channel === "whatsapp" || channel === "sms" || channel === "email" ? channel : target.kind === "email" ? "email" : "sms";
}

/** Can phone codes go by WhatsApp on this server (AUTH_OTP_WHATSAPP)? false when unknown. */
export async function fetchWhatsAppCodes() {
  const response = await fetch("/api/auth/otp", { headers: { Accept: "application/json" } }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { data?: { whatsapp?: boolean } } | null;
  return body?.data?.whatsapp === true;
}

/** Checks the code. needsName: a brand-new account, so ask "What should we call you?" before going on. */
export async function verifyCode(target: CodeTarget, token: string) {
  const data = await postJson<{ accessToken: string | null; needsName?: boolean }>("/api/auth/otp", { action: "verify", ...targetFields(target), token });
  return { accessToken: data?.accessToken ?? null, needsName: data?.needsName === true };
}

/** Creates or refreshes the app's User row. Returns the role the account actually has. */
export async function syncSession(
  accessToken: string,
  payload: { role: AuthRole; fullName?: string; businessName?: string; phone?: string; source?: "signup"; ageConfirmed?: boolean },
) {
  const data = await postJson<{ role?: AuthRole }>("/api/auth/sync-user", payload, { Authorization: `Bearer ${accessToken}` }).catch(() => null);
  return data?.role ?? null;
}

/** Email + password sign-in through /api/auth/login (rate-limited and logged); it sets the session cookies. */
export async function signInWithPassword(email: string, password: string) {
  const data = await postJson<{ accessToken: string | null }>("/api/auth/login", { email, password });
  return data?.accessToken ?? null;
}

/** mode "signup" lets the callback say "This email already has a seller account" when the Google account has one. */
/** adult: "I'm 18 or older" was ticked on the sign-up page; the callback records it on the account. */
export function callbackUrl(role: AuthRole, next: string, mode?: "login" | "signup", adult = false) {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("role", role);
  url.searchParams.set("next", next);
  if (mode === "signup") url.searchParams.set("mode", "signup");
  if (mode === "signup" && adult) url.searchParams.set("adult", "1");
  return url.toString();
}

export async function signInWithGoogle(role: AuthRole, next: string, mode?: "login" | "signup", adult = false) {
  const supabase = requireSupabase();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(role, next, mode, adult), queryParams: { prompt: "select_account" } },
  });
  if (error) throw new Error(/provider is not enabled/i.test(error.message) ? "Google sign-in isn't switched on yet. Use your phone or email." : error.message);
}

/** The server calls Supabase's resetPasswordForEmail, rate-limited, and always answers "sent". */
export async function sendPasswordReset(email: string, role: AuthRole) {
  await postJson("/api/auth/password/forgot", { email, role });
}

/**
 * Sets a new password. From a reset link no current password is needed; from Settings it is (or a very
 * recent sign-in). Every other device is signed out either way.
 */
export async function updatePassword(password: string, currentPassword?: string) {
  return postJson<{ changed: boolean; signedOutOthers: boolean; signedIn?: boolean }>("/api/auth/password", { password, currentPassword });
}

export async function hasSession() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

/** Waits briefly for the auth cookie to land before a full navigation, so the server sees the session. */
export async function navigateAfterAuth(url: string) {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  window.location.href = url;
}

function requireSupabase() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Sign in isn't available right now. Please try again shortly.");
  return supabase;
}

/** Words for sign-in and sign-up screens: plain messages as they are, technical ones made friendly (and reported). */
export function friendlyNetworkError(error: unknown) {
  return friendlyError(error);
}
