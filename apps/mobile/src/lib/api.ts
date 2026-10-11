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
