import { NextResponse } from "next/server";
import { tryAgainMessage } from "./throttle-policy";

// Response helpers shared by the /api/auth handlers. Auth answers are never cached.

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export function authJson(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status, headers: NO_STORE });
}

export function authError(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

export function rateLimited(seconds: number, what = "attempts") {
  const response = authError("RATE_LIMITED", tryAgainMessage(seconds, what), 429);
  response.headers.set("Retry-After", String(seconds));
  return response;
}
