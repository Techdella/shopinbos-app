import { supabase } from "./supabase";

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
  if (status === 0) return "We couldn't reach Shopinbos. Check your connection and try again.";
  if (status === 401) return "You've been logged out. Log in again to carry on.";
  if (status === 403) return "This account can't do that. Ask the shop owner, or tap Help.";
  if (status === 404) return "We couldn't find that. It may have been removed. Go back and try again.";
  if (status === 409) return "Someone changed this at the same time. Pull down to see the latest, then try again.";
  if (status === 413) return "That file is too big. Try a smaller photo.";
  if (status === 429) return "That's a lot of tries in a short time. Wait a minute, then try again.";
  if (status >= 400 && status < 500) return "Something in the form needs another look. Check it and try again.";
  return "Shopinbos is having a problem right now. Wait a minute and try again, or tap Help.";
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
    throw new ApiError("We couldn't reach Shopinbos. Check your connection and try again.", 0);
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
    throw new ApiError("We couldn't reach Shopinbos. Check your connection and try again.", 0);
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: unknown }) | null;
  if (response.ok && (body === null || typeof body !== "object")) throw new ApiError("This part of Shopinbos isn't ready in the app yet. Tap Help and we'll sort it out.", 200, "NOT_JSON");
  if (!response.ok) {
    const raw = body?.error;
    const error = raw && typeof raw === "object" ? (raw as { message?: string; code?: string }) : { message: typeof raw === "string" ? raw : undefined, code: undefined };
    throw new ApiError(plainMessage(response.status === 401 ? null : error.message, response.status), response.status, error.code);
  }
  return body as T;
}
