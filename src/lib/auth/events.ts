import "server-only";

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { sendEmail } from "@/lib/notifications/resend";
import { sha256 } from "./throttle";

// Security event log ("AuthEvent") plus the emails people get when their password changes or a new
// device signs in. Every write is best-effort: auth must keep working before the migration runs.

export type AuthEventType =
  | "login_success"
  | "login_failure"
  | "login_locked"
  | "otp_sent"
  | "password_reset_requested"
  | "password_reset"
  | "password_changed"
  | "password_change_failed"
  | "new_device"
  | "logout"
  | "logout_all"
  | "session_expired";

export const DEVICE_COOKIE = "sib_device";

export function clientIp(request: NextRequest | Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || null;
}

export function deviceIdFrom(request: NextRequest) {
  const value = request.cookies.get(DEVICE_COOKIE)?.value ?? "";
  return /^[0-9a-f-]{36}$/.test(value) ? value : null;
}

/** Long-lived, httpOnly id for this browser, so a sign-in from somewhere new can be spotted. */
export function deviceCookie(id: string) {
  return {
    name: DEVICE_COOKIE,
    value: id,
    options: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 400 * 86_400 },
  };
}

export async function logAuthEvent(
  request: NextRequest | Request | null,
  event: { type: AuthEventType; supabaseId?: string | null; method?: string | null; deviceId?: string | null; detail?: Record<string, unknown> },
) {
  const ip = request ? clientIp(request) : null;
  const userAgent = request?.headers.get("user-agent")?.slice(0, 300) ?? null;
  const detail = event.detail ? JSON.stringify(event.detail) : null;
  await db.$executeRaw`
    INSERT INTO "AuthEvent" ("id", "supabaseId", "type", "method", "ipHash", "userAgent", "deviceId", "detail", "createdAt")
    VALUES (${randomUUID()}, ${event.supabaseId ?? null}, ${event.type}, ${event.method ?? null}, ${ip ? sha256(ip) : null}, ${userAgent}, ${event.deviceId ?? null}, ${detail}::jsonb, now())`.catch(() => null);
}

/**
 * Whether this account has signed in from this browser before. Unknown (no table yet, or a brand-new
 * account with no history) counts as known so nobody gets a scary email for their first sign-in.
 */
async function isNewDevice(supabaseId: string, deviceId: string | null) {
  try {
    const rows = await db.$queryRaw<{ seen: boolean; any: boolean }[]>`
      SELECT
        EXISTS (SELECT 1 FROM "AuthEvent" WHERE "supabaseId" = ${supabaseId} AND "type" = 'login_success' AND "deviceId" = ${deviceId ?? ""}) AS "seen",
        EXISTS (SELECT 1 FROM "AuthEvent" WHERE "supabaseId" = ${supabaseId} AND "type" = 'login_success') AS "any"`;
    const row = rows[0];
    return Boolean(row && row.any && !row.seen);
  } catch {
    return false;
  }
}

export function describeDevice(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /Expo|okhttp|CFNetwork/i.test(ua) ? "the Shopinbos app" : "a browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function securityEmailHtml(heading: string, lines: string[]) {
  const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com").replace(/\/$/, "");
  return `<!doctype html><html><body style="margin:0;background:#FAF7F1;font-family:Arial,Helvetica,sans-serif;color:#16141F">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="font-weight:800;font-size:18px;margin-bottom:24px">Shopinbos</div>
<div style="background:#fff;border:1px solid #ECE7DD;border-radius:18px;padding:24px">
<h1 style="margin:0 0 12px;font-size:22px">${escape(heading)}</h1>
${lines.map((line) => `<p style="margin:0 0 12px;line-height:1.55;color:#4A4752">${escape(line)}</p>`).join("\n")}
<p style="margin:20px 0 0"><a href="${appUrl}/forgot-password" style="display:inline-block;background:#16141F;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">Reset my password</a></p>
</div>
<p style="font-size:12px;color:#6E6E68;margin-top:16px">You get this email for your account's security. It can't be switched off.</p>
</div></body></html>`;
}

function whenText() {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date());
}

export async function sendPasswordChangedEmail(email: string | null | undefined, request: NextRequest, kind: "changed" | "reset") {
  if (!email) return;
  await sendEmail({
    to: [email],
    subject: "Your Shopinbos password was changed",
    html: securityEmailHtml("Your password was changed", [
      `The password for ${email} was ${kind === "reset" ? "reset with an email link" : "changed in Settings"} on ${whenText()} (Lagos time) from ${describeDevice(request.headers.get("user-agent"))}.`,
      "We signed you out everywhere else. If this was you, you don't need to do anything.",
      "If it wasn't you, reset your password now and contact support@shopinbos.com.",
    ]),
  }).catch(() => null);
}

/**
 * Call after a successful sign-in. Logs it, and emails the account owner when it came from a browser
 * this account hasn't used before. Returns the device id to keep in the browser's cookie.
 */
export async function recordSignIn(
  request: NextRequest,
  user: { id: string; email?: string | null },
  method: string,
) {
  const existing = deviceIdFrom(request);
  const deviceId = existing ?? randomUUID();
  const fresh = await isNewDevice(user.id, deviceId);
  await logAuthEvent(request, { type: "login_success", supabaseId: user.id, method, deviceId });
  if (fresh) {
    await logAuthEvent(request, { type: "new_device", supabaseId: user.id, method, deviceId });
    if (user.email) {
      await sendEmail({
        to: [user.email],
        subject: "New sign-in to your Shopinbos account",
        html: securityEmailHtml("New sign-in to your account", [
          `Someone signed in to ${user.email} on ${whenText()} (Lagos time) from ${describeDevice(request.headers.get("user-agent"))}.`,
          "If this was you, you don't need to do anything.",
          "If it wasn't you, reset your password now. Resetting it signs out every other device.",
        ]),
      }).catch(() => null);
    }
  }
  return deviceId;
}

export interface SecurityActivityItem {
  type: AuthEventType;
  method: string | null;
  device: string;
  at: string;
}

/** Latest security events for Settings > Security. Empty before the migration runs. */
export async function recentSecurityActivity(supabaseId: string, limit = 12): Promise<SecurityActivityItem[]> {
  const rows = await db.$queryRaw<{ type: AuthEventType; method: string | null; userAgent: string | null; createdAt: Date }[]>`
    SELECT "type", "method", "userAgent", "createdAt" FROM "AuthEvent"
    WHERE "supabaseId" = ${supabaseId} AND "type" IN ('login_success', 'new_device', 'password_changed', 'password_reset', 'logout_all', 'login_locked')
    ORDER BY "createdAt" DESC LIMIT ${limit}`.catch(() => []);
  return rows.map((row) => ({ type: row.type, method: row.method, device: describeDevice(row.userAgent), at: new Date(row.createdAt).toISOString() }));
}
