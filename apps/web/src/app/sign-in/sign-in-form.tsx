'use client';
import { ApiClientError } from '@shopinbos/api-client';
import { useOtpStart, useOtpVerify } from '@shopinbos/api-client/react';
import { Button, Card, Input } from '@shopinbos/ui-web';
import { formatPhoneNg, normalizePhone } from '@shopinbos/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Submit = { preventDefault(): void };

type Mode = 'phone' | 'email';

export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('phone');
  const [identifier, setIdentifier] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const start = useOtpStart();
  const verify = useOtpVerify();

  const payload = () => (mode === 'phone' ? { phone: identifier } : { email: identifier });

  async function onStart(e: Submit) {
    e.preventDefault();
    setError(null);
    if (mode === 'phone' && !normalizePhone(identifier))
      return setError('Enter a valid phone number, like 0803 123 4567');
    try {
      await start.mutateAsync(payload());
      setSentTo(mode === 'phone' ? formatPhoneNg(normalizePhone(identifier)!) : identifier.trim());
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "We couldn't send your code. Try again.",
      );
    }
  }

  async function onVerify(e: Submit) {
    e.preventDefault();
    setError(null);
    try {
      await verify.mutateAsync({ ...payload(), code });
      router.replace('/home');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "That code didn't work. Try again.");
    }
  }

  if (sentTo) {
    return (
      <Card className="p-6">
        <form onSubmit={onVerify} className="flex flex-col gap-4" noValidate>
          <div>
            <h2 className="text-lg font-bold">Enter your code</h2>
            <p className="text-sm text-sub">
              {mode === 'phone'
                ? `We sent a 6-digit code to ${sentTo} on WhatsApp (or SMS).`
                : `We sent a 6-digit code to ${sentTo}.`}
            </p>
          </div>
          <Input
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={error ?? undefined}
            autoFocus
          />
          <Button
            type="submit"
            variant="accent"
            size="lg"
            block
            loading={verify.isPending}
            disabled={code.length !== 6}
          >
            Continue
          </Button>
          <div className="flex justify-between text-sm">
            <button
              type="button"
              className="min-h-11 font-semibold text-sub hover:text-ink"
              onClick={() => {
                setSentTo(null);
                setCode('');
                setError(null);
              }}
            >
              Change {mode === 'phone' ? 'number' : 'email'}
            </button>
            <button
              type="button"
              className="min-h-11 font-semibold text-ink hover:underline"
              disabled={start.isPending}
              onClick={onStart}
            >
              Send a new code
            </button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={onStart} className="flex flex-col gap-4" noValidate>
        {mode === 'phone' ? (
          <Input
            key="phone"
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0803 123 4567"
            hint="We send a code on WhatsApp. If that fails, by SMS."
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            error={error ?? undefined}
            autoFocus
          />
        ) : (
          <Input
            key="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            error={error ?? undefined}
            autoFocus
          />
        )}
        <Button
          type="submit"
          variant="accent"
          size="lg"
          block
          loading={start.isPending}
          disabled={!identifier.trim()}
        >
          Send my code
        </Button>
        <button
          type="button"
          className="min-h-11 text-sm font-semibold text-sub hover:text-ink"
          onClick={() => {
            setMode(mode === 'phone' ? 'email' : 'phone');
            setIdentifier('');
            setError(null);
          }}
        >
          {mode === 'phone' ? 'Use email instead' : 'Use phone number instead'}
        </button>
      </form>
    </Card>
  );
}
