import { Alert } from "react-native";
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

export async function sendCode(target: CodeTarget, options: { create: boolean; fullName?: string; role?: Exclude<AppRole, "admin"> }) {
  // Same sign-up metadata as the web's /api/auth/otp: the role picked on the sign-up screen ("I sell / I supply shops / I deliver").
  const data = options.create ? { role: options.role ?? "seller", full_name: options.fullName?.trim() || undefined } : undefined;
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
export async function syncAccount(payload: { fullName?: string; phone?: string; signup?: boolean; role?: Exclude<AppRole, "admin"> }) {
  const role = payload.role ?? "seller";
  // Google sign-ups carry no role yet; the backend reads it from the session, so set it before the first sync.
  if (payload.signup && role !== "seller") {
    const { data: current } = await supabase.auth.getUser();
    if (current.user && !current.user.user_metadata?.role) await supabase.auth.updateUser({ data: { role } }).then(() => supabase.auth.refreshSession()).catch(() => null);
  }
  const data = await api<{ role?: AppRole }>("/api/auth/sync-user", {
    method: "POST",
    json: { role, fullName: payload.fullName, phone: payload.phone, source: payload.signup ? "signup" : undefined },
  }).catch(() => null);
  return data?.role ?? null;
}

/** Asks "Log out of Shopinbos?" and resolves true only if the person chose Log out. */
export function confirmSignOut(options: { everywhere?: boolean } = {}) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      options.everywhere ? "Log out of all devices?" : "Log out of Shopinbos?",
      options.everywhere
        ? "This logs you out on this phone and every other device. You'll need your code or password to get back in."
        : "You'll need your code or password to get back in.",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: options.everywhere ? "Log out everywhere" : "Log out", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Signs out without asking. Used after confirmSignOut, and when a session has expired. */
export async function signOutNow(scope: "local" | "global" = "local") {
  markUserSignOut();
  await supabase.auth.signOut({ scope }).catch(() => supabase.auth.signOut({ scope: "local" }));
}

/**
 * Every "Log out" button calls this. It asks first; if the person cancels, the returned promise never
 * settles, so callers' `.then(() => router.replace("/welcome"))` only runs after a real sign-out.
 */
export function signOut(options: { everywhere?: boolean } = {}) {
  return new Promise<void>((resolve) => {
    void confirmSignOut(options).then(async (confirmed) => {
      if (!confirmed) return;
      await signOutNow(options.everywhere ? "global" : "local");
      resolve();
    });
  });
}

// Lets the session provider tell a sign-out the person chose apart from a session that ran out.
let userSignOutAt = 0;
function markUserSignOut() {
  userSignOutAt = Date.now();
}
export function signOutWasRequested() {
  return Date.now() - userSignOutAt < 10_000;
}
