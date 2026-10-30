import { Platform } from "react-native";
import { supabase } from "./supabase";
import { tNow } from "./app-locale";
import { APP_CLIENT_HEADER, APP_CLIENT_VALUE, storeSafeKind } from "@shared/store-payments";

// Calls the Shopinbos Next.js API (the same backend as the web app) with the Supabase access token.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://app.shopinbos.com").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

/**
 * The words a seller sees when something goes wrong (build spec 8A: no "error", "failed" or "invalid", just a
 * plain reason and what to do). Messages written for people pass through; technical ones get a plain line by status.
 */
export function plainMessage(message: string | null | undefined, status: number): string {
  const text = (message ?? "").trim();
  const technical = !text || /\b(error|errors|failed|failure|invalid|exception|internal|unauthori[sz]ed|forbidden|null|undefined|prisma|stack|ECONN\w*|timeout|fetch)\b/i.test(text) || /[A-Z]{3,}_[A-Z_]+|\{|\}|<\/?\w+>/.test(text);
  if (!technical) return text;
  const t = tNow("m_ui");
  if (status === 0) return t("error.offline");
  if (status === 401) return t("error.loggedOut");
  if (status === 403) return t("error.notAllowed");
  if (status === 404) return t("error.notFound");
  if (status === 409) return t("error.conflict");
  if (status === 413) return t("error.tooBig");
  if (status === 429) return t("error.tooMany");
  if (status >= 400 && status < 500) return t("error.form");
  return t("error.server");
}

/**
 * The server's message for an error code, as the phone shows it (app store payment rules, shared/store-payments.ts;
 * docs/store-payments-audit.md). Out of AI credits: the server says to buy more, so the phone says the plan's credits
 * refill each month. Not on the plan (PLAN_LIMIT, UPGRADE_REQUIRED, 402) or any message that says to upgrade or top
 * up: "That isn't on your plan.", with no upgrade link or price.
 */
export function phoneMessage(message: string | null | undefined, status: number, code?: string): string {
  const kind = storeSafeKind(code, status, message);
  if (kind === "credits") return tNow("m_ui")("error.aiAllowance");
  if (kind === "plan") return tNow("m_ui")("error.notOnPlan");
  return plainMessage(message, status);
}

/** The token, and the header that tells the server this is the phone app (it keeps its answers store-safe). */
export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return { [APP_CLIENT_HEADER]: APP_CLIENT_VALUE, ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) };
}

/**
 * fetch, except for file uploads. The global fetch is expo/fetch (Expo SDK 57), which can't send React Native's
 * { uri, name, type } file parts: it throws "Unsupported FormDataPart implementation" before the request leaves the
 * phone, which looked like being offline (product photos, Rex video photos, voice notes, documents). Multipart bodies
 * go through XMLHttpRequest instead, React Native's own networking, which reads the file from disk (as Add many's
 * uploads always did, lib/bulk-add.ts). Never set Content-Type for these: XHR adds the multipart boundary itself.
 */
export function send(url: string, init: RequestInit = {}): Promise<Response> {
  if (Platform.OS === "web" || !(init.body instanceof FormData)) return fetch(url, init);
  const body = init.body;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method ?? "POST", url);
    for (const [name, value] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
      if (name.toLowerCase() !== "content-type") xhr.setRequestHeader(name, value);
    }
    xhr.timeout = 120_000;
    xhr.onload = () => {
      // Response only takes 200–599; anything else is a connection problem.
      if (xhr.status < 200 || xhr.status > 599) return reject(new TypeError("Network request failed"));
      const empty = xhr.status === 204 || xhr.status === 205 || xhr.status === 304;
      resolve(new Response(empty ? null : xhr.responseText, { status: xhr.status, headers: { "Content-Type": xhr.getResponseHeader("Content-Type") ?? "application/json" } }));
    };
    xhr.onerror = () => reject(new TypeError("Network request failed"));
    xhr.ontimeout = () => reject(new TypeError("Network request timed out"));
    xhr.send(body);
  });
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await send(`${API_URL}${path}`, {
      ...rest,
      headers: {
        Accept: "application/json",
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(await authHeader()),
        ...(headers as Record<string, string> | undefined),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(tNow("m_ui")("error.offline"), 0);
  }
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string; code?: string } } | T | null;
  if (!response.ok) {
    const error = (body as { error?: { message?: string; code?: string } } | null)?.error;
    throw new ApiError(phoneMessage(error?.message, response.status, error?.code), response.status, error?.code);
  }
  return (body && typeof body === "object" && "data" in (body as object) ? (body as { data: T }).data : body) as T;
}

/**
 * Like `api`, but returns the whole JSON body (for routes that put extra numbers in `meta`, or that don't use
 * the `{ data }` envelope). A non-JSON answer (e.g. a cookie-only route redirecting to /login) is an error.
 */
export async function apiBody<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await send(`${API_URL}${path}`, {
      ...rest,
      headers: {
        Accept: "application/json",
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(await authHeader()),
        ...(headers as Record<string, string> | undefined),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(tNow("m_ui")("error.offline"), 0);
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: unknown }) | null;
  if (response.ok && (body === null || typeof body !== "object")) throw new ApiError(tNow("m_ui")("error.notReady"), 200, "NOT_JSON");
  if (!response.ok) {
    const raw = body?.error;
    const error = raw && typeof raw === "object" ? (raw as { message?: string; code?: string }) : { message: typeof raw === "string" ? raw : undefined, code: undefined };
    throw new ApiError(phoneMessage(response.status === 401 ? null : error.message, response.status, error.code), response.status, error.code);
  }
  return body as T;
}
