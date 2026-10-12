import { supabase } from "./supabase";

// Calls the Shopinbos Next.js API (the same backend as the web app) with the Supabase access token.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://app.shopinbos.com").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
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
    throw new ApiError(error?.message ?? (response.status === 401 ? "Your session has ended. Log in again." : "Something went wrong. Please try again."), response.status, error?.code);
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
  if (response.ok && (body === null || typeof body !== "object")) throw new ApiError("This part of Shopinbos didn't answer the app. Try it on the web for now.", 200, "NOT_JSON");
  if (!response.ok) {
    const raw = body?.error;
    const error = raw && typeof raw === "object" ? (raw as { message?: string; code?: string }) : { message: typeof raw === "string" ? raw : undefined, code: undefined };
    throw new ApiError(response.status === 401 ? "Your session has ended. Log in again." : error.message ?? "Something went wrong. Please try again.", response.status, error.code);
  }
  return body as T;
}
