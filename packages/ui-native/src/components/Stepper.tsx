import { Pressable, StyleSheet, Text, View } from 'react-native';
import { clamp, t } from '../styles';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
}

export function Stepper({
  value,
  onChange,
  label,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  format = String,
}: StepperProps) {
  const set = (n: number) => onChange(clamp(n, min, max));
  return (
    <View accessibilityLabel={label} style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        disabled={value <= min}
        onPress={() => set(value - step)}
        style={[styles.btn, value <= min && styles.dim]}
      >
        <Text style={styles.sign}>−</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={styles.value}>
        {format(value)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        disabled={value >= max}
        onPress={() => set(value + step)}
        style={[styles.btn, value >= max && styles.dim]}
      >
        <Text style={styles.sign}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[3] },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.4 },
  sign: { fontSize: 20, fontFamily: 'PlusJakartaSans_700Bold', color: t.colors.ink },
  value: {
    minWidth: 64,
    textAlign: 'center',
    fontSize: t.fontSizes.lg,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: t.colors.ink,
  },
});
