import { StyleSheet, Text, View } from 'react-native';
import { t } from '../styles';

export interface StatProps {
  label: string;
  value: string;
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
}

export function Stat({ label, value, delta, trend = 'flat' }: StatProps) {
  const color =
    trend === 'up' ? t.colors.ok : trend === 'down' ? t.colors['accent-text'] : t.colors.sub;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${delta ? `, ${delta}` : ''}`}
      style={styles.wrap}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {delta ? <Text style={[styles.delta, { color }]}>{delta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  label: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: t.fontSizes.sm, color: t.colors.sub },
  value: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: t.fontSizes['2xl'],
    color: t.colors.ink,
  },
  delta: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: t.fontSizes.sm },
});
