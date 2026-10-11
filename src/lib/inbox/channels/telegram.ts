import "server-only";
import { appUrl, providerError, readJson, type SendInput, type SendResult } from "./types";

// Telegram Bot API. Credentials: botToken (from @BotFather). Connecting calls setWebhook with a secret token
// that Telegram sends back in X-Telegram-Bot-Api-Secret-Token on every update.

async function call(token: string, method: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false as const, error: "Couldn't reach Telegram. Try again." };
  const json = await readJson(res);
  if (!res.ok || json.ok !== true) return { ok: false as const, error: providerError(json, "Telegram rejected the request.") };
  return { ok: true as const, result: json.result as Record<string, unknown> };
}

export async function sendTelegram(input: SendInput): Promise<SendResult> {
  if (!input.credentials.botToken) return { ok: false, error: "Telegram isn't connected." };
  const res = await call(input.credentials.botToken, "sendMessage", { chat_id: input.to, text: input.body });
  if (!res.ok) return res;
  return { ok: true, externalId: res.result?.message_id ? `${input.to}:${String(res.result.message_id)}` : null };
}

export async function connectTelegram(botToken: string, channelId: string, secret: string): Promise<{ ok: true; botId: string; displayName: string } | { ok: false; error: string }> {
  const me = await call(botToken, "getMe");
  if (!me.ok) return me;
  const hook = await call(botToken, "setWebhook", {
    url: `${appUrl()}/api/webhooks/telegram/${channelId}`,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  if (!hook.ok) return hook;
  return { ok: true, botId: String(me.result.id ?? ""), displayName: me.result.username ? `@${String(me.result.username)}` : String(me.result.first_name ?? "Telegram bot") };
}

export async function disconnectTelegram(botToken: string) {
  await call(botToken, "deleteWebhook", { drop_pending_updates: false });
}
