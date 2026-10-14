import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { api, API_URL } from "./api";
import { supabase } from "./supabase";
import { unregisterPushDevice } from "./push";
import { tNow } from "./app-locale";

WebBrowser.maybeCompleteAuthSession();

export type CodeTarget = { kind: "phone"; phone: string; via: "whatsapp" | "sms" } | { kind: "email"; email: string };
export type AppRole = "seller" | "supplier" | "logistics_partner" | "admin";

function friendly(message: string, phone = false) {
  const t = tNow("m_auth");
  if (/signups not allowed|user not found/i.test(message)) return t("error.noAccount");
  if (/phone provider/i.test(message) && phone) return t("error.noPhoneCodes");
  if (/expired|invalid/i.test(message) && /token|otp/i.test(message)) return t("error.badCode");
  if (/invalid login credentials/i.test(message)) return t("error.badPassword");
  if (/provider is not enabled/i.test(message)) return t("error.noGoogle");
  return message;
}

/** How a code actually went: WhatsApp, SMS (WhatsApp off, failed, or "Send it by SMS") or email. */
export type CodeChannel = "whatsapp" | "sms" | "email";

/** Can phone codes go by WhatsApp (the server's AUTH_OTP_WHATSAPP, GET /api/auth/otp)? false when unknown. */
export async function fetchWhatsAppCodes() {
  try {
    const response = await fetch(`${API_URL}/api/auth/otp`, { headers: { Accept: "application/json" } });
    const body = (await response.json().catch(() => null)) as { data?: { whatsapp?: boolean } } | null;
    return body?.data?.whatsapp === true;
  } catch {
    return false;
  }
}

/**
 * Sends a sign-in code and returns the channel that carried it. WhatsApp codes go through the server
 * (POST /api/auth/otp notes the channel for the Send SMS hook, which falls back to SMS); SMS and email codes go
 * straight to Supabase as before. Supabase itself is only ever asked for SMS (its WhatsApp needs Twilio).
 */
export async function sendCode(target: CodeTarget, options: { create: boolean; fullName?: string; role?: Exclude<AppRole, "admin"> }): Promise<CodeChannel> {
  // Same sign-up metadata as the web's /api/auth/otp: the role picked on the sign-up screen ("I sell / I supply shops / I deliver").
  const data = options.create ? { role: options.role ?? "seller", full_name: options.fullName?.trim() || undefined } : undefined;
  if (target.kind === "phone" && target.via === "whatsapp") {
    let response: Response | null = null;
    try {
      response = await fetch(`${API_URL}/api/auth/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "send", phone: target.phone, via: "whatsapp", create: options.create, profile: options.create ? { role: data?.role, fullName: data?.full_name } : undefined }),
      });
    } catch {
      response = null; // Can't reach the server: send by SMS straight from Supabase below.
    }
    if (response) {
      const body = (await response.json().catch(() => null)) as { data?: { channel?: string }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(friendly(body?.error?.message ?? tNow("m_auth")("form.sendFailed"), true));
      return body?.data?.channel === "whatsapp" ? "whatsapp" : "sms";
    }
  }
  const { error } =
    target.kind === "phone"
      ? await supabase.auth.signInWithOtp({ phone: target.phone, options: { shouldCreateUser: options.create, channel: "sms", data } })
      : await supabase.auth.signInWithOtp({ email: target.email, options: { shouldCreateUser: options.create, data } });
  if (error) throw new Error(friendly(error.message, target.kind === "phone"));
  return target.kind === "phone" ? "sms" : "email";
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
  if (error || !data.url) throw new Error(friendly(error?.message ?? tNow("m_auth")("error.googleOpen")));
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return null;
  const code = new URL(result.url).searchParams.get("code");
  if (!code) throw new Error(tNow("m_auth")("error.googleUnfinished"));
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

/** Asks "Log out of Shopinbos?" (m_auth "logout.*") and resolves true only if the person chose Log out. */
export function confirmSignOut(options: { everywhere?: boolean } = {}) {
  const t = tNow("m_auth", "common");
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      options.everywhere ? t("logout.everywhereTitle") : t("logout.title"),
      options.everywhere ? t("logout.everywhereBody") : t("logout.body"),
      [
        { text: t("cancel"), style: "cancel", onPress: () => resolve(false) },
        { text: options.everywhere ? t("logout.everywhere") : t("logOut"), style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Signs out without asking. Used after confirmSignOut, and when a session has expired. */
export async function signOutNow(scope: "local" | "global" = "local") {
  markUserSignOut();
  // This phone stops getting the account's notifications (while the session can still say so).
  await unregisterPushDevice().catch(() => null);
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
