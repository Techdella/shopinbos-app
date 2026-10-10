import { useMe } from '@shopinbos/api-client/react';
import { Badge, Button, Card, theme } from '@shopinbos/ui-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../lib/auth';

/** Phase 0 hello screen: proves sign-in and /api/me from the device. */
export default function Home() {
  const me = useMe();
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.brand}>Shopinbos Riders</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Hi {me.data?.user.name ?? 'there'}
        </Text>
        <Card tone="ai">
          <Text style={styles.cardTitle}>You are signed in.</Text>
          <Text style={styles.cardText}>Jobs, pickup and proof of delivery arrive in phase 4.</Text>
        </Card>
        {me.isLoading ? <Text style={styles.muted}>Loading your account…</Text> : null}
        {me.error ? <Text style={styles.error}>{me.error.message}</Text> : null}
        {me.data?.memberships.map((m) => (
          <Card key={m.id}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{m.organization.name}</Text>
              <Badge label={m.role === 'OWNER' ? 'Owner' : m.role.toLowerCase()} />
            </View>
            {m.stores.map((s) => (
              <Text key={s.id} style={styles.muted}>
                {s.slug}.shopinbos.com
              </Text>
            ))}
          </Card>
        ))}
        <Button variant="ghost" onPress={() => auth.signOut()}>
          Sign out
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.canvas },
  page: { padding: theme.spacing[5], gap: theme.spacing[4] },
  brand: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: theme.fontSizes.sm,
    color: theme.colors.sub,
  },
  title: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: theme.fontSizes['3xl'],
    color: theme.colors.ink,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
  },
  cardTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: theme.fontSizes.lg,
    color: theme.colors.ink,
  },
  cardText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: theme.fontSizes.base,
    color: theme.colors.ai,
    marginTop: 4,
  },
  muted: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: theme.fontSizes.sm,
    color: theme.colors.sub,
  },
  error: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: theme.fontSizes.sm,
    color: theme.colors['accent-text'],
  },
});
