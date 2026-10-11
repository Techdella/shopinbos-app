// Helpers for /auth/handoff (the mobile app opening a web page signed in). Kept pure for tests.

/** Only same-site paths: "/home/x" yes; "//evil.com", "/\\evil.com" and absolute URLs no. */
export function handoffNextPath(value: string | null | undefined): string {
  return value && /^\/(?![/\\])/.test(value) && !/[\r\n]/.test(value) ? value : "/home";
}

/** Reads the access token from "#t=<jwt>". */
export function readHandoffToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("t");
  return token && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) ? token : null;
}
