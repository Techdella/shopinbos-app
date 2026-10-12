"use client";

import type { AuthRole } from "@/lib/brand";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export type SignupRole = Exclude<AuthRole, "admin">;

export type CodeTarget = { kind: "phone"; phone: string; via: "whatsapp" | "sms" } | { kind: "email"; email: string };

type ApiBody<T> = { data?: T; error?: { message?: string } } | null;

async function postJson<T>(url: string, payload: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => null)) as ApiBody<T>;
  if (!response.ok) throw new Error(body?.error?.message ?? "Something went wrong. Please try again.");
  return body?.data as T;
}

function targetFields(target: CodeTarget) {
  return target.kind === "phone" ? { phone: target.phone, via: target.via } : { email: target.email };
}

export async function sendCode(
  target: CodeTarget,
  options: { create: boolean; profile?: { fullName?: string; role?: SignupRole; businessName?: string } },
) {
  await postJson("/api/auth/otp", { action: "send", ...targetFields(target), create: options.create, profile: options.profile });
}

export async function verifyCode(target: CodeTarget, token: string) {
  const data = await postJson<{ accessToken: string | null }>("/api/auth/otp", { action: "verify", ...targetFields(target), token });
  return data?.accessToken ?? null;
}

/** Creates or refreshes the app's User row. Returns the role the account actually has. */
export async function syncSession(
  accessToken: string,
  payload: { role: AuthRole; fullName?: string; businessName?: string; phone?: string; source?: "signup" },
) {
  const data = await postJson<{ role?: AuthRole }>("/api/auth/sync-user", payload, { Authorization: `Bearer ${accessToken}` }).catch(() => null);
  return data?.role ?? null;
}

/** Email + password sign-in through /api/auth/login (rate-limited and logged); it sets the session cookies. */
export async function signInWithPassword(email: string, password: string) {
  const data = await postJson<{ accessToken: string | null }>("/api/auth/login", { email, password });
  return data?.accessToken ?? null;
}

export function callbackUrl(role: AuthRole, next: string) {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("role", role);
  url.searchParams.set("next", next);
  return url.toString();
}

export async function signInWithGoogle(role: AuthRole, next: string) {
  const supabase = requireSupabase();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(role, next), queryParams: { prompt: "select_account" } },
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

export function friendlyNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|network|connect/i.test(message)
    ? "We couldn't reach Shopinbos. Check your connection and try again."
    : message || "Something went wrong. Please try again.";
}
