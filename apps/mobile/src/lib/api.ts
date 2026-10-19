import { supabase } from "./supabase";
import { tNow } from "./app-locale";

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

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
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
    throw new ApiError(plainMessage(error?.message, response.status), response.status, error?.code);
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
    response = await fetch(`${API_URL}${path}`, {
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
    throw new ApiError(plainMessage(response.status === 401 ? null : error.message, response.status), response.status, error.code);
  }
  return body as T;
}
