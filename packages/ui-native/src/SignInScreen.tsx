import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { Input } from './components/Input';
import { t } from './styles';

export interface SignInScreenProps {
  title: string;
  subtitle?: string;
  /** Ask for a code. Throw an Error with a plain message to show it. */
  onStart: (input: { phone: string } | { email: string }) => Promise<void>;
  onVerify: (input: ({ phone: string } | { email: string }) & { code: string }) => Promise<void>;
  /** Phones only for riders; sellers may also use email. */
  allowEmail?: boolean;
}

/** Phone-first OTP sign-in shared by Shopinbos Seller, Riders and Partners. */
export function SignInScreen({
  title,
  subtitle,
  onStart,
  onVerify,
  allowEmail = true,
}: SignInScreenProps) {
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const id = () => (mode === 'phone' ? { phone: value } : { email: value });
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Shopinbos</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
        <Card style={styles.card}>
          {!sent ? (
            <View style={styles.gap}>
              <Input
                key={mode}
                label={mode === 'phone' ? 'Phone number' : 'Email'}
                value={value}
                onChangeText={setValue}
                keyboardType={mode === 'phone' ? 'phone-pad' : 'email-address'}
                autoComplete={mode === 'phone' ? 'tel' : 'email'}
                autoCapitalize="none"
                placeholder={mode === 'phone' ? '0803 123 4567' : 'you@example.com'}
                hint={
                  mode === 'phone'
                    ? 'We send a code on WhatsApp. If that fails, by SMS.'
                    : undefined
                }
                error={error}
              />
              <Button
                variant="accent"
                loading={busy}
                disabled={!value.trim()}
                onPress={() =>
                  run(async () => {
                    await onStart(id());
                    setSent(true);
                  })
                }
              >
                Send my code
              </Button>
              {allowEmail ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.link}
                  onPress={() => {
                    setMode(mode === 'phone' ? 'email' : 'phone');
                    setValue('');
                    setError(undefined);
                  }}
                >
                  <Text style={styles.linkText}>
                    {mode === 'phone' ? 'Use email instead' : 'Use phone number instead'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.gap}>
              <Text style={styles.sub}>Enter the 6-digit code we sent to {value.trim()}.</Text>
              <Input
                label="Code"
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                error={error}
                autoFocus
              />
              <Button
                variant="accent"
                loading={busy}
                disabled={code.length !== 6}
                onPress={() => run(() => onVerify({ ...id(), code }))}
              >
                Continue
              </Button>
              <Pressable
                accessibilityRole="button"
                style={styles.link}
                onPress={() => {
                  setSent(false);
                  setCode('');
                  setError(undefined);
                }}
              >
                <Text style={styles.linkText}>Change {mode === 'phone' ? 'number' : 'email'}</Text>
              </Pressable>
            </View>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: t.colors.canvas },
  page: { flexGrow: 1, justifyContent: 'center', padding: t.spacing[5], gap: t.spacing[2] },
  brand: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: t.fontSizes.sm,
    color: t.colors.sub,
  },
  title: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: t.fontSizes['2xl'],
    color: t.colors.ink,
  },
  sub: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: t.fontSizes.base,
    color: t.colors.sub,
  },
  card: { marginTop: t.spacing[4] },
  gap: { gap: t.spacing[4] },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: t.fontSizes.sm,
    color: t.colors.sub,
  },
});
