import { OtpSendError, type FetchLike, type OtpSender } from './types';

export const GRAPH_API_VERSION = 'v23.0';

export interface WhatsAppOtpConfig {
  phoneNumberId: string;
  accessToken: string;
  /** Approved authentication template with a copy-code button. */
  templateName: string;
  languageCode: string;
  fetch?: FetchLike;
}

/** Sends the code with the platform WhatsApp number using an authentication template. */
export function whatsappOtpSender(cfg: WhatsAppOtpConfig): OtpSender {
  const doFetch = cfg.fetch ?? fetch;
  return {
    channel: 'whatsapp',
    async send({ to, code }) {
      const res = await doFetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${cfg.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to.replace(/^\+/, ''),
            type: 'template',
            template: {
              name: cfg.templateName,
              language: { code: cfg.languageCode },
              components: [
                { type: 'body', parameters: [{ type: 'text', text: code }] },
                {
                  type: 'button',
                  sub_type: 'url',
                  index: '0',
                  parameters: [{ type: 'text', text: code }],
                },
              ],
            },
          }),
        },
      );
      if (!res.ok)
        throw new OtpSendError(`WhatsApp send failed (${res.status})`, 'whatsapp', res.status);
      const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
      return { providerRef: json.messages?.[0]?.id };
    },
  };
}
