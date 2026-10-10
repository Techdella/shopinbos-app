import { describe, expect, it, vi } from 'vitest';
import {
  limit,
  memoryCounterStore,
  OtpSendError,
  otpSendersFromEnv,
  sendOtp,
  signStandardWebhook,
  termiiSmsSender,
  verifyStandardWebhook,
  WebhookVerificationError,
  whatsappOtpSender,
  type OtpSender,
} from './index';

const SECRET = `v1,whsec_${btoa('a-very-secret-key-for-tests-only')}`;

describe('standard webhooks', () => {
  const body = JSON.stringify({ user: { phone: '2348031234567' }, sms: { otp: '123456' } });
  const now = 1_790_000_000_000;

  async function headers(ts = now / 1000, secret = SECRET) {
    return {
      'webhook-id': 'msg_1',
      'webhook-timestamp': String(ts),
      'webhook-signature': await signStandardWebhook(secret, 'msg_1', ts, body),
    };
  }

  it('accepts a valid signature', async () => {
    const parsed = await verifyStandardWebhook<{ sms: { otp: string } }>({
      secret: SECRET,
      body,
      headers: await headers(),
      now: () => now,
    });
    expect(parsed.sms.otp).toBe('123456');
  });

  it('rejects a tampered body', async () => {
    await expect(
      verifyStandardWebhook({
        secret: SECRET,
        body: body.replace('123456', '000000'),
        headers: await headers(),
        now: () => now,
      }),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it('rejects a replay outside the window', async () => {
    await expect(
      verifyStandardWebhook({
        secret: SECRET,
        body,
        headers: await headers(now / 1000 - 600),
        now: () => now,
      }),
    ).rejects.toThrow(/tolerance/);
  });

  it('rejects the wrong secret and missing headers', async () => {
    const other = `v1,whsec_${btoa('another-secret')}`;
    await expect(
      verifyStandardWebhook({
        secret: SECRET,
        body,
        headers: await headers(now / 1000, other),
        now: () => now,
      }),
    ).rejects.toThrow(/mismatch/);
    await expect(
      verifyStandardWebhook({ secret: SECRET, body, headers: {}, now: () => now }),
    ).rejects.toThrow(/Missing/);
  });
});

describe('OTP senders', () => {
  it('WhatsApp sends an authentication template without the plus', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] })));
    const s = whatsappOtpSender({
      phoneNumberId: '123',
      accessToken: 'tok',
      templateName: 'shopinbos_otp',
      languageCode: 'en',
      fetch,
    });
    await expect(s.send({ to: '+2348031234567', code: '123456' })).resolves.toEqual({
      providerRef: 'wamid.1',
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toContain('/123/messages');
    const sent = JSON.parse(init.body);
    expect(sent.to).toBe('2348031234567');
    expect(sent.template.name).toBe('shopinbos_otp');
    expect(JSON.stringify(sent)).toContain('123456');
  });

  it('Termii raises on HTTP errors', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));
    const s = termiiSmsSender({ apiKey: 'k', senderId: 'Shopinbos', fetch });
    await expect(s.send({ to: '+2348031234567', code: '123456' })).rejects.toBeInstanceOf(
      OtpSendError,
    );
  });

  it('falls back from WhatsApp to SMS', async () => {
    const wa: OtpSender = {
      channel: 'whatsapp',
      send: vi.fn().mockRejectedValue(new OtpSendError('down', 'whatsapp', 500)),
    };
    const sms: OtpSender = {
      channel: 'sms',
      send: vi.fn().mockResolvedValue({ providerRef: 'sms1' }),
    };
    await expect(sendOtp([wa, sms], { to: '+2348031234567', code: '123456' })).resolves.toEqual({
      channel: 'sms',
      providerRef: 'sms1',
      failed: ['whatsapp'],
    });
  });

  it('throws when every channel fails', async () => {
    const wa: OtpSender = {
      channel: 'whatsapp',
      send: vi.fn().mockRejectedValue(new OtpSendError('down', 'whatsapp')),
    };
    await expect(sendOtp([wa], { to: '+2348031234567', code: '1' })).rejects.toThrow('down');
  });

  it('builds senders from env in order and skips unconfigured ones', () => {
    expect(otpSendersFromEnv({ TERMII_API_KEY: 'k' }).map((s) => s.channel)).toEqual(['sms']);
    expect(
      otpSendersFromEnv({
        TERMII_API_KEY: 'k',
        WHATSAPP_PHONE_NUMBER_ID: '1',
        META_SYSTEM_USER_TOKEN: 't',
      }).map((s) => s.channel),
    ).toEqual(['whatsapp', 'sms']);
    expect(
      otpSendersFromEnv({
        OTP_CHANNEL_ORDER: 'sms,whatsapp',
        TERMII_API_KEY: 'k',
        WHATSAPP_PHONE_NUMBER_ID: '1',
        META_SYSTEM_USER_TOKEN: 't',
      }).map((s) => s.channel),
    ).toEqual(['sms', 'whatsapp']);
  });
});

describe('rate limits', () => {
  it('blocks after the limit and resets after the window', async () => {
    let t = 0;
    const store = memoryCounterStore(() => t);
    for (let i = 0; i < 5; i++) expect((await limit(store, 'otp:+234', 5, 60)).allowed).toBe(true);
    expect((await limit(store, 'otp:+234', 5, 60)).allowed).toBe(false);
    t = 61_000;
    expect((await limit(store, 'otp:+234', 5, 60)).allowed).toBe(true);
  });
});
