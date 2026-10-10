import { OtpSendError, type FetchLike, type OtpSender } from './types';

export interface TermiiConfig {
  apiKey: string;
  senderId: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

/** SMS fallback through Termii's DND route (delivers to DND-registered Nigerian numbers). */
export function termiiSmsSender(cfg: TermiiConfig): OtpSender {
  const doFetch = cfg.fetch ?? fetch;
  const base = cfg.baseUrl ?? 'https://v3.api.termii.com';
  return {
    channel: 'sms',
    async send({ to, code }) {
      const res = await doFetch(`${base}/api/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: cfg.apiKey,
          to: to.replace(/^\+/, ''),
          from: cfg.senderId,
          sms: `Your Shopinbos code is ${code}. It expires in 10 minutes. Don't share it with anyone.`,
          type: 'plain',
          channel: 'dnd',
        }),
      });
      if (!res.ok) throw new OtpSendError(`Termii send failed (${res.status})`, 'sms', res.status);
      const json = (await res.json().catch(() => ({}))) as { message_id?: string };
      return { providerRef: json.message_id };
    },
  };
}
