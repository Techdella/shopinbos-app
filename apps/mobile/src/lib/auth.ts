import { Alert, Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
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

/**
 * Told before any code is sent: NO_ACCOUNT (log in with an email or phone that has no account: "sign up first") or
 * ACCOUNT_EXISTS (sign up with one that has: "log in"; role is the kind of account it is, when known).
 */
export class AccountCheckError extends Error {
  constructor(readonly code: "NO_ACCOUNT" | "ACCOUNT_EXISTS", readonly via: "email" | "phone", readonly role: AppRole | null = null) {
    const t = tNow("m_auth");
    super(code === "NO_ACCOUNT" ? t(via === "phone" ? "noAccount.phone" : "noAccount.email") : t(via === "phone" ? "exists.phone" : "exists.email"));
  }
}

type ServerError = { code?: string; message?: string; role?: AppRole | null } | undefined;

function accountCheckError(error: ServerError, via: "email" | "phone") {
  if (error?.code === "NO_ACCOUNT" || error?.code === "ACCOUNT_EXISTS") return new AccountCheckError(error.code, via, error.role ?? null);
  return null;
}

/**
 * Asks the server (POST /api/auth/otp, action "check") whether this email or phone can log in, or sign up, before a
 * code goes or a password is tried. Throws AccountCheckError, the server's own message (say, a number another
 * account already uses, or too many tries), or "Couldn't reach Shopinbos" when there's no answer: nobody goes on
 * to a code or password without being told first whether it can work.
 */
export async function checkAccount(target: CodeTarget, create: boolean) {
  const via = target.kind;
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action: "check", ...(target.kind === "phone" ? { phone: target.phone } : { email: target.email }), create }),
    });
  } catch {
    throw new Error(tNow("m_auth")("error.offline"));
  }
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as { error?: ServerError } | null;
  throw accountCheckError(body?.error, via) ?? new Error(body?.error?.message ?? tNow("m_auth")("error.offline"));
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
 * straight to Supabase, after the server's account check. Supabase itself is only ever asked for SMS (its WhatsApp needs Twilio).
 */
export async function sendCode(target: CodeTarget, options: { create: boolean; fullName?: string; role?: Exclude<AppRole, "admin"> }): Promise<CodeChannel> {
  // Same sign-up metadata as the web's /api/auth/otp: the role picked on the sign-up screen ("I sell / I supply shops / I deliver").
  const data = options.create ? { role: options.role ?? "seller", full_name: options.fullName?.trim() || undefined } : undefined;
  if (target.kind === "phone" && target.via === "whatsapp") {
    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/auth/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "send", phone: target.phone, via: "whatsapp", create: options.create, profile: options.create ? { role: data?.role, fullName: data?.full_name } : undefined }),
      });
    } catch {
      // No answer, so no "sign up first" / "log in instead" check either: say so rather than send blind.
      throw new Error(tNow("m_auth")("error.offline"));
    }
    const body = (await response.json().catch(() => null)) as { data?: { channel?: string }; error?: ServerError } | null;
    if (!response.ok) throw accountCheckError(body?.error, "phone") ?? new Error(friendly(body?.error?.message ?? tNow("m_auth")("form.sendFailed"), true));
    return body?.data?.channel === "whatsapp" ? "whatsapp" : "sms";
  }
  // SMS and email codes go straight to Supabase, so ask the server first: "sign up first" or "log in instead".
  await checkAccount(target, options.create);
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
  await checkAccount({ kind: "email", email }, false);
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

/** Sign in with Apple is offered on iPhone only (Apple requires it there because the app offers Google sign-in). */
export async function appleSignInAvailable() {
  return Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync().catch(() => false));
}

/**
 * Sign in with Apple, natively: Apple signs an ID token for this nonce and Supabase checks it (provider "apple",
 * client ID = the app's bundle ID). Returns the person's name too, which Apple shares on their first sign-in only.
 * null when they cancel.
 */
export async function signInWithApple() {
  const nonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw new Error(tNow("m_auth")("error.appleUnfinished"));
  }
  if (!credential.identityToken) throw new Error(tNow("m_auth")("error.appleUnfinished"));
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken, nonce });
  if (error) throw new Error(friendly(error.message));
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ").trim();
  return { session: data.session, fullName: fullName || undefined };
}

export async function sendPasswordReset(email: string) {
  // The reset link opens the web app, which handles choosing the new password.
  const redirectTo = `${API_URL}/auth/callback?role=seller&next=${encodeURIComponent("/reset-password")}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(friendly(error.message));
}

/**
 * Creates or refreshes the app's User row; returns the account's actual role. On sign-up the role picked on the
 * screen goes with it (source "signup"), and the server uses it only for a brand-new account: an existing account
 * keeps its own role, and the server puts the login's saved role in line. (This used to write the role into the
 * login's metadata from the phone, which could tag an existing seller as a supplier.)
 */
export async function syncAccount(payload: { fullName?: string; phone?: string; signup?: boolean; role?: Exclude<AppRole, "admin"> }) {
  const role = payload.role ?? "seller";
  const data = await api<{ role?: AppRole }>("/api/auth/sync-user", {
    method: "POST",
    json: { role, fullName: payload.fullName, phone: payload.phone, source: payload.signup ? "signup" : undefined },
  }).catch(() => null);
  // Pick up the role the server saved on the login, so later launches read the same one.
  if (payload.signup && data?.role) await supabase.auth.refreshSession().catch(() => null);
  return data?.role ?? null;
}

/**
 * Signed up as one kind of account with an email or phone that already has another kind: "This email already has
 * a seller account. Log in, or use a different email for your supplier business." Nothing about the account was
 * changed. "Open my account" keeps them in it; "Use a different email" logs out so they can start again.
 */
export function explainSignupConflict(actual: AppRole, wanted: Exclude<AppRole, "admin">, via: "email" | "phone") {
  const t = tNow("m_auth");
  const message = t(via === "phone" ? "conflict.phone" : "conflict.email", {
    account: t(`conflict.account.${actual}`),
    business: t(`conflict.business.${wanted}`),
  });
  return new Promise<"open" | "different">((resolve) => {
    Alert.alert(
      t("form.existingTitle"),
      message,
      [
        { text: via === "phone" ? t("conflict.differentPhone") : t("conflict.differentEmail"), onPress: () => resolve("different") },
        { text: t("conflict.open"), style: "default", onPress: () => resolve("open") },
      ],
      { cancelable: true, onDismiss: () => resolve("open") },
    );
  });
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
