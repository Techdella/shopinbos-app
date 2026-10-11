import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { api, API_URL } from "./api";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export type CodeTarget = { kind: "phone"; phone: string; via: "whatsapp" | "sms" } | { kind: "email"; email: string };
export type AppRole = "seller" | "supplier" | "logistics_partner" | "admin";

function friendly(message: string, phone = false) {
  if (/signups not allowed|user not found/i.test(message)) return "We couldn't find an account for that. Check it, or create a new shop.";
  if (/phone provider/i.test(message) && phone) return "Phone codes aren't switched on yet. Use email for now.";
  if (/expired|invalid/i.test(message) && /token|otp/i.test(message)) return "That code is wrong or has expired. Check it, or ask for a new one.";
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Try again or use a code.";
  if (/provider is not enabled/i.test(message)) return "Google sign-in isn't switched on yet. Use your phone or email.";
  return message;
}

export async function sendCode(target: CodeTarget, options: { create: boolean; fullName?: string }) {
  const data = options.create ? { role: "seller", full_name: options.fullName?.trim() || undefined } : undefined;
  const { error } =
    target.kind === "phone"
      ? await supabase.auth.signInWithOtp({ phone: target.phone, options: { shouldCreateUser: options.create, channel: target.via, data } })
      : await supabase.auth.signInWithOtp({ email: target.email, options: { shouldCreateUser: options.create, data } });
  if (error) throw new Error(friendly(error.message, target.kind === "phone"));
}

export async function verifyCode(target: CodeTarget, token: string) {
  const { data, error } =
    target.kind === "phone"
      ? await supabase.auth.verifyOtp({ phone: target.phone, token, type: "sms" })
      : await supabase.auth.verifyOtp({ email: target.email, token, type: "email" });
  if (error) throw new Error(friendly(error.message, target.kind === "phone"));
  return data.session;
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error.message));
  return data.session;
}

/** Google sign-in in the system browser, returning to shopinbos://auth/callback (PKCE). */
export async function signInWithGoogle() {
  const redirectTo = makeRedirectUri({ scheme: "shopinbos", path: "auth/callback" });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) throw new Error(friendly(error?.message ?? "Couldn't open Google sign-in."));
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return null;
  const code = new URL(result.url).searchParams.get("code");
  if (!code) throw new Error("Google sign-in didn't finish. Try again.");
  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error) throw new Error(friendly(exchange.error.message));
  return exchange.data.session;
}

export async function sendPasswordReset(email: string) {
  // The reset link opens the web app, which handles choosing the new password.
  const redirectTo = `${API_URL}/auth/callback?role=seller&next=${encodeURIComponent("/reset-password")}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(friendly(error.message));
}

/** Creates or refreshes the app's User row; returns the account's actual role. */
export async function syncAccount(payload: { fullName?: string; phone?: string; signup?: boolean }) {
  const data = await api<{ role?: AppRole }>("/api/auth/sync-user", {
    method: "POST",
    json: { role: "seller", fullName: payload.fullName, phone: payload.phone, source: payload.signup ? "signup" : undefined },
  }).catch(() => null);
  return data?.role ?? null;
}

export async function signOut() {
  await supabase.auth.signOut();
}
