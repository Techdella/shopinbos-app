/**
 * Standard Webhooks verification (https://www.standardwebhooks.com), used by Supabase Auth hooks.
 * Signed content: `${webhook-id}.${webhook-timestamp}.${body}`, HMAC-SHA256, base64.
 * Secret format: "v1,whsec_<base64>" (Supabase) or "whsec_<base64>".
 */

export class WebhookVerificationError extends Error {}

export interface VerifyInput {
  secret: string;
  body: string;
  headers: Headers | Record<string, string | undefined>;
  /** Reject replays older or newer than this (seconds). */
  toleranceSeconds?: number;
  now?: () => number;
}

function header(h: VerifyInput['headers'], name: string): string | undefined {
  if (typeof (h as Headers).get === 'function') return (h as Headers).get(name) ?? undefined;
  return (h as Record<string, string | undefined>)[name];
}

function secretBytes(secret: string): Uint8Array {
  const raw = secret.replace(/^v1,/, '').replace(/^whsec_/, '');
  return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
}

async function hmacBase64(key: Uint8Array, content: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(content)),
  );
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signStandardWebhook(
  secret: string,
  id: string,
  timestamp: number,
  body: string,
): Promise<string> {
  return `v1,${await hmacBase64(secretBytes(secret), `${id}.${timestamp}.${body}`)}`;
}

/** Throws WebhookVerificationError unless the signature is valid and fresh. Returns the parsed JSON body. */
export async function verifyStandardWebhook<T = unknown>({
  secret,
  body,
  headers,
  toleranceSeconds = 300,
  now = Date.now,
}: VerifyInput): Promise<T> {
  const id = header(headers, 'webhook-id');
  const ts = header(headers, 'webhook-timestamp');
  const sigHeader = header(headers, 'webhook-signature');
  if (!id || !ts || !sigHeader) throw new WebhookVerificationError('Missing webhook headers');

  const timestamp = Number(ts);
  if (!Number.isInteger(timestamp)) throw new WebhookVerificationError('Bad timestamp');
  if (Math.abs(now() / 1000 - timestamp) > toleranceSeconds)
    throw new WebhookVerificationError('Timestamp outside tolerance');

  const expected = await hmacBase64(secretBytes(secret), `${id}.${timestamp}.${body}`);
  const ok = sigHeader
    .split(' ')
    .map((s) => s.split(',', 2))
    .some(([version, sig]) => version === 'v1' && !!sig && timingSafeEqual(sig, expected));
  if (!ok) throw new WebhookVerificationError('Signature mismatch');

  return JSON.parse(body) as T;
}
